import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { gameMode, gameStatus } from './schema';
import { currentUser, requireActiveUser, requireAdmin, requireUser, toGameRow } from './lib';

/** Published games in catalog order, optionally filtered like the library page. */
export const list = query({
  args: {
    q: v.optional(v.string()), category: v.optional(v.string()),
    mode: v.optional(gameMode), limit: v.optional(v.number()),
  },
  handler: async (ctx, { q, category, mode, limit }) => {
    let games = await ctx.db.query('games').withIndex('by_status_sort', (x) => x.eq('status', 'published')).collect();
    const term = q?.trim().toLowerCase();
    if (term) games = games.filter((g) => g.name.toLowerCase().includes(term));
    if (mode) games = games.filter((g) => g.modes.includes(mode));
    if (category) {
      const cat = await ctx.db.query('categories').withIndex('by_slug', (x) => x.eq('slug', category)).unique();
      games = cat ? games.filter((g) => g.category_id === cat._id) : [];
    }
    return Promise.all(games.slice(0, limit ?? games.length).map((g) => toGameRow(ctx, g)));
  },
});

export const categories = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query('categories').withIndex('by_sort').collect())
    .map((c) => ({ slug: c.slug, name: c.name })),
});

export const districts = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query('districts').withIndex('by_name').collect())
    .map((d) => ({ id: d._id, name: d.name })),
});

/** A published game by slug, or null. */
export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const g = await ctx.db.query('games').withIndex('by_slug', (x) => x.eq('slug', slug)).unique();
    if (!g || g.status !== 'published') return null;
    return { ...(await toGameRow(ctx, g)), is_builtin: g.is_builtin };
  },
});

/** The signed-in player's most recently played published games. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 4 }) => {
    const me = await currentUser(ctx);
    if (!me) return [];
    const stats = await ctx.db.query('game_stats')
      .withIndex('by_user_recent', (x) => x.eq('user_id', me._id)).order('desc').take(50);
    const out = [];
    for (const s of stats) {
      const g = await ctx.db.get(s.game_id);
      if (g?.status === 'published') out.push(await toGameRow(ctx, g));
      if (out.length >= limit) break;
    }
    return out;
  },
});

/** The signed-in player's stats for one game, or for every game they have played (newest first). */
export const myStats = query({
  args: { gameId: v.optional(v.id('games')) },
  handler: async (ctx, { gameId }) => {
    const me = await currentUser(ctx);
    if (!me) return [];
    const rows = gameId
      ? await ctx.db.query('game_stats').withIndex('by_user_game', (x) => x.eq('user_id', me._id).eq('game_id', gameId)).collect()
      : await ctx.db.query('game_stats').withIndex('by_user_recent', (x) => x.eq('user_id', me._id)).order('desc').collect();
    return Promise.all(rows.map(async (s) => {
      const g = await ctx.db.get(s.game_id);
      return {
        played: s.played, wins: s.wins, losses: s.losses, draws: s.draws, best_score: s.best_score,
        games: g ? { name: g.name, icon: g.icon } : null,
      };
    }));
  },
});

// Single-player stat tracking (was record_play / record_result).
export const recordPlay = mutation({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const me = await requireActiveUser(ctx);
    const g = await ctx.db.get(gameId);
    if (!g || g.status !== 'published' || g.coming_soon) throw new ConvexError('game unavailable');
    const s = await ctx.db.query('game_stats').withIndex('by_user_game', (x) => x.eq('user_id', me._id).eq('game_id', gameId)).unique();
    if (s) await ctx.db.patch(s._id, { played: s.played + 1, last_played_at: Date.now() });
    else await ctx.db.insert('game_stats', {
      user_id: me._id, game_id: gameId, played: 1, wins: 0, losses: 0, draws: 0, best_score: 0, last_played_at: Date.now(),
    });
  },
});

export const recordResult = mutation({
  args: { gameId: v.id('games'), result: v.union(v.literal('win'), v.literal('loss'), v.literal('draw')), score: v.optional(v.number()) },
  handler: async (ctx, { gameId, result, score = 0 }) => {
    const me = await requireUser(ctx);
    const s = await ctx.db.query('game_stats').withIndex('by_user_game', (x) => x.eq('user_id', me._id).eq('game_id', gameId)).unique();
    if (!s) return;
    await ctx.db.patch(s._id, {
      wins: s.wins + (result === 'win' ? 1 : 0),
      losses: s.losses + (result === 'loss' ? 1 : 0),
      draws: s.draws + (result === 'draw' ? 1 : 0),
      best_score: Math.max(s.best_score, Math.min(Math.trunc(score), 100_000_000)),
      last_played_at: Date.now(),
    });
  },
});

// ---------- Admin ----------
export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [players, games, reports] = await Promise.all([
      ctx.db.query('users').collect(),
      ctx.db.query('games').collect(),
      ctx.db.query('reports').withIndex('by_status', (x) => x.eq('status', 'open')).collect(),
    ]);
    return { players: players.length, games: games.length, reports: reports.length };
  },
});

/** Every game (any status) with how many uploaded versions it has. */
export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const games = await ctx.db.query('games').withIndex('by_sort').collect();
    return Promise.all(games.map(async (g) => ({
      id: g._id, slug: g.slug, name: g.name, icon: g.icon, status: g.status, version: g.version,
      coming_soon: g.coming_soon, is_builtin: g.is_builtin,
      version_count: g.is_builtin ? 0 : (await ctx.db.query('game_versions')
        .withIndex('by_game_version', (x) => x.eq('game_id', g._id)).collect()).length,
    })));
  },
});

export const setStatus = mutation({
  args: { id: v.id('games'), status: gameStatus },
  handler: async (ctx, { id, status }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(id, {
      status, published_at: status === 'published' ? Date.now() : undefined, updated_at: Date.now(),
    });
  },
});
