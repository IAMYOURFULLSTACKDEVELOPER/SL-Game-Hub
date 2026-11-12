import { ConvexError, v } from 'convex/values';
import { query, mutation, internalMutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { UnoEngine, unoViewFor, UNO_MANIFEST, type UnoState, type UnoMove } from '@slgh/shared/src/games/uno';
import {
  SalonePolyEngine, salonePolyViewFor, actor, SALONE_POLY_MANIFEST,
  type SalonePolyState, type SalonePolyMove,
} from '@slgh/shared/src/games/salone-poly';
import type { Difficulty, Player } from '@slgh/shared/src/types';

// Online rooms for UNO and Salone-Poly. Anonymous like free Dice rooms: no account needed.
// Each browser makes a private `secret` and sends it with every call; it proves which seat is theirs.
// Other players only ever see the public `member_id`, so nobody can act or peek as someone else.
// The server owns the game: it validates and applies every move, makes every roll and shuffle,
// plays the bots, and sends each player only what they may see (UNO hands stay secret).

const uno = new UnoEngine();
const poly = new SalonePolyEngine();
type Game = Doc<'play_rooms'>['game'];
type Room = Doc<'play_rooms'>;
type State = UnoState | SalonePolyState;

const MAX_SEATS: Record<Game, number> = { uno: UNO_MANIFEST.maxPlayers, 'salone-poly': SALONE_POLY_MANIFEST.maxPlayers };
const BOT_DELAY_MS: Record<Game, number> = { uno: 1100, 'salone-poly': 800 };
export const HEARTBEAT_MS = 10_000;
const STALE_MS = 3 * HEARTBEAT_MS;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to mix up when reading a code aloud

const gameV = v.union(v.literal('uno'), v.literal('salone-poly'));
const difficultyV = v.union(v.literal('easy'), v.literal('medium'), v.literal('hard'));
const colorV = v.union(v.literal('red'), v.literal('yellow'), v.literal('green'), v.literal('blue'));
const spaceMove = <T extends string>(type: T) => v.object({ type: v.literal(type), space: v.number() });
const moveV = v.union(
  // UNO
  v.object({ type: v.literal('play'), cardId: v.string(), color: v.optional(colorV), uno: v.optional(v.boolean()) }),
  v.object({ type: v.literal('draw') }),
  v.object({ type: v.literal('pass') }),
  // Salone-Poly (no dice in `roll`: the server rolls). Trades go through offerTrade/respondTrade.
  v.object({ type: v.literal('roll') }),
  v.object({ type: v.literal('buy') }),
  v.object({ type: v.literal('decline') }),
  v.object({ type: v.literal('bid'), amount: v.number() }),
  v.object({ type: v.literal('auction_pass') }),
  v.object({ type: v.literal('pay_jail') }),
  v.object({ type: v.literal('use_jail_card') }),
  spaceMove('build'), spaceMove('sell_building'), spaceMove('mortgage'), spaceMove('unmortgage'),
  v.object({ type: v.literal('pay_debt') }),
  v.object({ type: v.literal('bankrupt') }),
  v.object({ type: v.literal('end_turn') }),
  v.object({ type: v.literal('time_up') }),
);
const tradeSideV = v.object({ spaces: v.array(v.number()), cash: v.number(), jailCards: v.number() });
const UNO_MOVES = new Set(['play', 'draw', 'pass']);

const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, 20) || 'Player';
const checkSecret = (secret: string) => {
  if (!/^[A-Za-z0-9-]{20,64}$/.test(secret)) throw new ConvexError('Something went wrong joining. Reload the page and try again.');
};

const roomByCode = (ctx: QueryCtx, code: string) =>
  ctx.db.query('play_rooms').withIndex('by_code', (q) => q.eq('code', code.toUpperCase())).unique();
const membersOf = (ctx: QueryCtx, roomId: Id<'play_rooms'>) =>
  ctx.db.query('play_members').withIndex('by_room_id_and_joined_at', (q) => q.eq('room_id', roomId)).take(16);
const memberBySecret = (ctx: QueryCtx, roomId: Id<'play_rooms'>, secret: string) =>
  ctx.db.query('play_members').withIndex('by_room_id_and_secret', (q) => q.eq('room_id', roomId).eq('secret', secret)).unique();

async function requireMember(ctx: MutationCtx, code: string, secret: string) {
  const room = await roomByCode(ctx, code);
  const me = room && await memberBySecret(ctx, room._id, secret);
  if (!room || !me) throw new ConvexError('You are no longer in this room.');
  return { room, me };
}

/** Index of the player who must act now (UNO: whose turn; Salone-Poly: also auction bidders and debtors) */
const actorOf = (room: Room, s: State) => (room.game === 'uno' ? s.currentPlayerIndex : actor(s as SalonePolyState));
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
  await ctx.scheduler.runAfter(BOT_DELAY_MS[room.game], internal.rooms.botMove, { roomId: room._id, version: room.version });
}

