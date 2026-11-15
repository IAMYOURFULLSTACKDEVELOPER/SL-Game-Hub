'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import { playerMessage } from '@slgh/shared/src/errors';
import { PageHeader } from '@/components/PageHeader';
import { Icon } from '@/components/Icon';

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(ms).toLocaleDateString('en-GB');
};

/** Your groups, plus forms to create one (Pro) or join one with an invite code. */
export default function GroupsClient() {
  const router = useRouter();
  const data = useQuery(api.groups.mine);
  const create = useMutation(api.groups.create);
  const join = useMutation(api.groups.join);
  const invites = useQuery(api.groups.myInvites);
  const answer = useMutation(api.groups.answerInvite);
  const [form, setForm] = useState({ name: '', description: '', code: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (fn: () => Promise<string>) => {
    setBusy(true); setError('');
    try { router.push(`/groups/${await fn()}`); } catch (e) { setError(playerMessage(e)); setBusy(false); }
  };
  const onCreate = (e: FormEvent) => { e.preventDefault(); void go(() => create({ name: form.name, description: form.description || undefined })); };
  const onJoin = (e: FormEvent) => { e.preventDefault(); void go(() => join({ inviteCode: form.code })); };
  const onAnswer = async (inviteId: (typeof invites & object)[number]['id'], accept: boolean) => {
    setBusy(true); setError('');
    try {
      const groupId = await answer({ inviteId, accept });
      if (groupId) { router.push(`/groups/${groupId}`); return; }
    } catch (e) { setError(playerMessage(e)); }
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <PageHeader icon="users" tone="blue" title="Groups" subtitle="Your teams: chat channels, a forum, and the people you play with." />

      {!!invites?.length && (
        <section className="space-y-2" aria-label="Invites">
          <h2 className="flex items-center gap-2 text-lg"><Icon name="mail" size={18} />Invites</h2>
          <ul className="space-y-2">
            {invites.map((i) => (
              <li key={i.id} className="card pop-in flex flex-wrap items-center gap-3 border-accent/40 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{i.name}</span>
                  <span className="block text-sm text-muted">{i.from} invited you · {i.members} {i.members === 1 ? 'member' : 'members'}</span>
                  {i.description && <span className="block truncate text-sm text-muted">{i.description}</span>}
                </span>
                <span className="flex gap-2">
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void onAnswer(i.id, true)}><Icon name="check" size={15} />Join</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void onAnswer(i.id, false)}>Decline</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data === undefined ? <p className="text-muted">Loading…</p> : data.groups.length === 0 ? (
        <p className="card p-5 text-muted">You're not in any groups yet. Join one with a code from a friend{data.canCreate ? ', or start your own' : ''}.</p>
      ) : (
        <ul className="space-y-2">
          {data.groups.map((g) => (
            <li key={g.id}>
              <Link href={`/groups/${g.id}`} className="card card-hover flex items-center justify-between gap-3 p-4">
                <span className="icon-badge icon-badge-blue h-11 w-11 shrink-0 rounded-xl font-display font-bold" aria-hidden>{g.name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{g.name}{g.role === 'owner' && <span className="chip chip-muted ml-2">Owner</span>}</span>
                  {g.description && <span className="block truncate text-sm text-muted">{g.description}</span>}
                </span>
                <span className="shrink-0 text-right text-xs text-muted">{g.member_count} members<br />active {ago(g.last_post_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <form onSubmit={onJoin} className="card space-y-3 p-5">
          <h2 className="text-lg font-bold">Join a group</h2>
          <label className="label" htmlFor="group-code">Invite code</label>
          <input id="group-code" className="input font-mono uppercase tracking-widest" maxLength={8} required value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="ABCD2345" />
          <button className="btn btn-outline w-full" disabled={busy || form.code.length < 8}>Join</button>
        </form>

        <form onSubmit={onCreate} className="card space-y-3 p-5">
          <h2 className="text-lg font-bold">Start a group</h2>
          {data && !data.canCreate ? (
            <p className="text-sm text-muted">Creating groups is a Pro feature. <Link href="/pro" className="font-semibold text-secondary">Go Pro</Link> to start one for your team. Anyone can join it.</p>
          ) : (
            <>
              <label className="label" htmlFor="group-name">Name</label>
              <input id="group-name" className="input" required minLength={3} maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Freetown Kings" />
              <label className="label" htmlFor="group-desc">What it's for (optional)</label>
              <input id="group-desc" className="input" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <button className="btn btn-primary w-full" disabled={busy || form.name.trim().length < 3}>Create group</button>
            </>
          )}
        </form>
      </div>
    </main>
  );
}
