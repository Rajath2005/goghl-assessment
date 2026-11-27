import type { Express, Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { authorized, requireUser, type User } from './auth.js';
import { field, HttpError, type Inbox } from './events.js';
import { route } from './http.js';
import { conversations, thread } from './views.js';

function integer(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) > max) throw new HttpError(400, 'Invalid pagination');
  return Number(value);
}

export function apiRoutes(app: Express, inbox: Inbox, redis: Redis) {
  const member = (run: (req: Request, res: Response, workspace: string, user: User) => Promise<void>) =>
    route(async (req, res) => {
      const user = await requireUser(redis, req);
      await run(req, res, authorized(user, req.query.workspace), user);
    });
  app.get('/api/conversations', member(async (req, res, workspace, user) => {
    const after = await inbox.tail(workspace);
    const filter = req.query.filter ?? 'all';
    if (typeof filter !== 'string' || !['all', 'open', 'closed', 'mine', 'unassigned'].includes(filter)) throw new HttpError(400, 'Unknown inbox filter');
    const result = await conversations(inbox, workspace, integer(req.query.offset, 0, 10000000),
      Math.max(1, integer(req.query.limit, 30, 100)), filter, user.sub);
    res.json({ ...result, after });
  }));
  app.get('/api/thread', member(async (req, res, workspace) => {
    res.json(await thread(inbox, workspace, field(req.query.contact, 'contact')));
  }));
  app.post('/api/reply', member(async (req, res, workspace) => {
    const b = req.body;
    await inbox.reply(workspace, field(b?.contact, 'contact'), field(b?.text, 'text', 32768), field(b?.client_ref, 'client_ref'));
    res.sendStatus(202);
  }));
  app.post('/api/claim', member(async (req, res, workspace, user) => {
    await inbox.claim(workspace, field(req.body?.contact, 'contact'), user.sub);
    res.sendStatus(200);
  }));
  app.post('/api/close', member(async (req, res, workspace) => {
    if (typeof req.body?.closed !== 'boolean') throw new HttpError(400, 'Expected closed flag');
    await inbox.setClosed(workspace, field(req.body.contact, 'contact'), req.body.closed);
    res.sendStatus(200);
  }));
}
