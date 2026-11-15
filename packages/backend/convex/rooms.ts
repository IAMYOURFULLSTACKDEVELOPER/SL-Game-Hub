import { ConvexError, v } from 'convex/values';
import { query, mutation, internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { SalonePolyEngine, type SalonePolyState } from '@slgh/shared/src/games/salone-poly';
import type { GameState, Player } from '@slgh/shared/src/types';
import { SPECS, ROOM_GAME_NAMES, moveV, roomGameV, type RoomMove } from './roomGames';
import { WALLET_LIMITS, formatLeones } from '@slgh/shared/src/wallet';
import { requireWalletUser } from './wallet';
import { currentUser } from './lib';
import { countGame, roomsLeft, spendRoomAllowance, isPro } from './pro';
import { FREE_DAILY_ROOMS, ROOM_IDLE_DAYS } from '@slgh/shared/src/pro';
import { lockPot, openPot, heldEntries, settleShared, stakeIn, unstake, voidPot } from './pots';
import { BOT_THINK_MS, botThinkMs, type BotThinkKind } from '@slgh/shared/src/bot-think';
import { recordPlayedWith } from './groups';
import { announceHosting } from './social';

// Online rooms for every multiplayer game (see roomGames.ts). Players must be signed in (a free account is
// fine). Free players can create FREE_DAILY_ROOMS rooms a day (Pro: unlimited); joining and playing are unlimited.
// Rooms outlive their players: when the last one leaves, the room is reset to its lobby and kept for
// ROOM_IDLE_DAYS, and everyone who was in it sees it under "Your rooms" (room_visits) to come back to.
// Each browser also makes a private `secret` and sends it with every call; it proves which seat is theirs.
// Other players only ever see the public `member_id`, so nobody can act or peek as someone else.
// The server owns the game: it validates and applies every move, makes every roll and shuffle,
// plays the bots, and sends each player only what they may see (UNO hands, Scrabble racks stay secret).
// Money rooms (`stake` set) are for signed-in players aged 18+: each member is tied to their account,
// joining puts the stake into the round's pot (pots.ts), there are no bots, and when the game ends the
// server pays the winner (a draw or tie shares the pot). Leaving before the start returns your stake;
// leaving during a game forfeits it.

const poly = new SalonePolyEngine(); // trades
type Room = Doc<'play_rooms'>;
type State = GameState;

export const HEARTBEAT_MS = 10_000;
const STALE_MS = 3 * HEARTBEAT_MS;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to mix up when reading a code aloud
const MAX_PENDING_REQUESTS = 20; // per room, so a listed room can't be flooded
const REQUEST_TTL_MS = 60 * 60_000; // unanswered or answered requests are cleared after an hour
const ROOM_IDLE_MS = ROOM_IDLE_DAYS * 24 * 60 * 60_000;
const RECENT_ROOMS = 12; // shown under "Your rooms"

const difficultyV = v.union(v.literal('easy'), v.literal('medium'), v.literal('hard'));
const tradeSideV = v.object({ spaces: v.array(v.number()), cash: v.number(), jailCards: v.number() });

const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, 20) || 'Player';
const checkSecret = (secret: string) => {
  if (!/^[A-Za-z0-9-]{20,64}$/.test(secret)) throw new ConvexError('Something went wrong joining. Reload the page and try again.');
};

export const roomByCode = (ctx: QueryCtx, code: string) =>
  ctx.db.query('play_rooms').withIndex('by_code', (q) => q.eq('code', code.toUpperCase())).unique();
export const membersOf = (ctx: QueryCtx, roomId: Id<'play_rooms'>) =>
  ctx.db.query('play_members').withIndex('by_room_id_and_joined_at', (q) => q.eq('room_id', roomId)).take(16);
export const memberBySecret = (ctx: QueryCtx, roomId: Id<'play_rooms'>, secret: string) =>
  ctx.db.query('play_members').withIndex('by_room_id_and_secret', (q) => q.eq('room_id', roomId).eq('secret', secret)).unique();

export async function requireMember(ctx: MutationCtx, code: string, secret: string) {
  const room = await roomByCode(ctx, code);
  const me = room && await memberBySecret(ctx, room._id, secret);
  if (!room || !me) throw new ConvexError('You are no longer in this room.');
  return { room, me };
}

/** Index of the player who must act now (Salone-Poly: also auction bidders and debtors; -1 in races) */
const actorOf = (room: Room, s: State) => SPECS[room.game].actor(s);
const seatOf = (s: State | undefined, memberId: string) => (s ? s.players.findIndex((p) => p.id === memberId) : -1);

