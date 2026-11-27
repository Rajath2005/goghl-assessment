import type { Server } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { WebSocketServer, WebSocket } from 'ws';
import type { Redis } from 'ioredis';
import { allowOrigin, authorized, session } from './auth.js';
import { HttpError, type Inbox } from './events.js';
import { frame } from './views.js';

export function attachLive(server: Server, inbox: Inbox, redis: Redis) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://switchboard.invalid');
      if (url.pathname !== '/ws') throw new HttpError(404, 'Not found');
      if (!allowOrigin(req.headers.origin)) throw new HttpError(403, 'Forbidden');
      const user = await session(redis, req.headers.cookie);
      if (!user) throw new HttpError(401, 'Unauthorized');
      const workspace = authorized(user, url.searchParams.get('workspace'));
      const after = url.searchParams.get('after');
      if (after !== null && (!/^\d+$/.test(after) || !Number.isSafeInteger(Number(after)))) throw new HttpError(400, 'Bad cursor');
      const cursor = after === null ? await inbox.tail(workspace) : Number(after);
      sockets.handleUpgrade(req, socket, head, ws => {
        ws.on('error', () => ws.terminate());
        // One ordered read path for both catch-up and live changes. Readers
        // cannot race a subscribe/scan handoff or skip an uncommitted frame.
        void pump(ws, workspace, cursor, req.headers.cookie).catch(() => ws.close(1011, 'Reconnect'));
      });
    })().catch(error => {
      const status = error instanceof HttpError ? error.status : 503;
      socket.end('HTTP/1.1 ' + status + ' Upgrade refused\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
  });
  async function pump(ws: WebSocket, workspace: string, cursor: number, cookie?: string) {
    let lastPing = Date.now(), alive = true;
    ws.on('pong', () => { alive = true; });
    while (ws.readyState === WebSocket.OPEN) {
      if (!await session(redis, cookie)) { ws.close(1008, 'Session expired'); return; }
      if (Date.now() - lastPing > 20000) {
        if (!alive) { ws.terminate(); return; }
        alive = false;
        ws.ping();
        lastPing = Date.now();
      }
      const rows = await inbox.events.find({ workspace, seq: { $gt: cursor } }).sort({ seq: 1 }).limit(128).toArray();
      for (const row of rows) {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > 512 * 1024) { ws.close(1013, 'Reconnect to replay'); return; }
        ws.send(JSON.stringify(frame(row)));
        cursor = row.seq;
      }
      if (rows.length < 128) await sleep(250);
    }
  }
}
