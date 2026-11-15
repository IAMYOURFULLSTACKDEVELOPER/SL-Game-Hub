'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { playerMessage } from '@slgh/shared/src/errors';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { sfx } from '@/lib/sound';

// Following, and inviting the people you follow to games:
//  - FollowButton: follow / following (with "follows you" and "follow back")
//  - PersonRow: a player in a list, linking to their page
//  - FriendPicker: tick friends to invite to a game that doesn't exist yet (the schedule form)
//  - InviteFriends: invite friends to the room you're in, one tap each
//  - InviteToEvent: invite friends to a scheduled game

export type Person = { id: Id<'users'>; username: string; avatar: string; pro: boolean; iFollow: boolean; followsMe: boolean };

export function FollowButton({ person, size = 'sm', className = '' }: { person: Pick<Person, 'id' | 'username' | 'iFollow' | 'followsMe'>; size?: 'sm' | 'md'; className?: string }) {
  const follow = useMutation(api.social.follow);
  const unfollow = useMutation(api.social.unfollow);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState('');
  const sz = size === 'sm' ? 'btn-sm' : '';
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(playerMessage(e)); }
    setBusy(false);
  };
  if (person.iFollow) {
    return (
      <button type="button" className={`btn ${sz} btn-outline ${hover ? 'text-danger' : ''} ${className}`} disabled={busy}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={error || undefined}
        aria-label={`Unfollow ${person.username}`}
        onClick={() => run(async () => { await unfollow({ userId: person.id }); sfx('toggleOff'); })}>
        <Icon name={hover ? 'close' : 'userCheck'} size={15} />{hover ? 'Unfollow' : 'Following'}
      </button>
    );
  }
  return (
    <button type="button" className={`btn ${sz} btn-primary ${className}`} disabled={busy} title={error || undefined}
      aria-label={`Follow ${person.username}`}
      onClick={() => run(async () => { await follow({ userId: person.id }); sfx('toggleOn'); })}>
      <Icon name="userPlus" size={15} />{person.followsMe ? 'Follow back' : 'Follow'}
    </button>
  );
}

export function PersonRow({ p, children, sub }: { p: Person; children?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-hover">
      <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3 hover:no-underline">
        <Avatar id={p.avatar} size={38} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 truncate font-semibold text-heading">
            {p.username}
            {p.pro && <span className="chip chip-accent px-1.5 py-0 text-[10px]">PRO</span>}
          </span>
          <span className="block truncate text-xs text-muted">
            {sub ?? (p.iFollow && p.followsMe ? 'Friends: you follow each other' : p.followsMe ? 'Follows you' : p.iFollow ? 'You follow them' : '')}
          </span>
        </span>
      </Link>
      {children}
    </li>
  );
}

