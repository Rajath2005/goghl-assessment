import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, CircleAlert, CircleCheck, Clock3,
  Inbox, KeyRound, LogOut, Menu, MessageSquare, Plus, Radio, RotateCcw, Send, SlidersHorizontal,
  UserRound, UserRoundCheck, UserRoundPlus, UsersRound, X, type LucideIcon } from 'lucide-react';
import { Brand, PatchPanel } from './Brand';
import { api, ApiError, displayTime, human, initials, listTime, workspaceName, type Thread, type User } from './client';
import { useInbox } from './useInbox';
import { Composer } from './Composer';
import './style.css';

const folders: [string, string, LucideIcon][] = [
  ['open', 'Open inbox', Inbox], ['mine', 'Assigned to me', UserRoundCheck],
  ['unassigned', 'Unassigned', UsersRound], ['closed', 'Closed', Archive], ['all', 'All conversations', MessageSquare],
];
function Login({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  return <main className="login">
    <div className="login-content"><Brand/>
      <section className="login-prompt"><div className="login-icon"><Radio size={25}/></div>
        <h1>Your team inbox.</h1>
        <p>Sign in to pick up conversations, reply to customers and keep your team in sync.</p>
        {error ? <><p role="alert" className="inline-error">{error}</p><button className="primary" onClick={retry}><RotateCcw size={17}/>Try again</button></>
          : loading ? <p role="status">Checking your session…</p>
          : <a className="primary login-button" href="/auth/login"><KeyRound size={17}/> Sign in to Switchboard <ArrowRight size={18}/></a>}
      </section>
      <div className="login-foot">Workspace access is managed by your organization.</div>
    </div><div className="login-art"><PatchPanel/></div>
  </main>;
}

export function App() {
  const [user, setUser] = useState<User | null>(), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [workspace, setWorkspace] = useState('');
  useEffect(() => {
    const cancel = new AbortController();
    setError('');
    api<User>('me', {}, undefined, cancel.signal).then(u => {
      if (!cancel.signal.aborted) { setUser(u); setWorkspace(u.workspaces[0]?.id ?? ''); }
    }).catch(e => {
      if (cancel.signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else setError('Could not connect to Switchboard. Check your connection and try again.');
    });
    const expired = () => { setUser(null); setWorkspace(''); };
    window.addEventListener('session-ended', expired);
    return () => { cancel.abort(); window.removeEventListener('session-ended', expired); };
  }, [attempt]);
  const logout = async () => {
    await api('logout', {}, {});
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('sb:draft:')) sessionStorage.removeItem(key);
    setUser(null); setWorkspace('');
  };
  if (!user) return <Login loading={user === undefined} error={error} retry={() => setAttempt(n => n + 1)}/>;
  if (!workspace) return <main className="simple-state"><Brand/><h1>No workspaces assigned</h1><p>Ask your administrator for access.</p><button onClick={() => void logout()}>Sign out</button></main>;
  return <Workspace key={workspace} user={user} workspace={workspace} switchTo={setWorkspace} logout={logout}/>;
}

function Workspace({ user, workspace, switchTo, logout }: { user: User; workspace: string; switchTo: (w: string) => void; logout: () => Promise<void> }) {
  const [filter, setFilter] = useState('open'), [contact, choose] = useState<string | null>(null);
  const [menu, setMenu] = useState(false), [newThread, setNewThread] = useState(false);
  const [draftContact, setDraftContact] = useState<string>(), [entered, setEntered] = useState('');
  const [mobileThread, setMobileThread] = useState(false), [actionError, setActionError] = useState(''), [pending, setPending] = useState(false);
  const view = useInbox(workspace, filter, contact === draftContact ? null : contact);
  const dialog = useRef<HTMLDialogElement>(null);
  const lastMessage = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const detail: Thread | undefined = contact && contact === draftContact ? { contact, closed: false, assignee: null, messages: [] } : view.detail;
  const select = useCallback((id: string) => { choose(id); setMobileThread(true); setActionError(''); stickToBottom.current = true; }, []);
  useEffect(() => {
    if (!contact && view.list?.items[0] && window.matchMedia('(min-width: 861px)').matches) choose(view.list.items[0].contact);
  }, [view.list, contact]);
  useEffect(() => {
    if (stickToBottom.current) lastMessage.current?.scrollIntoView({ block: 'nearest' });
  }, [contact, detail?.messages.length]);
  useEffect(() => {
    if (newThread) dialog.current?.showModal(); else dialog.current?.close();
  }, [newThread]);
  const selectFolder = (id: string) => { setFilter(id); choose(null); setDraftContact(undefined); setMenu(false); setMobileThread(false); setActionError(''); };
  async function mutate(path: string, body: object) {
    setPending(true); setActionError('');
    try {
      await api(path, { workspace }, { contact, ...body });
      setDraftContact(undefined); view.refresh();
    } catch (e) { setActionError((e as Error).message); view.refresh(); }
    finally { setPending(false); }
  }
  const caption = folders.find(f => f[0] === filter)![1];
  const role = user.workspaces.find(w => w.id === workspace)?.role;
  return <main className={'workspace' + (mobileThread ? ' showing-thread' : '')}>
    {menu && <button className="nav-overlay" aria-label="Dismiss navigation" onClick={() => setMenu(false)}/>}
    <aside className={'sidebar' + (menu ? ' expanded' : '')}><Brand/>
      <div className="workspace-picker"><span className="tenant-mark">{workspaceName(workspace).slice(0, 1)}</span>
        <div><small>Workspace</small><strong>{workspaceName(workspace)}</strong></div>
        <ChevronDown size={15}/><select aria-label="Workspace" value={workspace} onChange={e => switchTo(e.target.value)}>
          {user.workspaces.map(w => <option key={w.id} value={w.id}>{workspaceName(w.id)}</option>)}</select>
      </div>
      <nav aria-label="Inbox folders"><span className="nav-heading">Conversations</span>
        {folders.map(([id, title, Icon]) => <button key={id} aria-current={filter === id ? 'page' : undefined}
          onClick={() => selectFolder(id)}><Icon size={18}/>{title}</button>)}
      </nav>
      <div className="identity"><span className="initials">{initials(user.name)}</span><div><strong>{user.name}</strong><small>{role}</small></div>
        <button className="icon" title="Sign out" aria-label="Sign out" onClick={() => { void logout().catch(e => setActionError(e.message)); }}><LogOut size={17}/></button></div>
    </aside>
    <div className="desk">
      <header className="desk-bar"><button className="icon menu-toggle" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}><Menu size={19}/></button>
        <span>{workspaceName(workspace)}</span><span className="crumb">/</span><strong>Team inbox</strong>
        <span role="status" className={'connection ' + (view.connection === 'Live' ? 'online' : '')}><i/>{view.connection}</span>
      </header>
      <div className="panes"><section className="inbox-list" aria-label="Conversation list">
        <div className="list-title"><h1>{caption}</h1><button className="icon new-message" title="New conversation" aria-label="New conversation"
          onClick={() => { setEntered(''); setNewThread(true); }}><Plus size={20}/></button></div>
        <div className="list-order"><SlidersHorizontal size={13}/> Newest activity first</div>
        <div className="rows">
          {view.error ? <div className="list-state" role="alert">{view.error}<button onClick={view.refresh}>Retry</button></div>
            : !view.list ? <div className="list-state" role="status">Loading conversations…</div>
            : !view.list.items.length ? <div className="list-state"><Inbox/><strong>{filter === 'mine' ? 'No conversations assigned to you' : 'No conversations here'}</strong>
              <span>{filter === 'open' ? 'New customer messages will appear here.' : 'Choose another folder to see more conversations.'}</span></div>
            : view.list.items.map(row => <button key={row.contact} className={'contact-row' + (row.contact === contact ? ' selected' : '')}
              aria-pressed={row.contact === contact} onClick={() => { setDraftContact(undefined); select(row.contact); }}>
              <span className="contact-line"><strong>{row.contact}</strong><time dateTime={row.activity}>{listTime(row.activity)}</time></span>
              <span className="preview">{row.preview || 'No messages yet'}</span>
              <span className="row-assignee">{row.closed ? <><Archive/>Closed</> : row.assignee ? <><UserRoundCheck/>{row.assignee === user.sub ? 'You' : human(row.assignee)}</> : <><UserRound/>Unassigned</>}</span>
            </button>)}
          {view.list?.nextOffset != null && <button className="more" onClick={view.more} disabled={view.loading}>{view.loading ? 'Loading…' : 'Load more conversations'}</button>}
        </div>
      </section>
      <section className="thread" aria-label="Conversation">
        {!contact ? <div className="empty-thread"><div className="empty-mark"><MessageSquare size={33}/></div><h2>Select a conversation</h2><p>Pick a contact from the inbox to read and reply.</p></div> :
          <><header className="thread-head"><button className="icon back" aria-label="Back to inbox" onClick={() => setMobileThread(false)}><ArrowLeft size={17}/></button>
            <div className="contact-avatar"><UserRound size={22}/></div><div className="thread-name"><h2>{contact}</h2><span>Customer conversation</span></div>
            {detail && <button className="quiet close-thread" disabled={pending} onClick={() => void mutate('close', { closed: !detail.closed })} hidden={!!draftContact}>
              {detail.closed ? <RotateCcw size={15}/> : <CircleCheck size={15}/>} {detail.closed ? 'Reopen' : 'Close'}</button>}</header>
            {actionError && <div className="action-error" role="alert">{actionError}</div>}
            {view.threadError && !draftContact ? <div className="list-state" role="alert">{view.threadError}<button onClick={view.refresh}>Retry</button></div>
              : !detail ? <div className="list-state" role="status">Loading messages…</div> :
              <><div className="assignment"><span className={'open-state' + (detail.closed ? ' closed' : '')}><i/>{detail.closed ? 'Closed' : 'Open'}</span>
                <span><UserRound size={14}/>{detail.assignee === user.sub ? 'Assigned to you' : detail.assignee ? 'Assigned to ' + human(detail.assignee) : 'Unassigned'}</span>
                {!detail.assignee && <button disabled={pending} onClick={() => void mutate('claim', {})}><UserRoundPlus size={14}/>Claim</button>}</div>
              <div className="messages" onScroll={e => { const el = e.currentTarget; stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
                {!detail.messages.length && <div className="first-message"><Send size={23}/><h3>Start the conversation</h3><p>Your first reply will be sent to {contact}.</p></div>}
                {detail.messages.map((m, i, all) => {
                  const outbound = m.type === 'message.queued';
                  const date = new Date(m.at);
                  const dayBreak = i === 0 || new Date(all[i - 1].at).toDateString() !== date.toDateString();
                  const StatusIcon = m.status === 'delivered' ? CheckCheck : m.status === 'failed' ? CircleAlert : m.status === 'sent' ? Check : Clock3;
                  return <div key={m.seq}>{dayBreak && <div className="day-break"><span>{date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>}
                    <article className={'message ' + (outbound ? 'outgoing' : 'incoming')} aria-label={outbound ? 'Agent reply' : 'Customer message'}>
                      <div className="bubble">{m.text}</div><div className="message-meta"><time dateTime={m.at}>{displayTime(m.at)}</time>
                        {outbound && <span className={m.status}><StatusIcon size={13}/>{m.status}</span>}</div></article></div>;
                })}<div ref={lastMessage}/>
              </div>
              {detail.closed ? <div className="closed-note"><Archive size={17}/>Reopen this conversation to reply.</div> :
                <Composer key={contact} workspace={workspace} contact={contact} sub={user.sub} onSent={() => { setDraftContact(undefined); stickToBottom.current = true; view.refresh(); }}/>}
              </>}
          </>}
      </section></div>
    </div>
    <dialog ref={dialog} onCancel={() => setNewThread(false)} onClose={() => setNewThread(false)}>
      <form onSubmit={e => {
        e.preventDefault(); const id = entered.trim(); if (!id) return;
        setNewThread(false); setActionError('');
        void api<Thread>('thread', { workspace, contact: id }).then(() => { setDraftContact(undefined); select(id); })
          .catch(e => { if (e instanceof ApiError && e.status === 404) { setDraftContact(id); select(id); } else setActionError(e.message); });
      }}><div className="dialog-title"><h2>New conversation</h2><button className="icon" type="button" onClick={() => setNewThread(false)} aria-label="Cancel"><X size={18}/></button></div>
        <label htmlFor="new-contact">Customer phone number</label><input id="new-contact" type="tel" placeholder="+14155550101" value={entered}
          autoFocus required maxLength={128} onChange={e => setEntered(e.target.value)}/><button className="primary" disabled={!entered.trim()}>Open conversation</button></form>
    </dialog>
    {actionError && !contact && <div role="alert" className="toast">{actionError}</div>}
  </main>;
}
