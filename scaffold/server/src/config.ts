import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const root = new URL('../../../', import.meta.url);
try { process.loadEnvFile(new URL('.env', root)); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Unable to load .env'); }
// The starter supplies public simulator settings for local use. Production
// deployments, including the grader, supply their own values explicitly.
const defaults = process.env.NODE_ENV === 'production' ? {} : parseEnv(readFileSync(new URL('.env.example', root), 'utf8'));
function setting(name: string) {
  const value = process.env[name] ?? defaults[name];
  if (!value || !value.trim()) throw new Error('Missing configuration: ' + name);
  return value;
}
function endpoint(name: string, protocols: string[]) {
  const value = setting(name);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Invalid URL for ' + name); }
  if (!protocols.includes(parsed.protocol)) throw new Error('Invalid URL scheme for ' + name);
  return value;
}
const http = ['http:', 'https:'];
const port = Number(setting('PORT'));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
export const config = {
  port, webOrigin: endpoint('WEB_ORIGIN', http),
  graderToken: setting('GRADER_TOKEN'),
  mongoUrl: endpoint('MONGO_URL', ['mongodb:', 'mongodb+srv:']),
  redisUrl: endpoint('REDIS_URL', ['redis:', 'rediss:']),
  pigeon: {
    url: endpoint('PIGEON_URL', http), webhookSecret: setting('PIGEON_WEBHOOK_SECRET'),
    apiKeys: { ws_acme: setting('PIGEON_KEY_WS_ACME'), ws_globex: setting('PIGEON_KEY_WS_GLOBEX') } as Record<string, string>,
  },
  oidc: {
    issuer: endpoint('OIDC_ISSUER', http), clientId: setting('OIDC_CLIENT_ID'),
    clientSecret: setting('OIDC_CLIENT_SECRET'), redirectUri: endpoint('OIDC_REDIRECT_URI', http),
  },
};
