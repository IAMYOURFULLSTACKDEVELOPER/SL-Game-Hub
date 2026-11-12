import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { publicProfile, requireActiveUser } from './lib';

const tournamentStatus = v.union(
  v.literal('upcoming'), v.literal('registration'), v.literal('in_progress'), v.literal('completed'), v.literal('cancelled'),
);
const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());

async function toRow(ctx: QueryCtx, t: Doc<'tournaments'>) {
  const g = await ctx.db.get(t.game_id);
  return {
    id: t._id, name: t.name, description: t.description ?? null, format: t.format, status: t.status,
    max_players: t.max_players, prize_coins: t.prize_coins, entry_fee_coins: t.entry_fee_coins, rules: t.rules ?? null,
    registration_starts_at: iso(t.registration_starts_at), registration_ends_at: iso(t.registration_ends_at),
    starts_at: iso(t.starts_at), ends_at: iso(t.ends_at),
    games: { slug: g?.slug ?? '', name: g?.name ?? '', icon: g?.icon ?? '🎮' },
  };
}

export const list = query({
  args: { status: tournamentStatus },
  handler: async (ctx, { status }) => {
    const rows = await ctx.db.query('tournaments').withIndex('by_status_starts', (q) => q.eq('status', status)).collect();
    return Promise.all(rows.map((t) => toRow(ctx, t)));
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const tid = ctx.db.normalizeId('tournaments', id);
    const t = tid && await ctx.db.get(tid);
    if (!t) return null;
    const regs = await ctx.db.query('tournament_registrations')
      .withIndex('by_tournament_status', (q) => q.eq('tournament_id', t._id).eq('status', 'registered')).collect();
    const matches = await ctx.db.query('tournament_matches')
      .withIndex('by_tournament_round', (q) => q.eq('tournament_id', t._id)).collect();
    return {
      tournament: await toRow(ctx, t),
      registrations: await Promise.all(regs.map(async (r) => ({ id: r._id, profiles: await publicProfile(ctx, r.user_id) }))),
      matches: matches.map((m) => ({
        id: m._id, round: m.round, status: m.status, score1: m.score1 ?? null, score2: m.score2 ?? null,
        player1_id: m.player1_id ?? null, player2_id: m.player2_id ?? null,
      })),
    };
  },
});

/** Was register_for_tournament: error messages are shown to the player as-is. */
export const register = mutation({
  args: { tournamentId: v.id('tournaments') },
  handler: async (ctx, { tournamentId }) => {
    const me = await requireActiveUser(ctx, 'account banned');
    const t = await ctx.db.get(tournamentId);
    if (!t) throw new ConvexError('tournament not found');
    if (t.status !== 'registration') throw new ConvexError('registration not open');
    const now = Date.now();
    if ((t.registration_starts_at && now < t.registration_starts_at) || (t.registration_ends_at && now > t.registration_ends_at)) {
      throw new ConvexError('registration not in time window');
    }
    const existing = await ctx.db.query('tournament_registrations')
      .withIndex('by_tournament_user', (q) => q.eq('tournament_id', t._id).eq('user_id', me._id)).unique();
    if (existing) throw new ConvexError('already registered');
    const count = (await ctx.db.query('tournament_registrations')
      .withIndex('by_tournament_status', (q) => q.eq('tournament_id', t._id).eq('status', 'registered')).collect()).length;
    if (count >= t.max_players) throw new ConvexError('tournament full');
    if (t.entry_fee_coins > 0) throw new ConvexError('coin payment not yet implemented');
    await ctx.db.insert('tournament_registrations', { tournament_id: t._id, user_id: me._id, registered_at: now, status: 'registered' });
  },
});
