'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import { ConvexRoomProvider } from '@/components/ConvexRoomProvider';
import { PageHeader } from '@/components/PageHeader';
import { Icon } from '@/components/Icon';
import { errorText, mySecret, savedName, type RoomGame } from '@/lib/useRoom';
import { sfx } from '@/lib/sound';

// Live games: every online room whose host chose to list it. Players ask to join; the host
// says yes or no from their room, and a yes hands this browser the room link. No account needed.

const GAMES: Record<RoomGame, { name: string; icon: string; href: string }> = {
  uno: { name: 'UNO', icon: '🃏', href: '/games/uno/play' },
  'salone-poly': { name: 'Salone-Poly', icon: '🏝️', href: '/games/salone-poly/play' },
  chess: { name: 'Chess', icon: '♟️', href: '/games/chess/play' },
  checkers: { name: 'Checkers', icon: '🔴', href: '/games/checkers/play' },
  'snake-and-ladder': { name: 'Snake & Ladder', icon: '🎲', href: '/games/snake-and-ladder/play' },
  scrabble: { name: 'Scrabble', icon: '🔠', href: '/games/scrabble/play' },
  'word-search': { name: 'Word Search', icon: '🔤', href: '/games/word-search/play' },
  snake: { name: 'Snake', icon: '🐍', href: '/games/snake/play' },
};
const ASKED_KEY = 'slgh-asked-rooms';
const NAME_KEY = 'slgh-player-name';

function loadAsked(): string[] {
  try { return JSON.parse(localStorage.getItem(ASKED_KEY) ?? '[]'); } catch { return []; }
}
function saveAsked(ids: string[]) {
  try { localStorage.setItem(ASKED_KEY, JSON.stringify(ids.slice(-30))); } catch { /* private mode */ }
}

export default function LobbyClient() {
  return <ConvexRoomProvider><Lobby /></ConvexRoomProvider>;
}

type Listed = { id: string; game: RoomGame; host: string; players: number; maxPlayers: number; playing: boolean; createdAt: number };

function Lobby() {
  const rooms = useQuery(api.rooms.publicList) as Listed[] | undefined;
  const [secret, setSecret] = useState('');
  const [name, setName] = useState('');
  const [filter, setFilter] = useState<RoomGame | 'all'>('all');
  const [asked, setAsked] = useState<string[]>([]);
  useEffect(() => { setSecret(mySecret()); setName(savedName()); setAsked(loadAsked()); }, []);

  const remember = (id: string, on: boolean) => setAsked((a) => {
    const next = on ? [...a.filter((x) => x !== id), id] : a.filter((x) => x !== id);
    saveAsked(next);
    return next;
  });
  const shown = (rooms ?? []).filter((r) => filter === 'all' || r.game === filter);

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader icon="globe" tone="blue" title="Live games" subtitle="Open online games. Ask to join one and the host lets you in." />

      <div className="card space-y-3 p-4">
        <div>
          <label className="label" htmlFor="lobby-name">Your name</label>
          <input id="lobby-name" className="input" maxLength={20} value={name} autoComplete="nickname" placeholder="What should other players call you?"
            onChange={(e) => { setName(e.target.value); try { localStorage.setItem(NAME_KEY, e.target.value); } catch { /* private mode */ } }} />
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which game">
          {(['all', ...(Object.keys(GAMES) as RoomGame[])] as const).map((f) => (
            <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`}>
              {f === 'all' ? 'All games' : `${GAMES[f].icon} ${GAMES[f].name}`}
            </button>
          ))}
        </div>
      </div>

      {rooms === undefined ? (
        <p className="py-8 text-center text-muted"><span className="loading-dots">Looking for games</span></p>
      ) : shown.length === 0 ? (
        <div className="card space-y-3 p-6 text-center">
          <p className="text-4xl" aria-hidden>🎲</p>
          <p className="font-semibold">No open games right now.</p>
          <p className="text-muted">Start one and list it here: open a game, choose <b>Online</b>, create a room and tick <b>List in Live games</b>.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {(Object.keys(GAMES) as RoomGame[]).map((g) => (
              <Link key={g} href={`${GAMES[g].href}?online=1`} className="btn btn-outline">{GAMES[g].icon} {GAMES[g].name}</Link>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((r, i) => (
            <RoomCard key={r.id} room={r} index={i} secret={secret} name={name} asked={asked.includes(r.id)} onAsked={(on) => remember(r.id, on)} />
          ))}
        </ul>
      )}
    </main>
  );
}

function RoomCard({ room: r, index, secret, name, asked, onAsked }: {
  room: Listed; index: number; secret: string; name: string; asked: boolean; onAsked: (on: boolean) => void;
}) {
  const g = GAMES[r.game];
  const status = useQuery(api.rooms.requestStatus, asked && secret ? { roomId: r.id, secret } : 'skip');
  const request = useMutation(api.rooms.requestJoin);
  const cancel = useMutation(api.rooms.cancelRequest);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const full = r.players >= r.maxPlayers;

  // Celebrate once when the host says yes.
  const approved = status?.status === 'approved' && status.code;
  useEffect(() => { if (approved) sfx('success'); }, [approved]);

  const ask = async () => {
    if (!name.trim()) { setError('Enter your name first.'); return; }
    setBusy(true); setError('');
    try { await request({ roomId: r.id, name: name.trim(), secret }); onAsked(true); sfx('click'); } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };
  const withdraw = async () => {
    setBusy(true);
    try { await cancel({ roomId: r.id, secret }); } catch { /* already gone */ }
    onAsked(false); setBusy(false);
  };

  return (
    <li className="card pop-in space-y-3 p-4" style={{ ['--i' as string]: index }}>
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-2xl" aria-hidden>{g.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold">{g.name}</p>
          <p className="truncate text-sm text-muted">Hosted by {r.host}</p>
        </div>
        <div className="text-right text-sm">
          <span className={`chip ${r.playing ? 'chip-accent' : 'chip-muted'}`}>{r.playing ? 'Playing' : 'Waiting'}</span>
          <p className="mt-1 flex items-center justify-end gap-1 text-muted"><Icon name="users" size={14} />{r.players}/{r.maxPlayers}</p>
        </div>
      </div>

      {approved ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-primary/10 p-3">
          <span className="flex-1 font-semibold">🎉 {r.host} let you in!{r.playing && ' You can join when the current game ends.'}</span>
          <Link href={`${g.href}?room=${status!.code}`} className="btn btn-primary btn-sm" onClick={() => onAsked(false)}>Join now</Link>
        </div>
      ) : status?.status === 'pending' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bg/60 p-3">
          <span className="flex-1 text-sm font-semibold"><span className="loading-dots">Waiting for {r.host} to answer</span></span>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={withdraw}>Cancel</button>
        </div>
      ) : status?.status === 'declined' ? (
        <p className="rounded-xl bg-bg/60 p-3 text-sm text-muted">The host said no this time. Try another game.</p>
      ) : (
        <button className="btn btn-primary w-full" disabled={busy || full || !secret} onClick={ask}>
          {full ? 'Room is full' : r.playing ? 'Ask to join the next game' : 'Ask to join'}
        </button>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
    </li>
  );
}