/** Store a new game state and, if a bot must act next, schedule its move. */
async function save(ctx: MutationCtx, room: Room, state: State, extra: Partial<Room> = {}) {
  const version = room.version + 1;
  await ctx.db.patch(room._id, { ...extra, state, version, offer: undefined });
  const wasPlaying = (room.state as State | undefined)?.status === 'playing';
  if (room.pot_id && wasPlaying && state.status === 'finished') await settleRound(ctx, room, state);
  await scheduleBot(ctx, { ...room, state, version });
}

const roomLabel = (room: Room) => `${ROOM_GAME_NAMES[room.game]} room ${room.code}`;

/** Money rooms: the game just ended, so pay the pot out and open a fresh one for the next round. */
async function settleRound(ctx: MutationCtx, room: Room, s: State) {
  const members = await membersOf(ctx, room._id);
  const accountAt = (seat: number) => {
    const p = s.players[seat];
    return p && !p.isAI ? members.find((m) => m.member_id === p.id)?.user_id ?? null : null;
  };
  const stillHere = s.players.map((_, i) => i).filter((i) => accountAt(i));
  let winning: number[] = [];
  if (typeof s.winner === 'number' && accountAt(s.winner)) winning = [s.winner];
  else {
    // A draw or a tie: share between the tied leaders (by score where the game keeps one), else everyone still playing.
    const scores = (s as State & { scores?: number[] }).scores;
    const tied = (s as State & { tiedPlayers?: number[] }).tiedPlayers;
    if (tied?.length) winning = tied;
    else if (s.winner === null && Array.isArray(scores) && scores.length === s.players.length && stillHere.length) {
      const best = Math.max(...stillHere.map((i) => scores[i]));
      winning = stillHere.filter((i) => scores[i] === best);
    }
    winning = winning.filter((i) => accountAt(i));
    if (!winning.length) winning = stillHere; // e.g. a bot that took over someone who left came first
  }
  const each = await settleShared(ctx, room.pot_id!, winning.map((i) => accountAt(i)!), roomLabel(room));
  await ctx.db.patch(room._id, {
    pot_id: await openPot(ctx, room.game, room.code, room.stake!),
    last_prize: each ? { names: winning.map((i) => s.players[i].name), each } : undefined,
  });
}

async function scheduleBot(ctx: MutationCtx, room: Room) {
  const s = room.state as State | undefined;
  if (!s || s.status !== 'playing' || !s.players[actorOf(room, s)]?.isAI) return;
  const spec = SPECS[room.game];
  const args = { roomId: room._id, version: room.version };
  // Bots "think" for a varied, human-feeling moment before they play.
  const kind = room.game === 'salone-poly' && (s as { phase?: string }).phase === 'auction' ? 'salone-poly-auction' : room.game;
  const delay = kind in BOT_THINK_MS ? botThinkMs(kind as BotThinkKind) : spec.botDelayMs;
  // Scrabble bots need the dictionary, which only the Node runtime can load.
  if (spec.nodeBot) await ctx.scheduler.runAfter(delay, internal.scrabbleNode.botMove, args);
  else await ctx.scheduler.runAfter(delay, internal.rooms.botMove, args);
}

const pendingRequests = (ctx: QueryCtx, roomId: Id<'play_rooms'>) =>
  ctx.db.query('play_requests').withIndex('by_room_id_and_status', (q) => q.eq('room_id', roomId).eq('status', 'pending')).take(MAX_PENDING_REQUESTS);

/** Remember that this player was in the room, for their "Your rooms" list. */
async function recordVisit(ctx: MutationCtx, userId: Id<'users'> | undefined, roomId: Id<'play_rooms'>) {
  if (!userId) return;
  const now = Date.now();
  const visit = await ctx.db.query('room_visits')
    .withIndex('by_user_id_and_room_id', (q) => q.eq('user_id', userId).eq('room_id', roomId)).unique();
  if (visit) await ctx.db.patch(visit._id, { last_at: now });
  else await ctx.db.insert('room_visits', { user_id: userId, room_id: roomId, last_at: now });
}

/** Clear a room's join requests and voice messages (it emptied, or is being deleted). */
async function clearRoomExtras(ctx: MutationCtx, roomId: Id<'play_rooms'>) {
  const requests = await ctx.db.query('play_requests').withIndex('by_room_id_and_status', (q) => q.eq('room_id', roomId)).take(100);
  for (const r of requests) await ctx.db.delete(r._id);
  const signals = await ctx.db.query('voice_signals').withIndex('by_room_id_and_to', (q) => q.eq('room_id', roomId)).take(500);
  for (const x of signals) await ctx.db.delete(x._id);
}

