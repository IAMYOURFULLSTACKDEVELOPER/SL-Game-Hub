'use client';
import Link from 'next/link';
import { useMutation } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { formatLeones } from '@slgh/shared/src/wallet';
import { sfx } from '@/lib/sound';
import { GameGlyph } from './GameGlyph';
import { Icon } from './Icon';

// "Your rooms": online rooms this player created or joined. Rooms stay open after everyone leaves
// (for ROOM_IDLE_DAYS), so players come back to the same room instead of making a new one each time.

export type RecentData = NonNullable<FunctionReturnType<typeof api.rooms.recent>>;
export type RecentRoom = RecentData['rooms'][number];

export const ROOM_GAME_INFO: Record<RecentRoom['game'], { name: string; href: string }> = {
  uno: { name: 'UNO', href: '/games/uno/play' },
  'salone-poly': { name: 'Salone-Poly', href: '/games/salone-poly/play' },
  chess: { name: 'Chess', href: '/games/chess/play' },
  checkers: { name: 'Checkers', href: '/games/checkers/play' },
  'snake-and-ladder': { name: 'Snake & Ladder', href: '/games/snake-and-ladder/play' },
  scrabble: { name: 'Scrabble', href: '/games/scrabble/play' },
  'word-search': { name: 'Word Search', href: '/games/word-search/play' },
  snake: { name: 'Snake', href: '/games/snake/play' },
};

const DAY = 24 * 60 * 60_000;
function ago(t: number, now: number) {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function statusOf(r: RecentRoom, now: number) {
  if (r.playing) return { text: 'Game in progress', tone: 'text-accent' };
  if (r.players > 0) return { text: `${r.players}/${r.maxPlayers} in the room${r.host ? ` · ${r.host} hosts` : ''}`, tone: 'text-success' };
  const days = r.expiresAt ? Math.max(1, Math.ceil((r.expiresAt - now) / DAY)) : null;
  return { text: `Empty${days ? ` · open for ${days} more ${days === 1 ? 'day' : 'days'}` : ''}`, tone: 'text-muted' };
}

/** "Free rooms left today" line for the free plan (nothing for Pro). */
export function RoomsLeft({ data }: { data: RecentData | null | undefined }) {
  if (!data || data.roomsLeft === null) return null;
  const out = data.roomsLeft === 0;
  return (
    <p className={`text-xs ${out ? 'font-semibold text-danger' : 'text-muted'}`}>
      {out ? `You've made today's ${data.freeDailyRooms} free rooms. Rejoin one of yours, or ` : `${data.roomsLeft} of ${data.freeDailyRooms} free rooms left today. `}
      <Link href="/pro" className="font-semibold text-secondary hover:underline">{out ? 'go Pro' : 'Pro: unlimited'}</Link>
      {out && ' for unlimited rooms.'}
    </p>
  );
}

/**
 * The list. With `onRejoin` (inside a game) the button joins straight away; without it (Live games page,
 * every game) each room links to its game with ?room=CODE.
 */
export function RecentRooms({ data, now, onRejoin, disabled, showGame = false }: {
  data: RecentData | null | undefined; now: number;
  onRejoin?: (room: RecentRoom) => void; disabled?: boolean; showGame?: boolean;
}) {
  const forget = useMutation(api.rooms.forgetRecent);
  if (!data?.rooms.length) return null;
  return (
    <section className="card p-2" aria-labelledby="recent-rooms-title">
      <h2 id="recent-rooms-title" className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <Icon name="clock" size={14} />Your rooms
      </h2>
      <ul className="space-y-0.5">
        {data.rooms.map((r, i) => {
          const info = ROOM_GAME_INFO[r.game];
          const st = statusOf(r, now);
          const label = `${showGame ? `${info.name} ` : ''}room ${r.code}`;
          return (
            <li key={r.id} className="recent-room pop-in group" style={{ ['--i' as string]: i }}>
              <span className="relative shrink-0">
                <GameGlyph slug={r.game} name={info.name} size={40} />
                {r.players > 0 && <span className="recent-room-live" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {showGame && <span className="font-semibold text-heading">{info.name}</span>}
                  <span className="font-mono text-sm font-bold tracking-widest text-heading">{r.code}</span>
                  {r.mine && <span className="chip chip-accent">Yours</span>}
                  {r.stake !== null && <span className="chip chip-muted"><Icon name="wallet" size={12} />{formatLeones(r.stake)}</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  <span className={st.tone}>{st.text}</span> · {ago(r.lastAt, now)}
                </p>
              </div>
              {onRejoin ? (
                <button type="button" className="btn btn-sm btn-success" disabled={disabled || r.playing}
                  title={r.playing ? 'You can join when this game ends' : undefined} aria-label={`Rejoin ${label}`}
                  onClick={() => { sfx('click'); onRejoin(r); }}>
                  <Icon name="login" size={16} /><span className="hidden sm:inline">Rejoin</span>
                </button>
              ) : (
                <Link href={`${info.href}?room=${r.code}`} className="btn btn-sm btn-success" aria-label={`Open ${label}`}>
                  <Icon name="login" size={16} /><span className="hidden sm:inline">Open</span>
                </Link>
              )}
              <button type="button" className="btn btn-ghost btn-icon h-8 w-8 opacity-60 hover:opacity-100 group-hover:opacity-100"
                aria-label={`Remove ${label} from your rooms`} title="Remove from your rooms"
                onClick={() => { sfx('toggleOff'); forget({ roomId: r.id }).catch(() => {}); }}>
                <Icon name="close" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
