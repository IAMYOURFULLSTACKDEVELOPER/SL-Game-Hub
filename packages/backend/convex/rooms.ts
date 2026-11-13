import { ConvexError, v } from 'convex/values';
import { query, mutation, internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { SalonePolyEngine, type SalonePolyState } from '@slgh/shared/src/games/salone-poly';
import type { GameState, Player } from '@slgh/shared/src/types';
import { SPECS, moveV, roomGameV, type RoomMove } from './roomGames';

// Online rooms for every multiplayer game (see roomGames.ts). Anonymous like free Dice rooms: no account needed.
// Each browser makes a private `secret` and sends it with every call; it proves which seat is theirs.
// Other players only ever see the public `member_id`, so nobody can act or peek as someone else.
// The server owns the game: it validates and applies every move, makes every roll and shuffle,
// plays the bots, and sends each player only what they may see (UNO hands, Scrabble racks stay secret).

const poly = new SalonePolyEngine(); // trades
type Room = Doc<'play_rooms'>;
type State = GameState;

export const HEARTBEAT_MS = 10_000;
const STALE_MS = 3 * HEARTBEAT_MS;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to mix up when reading a code aloud
const MAX_PENDING_REQUESTS = 20; // per room, so a listed room can't be flooded
const REQUEST_TTL_MS = 60 * 60_000; // unanswered or answered requests are cleared after an hour

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
  await scheduleBot(ctx, { ...room, state, version });
}

async function scheduleBot(ctx: MutationCtx, room: Room) {
  const s = room.state as State | undefined;
  if (!s || s.status !== 'playing' || !s.players[actorOf(room, s)]?.isAI) return;
  const spec = SPECS[room.game];
  const args = { roomId: room._id, version: room.version };
  // Scrabble bots need the dictionary, which only the Node runtime can load.
  if (spec.nodeBot) await ctx.scheduler.runAfter(spec.botDelayMs, internal.scrabbleNode.botMove, args);
  else await ctx.scheduler.runAfter(spec.botDelayMs, internal.rooms.botMove, args);
}

const pendingRequests = (ctx: QueryCtx, roomId: Id<'play_rooms'>) =>
  ctx.db.query('play_requests').withIndex('by_room_id_and_status', (q) => q.eq('room_id', roomId).eq('status', 'pending')).take(MAX_PENDING_REQUESTS);

/** Someone left: free their seat. Mid-game a bot takes over (or, in races, they drop out) so the others can finish. */
async function removeMember(ctx: MutationCtx, room: Room, member: Doc<'play_members'>) {
  await ctx.db.delete(member._id);
  const rest = await membersOf(ctx, room._id);
  if (rest.length === 0) {
    const requests = await ctx.db.query('play_requests').withIndex('by_room_id_and_status', (q) => q.eq('room_id', room._id)).take(100);
    for (const r of requests) await ctx.db.delete(r._id);
    const signals = await ctx.db.query('voice_signals').withIndex('by_room_id_and_to', (q) => q.eq('room_id', room._id)).take(500);
    for (const x of signals) await ctx.db.delete(x._id);
    await ctx.db.delete(room._id);
    return;
  }
  if (member.host) await ctx.db.patch(rest[0]._id, { host: true }); // the longest-waiting player takes over
  const s = room.state as State | undefined;
  const seat = seatOf(s, member.member_id);
  if (!s || s.status !== 'playing' || seat < 0) return;
  const spec = SPECS[room.game];
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
    return {
      code: room.code,
      game: room.game,
      version: room.version,
      isPublic: !!room.is_public,
      me: me && { id: me.member_id, host: me.host, seat },
      members: members.map((m) => ({ id: m.member_id, name: m.name, host: m.host, lastSeen: m.last_seen, voice: !!m.voice })),
      state,
      offer: (room.offer ?? null) as null | { from: number; to: number; give: TradeSideT; get: TradeSideT },
      requests,
    };
  },
});
type TradeSideT = { spaces: number[]; cash: number; jailCards: number };

