import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { config } from '../dist/config.js';
import { Inbox } from '../dist/events.js';
import { receive } from '../dist/webhook.js';
import { retryAfter } from '../dist/outbox.js';
import { snapshot, thread } from '../dist/views.js';

const ws = 'ws_acme', contact = '+12345';
function signed(raw, skew = 0) {
  const t = Math.floor(Date.now() / 1000) + skew;
  return 't=' + t + ',v1=' + createHmac('sha256', config.pigeon.webhookSecret).update(t + '.').update(raw).digest('hex');
}
test('verify the exact bytes before decoding JSON and accept delayed genuine events', async () => {
  const body = Buffer.from('{ "workspace":"ws_acme", "type":"future.event" }');
  const json = Buffer.from(JSON.stringify(JSON.parse(body)));
  const invalid = Buffer.from('{"broken"');
  for (const signature of [undefined, 'bad', signed(body, -301), signed(json)]) {
    await assert.rejects(receive(undefined, body, signature), { status: 401 });
  }
  await receive(undefined, body, signed(body, -290));
  await assert.rejects(receive(undefined, invalid, signed(invalid)), { status: 400 });
  const unknown = Buffer.from('{"workspace":"other","type":"message.inbound"}');
  await receive(undefined, unknown, signed(unknown));
});

test('Retry-After supports both duration and HTTP date', () => {
  assert.equal(retryAfter('3'), 3000);
  assert.equal(retryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 2000), 3000);
  assert.equal(retryAfter('invalid'), 2000);
});

test('concurrent instances converge on one reply, one holder and ordered, tenant-scoped messages', async () => {
  const client = new MongoClient(config.mongoUrl, { serverSelectionTimeoutMS: 3500 });
  const db = client.db('switchboard_test_' + randomUUID().replaceAll('-', ''));
  try {
    const a = new Inbox(db), b = new Inbox(db);
    await Promise.all([a.initialize(), b.initialize()]);
    await a.status(ws, 'unknown', 'sent', new Date());
    assert.equal(await a.tail(ws), 0);
    await Promise.all([a, b, a, b].map(service => service.reply(ws, contact, 'One reply', 'ref')));
    const winners = await Promise.allSettled([a.claim(ws, contact, 'first'), b.claim(ws, contact, 'second')]);
    assert.equal(winners.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(winners.find(x => x.status === 'rejected').reason.status, 409);
    const winner = winners[0].status === 'fulfilled' ? 'first' : 'second';
    await b.claim(ws, contact, winner);
    const inbound = (id, eventId, seconds) => ({
      workspace: ws, contact, type: 'message.inbound', message_id: id, eventId, text: 'Hello', at: new Date(seconds * 1000),
    });
    await Promise.all([a.inbound(inbound('new', 'e1', 2)), b.inbound(inbound('old', 'e2', 1)), b.inbound(inbound('new', 'e3', 2))]);
    await a.inbound(inbound('different', 'e2', 3));
    await b.status(ws, 'ref', 'delivered', new Date(), 'delivered');
    await a.status(ws, 'ref', 'sent', new Date(), 'late');
    await b.reply('ws_globex', contact, 'Independent workspace', 'ref');
    const state = (await snapshot(a)).workspaces;
    assert.deepEqual(state[ws].contacts[contact].inbound, ['old', 'new']);
    assert.equal(state[ws].contacts[contact].assignee, winner);
    assert.equal(state[ws].outbound.ref, 'delivered');
    assert.equal(state.ws_globex.outbound.ref, 'queued');
    assert.equal((await thread(a, ws, contact)).messages.length, 3);
    const events = await a.events.find({ workspace: ws }).sort({ seq: 1 }).toArray();
    assert.deepEqual(events.map(e => e.seq), [1,2,3,4,5]);
  } finally {
    // Only this suite's random database and owned collection can be touched.
    await db.collection('sb_events').drop().catch(() => {});
    await client.close();
  }
});
