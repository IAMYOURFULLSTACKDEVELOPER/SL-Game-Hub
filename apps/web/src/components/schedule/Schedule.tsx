'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { playerMessage } from '@slgh/shared/src/errors';
import { Icon } from '@/components/Icon';
import { GameGlyph } from '@/components/GameGlyph';
import { sfx } from '@/lib/sound';
import { FriendPicker, InviteToEvent } from '@/components/social/Social';

// Scheduled games: the list (with "going / maybe / can't", open or join the room, add to calendar)
// and the form to schedule a room or a tournament. Used on /schedule and on a group's Games tab.

export const SCHEDULE_GAMES: { slug: string; name: string; tournament: boolean }[] = [
  { slug: 'chess', name: 'Chess', tournament: true },
  { slug: 'checkers', name: 'Checkers', tournament: true },
  { slug: 'scrabble', name: 'Scrabble', tournament: true },
  { slug: 'uno', name: 'UNO', tournament: true },
  { slug: 'salone-poly', name: 'Salone-Poly', tournament: true },
  { slug: 'snake-and-ladder', name: 'Snake & Ladder', tournament: true },
  { slug: 'word-search', name: 'Word Search', tournament: true },
  { slug: 'dice', name: 'Dice', tournament: true },
  { slug: 'snake', name: 'Snake race', tournament: false },
];

type Game = NonNullable<ReturnType<typeof useQuery<typeof api.schedule.upcoming>>>['games'][number];

