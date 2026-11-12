import { ConvexError } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { formatLeones, splitPot } from '@slgh/shared/src/wallet';
import { post } from './wallet';

// Money staked on one round of a game. Each player's stake moves from their spendable balance to
// "held" when they commit, and stays held until the round is settled:
//   open    players can stake or take their stake back
//   locked  the round is being played; stakes can't be withdrawn (leaving forfeits)
//   settled the winner received the pot minus the platform fee
//   void    nobody won (e.g. everyone left); every stake went back
// Only server code that knows the real result (e.g. dice.ts, which makes every roll) may settle a pot.

/** Platform fee in basis points from WALLET_FEE_BPS (250 = 2.5%). Capped at 20%. */
export const feeBps = () => {
  const n = Number(process.env.WALLET_FEE_BPS ?? 0);
  return Number.isInteger(n) && n >= 0 && n <= 2_000 ? n : 0;
};

export const openPot = (ctx: MutationCtx, game: string, room: string, stake: number) =>
  ctx.db.insert('pots', { game, room, stake, fee_bps: feeBps(), status: 'open', total: 0 });

export const heldEntries = async (ctx: MutationCtx, potId: Id<'pots'>) =>
  (await ctx.db.query('pot_entries').withIndex('by_pot', (q) => q.eq('pot_id', potId)).collect())
    .filter((e) => e.status === 'held');

async function entryOf(ctx: MutationCtx, potId: Id<'pots'>, userId: Id<'users'>) {
  const entries = await ctx.db.query('pot_entries')
    .withIndex('by_pot_user', (q) => q.eq('pot_id', potId).eq('user_id', userId)).collect();
  return entries.find((e) => e.status === 'held') ?? null;
}

export async function stakeIn(ctx: MutationCtx, potId: Id<'pots'>, userId: Id<'users'>, label: string) {
  const pot = await ctx.db.get(potId);
  if (!pot || pot.status !== 'open') throw new ConvexError('This round has already started. Wait for the next one.');
  if (await entryOf(ctx, potId, userId)) return; // already in
  await post(ctx, userId, 'stake', { amount: -pot.stake, held: pot.stake }, `Stake in ${label}`, potId);
  await ctx.db.insert('pot_entries', { pot_id: potId, user_id: userId, amount: pot.stake, status: 'held' });
  await ctx.db.patch(potId, { total: pot.total + pot.stake });
}

/** Gives a stake back while the pot is still open. */
export async function unstake(ctx: MutationCtx, potId: Id<'pots'>, userId: Id<'users'>, label: string) {
  const pot = await ctx.db.get(potId);
  const entry = await entryOf(ctx, potId, userId);
  if (!pot || pot.status !== 'open' || !entry) return;
  await post(ctx, userId, 'stake_refund', { amount: entry.amount, held: -entry.amount }, `Stake returned from ${label}`, potId);
  await ctx.db.patch(entry._id, { status: 'refunded' });
  await ctx.db.patch(potId, { total: pot.total - entry.amount });
}

export const lockPot = (ctx: MutationCtx, potId: Id<'pots'>) => ctx.db.patch(potId, { status: 'locked' });

/** Pays the whole pot (minus the fee) to the winner. Voids the pot if the winner had no stake in it. */
export async function settlePot(ctx: MutationCtx, potId: Id<'pots'>, winnerId: Id<'users'> | null, label: string) {
  const pot = await ctx.db.get(potId);
  if (!pot || pot.status !== 'locked') return;
  const entries = await heldEntries(ctx, potId);
  if (!winnerId || !entries.some((e) => e.user_id === winnerId)) return voidPot(ctx, potId, label);
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const { fee, prize } = splitPot(total, pot.fee_bps);
  for (const e of entries) {
    if (e.user_id === winnerId) {
      await post(ctx, e.user_id, 'winnings', { amount: prize, held: -e.amount }, `Won ${formatLeones(prize)} in ${label}`, potId);
    } else {
      await post(ctx, e.user_id, 'stake_lost', { held: -e.amount }, `Lost ${formatLeones(e.amount)} stake in ${label}`, potId);
    }
    await ctx.db.patch(e._id, { status: e.user_id === winnerId ? 'won' : 'lost' });
  }
  await ctx.db.patch(potId, { status: 'settled', total, fee, winner_id: winnerId, settled_at: Date.now() });
  return prize;
}

/** Returns every stake still held. */
export async function voidPot(ctx: MutationCtx, potId: Id<'pots'>, label: string) {
  const pot = await ctx.db.get(potId);
  if (!pot || pot.status === 'settled' || pot.status === 'void') return;
  for (const e of await heldEntries(ctx, potId)) {
    await post(ctx, e.user_id, 'stake_refund', { amount: e.amount, held: -e.amount }, `Stake returned from ${label} (no winner)`, potId);
    await ctx.db.patch(e._id, { status: 'refunded' });
  }
  await ctx.db.patch(potId, { status: 'void', total: 0, settled_at: Date.now() });
}