/** Someone left: free their seat. Mid-game a bot takes over (or, in races, they drop out) so the others can finish. */
async function removeMember(ctx: MutationCtx, room: Room, member: Doc<'play_members'>) {
  await ctx.db.delete(member._id);
  if (room.pot_id && member.user_id) await unstake(ctx, room.pot_id, member.user_id, roomLabel(room)); // only while the pot is open
  const rest = await membersOf(ctx, room._id);
  if (rest.length === 0) {
    // Nobody left: keep the room so its players can come back, but reset it to the lobby.
    let potId = room.pot_id;
    if (potId) {
      await voidPot(ctx, potId, roomLabel(room)); // nobody left to win: every stake goes back
      potId = await openPot(ctx, room.game, room.code, room.stake!); // a fresh pot for whoever comes back
    }
    await clearRoomExtras(ctx, room._id);
    await ctx.db.patch(room._id, {
      state: undefined, offer: undefined, is_public: false, pot_id: potId, version: room.version + 1, empty_since: Date.now(),
    });
    return;
  }
  if (member.host) await ctx.db.patch(rest[0]._id, { host: true }); // the longest-waiting player takes over
  const s = room.state as State | undefined;
  const seat = seatOf(s, member.member_id);
  if (!s || s.status !== 'playing' || seat < 0) return;
  const spec = SPECS[room.game];
  if (room.pot_id) {
    // Money rooms: the leaver forfeits. If only one player with a stake is left, they win the pot now.
    const playing = s.players.map((_, i) => i)
      .filter((i) => i !== seat && !s.players[i].isAI && rest.some((m) => m.member_id === s.players[i].id));
    if (playing.length === 1) {
      await save(ctx, room, { ...s, status: 'finished', winner: playing[0], updatedAt: Date.now() });
      return;
    }
  }
  if (!spec.bots) { if (spec.onLeave) await save(ctx, room, spec.onLeave(s, seat)); return; }
  const players: Player[] = s.players.map((p, i) => (i === seat ? { id: p.id, name: `${p.name} (bot)`, isAI: true, difficulty: 'medium' } : p));
  await save(ctx, room, { ...s, players });
}

export const view = query({
  args: { code: v.string(), secret: v.string() },
  handler: async (ctx, { code, secret }) => {
    const room = await roomByCode(ctx, code);
    if (!room) return null;
    const members = await membersOf(ctx, room._id);
    const me = members.find((m) => m.secret === secret) ?? null;
    const s = room.state as State | undefined;
    const seat = me ? seatOf(s, me.member_id) : -1;
    let state: unknown = null;
    if (s) state = SPECS[room.game].view(s, seat);
    // Only the host sees who is asking to join.
    const requests = me?.host
      ? (await pendingRequests(ctx, room._id)).map((r) => ({ id: r.request_id, name: r.name, createdAt: r.created_at }))
      : [];
    const pot = room.pot_id ? await ctx.db.get(room.pot_id) : null;
    const meUser = me?.user_id ? await ctx.db.get(me.user_id) : null;
    const staked = new Set(pot
      ? (await ctx.db.query('pot_entries').withIndex('by_pot', (q) => q.eq('pot_id', pot._id)).collect())
        .filter((e) => e.status === 'held').map((e) => e.user_id as string)
      : []);
    return {
      code: room.code,
      game: room.game,
      version: room.version,
      isPublic: !!room.is_public,
      me: me && { id: me.member_id, host: me.host, seat, pro: isPro(meUser) },
      members: members.map((m) => ({
        id: m.member_id, name: m.name, host: m.host, lastSeen: m.last_seen, voice: !!m.voice, talk: !!m.voice_talk,
        staked: !!m.user_id && staked.has(m.user_id),
      })),
      money: room.stake === undefined ? null : {
        stake: room.stake,
        pot: pot ? { total: pot.total, status: pot.status, feeBps: pot.fee_bps } : null,
        lastPrize: room.last_prize ?? null,
      },
      state,
      offer: (room.offer ?? null) as null | { from: number; to: number; give: TradeSideT; get: TradeSideT },
      requests,
    };
  },
});
type TradeSideT = { spaces: number[]; cash: number; jailCards: number };

