import type { Document } from 'mongodb';
import { HttpError, type Entry, type Inbox, type Status, workspaces } from './events.js';

export function frame(e: Entry) {
  const { seq, type, contact, message_id, client_ref, status, assignee, at } = e;
  return { seq, type, contact, message_id, client_ref, status, assignee, at };
}

export async function conversations(inbox: Inbox, workspace: string, offset: number, limit: number, filter: string, sub: string) {
  const pipeline: Document[] = [
    { $match: { workspace, type: { $ne: 'message.status' } } },
    { $group: {
      _id: '$contact', activity: { $max: '$at' }, assignee: { $max: '$assignee' },
      recent: { $top: { sortBy: { at: -1, seq: -1 }, output: '$type' } },
      preview: { $top: { sortBy: { hasText: -1, at: -1, seq: -1 }, output: '$text' } },
      closedSeq: { $max: { $cond: [{ $eq: ['$type', 'conversation.closed'] }, '$seq', 0] } },
      reopenSeq: { $max: { $cond: [{ $eq: ['$type', 'conversation.reopened'] }, '$seq', 0] } },
    } },
    { $project: { _id: 0, contact: '$_id', activity: 1, preview: 1, recent: 1, assignee: 1, closed: { $gt: ['$closedSeq', '$reopenSeq'] } } },
  ];
  pipeline.splice(1, 0, { $set: { hasText: { $in: ['$type', ['message.inbound', 'message.queued']] } } });
  if (filter === 'mine') pipeline.push({ $match: { assignee: sub, closed: false } });
  if (filter === 'unassigned') pipeline.push({ $match: { assignee: null, closed: false } });
  if (filter === 'open' || filter === 'closed') pipeline.push({ $match: { closed: filter === 'closed' } });
  pipeline.push({ $sort: { activity: -1, contact: 1 } }, { $skip: offset }, { $limit: limit + 1 });
  const rows = await inbox.events.aggregate(pipeline).toArray();
  return { items: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
}

function chronology(a: Entry, b: Entry) {
  const delta = a.at.getTime() - b.at.getTime();
  const x = a.message_id ?? a.client_ref ?? '', y = b.message_id ?? b.client_ref ?? '';
  return delta || (x < y ? -1 : x > y ? 1 : a.seq - b.seq);
}

export async function thread(inbox: Inbox, workspace: string, contact: string) {
  const rows = await inbox.events.find({ workspace, contact }).sort({ seq: 1 }).toArray();
  if (!rows.length) throw new HttpError(404, 'Conversation not found');
  const statuses = new Map<string, Status>();
  let assignee: string | null = null, closed = false;
  for (const row of rows) {
    if (row.client_ref && row.status) statuses.set(row.client_ref, row.status);
    if (row.assignee) assignee = row.assignee;
    if (row.type === 'conversation.closed') closed = true;
    if (row.type === 'conversation.reopened') closed = false;
  }
  const messages = rows.filter(row => row.type === 'message.inbound' || row.type === 'message.queued')
    .sort(chronology).map(row => ({
      ...frame(row), text: row.text, status: row.client_ref ? statuses.get(row.client_ref) : undefined,
    }));
  return { contact, assignee, closed, messages };
}

export async function snapshot(inbox: Inbox) {
  const pairs = await Promise.all(workspaces.map(async workspace => {
    const contacts: Record<string, { inbound: string[]; assignee: string | null }> = Object.create(null);
    const outbound: Record<string, Status> = Object.create(null);
    const rows = await inbox.events.find({ workspace }).sort({ seq: 1 }).toArray();
    for (const row of rows) {
      const c = contacts[row.contact] ??= { inbound: [], assignee: null };
      if (row.assignee) c.assignee = row.assignee;
      if (row.client_ref && row.status) outbound[row.client_ref] = row.status;
    }
    for (const row of rows.filter(e => e.type === 'message.inbound').sort(chronology)) {
      contacts[row.contact].inbound.push(row.message_id!);
    }
    return [workspace, { contacts, outbound }];
  }));
  return { workspaces: Object.fromEntries(pairs) };
}
