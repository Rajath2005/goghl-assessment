import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Page, type Thread } from './client';

export function useInbox(workspace: string, filter: string, contact: string | null) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ filter: string; data: Page }>();
  const [detail, setDetail] = useState<Thread>();
  const [error, setError] = useState('');
  const [head, setHead] = useState<number>();
  const [connection, setConnection] = useState('Connecting');
  const [loading, setLoading] = useState(false);
  useEffect(() => { setPages(1); }, [filter]);
  useEffect(() => {
    const cancel = new AbortController();
    setLoading(true);
    void (async () => {
      let offset = 0;
      let result: Page = { items: [], nextOffset: null, after: 0 };
      for (let i = 0; i < pages; i++) {
        const query: Record<string, string> = { workspace, filter, offset: String(offset), limit: '24' };
        if (i > 0) query.asOf = String(result.after);
        const next: Page = await api('conversations', query, undefined, cancel.signal);
        result = { ...next, after: i === 0 ? next.after : result.after, items: [...result.items, ...next.items] };
        if (next.nextOffset === null) break;
        offset = next.nextOffset;
      }
      if (!cancel.signal.aborted) {
        setList({ filter, data: result });
        setHead(v => v ?? result.after);
        setError('');
      }
    })().catch(e => { if (!cancel.signal.aborted) setError(e.message); })
      .finally(() => { if (!cancel.signal.aborted) setLoading(false); });
    return () => cancel.abort();
  }, [workspace, filter, pages, revision]);
  const [threadError, setThreadError] = useState('');
  useEffect(() => {
    if (!contact) return;
    const cancel = new AbortController();
    setThreadError('');
    api<Thread>('thread', { workspace, contact }, undefined, cancel.signal)
      .then(result => { if (!cancel.signal.aborted) setDetail(result); })
      .catch(e => { if (!cancel.signal.aborted) setThreadError(e.message); });
    return () => cancel.abort();
  }, [workspace, contact, revision]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (head === undefined) return;
    let live = true, cursor = head, backoff = 400;
    let socket: WebSocket, retry: ReturnType<typeof setTimeout>;
    const scheduleRefresh = () => {
      if (timer.current !== undefined) return;
      timer.current = setTimeout(() => { timer.current = undefined; refresh(); }, 150);
    };
    function connect() {
      const url = new URL('/ws', window.location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      url.search = new URLSearchParams({ workspace, after: String(cursor) }).toString();
      socket = new WebSocket(url);
      socket.onopen = () => {
        if (!live) return;
        setConnection('Live'); backoff = 400; scheduleRefresh();
      };
      socket.onmessage = event => {
        if (!live) return;
        const change = JSON.parse(event.data);
        if (Number.isSafeInteger(change.seq) && change.seq > cursor) { cursor = change.seq; scheduleRefresh(); }
      };
      socket.onclose = () => {
        if (!live) return;
        setConnection('Reconnecting');
        // Check for a revoked session even when the upgrade itself was refused.
        void api('conversations', { workspace, limit: '1' }).catch(() => {});
        retry = setTimeout(connect, backoff + Math.random() * 200);
        backoff = Math.min(8000, backoff * 2);
      };
    }
    connect();
    return () => {
      live = false; clearTimeout(timer.current); timer.current = undefined; clearTimeout(retry); socket?.close();
    };
  }, [workspace, head, refresh]);
  return { list: list?.filter === filter ? list.data : undefined, loading, detail: detail?.contact === contact ? detail : undefined,
    error, threadError, connection, refresh, more: () => setPages(n => n + 1) };
}