/** Make a new room; you are its host. */
export const create = mutation({
  args: { game: roomGameV, name: v.string(), secret: v.string(), stake: v.optional(v.number()) },
  handler: async (ctx, { game, name, secret, stake }) => {
    checkSecret(secret);
    const user = await currentUser(ctx);
    if (!user) throw new ConvexError('errors.signInRequired');
    let userId: Id<'users'> = user._id;
    if (stake !== undefined) {
      if (SPECS[game].noMoney) throw new ConvexError('This game can only be played for fun.');
      if (!Number.isInteger(stake) || stake < WALLET_LIMITS.minStake || stake > WALLET_LIMITS.maxStake) {
        throw new ConvexError(`The stake must be between ${formatLeones(WALLET_LIMITS.minStake)} and ${formatLeones(WALLET_LIMITS.maxStake)}.`);
      }
      userId = (await requireWalletUser(ctx))._id;
    }
    await spendRoomAllowance(ctx, user); // free players: FREE_DAILY_ROOMS a day
    let code = '';
    for (let tries = 0; tries < 20 && (!code || await roomByCode(ctx, code)); tries++) {
      code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    }
    const now = Date.now();
    const potId = stake !== undefined ? await openPot(ctx, game, code, stake) : undefined;
    const roomId = await ctx.db.insert('play_rooms', { code, game, version: 0, created_at: now, stake, pot_id: potId, owner_id: user._id });
    const memberId = `m${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    await ctx.db.insert('play_members', {
      room_id: roomId, member_id: memberId, secret, name: cleanName(name), host: true, joined_at: now, last_seen: now, user_id: userId,
    });
    if (potId) await stakeIn(ctx, potId, userId, `${ROOM_GAME_NAMES[game]} room ${code}`);
    await recordVisit(ctx, userId, roomId);
    return { code, memberId };
  },
});

/** Join a room by its code (or come back to it after a reload). */
export const join = mutation({
  args: { code: v.string(), name: v.string(), secret: v.string() },
  handler: async (ctx, { code, name, secret }) => {
    checkSecret(secret);
    const room = await roomByCode(ctx, code);
    if (!room) throw new ConvexError(`Room ${code.toUpperCase()} was not found. Check the code and try again.`);
    const existing = await memberBySecret(ctx, room._id, secret);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { name: cleanName(name), last_seen: now });
      await recordVisit(ctx, existing.user_id, room._id);
      return { code: room.code, memberId: existing.member_id };
    }
    if ((room.state as State | undefined)?.status === 'playing') throw new ConvexError('This game has already started. Ask the host to start a new one, then join.');
    const members = await membersOf(ctx, room._id);
    if (members.length >= SPECS[room.game].max) throw new ConvexError(`Room ${room.code} is full (${SPECS[room.game].max} players).`);
    let userId: Id<'users'> | undefined = (await currentUser(ctx))?._id;
    if (!userId) throw new ConvexError('errors.signInRequired');
    if (room.stake !== undefined) {
      userId = (await requireWalletUser(ctx))._id;
      if (members.some((m) => m.user_id === userId)) throw new ConvexError('You are already in this room on another device.');
    }
    const memberId = `m${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    // The first one back in an empty room hosts it.
    await ctx.db.insert('play_members', {
      room_id: room._id, member_id: memberId, secret, name: cleanName(name), host: members.length === 0, joined_at: now, last_seen: now, user_id: userId,
    });
    if (room.empty_since !== undefined) await ctx.db.patch(room._id, { empty_since: undefined });
    if (room.pot_id && userId) await stakeIn(ctx, room.pot_id, userId, roomLabel(room));
    await recordVisit(ctx, userId, room._id);
    const request = await myRequest(ctx, room._id, secret); // they were let in from Live games: done with it
    if (request) await ctx.db.delete(request._id);
    return { code: room.code, memberId };
  },
});

export const heartbeat = mutation({
  args: { code: v.string(), secret: v.string() },
  handler: async (ctx, { code, secret }) => {
    const { me } = await requireMember(ctx, code, secret);
    await ctx.db.patch(me._id, { last_seen: Date.now() });
  },
});

export const leave = mutation({
  args: { code: v.string(), secret: v.string() },
  handler: async (ctx, { code, secret }) => {
    const room = await roomByCode(ctx, code);
    const me = room && await memberBySecret(ctx, room._id, secret);
    if (room && me) await removeMember(ctx, room, me);
  },
});

/** Money rooms: the signed-in member behind this seat (their account must be the one calling). */
async function requireStaker(ctx: MutationCtx, code: string, secret: string) {
  const { room, me } = await requireMember(ctx, code, secret);
  if (!room.pot_id || !me.user_id) throw new ConvexError('This room is not played for money.');
  if ((await requireWalletUser(ctx))._id !== me.user_id) throw new ConvexError('errors.signInRequired');
  return { room, potId: room.pot_id, userId: me.user_id };
}

/** Money rooms: put your stake in for the next game ("play again"). */
export const stake = mutation({
  args: { code: v.string(), secret: v.string() },
  handler: async (ctx, { code, secret }) => {
    const { room, potId, userId } = await requireStaker(ctx, code, secret);
    await stakeIn(ctx, potId, userId, roomLabel(room));
  },
});

/** Money rooms: take your stake back before the game starts. */
export const unstakeMe = mutation({
  args: { code: v.string(), secret: v.string() },
  handler: async (ctx, { code, secret }) => {
    const { room, potId, userId } = await requireStaker(ctx, code, secret);
    await unstake(ctx, potId, userId, roomLabel(room));
  },
});

// ---------- Your rooms: rooms you created or joined, to come back to ----------

/** The signed-in player's recent rooms (newest first) and how many rooms they can still create today. */
export const recent = query({
  args: { game: v.optional(roomGameV) },
  handler: async (ctx, { game }) => {
    const me = await currentUser(ctx);
    if (!me) return null;
    const visits = await ctx.db.query('room_visits').withIndex('by_user_id_and_last_at', (q) => q.eq('user_id', me._id)).order('desc').take(40);
    const rooms = [];
    for (const visit of visits) {
      if (rooms.length >= RECENT_ROOMS) break;
      const room = await ctx.db.get(visit.room_id);
      if (!room || (game && room.game !== game)) continue;
      const members = await membersOf(ctx, room._id);
      const s = room.state as State | undefined;
      rooms.push({
        id: room._id,
        code: room.code,
        game: room.game,
        mine: room.owner_id === me._id,
        host: members.find((m) => m.host)?.name ?? null,
        players: members.length,
        maxPlayers: SPECS[room.game].max,
        playing: s?.status === 'playing',
        stake: room.stake ?? null,
        lastAt: visit.last_at,
        expiresAt: room.empty_since !== undefined ? room.empty_since + ROOM_IDLE_MS : null,
      });
    }
    return { rooms, roomsLeft: await roomsLeft(ctx, me), freeDailyRooms: FREE_DAILY_ROOMS };
  },
});

/** Take a room off your "Your rooms" list. The room itself stays for anyone else who was in it. */
export const forgetRecent = mutation({
  args: { roomId: v.id('play_rooms') },
  handler: async (ctx, { roomId }) => {
    const me = await currentUser(ctx);
    if (!me) return;
    const visit = await ctx.db.query('room_visits')
      .withIndex('by_user_id_and_room_id', (q) => q.eq('user_id', me._id).eq('room_id', roomId)).unique();
    if (visit) await ctx.db.delete(visit._id);
  },
});

// ---------- Live games: public rooms anyone can ask to join ----------

/** Host only: list the room in Live games (or take it off). */
export const setPublic = mutation({
  args: { code: v.string(), secret: v.string(), isPublic: v.boolean() },
  handler: async (ctx, { code, secret, isPublic }) => {
    const { room, me } = await requireMember(ctx, code, secret);
    if (!me.host) throw new ConvexError('Only the host can change this.');
    await ctx.db.patch(room._id, { is_public: isPublic });
    // Followers hear that their friend is hosting (money rooms too: they still choose to stake)
    if (isPublic && !room.is_public && me.user_id) await announceHosting(ctx, me.user_id, room.game);
  },
});

/** Every listed room, newest first (rooms hosted by people you follow first). Never includes the room code: players ask the host instead. */
export const publicList = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await currentUser(ctx);
    const rooms = await ctx.db.query('play_rooms').withIndex('by_is_public', (q) => q.eq('is_public', true)).order('desc').take(50);
    const list = await Promise.all(rooms.map(async (room) => {
      const members = await membersOf(ctx, room._id);
      const host = members.find((m) => m.host);
      const s = room.state as State | undefined;
      return {
        id: room._id,
        game: room.game,
        host: host?.name ?? 'Host',
        friend: !!viewer && !!host?.user_id && host.user_id !== viewer._id && !!await ctx.db.query('follows')
          .withIndex('by_follower_id_and_followee_id', (q) => q.eq('follower_id', viewer._id).eq('followee_id', host.user_id!)).unique(),
        players: members.length,
        maxPlayers: SPECS[room.game].max,
        playing: s?.status === 'playing',
        stake: room.stake ?? null,
        createdAt: room.created_at,
      };
    }));
    return list.filter((r) => r.players > 0).sort((a, b) => Number(b.friend) - Number(a.friend));
  },
});

