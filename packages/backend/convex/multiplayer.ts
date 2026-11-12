import { ConvexError, v } from 'convex/values';
import { mutation, internalMutation } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireActiveUser, requireUser } from './lib';

// Friends --------------------------------------------------------------------
export const sendFriendRequest = mutation({
  args: { targetUserId: v.id('users') },
  handler: async (ctx, { targetUserId }) => {
    const me = await requireActiveUser(ctx);
    if (targetUserId === me._id) throw new ConvexError('cannot friend yourself');
    if (!(await ctx.db.get(targetUserId))) throw new ConvexError('user not found');
    const existing = await ctx.db.query('friendships').withIndex('by_pair', (q) => q.eq('requester_id', me._id).eq('receiver_id', targetUserId)).unique()
      ?? await ctx.db.query('friendships').withIndex('by_pair', (q) => q.eq('requester_id', targetUserId).eq('receiver_id', me._id)).unique();
    if (existing) throw new ConvexError('friendship already exists');
    return ctx.db.insert('friendships', { requester_id: me._id, receiver_id: targetUserId, status: 'pending', updated_at: Date.now() });
  },
});

export const respondFriendRequest = mutation({
  args: { friendshipId: v.id('friendships'), accept: v.boolean() },
  handler: async (ctx, { friendshipId, accept }) => {
    const me = await requireActiveUser(ctx);
    const f = await ctx.db.get(friendshipId);
    if (!f || f.receiver_id !== me._id || f.status !== 'pending') throw new ConvexError('request not found');
    await ctx.db.patch(f._id, { status: accept ? 'accepted' : 'blocked', updated_at: Date.now() });
  },
});

export const removeFriend = mutation({
  args: { friendshipId: v.id('friendships') },
  handler: async (ctx, { friendshipId }) => {
    const me = await requireActiveUser(ctx);
    const f = await ctx.db.get(friendshipId);
    if (!f || f.status !== 'accepted' || (f.requester_id !== me._id && f.receiver_id !== me._id)) {
      throw new ConvexError('friendship not found');
    }
    await ctx.db.delete(f._id);
  },
});

// Rooms ----------------------------------------------------------------------
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const randomCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

async function requirePublishedGame(ctx: QueryCtx, gameId: Id<'games'>) {
  const g = await ctx.db.get(gameId);
  if (!g || g.status !== 'published') throw new ConvexError('game not available');
}

export const createRoom = mutation({
  args: { gameId: v.id('games'), maxPlayers: v.optional(v.number()) },
  handler: async (ctx, { gameId, maxPlayers = 2 }) => {
    const me = await requireActiveUser(ctx);
    await requirePublishedGame(ctx, gameId);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 8) throw new ConvexError('max players must be 2-8');
    let room_code = randomCode();
    while (await ctx.db.query('game_rooms').withIndex('by_code', (q) => q.eq('room_code', room_code)).first()) room_code = randomCode();
    const room_id = await ctx.db.insert('game_rooms', {
      room_code, host_id: me._id, game_id: gameId, max_players: maxPlayers, status: 'waiting', updated_at: Date.now(),
    });
    await ctx.db.insert('room_participants', { room_id, user_id: me._id, joined_at: Date.now(), is_ready: true });
    return { room_id, room_code };
  },
});

export const joinRoom = mutation({
  args: { roomCode: v.string() },
  handler: async (ctx, { roomCode }) => {
    const me = await requireActiveUser(ctx);
    const room = await ctx.db.query('game_rooms').withIndex('by_code', (q) => q.eq('room_code', roomCode.toUpperCase())).first();
    if (!room || room.status !== 'waiting') throw new ConvexError('room not found or not available');
    const already = await ctx.db.query('room_participants').withIndex('by_room_user', (q) => q.eq('room_id', room._id).eq('user_id', me._id)).unique();
    if (already && already.left_at === undefined) return room._id;
    const present = (await ctx.db.query('room_participants').withIndex('by_room_user', (q) => q.eq('room_id', room._id)).collect())
      .filter((p) => p.left_at === undefined).length;
    if (present >= room.max_players) throw new ConvexError('room is full');
    if (already) await ctx.db.patch(already._id, { left_at: undefined, joined_at: Date.now(), is_ready: false });
    else await ctx.db.insert('room_participants', { room_id: room._id, user_id: me._id, joined_at: Date.now(), is_ready: false });
    return room._id;
  },
});

// Matchmaking ----------------------------------------------------------------
export const joinMatchmaking = mutation({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const me = await requireActiveUser(ctx);
    await requirePublishedGame(ctx, gameId);
    const queued = await ctx.db.query('matchmaking_queue').withIndex('by_user_status', (q) => q.eq('user_id', me._id).eq('status', 'queued')).collect();
    for (const e of queued) await ctx.db.patch(e._id, { status: 'cancelled' });
    const elo = await ctx.db.query('elo_ratings').withIndex('by_user_game', (q) => q.eq('user_id', me._id).eq('game_id', gameId)).unique();
    const now = Date.now();
    return ctx.db.insert('matchmaking_queue', {
      user_id: me._id, game_id: gameId, status: 'queued', elo_rating: elo?.rating ?? 1000, queued_at: now, timeout_at: now + 5 * 60_000,
    });
  },
});

export const leaveMatchmaking = mutation({
  args: { queueId: v.id('matchmaking_queue') },
  handler: async (ctx, { queueId }) => {
    const me = await requireUser(ctx);
    const e = await ctx.db.get(queueId);
    if (!e || e.user_id !== me._id || e.status !== 'queued') throw new ConvexError('queue entry not found');
    await ctx.db.patch(e._id, { status: 'cancelled' });
  },
});

// Elo ------------------------------------------------------------------------
/** score: 1 win, 0.5 draw, 0 loss. */
export const calculateElo = (rating: number, opponent: number, score: number, k = 32) =>
  rating + Math.floor(k * (score - 1 / (1 + 10 ** ((opponent - rating) / 400))));

/** Was update_elo_after_match: rates each participant against the other (two-player matches). */
export const updateEloAfterMatch = internalMutation({
  args: { matchId: v.id('game_matches') },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) return;
    const parts = await ctx.db.query('match_participants').withIndex('by_match', (q) => q.eq('match_id', matchId)).collect();
    const ratingOf = async (userId: Id<'users'>) =>
      ctx.db.query('elo_ratings').withIndex('by_user_game', (q) => q.eq('user_id', userId).eq('game_id', match.game_id)).unique();
    // Read every rating first so each player is rated against their opponent's pre-match Elo.
    const before = await Promise.all(parts.map((p) => ratingOf(p.user_id)));

    for (const [i, p] of parts.entries()) {
      const current = before[i]?.rating ?? 1000;
      const opponent = before.find((_, j) => j !== i)?.rating ?? 1000;
      const score = p.result === 'win' ? 1 : p.result === 'draw' ? 0.5 : 0;
      const next = calculateElo(current, opponent, score);
      const row = before[i];
      const counts = { wins: +(p.result === 'win'), losses: +(p.result === 'loss'), draws: +(p.result === 'draw') };
      if (row) {
        await ctx.db.patch(row._id, {
          rating: next, games_played: row.games_played + 1, wins: row.wins + counts.wins,
          losses: row.losses + counts.losses, draws: row.draws + counts.draws, updated_at: Date.now(),
        });
      } else {
        await ctx.db.insert('elo_ratings', { user_id: p.user_id, game_id: match.game_id, rating: next, games_played: 1, ...counts, updated_at: Date.now() });
      }
      await ctx.db.patch(p._id, { elo_change: next - current, new_elo: next });
    }
  },
});
