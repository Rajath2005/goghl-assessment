export type User = { sub: string; name: string; workspaces: { id: string; role: string }[] };
export type Message = { seq: number; at: string; text: string; type: string; status?: string };
export type Conversation = { contact: string; assignee: string | null; closed: boolean; activity: string; preview: string | null };
export type Thread = { contact: string; assignee: string | null; closed: boolean; messages: Message[] };
export type Page = { items: Conversation[]; nextOffset: number | null; after: number };
export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export async function api<T>(path: string, query: Record<string, string> = {}, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch('/api/' + path + '?' + new URLSearchParams(query), {
    signal, cache: 'no-store', method: body === undefined ? 'GET' : 'POST',
    ...(body !== undefined && { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== 'me') window.dispatchEvent(new Event('session-ended'));
    throw new ApiError(res.status, error.error || 'Request failed. Please try again.');
  }
  return res.headers.get('content-type')?.includes('application/json') ? res.json() : undefined as T;
}
export const workspaceName = (id: string) => id.replace(/^ws_/, '').replace(/(^|_)\w/g, s => s.replace('_', ' ').toUpperCase());
export const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
export const human = (id: string) => id.replace(/^u_/, '').replace(/^./, c => c.toUpperCase());
export const displayTime = (at: string) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export function listTime(at: string) {
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString() ? displayTime(at) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
