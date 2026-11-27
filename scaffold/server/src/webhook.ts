import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { field, HttpError, type Inbox, workspaces } from './events.js';

export async function receive(inbox: Inbox, raw: Buffer, signature?: string) {
  const match = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/i.exec(signature ?? '');
  if (!match || !Buffer.isBuffer(raw) || Math.abs(Math.floor(Date.now() / 1000) - Number(match[1])) > 300) {
    throw new HttpError(401, 'Invalid webhook signature');
  }
  const mac = createHmac('sha256', config.pigeon.webhookSecret).update(match[1] + '.').update(raw).digest();
  if (!timingSafeEqual(mac, Buffer.from(match[2], 'hex'))) throw new HttpError(401, 'Invalid webhook signature');
  let event;
  try { event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { throw new HttpError(400, 'Invalid JSON'); }
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new HttpError(400, 'Invalid event');
  const { workspace, type, data } = event;
  if (!workspaces.includes(workspace) || !['message.inbound', 'message.status'].includes(type)) return;
  const eventId = field(event.id, 'event id');
  const at = new Date(field(event.occurred_at, 'occurred_at'));
  if (!Number.isFinite(at.getTime())) throw new HttpError(400, 'Invalid occurred_at');
  if (type === 'message.inbound') {
    await inbox.inbound({ workspace, type, eventId, at, contact: field(data?.from, 'from'),
      message_id: field(data?.message_id, 'message_id'), text: field(data?.text, 'text', 32768) });
  } else if (['sent', 'delivered', 'failed'].includes(data?.status)) {
    await inbox.status(workspace, field(data.client_ref, 'client_ref'), data.status, at, eventId);
  }
}
