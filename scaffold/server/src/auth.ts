import { createHash, randomBytes } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Redis } from 'ioredis';
import { config } from './config.js';
import { HttpError, workspaces } from './events.js';
import { route } from './http.js';

export type User = { sub: string; name: string; workspaces: { id: string; role: 'admin' | 'agent' }[] };
const { issuer, clientId, clientSecret, redirectUri } = config.oidc;
const digest = (value: string) => createHash('sha256').update(value).digest('base64url');
const random = () => randomBytes(32).toString('base64url');
const cookies = { httpOnly: true, sameSite: 'lax' as const, secure: new URL(redirectUri).protocol === 'https:', path: '/' };
const denied = () => new HttpError(401, 'Sign-in expired or invalid. Please sign in again.');

function cookie(header: string | undefined, name: string) {
  return header?.split(';').map(pair => pair.trim()).find(pair => pair.startsWith(name + '='))?.slice(name.length + 1);
}
const sessionKey = (header?: string) => {
  const sid = cookie(header, 'sb_session');
  return sid && /^[\w-]{43}$/.test(sid) ? 'sb:session:' + digest(sid) : undefined;
};
export async function session(redis: Redis, header?: string): Promise<User | null> {
  const key = sessionKey(header);
  const value = key && await redis.get(key);
  return value ? JSON.parse(value) : null;
}
export function authorized(user: User, workspace: unknown): string {
  if (typeof workspace !== 'string' || !user.workspaces.some(w => w.id === workspace)) throw new HttpError(403, 'Workspace access denied');
  return workspace;
}
export function allowOrigin(origin?: string) {
  return !origin || origin === new URL(config.webOrigin).origin || origin === new URL(redirectUri).origin;
}
export async function requireUser(redis: Redis, req: Request) {
  const user = await session(redis, req.headers.cookie);
  if (!user) throw new HttpError(401, 'Please sign in');
  if (req.method !== 'GET' && !allowOrigin(req.get('origin'))) throw new HttpError(403, 'Origin denied');
  return user;
}
async function discover() {
  const res = await fetch(issuer.replace(/\/$/, '') + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(4000), redirect: 'error' });
  if (!res.ok) throw new Error('OIDC discovery unavailable');
  const data = await res.json();
  if (data.issuer !== issuer) throw new Error('OIDC issuer mismatch');
  for (const endpoint of [data.authorization_endpoint, data.token_endpoint, data.jwks_uri]) {
    if (new URL(endpoint).origin !== new URL(issuer).origin) throw new Error('Unexpected mock IdP endpoint');
  }
  return { authorize: String(data.authorization_endpoint), token: String(data.token_endpoint),
    keys: createRemoteJWKSet(new URL(data.jwks_uri), { timeoutDuration: 4000, cooldownDuration: 3000 }) };
}

export function authRoutes(app: Express, redis: Redis) {
  let metadata: ReturnType<typeof discover> | undefined;
  const provider = () => metadata ??= discover().catch(error => { metadata = undefined; throw error; });
  app.use(['/auth', '/api', '/__grader'], (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/auth/login', route(async (_req, res) => {
    const idp = await provider();
    const state = random(), browser = random(), nonce = random(), verifier = random();
    await redis.set('sb:login:' + digest(state + '.' + browser), JSON.stringify({ nonce, verifier }), 'EX', 300);
    res.cookie('sb_flow', browser, { ...cookies, maxAge: 300_000 });
    const url = new URL(idp.authorize);
    url.search = new URLSearchParams({ state, nonce, client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
      scope: 'openid profile', code_challenge: digest(verifier), code_challenge_method: 'S256' }).toString();
    res.redirect(url.href);
  }));
  app.get('/auth/callback', route(async (req, res) => {
    const { state, code } = req.query;
    const browser = cookie(req.headers.cookie, 'sb_flow');
    if (typeof state !== 'string' || typeof code !== 'string' || !browser) throw denied();
    const saved = await redis.getdel('sb:login:' + digest(state + '.' + browser));
    res.clearCookie('sb_flow', cookies);
    if (!saved) throw denied();
    const { verifier, nonce } = JSON.parse(saved);
    const idp = await provider();
    const response = await fetch(idp.token, { method: 'POST', signal: AbortSignal.timeout(4000), redirect: 'error',
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, code_verifier: verifier }) });
    if (response.status >= 500) throw new HttpError(503, 'Identity provider unavailable');
    if (!response.ok) throw denied();
    const { id_token } = await response.json();
    const { payload } = await jwtVerify(id_token, idp.keys, { issuer, audience: clientId, algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat', 'nonce'] }).catch(() => { throw denied(); });
    if (payload.nonce !== nonce || typeof payload.sub !== 'string' || !payload.sub ||
        ((Array.isArray(payload.aud) && payload.aud.length > 1 || payload.azp !== undefined) && payload.azp !== clientId) ||
        !Array.isArray(payload.workspaces)) throw denied();
    const memberships = payload.workspaces;
    if (!memberships.every(w => w && workspaces.includes(w.id) && ['admin', 'agent'].includes(w.role))) throw denied();
    const user: User = { sub: payload.sub, name: typeof payload.name === 'string' ? payload.name : payload.sub,
      workspaces: memberships.map(({ id, role }) => ({ id, role })) };
    const ttl = Math.min(3600, payload.exp! - Math.floor(Date.now() / 1000));
    if (ttl <= 0) throw denied();
    const sid = random();
    const old = sessionKey(req.headers.cookie);
    const tx = redis.multi();
    if (old) tx.del(old);
    await tx.set('sb:session:' + digest(sid), JSON.stringify(user), 'EX', ttl).exec();
    res.cookie('sb_session', sid, { ...cookies, maxAge: ttl * 1000 });
    res.redirect(config.webOrigin);
  }));
  app.get('/api/me', route(async (req, res) => { res.json(await requireUser(redis, req)); }));
  app.post('/api/logout', route(async (req, res: Response) => {
    await requireUser(redis, req);
    await redis.del(sessionKey(req.headers.cookie)!);
    res.clearCookie('sb_session', cookies).sendStatus(204);
  }));
}
