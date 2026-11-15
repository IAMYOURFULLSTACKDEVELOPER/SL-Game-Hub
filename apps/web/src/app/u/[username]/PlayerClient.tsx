'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { FollowButton, PersonRow } from '@/components/social/Social';

// A player's public page: follow them, turn their game alerts on or off, and see who they follow.

const count = (n: number) => (n > 1000 ? '1000+' : String(n));

export function PlayerClient({ username }: { username: string }) {
  const p = useQuery(api.social.profile, { username });
  const setNotify = useMutation(api.social.setNotify);
  const [list, setList] = useState<'followers' | 'following' | null>(null);
  const people = useQuery(api.social.list, list ? { username, which: list } : 'skip');

  if (p === undefined) return <p className="text-muted"><span className="loading-dots">Loading</span></p>;
  if (p === null) {
    return (
      <div className="card flex flex-col items-center gap-2 p-10 text-center">
        <Icon name="user" size={32} className="text-muted" />
        <p className="font-semibold">No player called {username}</p>
        <Link href="/friends?tab=find" className="btn btn-sm btn-outline"><Icon name="search" size={14} />Find people</Link>
      </div>
    );
  }
  const joined = new Date(p.joinedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/40 via-accent/30 to-primary/10" aria-hidden="true" />
        <div className="-mt-10 flex flex-wrap items-end gap-3 px-4 pb-4">
          <span className="rounded-full ring-4 ring-[rgb(var(--c-surface))]"><Avatar id={p.avatar} size={80} /></span>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="flex items-center gap-2 truncate text-2xl">
              {p.username}
              {p.pro && <span className="chip chip-accent text-xs">PRO</span>}
            </h1>
            <p className="text-sm text-muted">
              {p.fullName ? `${p.fullName} · ` : ''}{p.country ? `${p.country} · ` : ''}Joined {joined}
            </p>
          </div>
          {p.isMe ? (
            <Link href="/profile" className="btn btn-sm btn-outline"><Icon name="pencil" size={14} />Edit profile</Link>
          ) : p.signedIn ? (
            <div className="flex items-center gap-1.5">
              {p.iFollow && (
                <button type="button" className={`btn btn-sm btn-outline ${p.notify ? 'text-primary' : 'text-muted'}`} aria-pressed={p.notify}
                  title={p.notify ? 'You hear when they host or schedule a game' : 'Game alerts are off'}
                  onClick={() => setNotify({ userId: p.id, on: !p.notify }).catch(() => {})}>
                  <Icon name={p.notify ? 'bell' : 'bellOff'} size={15} />{p.notify ? 'Alerts on' : 'Alerts off'}
                </button>
              )}
              <FollowButton person={p} size="md" />
            </div>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(`/u/${p.username}`)}`} className="btn btn-primary"><Icon name="userPlus" size={16} />Sign in to follow</Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3 text-sm">
          <button type="button" className={`chip ${list === 'followers' ? 'border-primary text-primary' : 'chip-muted'}`} onClick={() => setList(list === 'followers' ? null : 'followers')}>
            <b className="text-heading">{count(p.followers)}</b> follower{p.followers === 1 ? '' : 's'}
          </button>
          <button type="button" className={`chip ${list === 'following' ? 'border-primary text-primary' : 'chip-muted'}`} onClick={() => setList(list === 'following' ? null : 'following')}>
            <b className="text-heading">{count(p.following)}</b> following
          </button>
          {p.followsMe && !p.isMe && <span className="chip chip-muted"><Icon name="userCheck" size={13} />Follows you</span>}
          {p.gamesTogether > 0 && <span className="chip chip-muted"><Icon name="gamepad" size={13} />{p.gamesTogether} game{p.gamesTogether === 1 ? '' : 's'} together</span>}
        </div>
      </section>

      {list && (
        <section className="card p-2" aria-label={list === 'followers' ? 'Followers' : 'Following'}>
          <h2 className="px-2 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wide text-muted">{list === 'followers' ? `Following ${p.username}` : `${p.username} follows`}</h2>
          {people === undefined ? <p className="p-2 text-sm text-muted"><span className="loading-dots">Loading</span></p>
            : people.length === 0 ? <p className="p-2 text-sm text-muted">Nobody yet.</p>
              : (
                <ul className="space-y-0.5">
                  {people.map((x) => (
                    <PersonRow key={x.id} p={x}>{p.signedIn && x.username !== p.username && <FollowButton person={x} />}</PersonRow>
                  ))}
                </ul>
              )}
        </section>
      )}

      {p.iFollow && !p.isMe && (
        <p className="text-center text-xs text-muted">
          {p.username} shows up in your friends list when you invite players to a room or a scheduled game.
        </p>
      )}
    </div>
  );
}
