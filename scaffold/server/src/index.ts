import express, { type ErrorRequestHandler } from 'express';
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { getDb } from './db.js';
import { getRedis } from './redis.js';
import { field, HttpError, Inbox, workspaceId } from './events.js';
import { route } from './http.js';
import { receive } from './webhook.js';
import { snapshot } from './views.js';
import { coordinationKeys, startWorkers } from './outbox.js';
import { authRoutes } from './auth.js';
import { apiRoutes } from './api.js';
import { attachLive } from './live.js';
import { fileURLToPath } from 'node:url';

const db = await getDb();
const inbox = new Inbox(db);
const redis = getRedis();
await Promise.all([inbox.initialize(), redis.ping()]);
const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'",
  });
  next();
});
app.get('/healthz', route(async (_req, res) => {
  await Promise.all([db.command({ ping: 1 }), redis.ping()]);
  res.json({ ok: true });
}));
app.post('/webhooks/pigeon', express.raw({ type: () => true, limit: '128kb', inflate: false }), route(async (req, res) => {
  await receive(inbox, req.body, req.get('x-pigeon-signature'));
  res.sendStatus(204);
}));
const digest = (value: string) => createHash('sha256').update(value).digest();
app.use('/__grader', (req, res, next) => {
  if (!timingSafeEqual(digest(req.get('x-grader-token') ?? ''), digest(config.graderToken))) {
    res.status(401).json({ error: 'Invalid grader token' });
  } else next();
});
app.use(express.json({ limit: '96kb' }));
authRoutes(app, redis);
apiRoutes(app, inbox, redis);
app.post('/__grader/reset', route(async (_req, res) => {
  await Promise.all([inbox.events.deleteMany({}), inbox.noteKeys.deleteMany({})]);
  await redis.del(...coordinationKeys());
  res.json({ ok: true });
}));
app.get('/__grader/snapshot', route(async (_req, res) => { res.json(await snapshot(inbox)); }));
app.post('/__grader/reply', route(async (req, res) => {
  const b = req.body;
  await inbox.reply(workspaceId(b?.workspace), field(b.contact, 'contact'), field(b.text, 'text', 32768), field(b.client_ref, 'client_ref'));
  res.sendStatus(202);
}));
app.post('/__grader/claim', route(async (req, res) => {
  const b = req.body;
  await inbox.claim(workspaceId(b?.workspace), field(b.contact, 'contact'), field(b.agent, 'agent'));
  res.sendStatus(200);
}));
const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error instanceof HttpError ? error.status : [400, 413, 415].includes(error.status) ? error.status : 503;
  if (status >= 500) console.error('Request failed', error.name, error.code ?? '');
  res.status(status).json({ error: error instanceof HttpError ? error.message : status >= 500 ? 'Service temporarily unavailable' : 'Invalid request body' });
};
app.use(express.static(fileURLToPath(new URL('../../web/dist/', import.meta.url))));
app.use(errors);
const server = createServer(app);
attachLive(server, inbox, redis);
server.listen(config.port, () => {
  startWorkers(inbox, redis);
  console.log('Switchboard ready on port', config.port);
});