async function publicRoom(ctx: QueryCtx, roomId: string) {
  const id = ctx.db.normalizeId('play_rooms', roomId);
  const room = id && await ctx.db.get(id);
  if (!room || !room.is_public) throw new ConvexError('That game is no longer open. Pick another one.');
  return room;
}
const myRequest = (ctx: QueryCtx, roomId: Id<'play_rooms'>, secret: string) =>
  ctx.db.query('play_requests').withIndex('by_room_id_and_secret', (q) => q.eq('room_id', roomId).eq('secret', secret)).first();

/** Ask the host of a listed room to let you in. Asking again just refreshes your name. */
export const requestJoin = mutation({
  args: { roomId: v.string(), name: v.string(), secret: v.string() },
  handler: async (ctx, { roomId, name, secret }) => {
    checkSecret(secret);
    if (!(await currentUser(ctx))) throw new ConvexError('errors.signInRequired'); // online play needs an account
    const room = await publicRoom(ctx, roomId);
    if (await memberBySecret(ctx, room._id, secret)) throw new ConvexError('You are already in this room.');
    const members = await membersOf(ctx, room._id);
    if (members.length >= SPECS[room.game].max) throw new ConvexError('This room is full.');
    const existing = await myRequest(ctx, room._id, secret);
    if (existing) {
      if (existing.status === 'declined') throw new ConvexError('The host said no to this room. Try another one.');
      await ctx.db.patch(existing._id, { name: cleanName(name) });
      return;
    }
    if ((await pendingRequests(ctx, room._id)).length >= MAX_PENDING_REQUESTS) {
      throw new ConvexError('Lots of people are asking to join this room. Try another one.');
    }
    const now = Date.now();
    await ctx.db.insert('play_requests', {
      room_id: room._id, secret, name: cleanName(name), status: 'pending', created_at: now,
      request_id: `r${now.toString(36)}${Math.floor(Math.random() * 1e8).toString(36)}`,
    });
  },
});