/** The current time, refreshed every minute (enough for "in 20 min" and keeps the live query steady). */
function useMinute() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 60_000) * 60_000), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function countdown(start: number, now: number) {
  const m = Math.round((start - now) / 60_000);
  if (m > 1440) return `in ${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
  if (m > 59) return `in ${Math.floor(m / 60)} h ${m % 60} min`;
  if (m > 0) return `in ${m} min`;
  if (m > -15) return 'starting now';
  return `started ${Math.round(-m / 60) > 0 ? `${Math.floor(-m / 60)} h ` : ''}${-m % 60} min ago`;
}

const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** A calendar file for the game (phones and computers open it in their calendar app). */
function icsHref(g: Game) {
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const url = typeof window === 'undefined' ? '' : `${location.origin}/schedule`;
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dodo//Schedule//EN', 'BEGIN:VEVENT',
    `UID:${g.id}@dodo`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(g.startsAt)}`, `DTEND:${stamp(g.startsAt + 3600_000)}`,
    `SUMMARY:${esc(`${g.title} (${g.gameName})`)}`, `DESCRIPTION:${esc(`${g.note ?? ''}\n${url}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(g.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
}

function GameCard({ g, now }: { g: Game; now: number }) {
  const rsvp = useMutation(api.schedule.rsvp);
  const cancel = useMutation(api.schedule.cancel);
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);
  const cancelled = g.status === 'cancelled';
  const over = g.startsAt + 3 * 3600_000 < now;
  const canInvite = !cancelled && !over && (g.isHost || g.myRsvp === 'going');
  const soon = g.startsAt - now < 30 * 60_000;
  const answer = async (status: 'going' | 'maybe' | 'no') => {
    setError('');
    try { await rsvp({ eventId: g.id, status }); sfx(status === 'going' ? 'toggleOn' : 'click'); } catch (e) { setError(playerMessage(e)); }
  };
  const openHref = g.game === 'dice' ? '/games/dice/play' : `/games/${g.game}/play?online=1&event=${g.id}`;
  const share = `${g.title} (${g.gameName}) on Dodo, ${day(g.startsAt)} at ${clock(g.startsAt)}. ${typeof window === 'undefined' ? '' : `${location.origin}/schedule`}`;

  return (
    <li className={`card overflow-hidden ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex gap-3 p-3 sm:p-4">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-bg/70 py-1.5 text-center">
          <span className="text-[11px] font-bold uppercase text-danger">{new Date(g.startsAt).toLocaleDateString('en-GB', { month: 'short' })}</span>
          <span className="font-display text-2xl font-bold leading-none">{new Date(g.startsAt).getDate()}</span>
          <span className="text-[11px] text-muted">{clock(g.startsAt)}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <GameGlyph slug={g.game} name={g.gameName} size={20} className="rounded-md" />
            <span className="text-sm font-semibold text-muted">{g.gameName}</span>
            <span className={`chip text-[11px] ${g.kind === 'tournament' ? 'border-accent/50 text-accent' : 'chip-muted'}`}>
              <Icon name={g.kind === 'tournament' ? 'trophy' : 'users'} size={11} />{g.kind === 'tournament' ? 'Tournament' : 'Online room'}
            </span>
            {g.group ? <Link href={`/groups/${g.group.id}?tab=games`} className="chip chip-muted text-[11px]">{g.group.name}</Link> : <span className="chip chip-muted text-[11px]"><Icon name="globe" size={11} />Public</span>}
          </div>
          <h3 className="truncate text-base">{g.title}</h3>
          <p className="text-xs text-muted">
            {cancelled ? <b className="text-danger">Cancelled</b> : <b className={soon ? 'text-primary' : ''}>{countdown(g.startsAt, now)}</b>}
            {' · '}{day(g.startsAt)} · by <Link href={`/u/${g.host.username}`} className="font-semibold text-text hover:underline">{g.host.username}</Link>
            {g.maxPlayers ? ` · up to ${g.maxPlayers} players` : ''}
          </p>
          {g.note && <p className="text-sm">{g.note}</p>}
          <p className="text-xs text-muted">
            <b className="text-text">{g.going}</b> going{g.maybe ? `, ${g.maybe} maybe` : ''}{g.invited ? `, ${g.invited} invited` : ''}
            {g.goingNames.length > 0 && `: ${g.goingNames.join(', ')}${g.going > g.goingNames.length ? '…' : ''}`}
          </p>
          {g.myRsvp === 'invited' && !cancelled && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-primary"><Icon name="send" size={14} />You&apos;re invited. Are you coming?</p>
          )}
        </div>
      </div>

      {!cancelled && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-bg/30 px-3 py-2">
          <div className="flex overflow-hidden rounded-xl border border-border" role="group" aria-label="Are you coming?">
            {([['going', 'Going'], ['maybe', 'Maybe'], ['no', "Can't"]] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={g.myRsvp === k} onClick={() => void answer(k)}
                className={`px-3 py-1.5 text-sm font-semibold transition ${g.myRsvp === k ? (k === 'going' ? 'bg-primary text-white' : k === 'maybe' ? 'bg-accent/30' : 'bg-danger/20') : 'hover:bg-bg'}`}>
                {label}
              </button>
            ))}
          </div>
          {g.kind === 'tournament' && g.tournamentId && <Link href={`/tournaments/${g.tournamentId}`} className="btn btn-sm btn-outline"><Icon name="trophy" size={14} />Tournament page</Link>}
          {g.kind === 'room' && g.roomCode && <Link href={`/games/${g.game}/play?room=${g.roomCode}`} className="btn btn-sm btn-primary"><Icon name="play" size={14} />Join room</Link>}
          {g.kind === 'room' && g.isHost && !g.roomCode && (
            <Link href={openHref} className={`btn btn-sm ${soon ? 'btn-primary' : 'btn-outline'}`}><Icon name="play" size={14} />Open the room</Link>
          )}
          {canInvite && (
            <button type="button" className={`btn btn-sm ${inviting ? 'btn-primary' : 'btn-outline'}`} aria-expanded={inviting} onClick={() => setInviting((x) => !x)}>
              <Icon name="userPlus" size={14} />Invite friends
            </button>
          )}
          <span className="ml-auto flex gap-1">
            <a className="btn btn-sm btn-ghost" href={icsHref(g)} download={`${g.title.replace(/[^\w]+/g, '-')}.ics`} aria-label="Add to calendar" title="Add to calendar"><Icon name="calendar" size={16} /></a>
            <a className="btn btn-sm btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp" title="Share"><Icon name="mail" size={16} /></a>
            {g.canManage && (
              <button type="button" className="btn btn-sm btn-ghost text-danger" onClick={() => { if (confirm(`Cancel "${g.title}"?`)) cancel({ eventId: g.id }).catch((e) => setError(playerMessage(e))); }}>Cancel</button>
            )}
          </span>
        </div>
      )}
      {inviting && canInvite && <InviteToEvent eventId={g.id} onDone={() => setInviting(false)} />}
      {error && <p role="alert" className="px-3 pb-2 text-sm font-semibold text-danger">{error}</p>}
    </li>
  );
}

/** Next round hour at least 30 minutes away, as a value for <input type="datetime-local"> */
function defaultStart() {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleForm({ groups, groupId, onDone }: { groups: { id: Id<'groups'>; name: string }[]; groupId?: Id<'groups'>; onDone?: () => void }) {
  const create = useMutation(api.schedule.create);
  const [kind, setKind] = useState<'room' | 'tournament'>('room');
  const [game, setGame] = useState('chess');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(defaultStart);
  const [note, setNote] = useState('');
  const [share, setShare] = useState<string>(groupId ?? 'public');
  const [max, setMax] = useState(8);
  const [friends, setFriends] = useState<Id<'users'>[]>([]);
  const [pickFriends, setPickFriends] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const gameName = SCHEDULE_GAMES.find((x) => x.slug === game)?.name ?? '';
  const choices = SCHEDULE_GAMES.filter((x) => kind === 'room' || x.tournament);
  useEffect(() => { if (!choices.some((x) => x.slug === game)) setGame(choices[0].slug); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await create({
        kind, game, title: title.trim() || `${gameName} ${kind === 'tournament' ? 'tournament' : 'night'}`,
        startsAt: new Date(start).getTime(), note: note || undefined,
        ...(share !== 'public' ? { groupId: share as Id<'groups'> } : {}),
        ...(kind === 'tournament' ? { maxPlayers: max } : {}),
        ...(friends.length ? { invite: friends } : {}),
      });
      sfx('toggleOn');
      setTitle(''); setNote(''); setFriends([]); setPickFriends(false);
      onDone?.();
    } catch (err) { setError(playerMessage(err)); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="card pop-in space-y-3 p-4">
      <h2 className="text-lg">Schedule a game</h2>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What kind">
        {([['room', 'users', 'Online room', 'Play together at a set time'], ['tournament', 'trophy', 'Tournament', 'Players sign up to compete']] as const).map(([k, icon, label, sub]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={`rounded-xl border p-3 text-left transition ${kind === k ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}>
            <span className="flex items-center gap-1.5 font-semibold"><Icon name={icon} size={16} />{label}</span>
            <span className="block text-xs text-muted">{sub}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Game</span>
          <select className="input" value={game} onChange={(e) => setGame(e.target.value)}>
            {choices.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Date and time</span>
          <input className="input" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Title</span>
          <input className="input" maxLength={80} placeholder={`${gameName} ${kind === 'tournament' ? 'tournament' : 'night'}`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Who can see it</span>
          <select className="input" value={share} onChange={(e) => setShare(e.target.value)}>
            <option value="public">Everyone on Dodo</option>
            {groups.map((x) => <option key={x.id} value={x.id}>Group: {x.name}</option>)}
          </select>
        </label>
        {kind === 'tournament' && (
          <label className="block">
            <span className="label">Most players</span>
            <select className="input" value={max} onChange={(e) => setMax(Number(e.target.value))}>
              {[4, 8, 16, 32, 64].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <label className="block sm:col-span-2">
          <span className="label">Note (optional)</span>
          <textarea className="input min-h-[64px]" maxLength={300} placeholder="Rules, prizes, who should come…" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="rounded-xl border border-border/60 p-3">
        <button type="button" className="flex w-full items-center gap-2 text-left" aria-expanded={pickFriends} onClick={() => setPickFriends((x) => !x)}>
          <Icon name="userPlus" size={16} className="text-primary" />
          <span className="flex-1 font-semibold">Invite friends{friends.length ? ` (${friends.length})` : ''}</span>
          <span className="text-xs text-muted">People you follow, or who follow you</span>
          <Icon name="chevronDown" size={16} className={`transition ${pickFriends ? 'rotate-180' : ''}`} />
        </button>
        {pickFriends && <div className="mt-3"><FriendPicker selected={friends} onChange={setFriends} /></div>}
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}><Icon name="calendar" size={16} />{busy ? 'Scheduling…' : 'Schedule'}</button>
        {onDone && <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>}
      </div>
      {share !== 'public'
        ? <p className="text-xs text-muted">The group&apos;s members see it, and it&apos;s announced in the group&apos;s chat. Friends you invite can see it too.</p>
        : <p className="text-xs text-muted">Everyone can see it, and your followers get a notification.</p>}
    </form>
  );
}

/** Upcoming scheduled games, with the form behind a button. `groupId` limits it to one group. */
export function Schedule({ groupId }: { groupId?: Id<'groups'> }) {
  const now = useMinute();
  const data = useQuery(api.schedule.upcoming, { now, ...(groupId ? { groupId } : {}) });
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-muted">{groupId ? 'Games and tournaments planned by this group.' : 'Plan a game night or a tournament, and see who is coming.'}</p>
        {!adding && <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={15} />Schedule</button>}
      </div>
      {adding && data && <ScheduleForm groups={data.groups} groupId={groupId} onDone={() => setAdding(false)} />}
      {data === undefined ? <p className="text-muted"><span className="loading-dots">Loading</span></p>
        : data.games.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 p-8 text-center">
            <Icon name="calendar" size={30} className="text-muted" />
            <p className="font-semibold">Nothing scheduled yet</p>
            <p className="text-sm text-muted">Pick a game and a time, and invite your friends or your group.</p>
          </div>
        ) : <ul className="space-y-3">{data.games.map((g) => <GameCard key={g.id} g={g} now={now} />)}</ul>}
    </div>
  );
}
