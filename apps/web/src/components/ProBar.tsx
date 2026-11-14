'use client';
import Link from 'next/link';
import { FREE_DAILY_ONLINE_GAMES } from '@slgh/shared/src/pro';
import type { RoomApi } from '@/lib/useRoom';

/** Free players: how many of today's free online games are left (nothing for Pro players or before joining). */
export function ProBar({ room }: { room: RoomApi }) {
  const me = room.view?.me;
  if (!room.joined || !me || me.pro || me.gamesLeft === null || me.gamesLeft === undefined) return null;
  const left = me.gamesLeft;
  return (
    <p className={`rounded-2xl border p-3 text-sm ${left === 0 ? 'border-danger/40 bg-danger/10 font-semibold text-danger' : 'border-border bg-bg/50 text-muted'}`}>
      {left === 0
        ? <>You've played today's {FREE_DAILY_ONLINE_GAMES} free online games, so you'll watch instead of play. </>
        : <>{left} of {FREE_DAILY_ONLINE_GAMES} free online games left today. </>}
      <Link href="/pro" className="font-semibold text-secondary">Go Pro for unlimited games</Link>
    </p>
  );
}
