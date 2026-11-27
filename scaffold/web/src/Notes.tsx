import { useEffect, useRef, useState } from 'react';
import { KeyRound, LockKeyhole, X } from 'lucide-react';
import { api, human } from './client';
import { generateSecret, importSecret, seal, unseal, type NoteKey, type SealedNote } from './cryptoNotes';

export function KeyDialog({ workspace, admin, done, close }: {
  workspace: string; admin: boolean; done: (key: NoteKey) => void; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(), [input, setInput] = useState(''), [generated, setGenerated] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const cancel = new AbortController();
    api<{ fingerprint: string | null }>('note-key', { workspace }, undefined, cancel.signal).then(r => setFingerprint(r.fingerprint))
      .catch(e => { if (!cancel.signal.aborted) setError(e.message); });
    return () => cancel.abort();
  }, [workspace]);
  async function unlock() {
    setError(''); setBusy(true);
    try {
      const local = await importSecret(generated || input.trim());
      if (generated) await api('note-key', { workspace }, { fingerprint: local.fingerprint });
      else if (local.fingerprint !== fingerprint) throw new Error('This key belongs to a different workspace or was entered incorrectly.');
      done(local);
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} onCancel={close}><form onSubmit={e => { e.preventDefault(); void unlock(); }}>
    <div className="dialog-title"><h2>Private note key</h2><button type="button" className="icon" aria-label="Cancel" onClick={close}><X size={18}/></button></div>
    {fingerprint === undefined ? <p>Checking workspace key…</p> : fingerprint ? <>
      <p>Enter the key shared by your workspace administrator. It stays in this tab until you leave the workspace.</p>
      <label htmlFor="note-key">Workspace key</label><input type="password" id="note-key" value={input} autoComplete="off" spellCheck={false}
        onChange={e => setInput(e.target.value)} required maxLength={64}/>
      <button className="primary" disabled={busy || !input.trim()}><KeyRound size={15}/>Unlock notes</button>
    </> : !admin ? <p>Ask a workspace administrator to set up private notes and share the key with you.</p> :
      generated ? <><p>Save this key in your password manager and share it with workspace members through a trusted channel. Switchboard cannot recover it.</p>
        <label htmlFor="created-key">New workspace key</label><input id="created-key" readOnly value={generated} onFocus={e => e.target.select()}/>
        <button className="primary" disabled={busy}>I saved the key. Enable notes</button></> :
        <><p>Create a workspace key to encrypt team notes on this device before they are stored.</p>
          <button type="button" className="primary" onClick={() => setGenerated(generateSecret())}><KeyRound size={15}/>Generate workspace key</button></>}
    {error && <p role="alert" className="inline-error">{error}</p>}
  </form></dialog>;
}

export function PrivateNote({ workspace, contact, note, unlocked, open }: {
  workspace: string; contact: string; note: SealedNote; unlocked: NoteKey | null; open: () => void;
}) {
  const [text, setText] = useState('');
  useEffect(() => {
    let active = true;
    if (unlocked) unseal(unlocked, workspace, contact, note)
      .then(v => { if (active) setText(v); }).catch(() => { if (active) setText('This note could not be authenticated.'); });
    return () => { active = false; };
  }, [workspace, contact, note.id, note.ciphertext, unlocked]);
  return <div className="private-note"><strong><LockKeyhole size={13}/>Private note from {human(note.author)}</strong>
    {unlocked ? <p>{text || 'Decrypting…'}</p> : <button className="quiet" onClick={open}>Unlock to read</button>}</div>;
}

export function NoteComposer({ workspace, contact, sub, unlocked, open, onSent }: {
  workspace: string; contact: string; sub: string; unlocked: NoteKey | null; open: () => void; onSent: () => void;
}) {
  const [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef<SealedNote>(undefined);
  if (!unlocked) return <div className="note-unlock"><LockKeyhole size={16}/><span>Private notes use your workspace key.</span>
    <button className="quiet" onClick={open}>Unlock notes</button></div>;
  return <form className="composer note-composer" onSubmit={async e => {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setError(''); setBusy(true);
    try {
      const note = pending.current ??= await seal(unlocked, workspace, contact, sub, text.trim());
      await api('notes', { workspace }, { contact, id: note.id, fingerprint: note.fingerprint, iv: note.iv, ciphertext: note.ciphertext });
      setText(''); pending.current = undefined; onSent();
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>
    <label htmlFor="note-body">Private team note</label><textarea id="note-body" value={text} maxLength={8000} disabled={busy}
      onChange={e => { setText(e.target.value); pending.current = undefined; }} placeholder="Leave context for your team…"/>
    <div className="compose-actions"><span className="key-hint"><LockKeyhole size={13}/>Only your workspace</span>
      <button className="primary" disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save note'}</button></div>
    {error && <p role="alert" className="inline-error">{error}</p>}
  </form>;
}
