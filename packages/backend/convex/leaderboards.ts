import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { isAdmin, publicProfile, requireUser } from './lib';
import { leaderboardType } from './schema';

/** Leaderboards of one type (per_game may be narrowed to a game slug), newest first, with their top 10. */
export const list = query({
  args: { type: leaderboardType, gameSlug: v.optional(v.string()) },
  handler: async (ctx, { type, gameSlug }) => {
    let boards;
    if (type === 'per_game' && gameSlug) {
      const game = await ctx.db.query('games').withIndex('by_slug', (q) => q.eq('slug', gameSlug)).unique();
      boards = game ? await ctx.db.query('leaderboards').withIndex('by_game', (q) => q.eq('game_id', game._id)).collect() : [];
    } else {
      boards = await ctx.db.query('leaderboards').withIndex('by_type', (q) => q.eq('type', type)).collect();
    }
    boards = boards.filter((b) => b.game_id).sort((a, b) => b._creationTime - a._creationTime); // boards always belong to a game

    return Promise.all(boards.map(async (b) => {
      const top = await ctx.db.query('leaderboard_entries')
        .withIndex('by_leaderboard_score', (q) => q.eq('leaderboard_id', b._id)).order('desc').take(10);
      return {
        id: b._id, name: b.name, description: b.description ?? null,
        entries: await Promise.all(top.map(async (e) => ({
          id: e._id, score: e.score, rank: e.rank ?? null, profiles: await publicProfile(ctx, e.user_id),
        }))),
      };
    }));
  },
});

async function recalculateRanks(ctx: MutationCtx, leaderboardId: Id<'leaderboards'>) {
  const entries = await ctx.db.query('leaderboard_entries')
    .withIndex('by_leaderboard_score', (q) => q.eq('leaderboard_id', leaderboardId)).order('desc').collect();
  // Highest score first; ties share a rank, and the earlier achiever is listed first.
  entries.sort((a, b) => b.score - a.score || a.achieved_at - b.achieved_at);
  let rank = 0, prev: number | null = null;
  for (const e of entries) {
    if (prev === null || e.score !== prev) rank++;
    if (e.rank !== rank) await ctx.db.patch(e._id, { rank });
    prev = e.score;
  }
}

/** Keeps a player's best score on a leaderboard (was update_leaderboard_entry). */
export const submitScore = mutation({
  args: { leaderboardId: v.id('leaderboards'), userId: v.id('users'), score: v.number(), metadata: v.optional(v.any()) },
  handler: async (ctx, { leaderboardId, userId, score, metadata }) => {
    const me = await requireUser(ctx);
    if (me.banned || (me._id !== userId && !isAdmin(me))) throw new ConvexError('forbidden');
    const existing = await ctx.db.query('leaderboard_entries')
      .withIndex('by_leaderboard_user', (q) => q.eq('leaderboard_id', leaderboardId).eq('user_id', userId)).unique();
    if (!existing) {
      await ctx.db.insert('leaderboard_entries', { leaderboard_id: leaderboardId, user_id: userId, score, metadata, achieved_at: Date.now() });
    } else if (existing.score < score) {
      await ctx.db.patch(existing._id, { score, metadata, achieved_at: Date.now() });
    } else return;
    await recalculateRanks(ctx, leaderboardId);
  },
});
