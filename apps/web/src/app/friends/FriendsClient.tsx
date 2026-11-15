'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import { Icon, type IconName } from '@/components/Icon';
import { FollowButton, PersonRow } from '@/components/social/Social';

// Friends: who you follow (with a bell per person for game alerts), who follows you, and finding people.
// The open tab is in the address (?tab=following|followers|find).

type Tab = 'following' | 'followers' | 'find';

function Empty({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 p-8 text-center">
      <Icon name={icon} size={30} className="text-muted" />
      <p className="font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-muted">{text}</p>
      {children}
    </div>
  );
}

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function FindPeople() {
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 250);
  const results = useQuery(api.social.search, term.length >= 2 ? { q: term } : 'skip');
  return (
    <div className="space-y-3 p-2">
      <label className="relative block">
        <span className="sr-only">Search by username</span>
        <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-9" autoFocus placeholder="Search by username" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {term.length < 2 ? <p className="px-1 text-sm text-muted">Type at least 2 letters of their username.</p>
        : results === undefined ? <p className="px-1 text-sm text-muted"><span className="loading-dots">Searching</span></p>
          : results.length === 0 ? <Empty icon="search" title="Nobody found" text={`No player's username starts with "${term}".`} />
            : <ul className="space-y-0.5">{results.map((p) => <PersonRow key={p.id} p={p}><FollowButton person={p} /></PersonRow>)}</ul>}
    </div>
  );
}

export function FriendsClient() {
  const data = useQuery(api.social.people, {});
  const setNotify = useMutation(api.social.setNotify);
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = ((['following', 'followers', 'find'] as const).find((t) => t === params.get('tab')) ?? 'following') as Tab;
  const setTab = (t: Tab) => router.replace(`${path}?tab=${t}`, { scroll: false });

  const tabs: [Tab, IconName, string, number | null][] = [
    ['following', 'userCheck', 'Following', data?.following.length ?? null],
    ['followers', 'users', 'Followers', data?.followers.length ?? null],
    ['find', 'search', 'Find people', null],
  ];

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <nav className="flex gap-1 overflow-x-auto border-b border-border/60 px-2" role="tablist" aria-label="Friends">
          {tabs.map(([k, icon, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${tab === k ? 'border-primary text-heading' : 'border-transparent text-muted hover:text-heading'}`}>
              <Icon name={icon} size={16} />{label}{n !== null && <span className="rounded-full bg-bg px-1.5 text-xs">{n}</span>}
            </button>
          ))}
        </nav>

        {tab === 'find' ? <FindPeople />
          : data === undefined ? <p className="p-4 text-muted"><span className="loading-dots">Loading</span></p>
            : tab === 'following' ? (
              data.following.length === 0
                ? <Empty icon="userPlus" title="You don't follow anyone yet" text="Follow people you like playing with. You'll see them when you invite players to a game, and hear when they host one.">
                    <button type="button" className="btn btn-sm btn-primary mt-1" onClick={() => setTab('find')}><Icon name="search" size={14} />Find people</button>
                  </Empty>
                : (
                  <ul className="space-y-0.5 p-2">
                    {data.following.map((p) => (
                      <PersonRow key={p.id} p={p}>
                        <button type="button" className={`btn btn-icon ${p.notify ? 'text-primary' : 'text-muted'}`}
                          aria-pressed={p.notify} title={p.notify ? `Alerts on: you hear when ${p.username} hosts a game` : `Alerts off for ${p.username}`}
                          aria-label={p.notify ? `Turn off game alerts from ${p.username}` : `Turn on game alerts from ${p.username}`}
                          onClick={() => setNotify({ userId: p.id, on: !p.notify }).catch(() => {})}>
                          <Icon name={p.notify ? 'bell' : 'bellOff'} size={18} />
                        </button>
                        <FollowButton person={p} />
                      </PersonRow>
                    ))}
                  </ul>
                )
            ) : (
              data.followers.length === 0
                ? <Empty icon="users" title="No followers yet" text="Share your page or play some online games: people you play with can follow you.">
                  </Empty>
                : <ul className="space-y-0.5 p-2">{data.followers.map((p) => <PersonRow key={p.id} p={p}><FollowButton person={p} /></PersonRow>)}</ul>
            )}
      </div>

      {data && data.suggestions.length > 0 && tab !== 'find' && (
        <section className="card p-2" aria-labelledby="suggested">
          <h2 id="suggested" className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <Icon name="sparkles" size={14} />People you&apos;ve played with
          </h2>
          <ul className="space-y-0.5">
            {data.suggestions.map((p) => (
              <PersonRow key={p.id} p={p} sub={p.games ? `Played ${p.games} game${p.games === 1 ? '' : 's'} together` : 'Was in a room with you'}>
                <FollowButton person={p} />
              </PersonRow>
            ))}
          </ul>
        </section>
      )}
      <p className="text-center text-xs text-muted">
        Following someone is one-way, like a social feed. You can invite people you follow, or who follow you, to your games.{' '}
        <Link href="/schedule" className="text-primary underline">Schedule a game</Link>
      </p>
    </div>
  );
}