/** The asker's view of their request. The room code is only revealed once the host says yes. */
export const requestStatus = query({
  args: { roomId: v.string(), secret: v.string() },
  handler: async (ctx, { roomId, secret }) => {
    const id = ctx.db.normalizeId('play_rooms', roomId);
    const room = id && await ctx.db.get(id);
    if (!room) return null;
    const r = await myRequest(ctx, room._id, secret);
    if (!r) return null;
    return { status: r.status, game: room.game, code: r.status === 'approved' ? room.code : null };
  },
});

export const cancelRequest = mutation({
  args: { roomId: v.string(), secret: v.string() },
  handler: async (ctx, { roomId, secret }) => {
    const id = ctx.db.normalizeId('play_rooms', roomId);
    const r = id && await myRequest(ctx, id, secret);
    if (r) await ctx.db.delete(r._id);
  },
});

/** Host only: let someone in (they get the room code and join themselves) or turn them down. */
export const answerRequest = mutation({
  args: { code: v.string(), secret: v.string(), requestId: v.string(), accept: v.boolean() },
  handler: async (ctx, { code, secret, requestId, accept }) => {
    const { room, me } = await requireMember(ctx, code, secret);
    if (!me.host) throw new ConvexError('Only the host can answer requests.');
    const r = (await pendingRequests(ctx, room._id)).find((x) => x.request_id === requestId);
    if (!r) return; // already answered or withdrawn
    if (accept && (await membersOf(ctx, room._id)).length >= SPECS[room.game].max) {
      throw new ConvexError('The room is full. Free a seat first.');
    }
    await ctx.db.patch(r._id, { status: accept ? 'approved' : 'declined' });
  },
});

/** Host only: deal a new game with everyone in the room, plus bots in the empty seats. */
export const start = mutation({
  args: { code: v.string(), secret: v.string(), bots: v.number(), difficulty: difficultyV, minutes: v.optional(v.number()), variant: v.optional(v.string()) },
  handler: async (ctx, { code, secret, bots, difficulty, minutes, variant }) => {
    const { room, me } = await requireMember(ctx, code, secret);
    if (!me.host) throw new ConvexError('Only the host can start the game.');
    if ((room.state as State | undefined)?.status === 'playing') throw new ConvexError('A game is already being played.');
    const spec = SPECS[room.game];
    let humans = (await membersOf(ctx, room._id)).slice(0, spec.max);
    if (room.pot_id) {
      const pot = await ctx.db.get(room.pot_id);
      if (pot?.status !== 'open') throw new ConvexError('This round has already started.');
      const staked = new Set((await heldEntries(ctx, pot._id)).map((e) => e.user_id));
      humans = humans.filter((m) => m.user_id && staked.has(m.user_id));
      if (humans.length < 2) throw new ConvexError('At least 2 players must put their stake in before the game can start.');
    }
    const botCount = spec.bots && !room.pot_id ? Math.max(0, Math.min(Math.floor(bots), spec.max - humans.length)) : 0;
    if (humans.length + botCount < 2) {
      throw new ConvexError(spec.bots ? 'Add a bot or wait for a friend: you need at least 2 players.' : 'Wait for a friend: you need at least 2 players.');
    }
    const players: Player[] = [
      ...humans.map((m) => ({ id: m.member_id, name: m.name, isAI: false })),
      ...Array.from({ length: botCount }, (_, i) => ({ id: `bot${i + 1}`, name: `Bot ${i + 1}`, isAI: true, difficulty })),
    ];
    const timed = spec.timer && minutes ? Math.min(120, Math.max(room.game === 'snake' ? 1 : 10, Math.floor(minutes))) : 0;
    if (room.pot_id) await lockPot(ctx, room.pot_id);
    await countGame(ctx, humans.flatMap((m) => (m.user_id ? [m.user_id] : [])));
    await recordPlayedWith(ctx, humans.flatMap((m) => (m.user_id ? [m.user_id] : []))); // for "people you've played with"
    await save(ctx, room, spec.start(players, timed, variant?.slice(0, 32)));
    if (timed) await ctx.scheduler.runAfter(timed * 60_000, internal.rooms.timeUp, { roomId: room._id });
  },
});

