'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { avatarEmoji } from '@slgh/shared/src/avatars';
import { playerMessage } from '@slgh/shared/src/errors';

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** One group: threads, members, and (for the owner) the invite code and member controls. */
export default function GroupClient({ id }: { id: string }) {
  const router = useRouter();
  const g = useQuery(api.groups.get, { id });
  const createThread = useMutation(api.groups.createThread);
  const removeMember = useMutation(api.groups.removeMember);
  const leave = useMutation(api.groups.leave);
  const removeGroup = useMutation(api.groups.remove);
  const newCode = useMutation(api.groups.newInviteCode);
  const [post, setPost] = useState({ title: '', body: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (g === undefined) return <main className="mx-auto max-w-3xl p-4 text-muted">Loading…</main>;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(playerMessage(e)); }
    setBusy(false);
  };
  const onPost = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const threadId = await createThread({ groupId: id, title: post.title, body: post.body });
      router.push(`/groups/${id}/t/${threadId}`);
    });
  };
  const invite = g.inviteCode && `Join my team "${g.name}" on SL Game Hub: open ${typeof window === 'undefined' ? '' : location.origin}/groups and enter code ${g.inviteCode}`;

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <Link href="/groups" className="back-link">← All groups</Link>
      <header className="space-y-1">
        <h1>{g.name}</h1>
        {g.description && <p className="text-muted">{g.description}</p>}
        <p className="text-sm text-muted">{g.member_count} {g.member_count === 1 ? 'member' : 'members'}</p>
      </header>

      {g.isOwner && g.inviteCode && (
        <section className="card flex flex-wrap items-center gap-3 p-4">
          <span className="text-sm text-muted">Invite code</span>
          <span className="font-mono text-2xl font-bold tracking-widest">{g.inviteCode}</span>
          <span className="flex flex-wrap gap-2">
            <a className="btn btn-sm btn-primary" href={`https://wa.me/?text=${encodeURIComponent(invite!)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => navigator.clipboard?.writeText(g.inviteCode!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
              onClick={() => { if (confirm('Make a new code? The old one stops working.')) void run(() => newCode({ groupId: id })); }}>New code</button>
          </span>
        </section>
      )}

      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Threads</h2>
        {g.threads.length === 0 ? <p className="card p-4 text-muted">No threads yet. Start the first one below.</p> : (
          <ul className="space-y-2">
            {g.threads.map((t) => (
              <li key={t.id}>
                <Link href={`/groups/${id}/t/${t.id}`} className="card card-hover flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0"><span className="block truncate font-semibold">{t.title}</span><span className="text-xs text-muted">by {t.author}</span></span>
                  <span className="shrink-0 text-right text-xs text-muted">{t.reply_count} {t.reply_count === 1 ? 'reply' : 'replies'}<br />{when(t.last_post_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={onPost} className="card space-y-3 p-4">
        <h2 className="text-lg font-bold">Start a thread</h2>
        <input className="input" required minLength={3} maxLength={100} placeholder="Title" aria-label="Thread title" value={post.title} onChange={(e) => setPost({ ...post, title: e.target.value })} />
        <textarea className="input min-h-[96px]" required maxLength={2000} placeholder="Say something to the team" aria-label="First post" value={post.body} onChange={(e) => setPost({ ...post, body: e.target.value })} />
        <button className="btn btn-primary" disabled={busy || post.title.trim().length < 3 || !post.body.trim()}>Post</button>
      </form>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Members</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {g.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 rounded-xl border border-border p-2">
              <span aria-hidden className="text-xl">{avatarEmoji(m.avatar)}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{m.username}</span>
              {m.role === 'owner' ? <span className="chip chip-muted">Owner</span> : g.isOwner && (
                <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={busy}
                  onClick={() => { if (confirm(`Remove ${m.username} from the group?`)) void run(() => removeMember({ groupId: id, userId: m.userId as Id<'users'> })); }}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {g.isOwner ? (
        <button type="button" className="btn btn-ghost w-full text-danger" disabled={busy}
          onClick={() => { if (confirm('Delete this group and all its posts? This cannot be undone.')) void run(async () => { await removeGroup({ groupId: id }); router.push('/groups'); }); }}>Delete group</button>
      ) : (
        <button type="button" className="btn btn-ghost w-full text-danger" disabled={busy}
          onClick={() => { if (confirm('Leave this group?')) void run(async () => { await leave({ groupId: id }); router.push('/groups'); }); }}>Leave group</button>
      )}
    </main>
  );
}
