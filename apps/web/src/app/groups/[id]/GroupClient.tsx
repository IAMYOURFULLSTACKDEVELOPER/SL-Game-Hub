'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { playerMessage } from '@slgh/shared/src/errors';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { ChatView } from '@/components/chat/ChatView';
import { Schedule } from '@/components/schedule/Schedule';
import { sfx } from '@/lib/sound';

// One group, in tabs: Chat (its channels), Games (scheduled games and tournaments), Forum (threads),
// Members (and, for the owner, adding teammates).

type Tab = 'chat' | 'games' | 'forum' | 'members';
type Group = NonNullable<ReturnType<typeof useQuery<typeof api.groups.get>>>;

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
/** A colour for the group's badge, picked from its name */
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export default function GroupClient({ id }: { id: string }) {
  const g = useQuery(api.groups.get, { id });
  const params = useSearchParams();
  const router = useRouter();
  const tab = (['chat', 'games', 'forum', 'members'].includes(params.get('tab') ?? '') ? params.get('tab') : 'chat') as Tab;
  const setTab = (t: Tab) => { sfx('click'); router.replace(`/groups/${id}?tab=${t}`, { scroll: false }); };

  if (g === undefined) return <main className="mx-auto max-w-5xl p-4 text-muted"><span className="loading-dots">Loading the group</span></main>;
  const h = hue(g.name);

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-2 sm:p-4">
      <Link href="/groups" className="back-link">← All groups</Link>

      <header className="card overflow-hidden">
        <div className="h-16 sm:h-20" style={{ background: `linear-gradient(120deg, hsl(${h} 70% 42%), hsl(${(h + 50) % 360} 70% 32%))` }} />
        <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
          <span className="-mt-8 grid h-16 w-16 place-items-center rounded-2xl border-4 border-surface font-display text-2xl font-bold text-white shadow-lg"
            style={{ background: `hsl(${h} 65% 45%)` }} aria-hidden>
            {g.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate">{g.name}</h1>
            <p className="text-sm text-muted">
              {g.member_count} {g.member_count === 1 ? 'member' : 'members'} · {g.channels.length} {g.channels.length === 1 ? 'channel' : 'channels'} · started by {g.ownerName}
            </p>
          </div>
          {g.isOwner && <button type="button" className="btn btn-primary btn-sm" onClick={() => setTab('members')}><Icon name="plus" size={16} />Add teammates</button>}
        </div>
        {g.description && <p className="px-4 pb-4 text-sm text-muted">{g.description}</p>}
        <nav className="flex gap-1 overflow-x-auto border-t border-border/60 px-2" role="tablist" aria-label="Group sections">
          {([['chat', 'chat', 'Chat'], ['games', 'calendar', 'Games'], ['forum', 'book', 'Forum'], ['members', 'users', 'Members']] as const).map(([k, icon, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${tab === k ? 'border-primary text-heading' : 'border-transparent text-muted hover:text-text'}`}>
              <Icon name={icon} size={16} />{label}
              {k === 'members' && g.isOwner && g.invites.length > 0 && <span className="chip chip-muted text-[10px]">{g.invites.length} invited</span>}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'chat' && <ChatTab g={g} />}
      {tab === 'games' && <Schedule groupId={g.id} />}
      {tab === 'forum' && <ForumTab g={g} id={id} />}
      {tab === 'members' && <MembersTab g={g} id={id} />}
    </main>
  );
}

// ---- Chat -------------------------------------------------------------------------------------------------

function ChatTab({ g }: { g: Group }) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const createChannel = useMutation(api.groups.createChannel);
  const updateChannel = useMutation(api.groups.updateChannel);
  const removeChannel = useMutation(api.groups.removeChannel);
  const [form, setForm] = useState<{ mode: 'new' | 'edit'; name: string; topic: string } | null>(null);
  const [error, setError] = useState('');

  const current = g.channels.find((c) => c.id === channelId) ?? g.channels[0];
  useEffect(() => { if (channelId && !g.channels.some((c) => c.id === channelId)) setChannelId(null); }, [g.channels, channelId]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError('');
    try {
      if (form.mode === 'new') setChannelId(await createChannel({ groupId: g.id, name: form.name, topic: form.topic || undefined }));
      else if (current) await updateChannel({ channelId: current.id, name: form.name, topic: form.topic || undefined });
      setForm(null);
      sfx('toggleOn');
    } catch (err) { setError(playerMessage(err)); }
  };
  const del = async () => {
    if (!current || !confirm(`Delete #${current.name} and all its messages?`)) return;
    try { await removeChannel({ channelId: current.id }); setChannelId(null); setForm(null); } catch (err) { setError(playerMessage(err)); }
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <aside className="card shrink-0 p-2 lg:w-56" aria-label="Channels">
        <p className="hidden px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted lg:block">Channels</p>
        <div className="flex gap-1 overflow-x-auto lg:flex-col">
          {g.channels.map((c) => (
            <button key={c.id} type="button" onClick={() => { setChannelId(c.id); setForm(null); sfx('click'); }} aria-current={current?.id === c.id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${current?.id === c.id ? 'bg-primary/15 font-semibold text-heading' : 'text-muted hover:bg-bg/70 hover:text-text'}`}>
              <Icon name="hash" size={15} /><span className="truncate">{c.name}</span>
            </button>
          ))}
          {g.isOwner && (
            <button type="button" onClick={() => setForm({ mode: 'new', name: '', topic: '' })}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-secondary hover:bg-bg/70">
              <Icon name="plus" size={15} />Add channel
            </button>
          )}
        </div>
      </aside>

      <div className="card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {form && (
          <form onSubmit={save} className="space-y-2 border-b border-border/60 p-3">
            <p className="text-sm font-bold">{form.mode === 'new' ? 'New channel' : `Edit #${current?.name}`}</p>
            <div className="flex flex-wrap gap-2">
              <div className="flex min-w-[10rem] flex-1 items-center rounded-xl border border-border bg-bg px-2">
                <Icon name="hash" size={15} className="text-muted" />
                <input className="min-w-0 flex-1 bg-transparent p-2 outline-none" autoFocus required maxLength={30} placeholder="tactics" aria-label="Channel name"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '-') })} />
              </div>
              <input className="input min-w-[10rem] flex-[2]" maxLength={120} placeholder="What it's for (optional)" aria-label="Topic"
                value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </div>
            {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm" disabled={form.name.trim().length < 2}>{form.mode === 'new' ? 'Create channel' : 'Save'}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setForm(null); setError(''); }}>Cancel</button>
              {form.mode === 'edit' && g.channels.length > 1 && <button type="button" className="btn btn-ghost btn-sm ml-auto text-danger" onClick={() => void del()}>Delete channel</button>}
            </div>
          </form>
        )}
        {current ? (
          <ChatView
            key={current.id}
            where={{ channel: current.id }}
            className="h-[calc(100dvh-var(--top-h)-22rem)] min-h-[420px]"
            header={(
              <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                <Icon name="hash" size={18} className="text-muted" />
                <h2 className="truncate text-base">{current.name}</h2>
                {current.topic && <span className="hidden min-w-0 truncate text-sm text-muted sm:inline">· {current.topic}</span>}
                {g.isOwner && !form && (
                  <button type="button" className="btn btn-ghost btn-sm ml-auto" aria-label={`Edit #${current.name}`}
                    onClick={() => setForm({ mode: 'edit', name: current.name, topic: current.topic ?? '' })}>
                    <Icon name="settings" size={16} />
                  </button>
                )}
              </header>
            )}
          />
        ) : <p className="p-6 text-center text-muted">No channels yet.</p>}
      </div>
    </div>
  );
}

// ---- Forum ------------------------------------------------------------------------------------------------

function ForumTab({ g, id }: { g: Group; id: string }) {
  const router = useRouter();
  const createThread = useMutation(api.groups.createThread);
  const [post, setPost] = useState({ title: '', body: '' });
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onPost = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { router.push(`/groups/${id}/t/${await createThread({ groupId: id, title: post.title, body: post.body })}`); }
    catch (err) { setError(playerMessage(err)); setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-muted">Longer posts that stay put: match plans, rules, tips.</p>
        {!writing && <button type="button" className="btn btn-primary btn-sm" onClick={() => setWriting(true)}><Icon name="pencil" size={15} />New thread</button>}
      </div>
      {writing && (
        <form onSubmit={onPost} className="card pop-in space-y-3 p-4">
          <input className="input" autoFocus required minLength={3} maxLength={100} placeholder="Title" aria-label="Thread title" value={post.title} onChange={(e) => setPost({ ...post, title: e.target.value })} />
          <textarea className="input min-h-[110px]" required maxLength={2000} placeholder="Say something to the team" aria-label="First post" value={post.body} onChange={(e) => setPost({ ...post, body: e.target.value })} />
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy || post.title.trim().length < 3 || !post.body.trim()}>Post</button>
            <button type="button" className="btn btn-ghost" onClick={() => setWriting(false)}>Cancel</button>
          </div>
        </form>
      )}
      {g.threads.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <Icon name="book" size={28} className="text-muted" />
          <p className="font-semibold">No threads yet</p>
          <p className="text-sm text-muted">Start one for your next match or your team&apos;s rules.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {g.threads.map((t) => (
            <li key={t.id}>
              <Link href={`/groups/${id}/t/${t.id}`} className="card card-hover flex items-center gap-3 p-3">
                <span className="icon-badge icon-badge-blue h-10 w-10 shrink-0 rounded-xl"><Icon name="chat" size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{t.title}</span><span className="text-xs text-muted">by {t.author} · {ago(t.last_post_at)}</span></span>
                <span className="chip chip-muted shrink-0">{t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Members ----------------------------------------------------------------------------------------------

function MembersTab({ g, id }: { g: Group; id: string }) {
  const router = useRouter();
  const removeMember = useMutation(api.groups.removeMember);
  const leave = useMutation(api.groups.leave);
  const removeGroup = useMutation(api.groups.remove);
  const newCode = useMutation(api.groups.newInviteCode);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: playerMessage(e) }); }
    setBusy(false);
  };
  const shown = g.members
    .filter((m) => m.username.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.username.localeCompare(b.username)));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section className="card space-y-3 p-4" aria-label="Members">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg">Members <span className="text-muted">({g.member_count})</span></h2>
          {g.members.length > 6 && <input className="input w-40 py-1.5 text-sm" placeholder="Find a member" aria-label="Find a member" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        </div>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm font-semibold ${msg.ok ? 'text-primary' : 'text-danger'}`}>{msg.text}</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 rounded-xl border border-border p-2">
              <Avatar id={m.avatar} size={36} />
              <span className="min-w-0 flex-1">
                <Link href={`/u/${m.username}`} className="block truncate font-semibold text-text hover:underline">{m.username}</Link>
                <span className="text-xs text-muted">joined {new Date(m.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </span>
              {m.role === 'owner' ? <span className="chip chip-muted"><Icon name="crown" size={12} />Owner</span> : g.isOwner && (
                <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={busy} aria-label={`Remove ${m.username}`}
                  onClick={() => { if (confirm(`Remove ${m.username} from the group?`)) void run(() => removeMember({ groupId: id, userId: m.userId as Id<'users'> }), `${m.username} was removed.`); }}>
                  <Icon name="close" size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="border-t border-border/60 pt-3">
          {g.isOwner ? (
            <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={busy}
              onClick={() => { if (confirm('Delete this group with all its channels, messages and threads? This cannot be undone.')) void run(async () => { await removeGroup({ groupId: id }); router.push('/groups'); }); }}>Delete group</button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={busy}
              onClick={() => { if (confirm('Leave this group?')) void run(async () => { await leave({ groupId: id }); router.push('/groups'); }); }}>Leave group</button>
          )}
        </div>
      </section>

      {g.isOwner && (
        <div className="space-y-4">
          <AddTeammates g={g} id={id} />
          {g.inviteCode && (
            <section className="card space-y-2 p-4" aria-label="Invite code">
              <h2 className="text-base">Invite code</h2>
              <p className="text-sm text-muted">Anyone with the code can join.</p>
              <InviteCode code={g.inviteCode} name={g.name} onNew={() => { if (confirm('Make a new code? The old one stops working.')) void run(() => newCode({ groupId: id }), 'New code made.'); }} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function InviteCode({ code, name, onNew }: { code: string; name: string; onNew: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Join my team "${name}" on Dodo: open ${typeof window === 'undefined' ? '' : location.origin}/groups and enter code ${code}`;
  return (
    <>
      <p className="rounded-xl bg-bg/70 p-3 text-center font-mono text-2xl font-bold tracking-[0.3em]">{code}</p>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-sm btn-primary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}>
          {copied ? <><Icon name="check" size={14} />Copied</> : 'Copy'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onNew}><Icon name="refresh" size={14} />New code</button>
      </div>
    </>
  );
}

/** Owner: invite by username or email, or pick from people you've played online games with. */
function AddTeammates({ g, id }: { g: Group; id: string }) {
  const suggestions = useQuery(api.groups.suggestions, { groupId: id });
  const invite = useMutation(api.groups.invite);
  const inviteUserId = useMutation(api.groups.inviteUserId);
  const cancelInvite = useMutation(api.groups.cancelInvite);
  const [who, setWho] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const send = async (key: string, fn: () => Promise<string>) => {
    setBusy(key); setMsg(null);
    try { const name = await fn(); setMsg({ ok: true, text: `Invite sent to ${name}. They'll see it on their Groups page.` }); sfx('pop'); setWho(''); }
    catch (e) { setMsg({ ok: false, text: playerMessage(e) }); }
    setBusy(null);
  };

  return (
    <section className="card space-y-3 p-4" aria-label="Add teammates">
      <h2 className="text-base">Add teammates</h2>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send('typed', () => invite({ groupId: id, who })); }}>
        <input className="input min-w-0 flex-1" placeholder="Username or email" aria-label="Username or email" value={who}
          onChange={(e) => { setWho(e.target.value); setMsg(null); }} autoComplete="off" />
        <button className="btn btn-primary" disabled={who.trim().length < 2 || busy !== null}>{busy === 'typed' ? '…' : 'Invite'}</button>
      </form>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm font-semibold ${msg.ok ? 'text-primary' : 'text-danger'}`}>{msg.text}</p>}

      {g.invites.length > 0 && (
        <div>
          <p className="pb-1 text-xs font-bold uppercase tracking-wide text-muted">Waiting for an answer</p>
          <ul className="space-y-1">
            {g.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-sm">
                <Avatar id={i.avatar} size={28} />
                <span className="min-w-0 flex-1 truncate">{i.username}</span>
                <span className="text-xs text-muted">{ago(i.createdAt)}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cancelInvite({ inviteId: i.id })}>Cancel</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="pb-1 text-xs font-bold uppercase tracking-wide text-muted">People you&apos;ve played with</p>
        {suggestions === undefined ? <p className="text-sm text-muted"><span className="loading-dots">Looking</span></p>
          : suggestions.length === 0 ? <p className="text-sm text-muted">Play some online games and the people you meet will show up here.</p> : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {suggestions.map((s) => (
                <li key={s.userId} className="flex items-center gap-2 rounded-lg p-1 text-sm hover:bg-bg/60">
                  <Avatar id={s.avatar} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.username}</span>
                    <span className="text-xs text-muted">{s.games ? `${s.games} ${s.games === 1 ? 'game' : 'games'} together · ` : 'same room · '}{ago(s.lastAt)}</span>
                  </span>
                  {s.invited ? <span className="chip chip-muted text-xs">Invited</span> : (
                    <button type="button" className="btn btn-outline btn-sm" disabled={busy !== null}
                      onClick={() => void send(s.userId, () => inviteUserId({ groupId: id, userId: s.userId }))}>
                      {busy === s.userId ? '…' : 'Invite'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
      </div>
      <p className="text-xs text-muted">Invited players choose whether to join.</p>
    </section>
  );
}