/** Someone left: free their seat. Mid-game a bot takes over, so the others can finish. */
async function removeMember(ctx: MutationCtx, room: Room, member: Doc<'play_members'>) {
  await ctx.db.delete(member._id);
  const rest = await membersOf(ctx, room._id);
  if (rest.length === 0) { await ctx.db.delete(room._id); return; }
  if (member.host) await ctx.db.patch(rest[0]._id, { host: true }); // the longest-waiting player takes over
  const s = room.state as State | undefined;
  const seat = seatOf(s, member.member_id);
  if (!s || s.status !== 'playing' || seat < 0) return;
  const players: Player[] = s.players.map((p, i) => (i === seat ? { id: p.id, name: `${p.name} (bot)`, isAI: true, difficulty: 'medium' } : p));
  await save(ctx, room, { ...s, players } as State);
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
    if (s) state = room.game === 'uno' ? unoViewFor(s as UnoState, seat) : salonePolyViewFor(s as SalonePolyState);
    return {
      code: room.code,
      game: room.game,
      version: room.version,
      me: me && { id: me.member_id, host: me.host, seat },
      members: members.map((m) => ({ id: m.member_id, name: m.name, host: m.host, lastSeen: m.last_seen })),
      state,
      offer: (room.offer ?? null) as null | { from: number; to: number; give: TradeSideT; get: TradeSideT },
    };
  },
});
type TradeSideT = { spaces: number[]; cash: number; jailCards: number };

/** Make a new room; you are its host. */
export const create = mutation({
  args: { game: gameV, name: v.string(), secret: v.string() },
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
    if (members.length >= MAX_SEATS[room.game]) throw new ConvexError(`Room ${room.code} is full (${MAX_SEATS[room.game]} players).`);
    const memberId = `m${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    await ctx.db.insert('play_members', { room_id: room._id, member_id: memberId, secret, name: cleanName(name), host: false, joined_at: now, last_seen: now });
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

/** Host only: deal a new game with everyone in the room, plus bots in the empty seats. */
export const start = mutation({
  args: { code: v.string(), secret: v.string(), bots: v.number(), difficulty: difficultyV, minutes: v.optional(v.number()) },
  handler: async (ctx, { code, secret, bots, difficulty, minutes }) => {
    const { room, me } = await requireMember(ctx, code, secret);
    if (!me.host) throw new ConvexError('Only the host can start the game.');
    if ((room.state as State | undefined)?.status === 'playing') throw new ConvexError('A game is already being played.');
    const max = MAX_SEATS[room.game];
    const humans = (await membersOf(ctx, room._id)).slice(0, max);
    const botCount = Math.max(0, Math.min(Math.floor(bots), max - humans.length));
    if (humans.length + botCount < 2) throw new ConvexError('Add a bot or wait for a friend: you need at least 2 players.');
    const players: Player[] = [
      ...humans.map((m) => ({ id: m.member_id, name: m.name, isAI: false })),
      ...Array.from({ length: botCount }, (_, i) => ({ id: `bot${i + 1}`, name: `Bot ${i + 1}`, isAI: true, difficulty: difficulty as Difficulty })),
    ];
    const timed = room.game === 'salone-poly' && minutes ? Math.min(120, Math.max(10, Math.floor(minutes))) : 0;
    const state: State = room.game === 'uno' ? uno.initialize(players) : poly.initialize(players, { minutes: timed });
    await save(ctx, room, state);
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
    if ((room.game === 'uno') !== UNO_MOVES.has(m.type)) throw new ConvexError('That move belongs to a different game.');

    if (room.game === 'uno') {
      const why = uno.check(s as UnoState, m as UnoMove, seat);
      if (why) throw new ConvexError(why);
      await save(ctx, room, uno.applyMove(s as UnoState, m as UnoMove));
      return;
    }
    const ps = s as SalonePolyState;
    if (m.type === 'time_up' && (!ps.endsAt || Date.now() < ps.endsAt)) throw new ConvexError('There is still time left.');
    const why = m.type === 'time_up' ? null : poly.check(ps, m as SalonePolyMove, seat);
    if (why) throw new ConvexError(why);
    await save(ctx, room, poly.applyMove(ps, m as SalonePolyMove));
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
    if (!bot?.isAI) return;
    const level = bot.difficulty ?? 'medium';
    if (room.game === 'uno') {
      const us = s as UnoState;
      const m = uno.getAIMove(us, level);
      // A move the engine refuses would leave the bot stuck: fall back to drawing or passing.
      const safe: UnoMove = uno.isValidMove(us, m, us.currentPlayerIndex) ? m : us.drawnCardId ? { type: 'pass' } : { type: 'draw' };
      await save(ctx, room, uno.applyMove(us, safe));
    } else {
      const ps = s as SalonePolyState;
      const next = poly.applyMove(ps, poly.getAIMove(ps, level));
      if (next !== ps) await save(ctx, room, next);
    }
  },
});

/** Timed Salone-Poly: when time runs out the richest player wins. */
export const timeUp = internalMutation({
  args: { roomId: v.id('play_rooms') },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    const s = room?.state as SalonePolyState | undefined;
    if (!room || room.game !== 'salone-poly' || !s || s.status !== 'playing' || !s.endsAt || Date.now() < s.endsAt) return;
    await save(ctx, room, poly.applyMove(s, { type: 'time_up' }));
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
  },
});