/** Make a move in the room's game. The server checks it is your turn and that the move is legal. */
export const move = mutation({
  args: { code: v.string(), secret: v.string(), move: moveV },
  handler: async (ctx, { code, secret, move: m }) => {
    const { room, me } = await requireMember(ctx, code, secret);
    const s = room.state as State | undefined;
    if (!s || s.status !== 'playing') throw new ConvexError('The game is not running.');
    const seat = seatOf(s, me.member_id);
    if (seat < 0) throw new ConvexError('You are watching this game, not playing in it.');
    // Without the dictionary this path can't tell a word from a non-word, so Scrabble plays never come in here.
    if (room.game === 'scrabble' && m.type === 'play') throw new ConvexError('Send Scrabble plays through scrabbleNode:move.');
    await applyMove(ctx, room, s, m, seat);
  },
});

async function applyMove(ctx: MutationCtx, room: Room, s: State, m: RoomMove, seat: number) {
  const spec = SPECS[room.game];
  if (!spec.moveTypes.has(m.type)) throw new ConvexError('That move belongs to a different game.');
  const why = spec.check(s, m, seat);
  if (why) throw new ConvexError(why);
  await save(ctx, room, spec.apply(s, m, seat));
}

/** For scrabbleNode.ts: the caller's seat and the game, read before checking words. */
export const seatFor = internalQuery({
  args: { code: v.string(), secret: v.string() },
  handler: async (ctx, { code, secret }) => {
    const room = await roomByCode(ctx, code);
    const me = room && await memberBySecret(ctx, room._id, secret);
    if (!room || !me) return null;
    const s = room.state as State | undefined;
    return { roomId: room._id, game: room.game, version: room.version, seat: seatOf(s, me.member_id), state: s ?? null };
  },
});

export const roomById = internalQuery({
  args: { roomId: v.id('play_rooms') },
  handler: (ctx, { roomId }) => ctx.db.get(roomId),
});

/** For scrabbleNode.ts: apply a move whose words were checked, if nothing changed since it was read. */
export const applyChecked = internalMutation({
  args: { roomId: v.id('play_rooms'), version: v.number(), seat: v.number(), move: moveV },
  handler: async (ctx, { roomId, version, seat, move: m }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.version !== version) throw new ConvexError('The game moved on while your play was being checked. Try again.');
    const s = room.state as State | undefined;
    if (!s || s.status !== 'playing') throw new ConvexError('The game is not running.');
    await applyMove(ctx, room, s, m, seat);
  },
});

/** Salone-Poly: offer a trade. Bots answer at once; a human gets the offer to accept or decline. */
export const offerTrade = mutation({
  args: { code: v.string(), secret: v.string(), with: v.number(), give: tradeSideV, get: tradeSideV },
  handler: async (ctx, args) => {
    const { room, me } = await requireMember(ctx, args.code, args.secret);
    const s = room.state as SalonePolyState | undefined;
    if (room.game !== 'salone-poly' || !s || s.status !== 'playing') throw new ConvexError('There is no game to trade in.');
    const seat = seatOf(s, me.member_id);
    const trade = { type: 'trade' as const, with: args.with, give: args.give, get: args.get };
    const why = poly.check(s, trade, seat);
    if (why) throw new ConvexError(why);
    if (s.players[args.with].isAI) {
      if (!poly.botAcceptsTrade(s, trade)) return { accepted: false };
      await save(ctx, room, poly.applyMove(s, trade));
      return { accepted: true };
    }
    await ctx.db.patch(room._id, { offer: { from: seat, to: args.with, give: args.give, get: args.get, version: room.version } });
    return { accepted: null }; // waiting for the other player
  },
});

