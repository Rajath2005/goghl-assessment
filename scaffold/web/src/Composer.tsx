import { useState, type FormEvent } from 'react';
import { Send, CornerDownLeft } from 'lucide-react';
import { api } from './client';

type Draft = { text: string; ref: string };
function newDraft(text = ''): Draft { return { text, ref: crypto.randomUUID() }; }
export function Composer({ workspace, contact, sub, onSent }: {
  workspace: string; contact: string; sub: string; onSent: () => void;
}) {
  const key = 'sb:draft:' + JSON.stringify([sub, workspace, contact]);
  const [draft, setDraft] = useState<Draft>(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null'); if (saved?.ref && typeof saved.text === 'string') return saved; } catch { /* storage unavailable */ }
    return newDraft();
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  function update(value: Draft) {
    setDraft(value);
    try { if (value.text) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); } catch { /* editing still works */ }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy || !draft.text.trim()) return;
    setBusy(true); setError('');
    try {
      await api('reply', { workspace }, { contact, text: draft.text.trim(), client_ref: draft.ref });
      update(newDraft()); onSent();
    } catch (e) { setError((e as Error).message + ' You can retry this reply.'); }
    finally { setBusy(false); }
  }
  return <form className="composer" onSubmit={send}>
    <label htmlFor="reply">Reply to customer</label>
    <textarea id="reply" placeholder="Write a reply…" value={draft.text} disabled={busy} maxLength={8000}
      onChange={e => update(newDraft(e.target.value))}
      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}/>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="compose-actions"><span className="key-hint"><CornerDownLeft size={14}/> Ctrl / ⌘ + Enter</span>
      <button className="primary" disabled={!draft.text.trim() || busy}><Send size={15}/>{busy ? 'Sending…' : 'Send reply'}</button></div>
  </form>;
}
