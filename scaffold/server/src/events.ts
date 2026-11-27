import { MongoServerError, ObjectId, type Db, type Filter } from 'mongodb';
import { config } from './config.js';

export const workspaces = Object.keys(config.pigeon.apiKeys);
export type Status = 'queued' | 'sent' | 'delivered' | 'failed';
export type Change = {
  workspace: string;
  contact: string;
  at: Date;
  type: 'message.inbound' | 'message.queued' | 'message.status' | 'conversation.assigned' | 'conversation.closed' | 'conversation.reopened';
  message_id?: string;
  client_ref?: string;
  status?: Status;
  text?: string;
  assignee?: string;
  eventId?: string;
  // A logical operation key is independent of the delivery attempt.
  key?: string;
};
export type Entry = Change & {
  _id: ObjectId;
  seq: number;
  due?: Date;
  attempts?: number;
  lease?: string;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function field(value: unknown, name: string, max = 256): string {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > max || value.includes('\0')) {
    throw new HttpError(400, 'Invalid ' + name);
  }
  return value;
}
export function workspaceId(value: unknown): string {
  if (typeof value !== 'string' || !workspaces.includes(value)) throw new HttpError(400, 'Unknown workspace');
  return value;
}

export class Inbox {
  readonly events;
  constructor(db: Db) { this.events = db.collection<Entry>('sb_events', { writeConcern: { w: 'majority', j: true } }); }

  async initialize() {
    await this.events.createIndexes([
      { key: { workspace: 1, seq: 1 }, unique: true },
      { key: { workspace: 1, key: 1 }, unique: true, partialFilterExpression: { key: { $exists: true } } },
      { key: { workspace: 1, eventId: 1 }, unique: true, partialFilterExpression: { eventId: { $exists: true } } },
      { key: { workspace: 1, contact: 1, seq: 1 } },
      { key: { workspace: 1, client_ref: 1, seq: -1 }, partialFilterExpression: { client_ref: { $exists: true } } },
      { key: { workspace: 1, due: 1 }, partialFilterExpression: { due: { $exists: true } } },
    ]);
  }
  async tail(workspace: string) {
    return (await this.events.findOne({ workspace }, { sort: { seq: -1 }, projection: { seq: 1 } }))?.seq ?? 0;
  }

  // Read the head BEFORE checking preconditions. A competing append must
  // either be visible to those reads or collide on (workspace, seq).
  private async append(workspace: string, decide: () => Promise<Change | null>) {
    for (;;) {
      const head = await this.tail(workspace);
      const change = await decide();
      if (!change) return;
      try {
        await this.events.insertOne({
          ...change, _id: new ObjectId(), seq: head + 1,
          ...(change.type === 'message.queued' && { due: new Date(), attempts: 0 }),
        });
        return;
      } catch (err) {
        if (!(err instanceof MongoServerError) || err.code !== 11000) throw err;
        // Re-evaluate the winning operation. Never consume a sequence number
        // before its frame is durable, even when a writer dies.
        await new Promise(resolve => setTimeout(resolve, Math.random() * 12));
      }
    }
  }
  private async exists(workspace: string, filter: Filter<Entry>) {
    return !!await this.events.findOne({ workspace, ...filter }, { projection: { _id: 1 } });
  }
  async inbound(change: Change & { message_id: string; eventId: string }) {
    const key = 'in:' + change.message_id;
    await this.append(change.workspace, async () => await this.exists(change.workspace, { $or: [{ key }, { eventId: change.eventId }] })
      ? null : { ...change, type: 'message.inbound', key });
  }
  async reply(workspace: string, contact: string, text: string, client_ref: string) {
    const key = 'out:' + client_ref;
    await this.append(workspace, async () => await this.exists(workspace, { key }) ? null : {
      type: 'message.queued', workspace, contact, text, client_ref, key, status: 'queued', at: new Date(),
    });
  }
  async claim(workspace: string, contact: string, assignee: string) {
    const key = 'claim:' + contact;
    await this.append(workspace, async () => {
      const owner = await this.events.findOne({ workspace, key });
      if (owner && owner.assignee !== assignee) throw new HttpError(409, 'Another agent holds this conversation');
      return owner ? null : { type: 'conversation.assigned', workspace, contact, assignee, key, at: new Date() };
    });
  }
  async setClosed(workspace: string, contact: string, closed: boolean) {
    await this.append(workspace, async () => {
      if (!await this.exists(workspace, { contact })) throw new HttpError(404, 'Conversation not found');
      const prev = await this.events.findOne({ workspace, contact, type: { $in: ['conversation.closed', 'conversation.reopened'] } }, { sort: { seq: -1 } });
      if ((prev?.type === 'conversation.closed') === closed) return null;
      return { workspace, contact, type: closed ? 'conversation.closed' : 'conversation.reopened', at: new Date() };
    });
  }
  async status(workspace: string, client_ref: string, status: Exclude<Status, 'queued'>, at: Date, eventId?: string, jobId?: ObjectId) {
    await this.append(workspace, async () => {
      if (eventId && await this.exists(workspace, { eventId })) return null;
      if (jobId && !await this.exists(workspace, { _id: jobId, client_ref })) return null;
      const prev = await this.events.findOne({ workspace, client_ref }, { sort: { seq: -1 } });
      if (!prev || prev.status === status || prev.status === 'delivered' || prev.status === 'failed') return null;
      return { type: 'message.status', workspace, contact: prev.contact, client_ref, status, at, ...(eventId && { eventId }) };
    });
  }
}
