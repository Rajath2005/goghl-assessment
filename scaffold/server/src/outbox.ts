import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Redis } from 'ioredis';
import { config } from './config.js';
import { type Inbox, workspaces } from './events.js';

const leaseMs = 10_000;
const keys = (workspace: string) => ['lock', 'bucket', 'cooldown'].map(part => 'sb:send:' + workspace + ':' + part);
export const coordinationKeys = () => workspaces.flatMap(keys);

// Use Redis time so different host clocks cannot refill the same bucket twice.
// Serialize outstanding HTTP requests per workspace so a 429 can establish
// the shared cooldown before the next worker starts a send.
const take = `
if redis.call('exists', KEYS[1], KEYS[3]) > 0 then return 0 end
local clock = redis.call('time')
local now = tonumber(clock[1]) * 1000 + tonumber(clock[2]) / 1000
local b = redis.call('hmget', KEYS[2], 'tokens', 'at')
local tokens = math.min(8, tonumber(b[1] or 8) + math.max(0, now - tonumber(b[2] or now)) * 0.004)
if tokens < 1 then return 0 end
redis.call('hset', KEYS[2], 'tokens', tokens - 1, 'at', now)
redis.call('pexpire', KEYS[2], 60000)
redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2])
return 1`;
const release = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  if tonumber(ARGV[2]) > 0 then redis.call('set', KEYS[3], '1', 'PX', ARGV[2]) end
  redis.call('del', KEYS[1])
end`;

export function retryAfter(value: string | null, now = Date.now()) {
  if (value === null) return 2000;
  const ms = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.max(1, Math.ceil(ms)) : 2000;
}

async function dispatch(inbox: Inbox, redis: Redis, workspace: string) {
  const queue = inbox.events;
  const pending = await queue.findOne({ workspace, due: { $lte: new Date() } }, { projection: { _id: 1 }, sort: { due: 1 } });
  if (!pending) return false;
  const token = randomUUID();
  const group = keys(workspace);
  if (!await redis.eval(take, 3, ...group, token, leaseMs)) return false;
  let cooldown = 0;
  try {
    const job = await queue.findOneAndUpdate({ _id: pending._id, workspace, due: { $lte: new Date() } }, {
      $set: { lease: token, due: new Date(Date.now() + leaseMs) }, $inc: { attempts: 1 },
    }, { returnDocument: 'after' });
    if (!job) return false;
    const ownLease = { workspace, _id: job._id, lease: token };
    const ref = job.client_ref!;
    const alreadySent = await queue.findOne({ workspace, client_ref: ref, type: 'message.status' }, { projection: { _id: 1 } });
    if (alreadySent) {
      await queue.updateOne(ownLease, { $unset: { due: '', lease: '' } });
      return true;
    }
    let status: 'sent' | 'failed' | undefined;
    try {
      const res = await fetch(new URL('/v1/messages', config.pigeon.url), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2500),
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.pigeon.apiKeys[workspace],
          'idempotency-key': createHash('sha256').update(JSON.stringify([workspace, ref])).digest('hex') },
        body: JSON.stringify({ to: job.contact, text: job.text, client_ref: ref }),
      });
      if (res.status === 429 || res.headers.has('retry-after')) cooldown = retryAfter(res.headers.get('retry-after')) + 30;
      if (res.ok && (await res.json()).status === 'accepted') status = 'sent';
      if (res.status === 400 || res.status === 422) status = 'failed';
      await res.body?.cancel().catch(() => {});
    } catch {
      // Timeout, interrupted response, or unreachable carrier. Retry the same key.
    }
    if (status) {
      await inbox.status(workspace, ref, status, new Date(), undefined, job._id);
      await queue.updateOne(ownLease, { $unset: { due: '', lease: '' } });
    } else {
      const backoff = Math.min(30_000, 400 * 2 ** Math.min(job.attempts ?? 1, 7));
      const delay = Math.max(cooldown, backoff * (0.75 + Math.random() / 2));
      await queue.updateOne(ownLease, { $set: { due: new Date(Date.now() + delay) }, $unset: { lease: '' } });
    }
    return true;
  } finally {
    await redis.eval(release, 3, ...group, token, cooldown);
  }
}

export function startWorkers(inbox: Inbox, redis: Redis) {
  for (const workspace of workspaces) {
    void (async () => {
      for (;;) {
        try { if (await dispatch(inbox, redis, workspace)) continue; }
        catch (error) { console.error('Outbox temporarily unavailable', workspace, (error as Error).name); await sleep(800); }
        await sleep(150 + Math.random() * 60);
      }
    })();
  }
}