/** Salone-Poly: answer a trade offered to you (or withdraw your own with accept=false). */
export const respondTrade = mutation({
  args: { code: v.string(), secret: v.string(), accept: v.boolean() },
  handler: async (ctx, { code, secret, accept }) => {
    const { room, me } = await requireMember(ctx, code, secret);
    const offer = room.offer as { from: number; to: number; give: TradeSideT; get: TradeSideT; version: number } | undefined;
    const s = room.state as SalonePolyState | undefined;
    if (!offer || !s) return;
    const seat = seatOf(s, me.member_id);
    if (seat !== offer.to && seat !== offer.from) throw new ConvexError('This trade is not yours to answer.');
    if (!accept || seat === offer.from) { await ctx.db.patch(room._id, { offer: undefined }); return; }
    const trade = { type: 'trade' as const, with: offer.to, give: offer.give, get: offer.get };
    // Anything that happened since the offer (a move, a payment) could change what is on the table.
    if (room.version !== offer.version || poly.check(s, trade, offer.from)) {
      await ctx.db.patch(room._id, { offer: undefined });
      throw new ConvexError('That offer is out of date. Ask for a new one.');
    }
    await save(ctx, room, poly.applyMove(s, trade));
  },
});

/** A bot's move, scheduled after the previous change. Skipped if the game moved on in the meantime. */
export const botMove = internalMutation({
  args: { roomId: v.id('play_rooms'), version: v.number() },
  handler: async (ctx, { roomId, version }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.version !== version) return;
    const s = room.state as State | undefined;
    if (!s || s.status !== 'playing') return;
    const bot = s.players[actorOf(room, s)];
    const step = SPECS[room.game].botStep;
    if (!bot?.isAI || !step) return;
    const next = step(s, bot.difficulty ?? 'medium');
    if (next) await save(ctx, room, next);
  },
});

/** For scrabbleNode.ts: a bot's checked move, if the game is still where the bot saw it. */
export const applyBotMove = internalMutation({
  args: { roomId: v.id('play_rooms'), version: v.number(), move: moveV },
  handler: async (ctx, { roomId, version, move: m }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.version !== version) return;
    const s = room.state as State | undefined;
    if (!s || s.status !== 'playing' || !s.players[actorOf(room, s)]?.isAI) return;
    const spec = SPECS[room.game];
    const seat = actorOf(room, s);
    // A bot move the rules refuse would leave the game stuck: pass instead.
    const safe: RoomMove = spec.check(s, m, seat) ? { type: 'pass' } : m;
    await save(ctx, room, spec.apply(s, safe, seat));
  },
});

/** Timed games: when time runs out the game ends (Salone-Poly: richest wins; Snake: highest score). */
export const timeUp = internalMutation({
  args: { roomId: v.id('play_rooms') },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    const s = room?.state as (State & { endsAt?: number | null }) | undefined;
    const end = room && SPECS[room.game].timeUp;
    if (!room || !end || !s || s.status !== 'playing' || !s.endsAt || Date.now() < s.endsAt) return;
    await save(ctx, room, end(s));
  },
});

/** Cron: players whose heartbeat stopped (closed tab, lost connection) leave; bots take their seats. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db.query('play_members').withIndex('by_last_seen', (q) => q.lt('last_seen', Date.now() - STALE_MS)).take(200);
    for (const m of stale) {
      const room = await ctx.db.get(m.room_id);
      if (room) await removeMember(ctx, room, m);
      else await ctx.db.delete(m._id);
    }
    const oldRequests = await ctx.db.query('play_requests').withIndex('by_created_at', (q) => q.lt('created_at', Date.now() - REQUEST_TTL_MS)).take(200);
    for (const r of oldRequests) await ctx.db.delete(r._id);
    const oldSignals = await ctx.db.query('voice_signals').withIndex('by_created_at', (q) => q.lt('created_at', Date.now() - 2 * 60_000)).take(500);
    for (const x of oldSignals) await ctx.db.delete(x._id);
    // Rooms nobody has been in for ROOM_IDLE_DAYS are deleted (gt(0) skips rooms with people in them).
    const idle = await ctx.db.query('play_rooms')
      .withIndex('by_empty_since', (q) => q.gt('empty_since', 0).lt('empty_since', Date.now() - ROOM_IDLE_MS)).take(50);
    for (const room of idle) await deleteRoom(ctx, room);
  },
});

/** Delete an empty room for good: its pot (no stakes are left in it), extras and everyone's "Your rooms" entry. */
async function deleteRoom(ctx: MutationCtx, room: Room) {
  if ((await membersOf(ctx, room._id)).length) return; // someone came back
  if (room.pot_id) await voidPot(ctx, room.pot_id, roomLabel(room));
  await clearRoomExtras(ctx, room._id);
  const visits = await ctx.db.query('room_visits').withIndex('by_room_id', (q) => q.eq('room_id', room._id)).take(500);
  for (const x of visits) await ctx.db.delete(x._id);
  await ctx.db.delete(room._id);
}
