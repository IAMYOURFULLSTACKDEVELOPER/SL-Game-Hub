'use client';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import { formatLeones } from '@slgh/shared/src/wallet';
import type { RoomApi } from '@/lib/useRoom';
import { sfx } from '@/lib/sound';

/** Money rooms: the pot, your stake, and the last payout. Shown above the lobby and the game (nothing in free rooms). */
export function MoneyBar({ room }: { room: RoomApi }) {
  const money = room.view?.money;
  const wallet = useQuery(api.wallet.summary, money && room.joined ? {} : 'skip');
  if (!money || !room.joined) return null;
  const me = room.view?.members.find((m) => m.id === room.view?.me?.id);
  const playing = (room.view?.state as { status?: string } | null)?.status === 'playing';
  const potOpen = money.pot?.status === 'open';
  const stakers = room.view?.members.filter((m) => m.staked).length ?? 0;
  const last = money.lastPrize;

  return (
    <div className="space-y-2 rounded-2xl border border-accent/50 bg-accent/10 p-3" aria-live="polite">
      <p className="flex flex-wrap items-center justify-between gap-2 font-semibold">
        <span>💰 Playing for money: {formatLeones(money.stake)} each</span>
        {money.pot && (
          <span>
            Pot {formatLeones(money.pot.total)}
            {money.pot.feeBps > 0 && <span className="text-xs font-normal text-muted"> ({money.pot.feeBps / 100}% fee)</span>}
          </span>
        )}
      </p>
      {last && !playing && (
        <p className="text-sm">🏆 {last.names.join(' and ')} {last.names.length > 1 ? 'shared the pot' : 'won'}: {formatLeones(last.each)}{last.names.length > 1 ? ' each' : ''}.</p>
      )}
      {potOpen && !playing && (me?.staked ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>✅ Your stake is in for the next game ({stakers} {stakers === 1 ? 'player' : 'players'} in).</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={room.busy} onClick={() => room.unstake()}>Take it back</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="btn btn-primary btn-sm" disabled={room.busy} onClick={() => { sfx('click'); room.stake(); }}>
            Put in {formatLeones(money.stake)} to play
          </button>
          <span className="text-muted">You only play if your stake is in.</span>
        </div>
      ))}
      {playing && me?.staked === false && <p className="text-sm text-muted">You're watching this game. Put your stake in for the next one.</p>}
      <p className="text-xs text-muted">
        Wallet: <b>{wallet ? formatLeones(wallet.balance) : '…'}</b> · <Link href="/wallet" className="text-primary underline">Top up or withdraw</Link>.
        Stakes are held until the game ends; the winner gets the pot, a draw shares it. Leaving mid-game forfeits your stake.
      </p>
    </div>
  );
}