/** Make a new room; you are its host. */
export const create = mutation({
  args: { game: roomGameV, name: v.string(), secret: v.string() },
  handler: async (ctx, { game, name, secret }) => {
    checkSecret(secret);
    let code = '';
    for (let tries = 0; tries < 20 && (!code || await roomByCode(ctx, code)); tries++) {
      code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    }
    const now = Date.now();
    const roomId = await ctx.db.insert('play_rooms', { code, game, version: 0, created_at: now });
    const memberId = `m${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    await ctx.db.insert('play_members', { room_id: roomId, member_id: memberId, secret, name: cleanName(name), host: true, joined_at: now, last_seen: now });
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
      return { code: room.code, memberId: existing.member_id };
    }
    if ((room.state as State | undefined)?.status === 'playing') throw new ConvexError('This game has already started. Ask the host to start a new one, then join.');
    const members = await membersOf(ctx, room._id);
    if (members.length >= SPECS[room.game].max) throw new ConvexError(`Room ${room.code} is full (${SPECS[room.game].max} players).`);
    const memberId = `m${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    await ctx.db.insert('play_members', { room_id: room._id, member_id: memberId, secret, name: cleanName(name), host: false, joined_at: now, last_seen: now });
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

// ---------- Live games: public rooms anyone can ask to join ----------

/** Host only: list the room in Live games (or take it off). */
export const setPublic = mutation({
  args: { code: v.string(), secret: v.string(), isPublic: v.boolean() },
  handler: async (ctx, { code, secret, isPublic }) => {
    const { room, me } = await requireMember(ctx, code, secret);
    if (!me.host) throw new ConvexError('Only the host can change this.');
    await ctx.db.patch(room._id, { is_public: isPublic });
  },
});

/** Every listed room, newest first. Never includes the room code: players ask the host instead. */
export const publicList = query({
  args: {},
  handler: async (ctx) => {
    const rooms = await ctx.db.query('play_rooms').withIndex('by_is_public', (q) => q.eq('is_public', true)).order('desc').take(50);
    const list = await Promise.all(rooms.map(async (room) => {
      const members = await membersOf(ctx, room._id);
      const host = members.find((m) => m.host);
      const s = room.state as State | undefined;
      return {
        id: room._id,
        game: room.game,
        host: host?.name ?? 'Host',
        players: members.length,
        maxPlayers: SPECS[room.game].max,
        playing: s?.status === 'playing',
        createdAt: room.created_at,
      };
    }));
    return list.filter((r) => r.players > 0);
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
  args: { code: v.string(), secret: v.string(), bots: v.number(), difficulty: difficultyV, minutes: v.optional(v.number()) },
  handler: async (ctx, { code, secret, bots, difficulty, minutes }) => {
    const { room, me } = await requireMember(ctx, code, secret);
    if (!me.host) throw new ConvexError('Only the host can start the game.');
    if ((room.state as State | undefined)?.status === 'playing') throw new ConvexError('A game is already being played.');
    const spec = SPECS[room.game];
    const humans = (await membersOf(ctx, room._id)).slice(0, spec.max);
    const botCount = spec.bots ? Math.max(0, Math.min(Math.floor(bots), spec.max - humans.length)) : 0;
    if (humans.length + botCount < 2) {
      throw new ConvexError(spec.bots ? 'Add a bot or wait for a friend: you need at least 2 players.' : 'Wait for a friend: you need at least 2 players.');
    }
    const players: Player[] = [
      ...humans.map((m) => ({ id: m.member_id, name: m.name, isAI: false })),
      ...Array.from({ length: botCount }, (_, i) => ({ id: `bot${i + 1}`, name: `Bot ${i + 1}`, isAI: true, difficulty })),
    ];
    const timed = spec.timer && minutes ? Math.min(120, Math.max(room.game === 'snake' ? 1 : 10, Math.floor(minutes))) : 0;
    await save(ctx, room, spec.start(players, timed));
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
  },
});