function NoFriends({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 text-center ${compact ? 'p-3' : 'p-6'}`}>
      <Icon name="users" size={26} className="text-muted" />
      <p className="text-sm font-semibold">No friends to invite yet</p>
      <p className="text-xs text-muted">Follow people you like playing with and they&apos;ll show up here.</p>
      <Link href="/friends?tab=find" className="btn btn-sm btn-outline mt-1"><Icon name="search" size={14} />Find people</Link>
    </div>
  );
}

/** Search box over a friends list (only shown when the list is long). */
function useFilter<T extends { username: string }>(list: T[] | undefined) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => (list ?? []).filter((p) => p.username.toLowerCase().includes(q.trim().toLowerCase())), [list, q]);
  const box = (list?.length ?? 0) > 6 ? (
    <label className="relative block">
      <span className="sr-only">Search friends</span>
      <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input className="input pl-9" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} />
    </label>
  ) : null;
  return { shown, box };
}

/** Tick friends to invite (used before the game exists, e.g. when scheduling). */
export function FriendPicker({ selected, onChange }: { selected: Id<'users'>[]; onChange: (ids: Id<'users'>[]) => void }) {
  const friends = useQuery(api.social.invitable, {});
  const { shown, box } = useFilter(friends);
  if (friends === undefined) return <p className="text-sm text-muted"><span className="loading-dots">Loading friends</span></p>;
  if (!friends.length) return <NoFriends compact />;
  const toggle = (id: Id<'users'>) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : selected.length >= 20 ? selected : [...selected, id]);
  return (
    <div className="space-y-2">
      {box}
      <ul className="max-h-60 space-y-0.5 overflow-y-auto rounded-lg border border-border/60 p-1">
        {shown.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id}>
              <label className={`flex cursor-pointer items-center gap-3 rounded-md p-2 transition-colors ${on ? 'bg-primary/10' : 'hover:bg-hover'}`}>
                <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-primary))]" checked={on} onChange={() => toggle(p.id)} />
                <Avatar id={p.avatar} size={30} />
                <span className="min-w-0 flex-1 truncate font-semibold">{p.username}</span>
                {p.lastPlayed > 0 && <span className="text-[11px] text-muted">played together</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">{selected.length ? `${selected.length} friend${selected.length === 1 ? '' : 's'} will get an invite.` : 'Pick friends to invite (up to 20).'}</p>
    </div>
  );
}

/** Invite friends to the online room you're in. Each gets a notification that opens the room. */
export function InviteFriends({ code, title }: { code: string; title: string }) {
  const friends = useQuery(api.social.invitable, { code });
  const invite = useMutation(api.social.inviteToRoom);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { shown, box } = useFilter(friends);
  const send = async (ids: Id<'users'>[], key: string) => {
    setSending(key); setError('');
    try { const r = await invite({ code, userIds: ids }); if (r.sent) sfx('success'); } catch (e) { setError(playerMessage(e)); }
    setSending(null);
  };
  const open = (friends ?? []).filter((p) => !p.inRoom && !p.invited);
  return (
    <section className="card space-y-2 p-4" aria-labelledby="invite-friends">
      <div className="flex items-center gap-2">
        <h3 id="invite-friends" className="flex flex-1 items-center gap-2 text-base"><Icon name="userPlus" size={18} />Invite friends</h3>
        {open.length > 1 && (
          <button type="button" className="btn btn-sm btn-outline" disabled={!!sending} onClick={() => send(open.slice(0, 20).map((p) => p.id), 'all')}>
            <Icon name="send" size={14} />{sending === 'all' ? 'Sending…' : `Invite all (${Math.min(open.length, 20)})`}
          </button>
        )}
      </div>
      {friends === undefined ? <p className="text-sm text-muted"><span className="loading-dots">Loading</span></p>
        : !friends.length ? <NoFriends compact />
          : (
            <>
              <p className="text-xs text-muted">They get a notification to join your {title} room.</p>
              {box}
              <ul className="max-h-72 space-y-0.5 overflow-y-auto">
                {shown.map((p) => (
                  <PersonRow key={p.id} p={p}>
                    {p.inRoom ? <span className="chip chip-muted text-xs"><Icon name="check" size={12} />In the room</span>
                      : p.invited ? <span className="chip text-xs text-primary"><Icon name="check" size={12} />Invited</span>
                        : (
                          <button type="button" className="btn btn-sm btn-primary" disabled={!!sending} onClick={() => send([p.id], p.id)}>
                            <Icon name="send" size={14} />{sending === p.id ? 'Sending…' : 'Invite'}
                          </button>
                        )}
                  </PersonRow>
                ))}
              </ul>
            </>
          )}
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}

/** Invite friends to a scheduled game (the host, or anyone going). */
export function InviteToEvent({ eventId, onDone }: { eventId: Id<'scheduled_games'>; onDone: () => void }) {
  const friends = useQuery(api.social.invitable, { eventId });
  const invite = useMutation(api.schedule.invite);
  const [picked, setPicked] = useState<Id<'users'>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const { shown, box } = useFilter(friends);
  const send = async () => {
    setBusy(true); setError('');
    try { const r = await invite({ eventId, userIds: picked }); setSent(r.sent); setPicked([]); sfx('success'); } catch (e) { setError(playerMessage(e)); }
    setBusy(false);
  };
  return (
    <div className="space-y-2 border-t border-border/60 bg-bg/30 p-3">
      {friends === undefined ? <p className="text-sm text-muted"><span className="loading-dots">Loading</span></p>
        : !friends.length ? <NoFriends compact />
          : (
            <>
              {box}
              <ul className="max-h-60 space-y-0.5 overflow-y-auto">
                {shown.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <li key={p.id}>
                      <label className={`flex items-center gap-3 rounded-md p-2 ${p.invited ? 'opacity-60' : 'cursor-pointer hover:bg-hover'} ${on ? 'bg-primary/10' : ''}`}>
                        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-primary))]" disabled={p.invited} checked={on || p.invited}
                          onChange={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id].slice(0, 20))} />
                        <Avatar id={p.avatar} size={28} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{p.username}</span>
                        {p.invited && <span className="text-xs text-primary">Invited</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      {sent !== null && <p className="text-sm font-semibold text-primary" aria-live="polite">{sent ? `Invited ${sent} friend${sent === 1 ? '' : 's'}.` : 'They were already invited.'}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || !picked.length} onClick={send}>
          <Icon name="send" size={14} />{busy ? 'Sending…' : picked.length ? `Invite ${picked.length}` : 'Invite'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDone}>Close</button>
      </div>
    </div>
  );
}
