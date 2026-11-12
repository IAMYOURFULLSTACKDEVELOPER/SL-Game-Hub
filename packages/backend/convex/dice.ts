import { ConvexError, v } from 'convex/values';
import { query, mutation, internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { DiceEngine, DICE_MANIFEST, rollDice, type DiceState } from '@slgh/shared/src/games/dice';
import { WALLET_LIMITS, formatLeones } from '@slgh/shared/src/wallet';
import { requireWalletUser } from './wallet';
import { heldEntries, lockPot, openPot, settlePot, stakeIn, unstake, voidPot } from './pots';

// Online Dice rooms. Free rooms are anonymous (no account needed): each browser makes up a
// random member id and sends a heartbeat; members that stop sending one are swept away.
// Money rooms have a stake: players must be signed in (18+), their member id is their user id,
// and joining commits the stake from their wallet into the room's pot (see pots.ts).
// The server owns the game state and makes every roll, so it also decides who wins the pot.

const engine = new DiceEngine();
const MAX = DICE_MANIFEST.maxPlayers;
export const HEARTBEAT_MS = 10_000;
const STALE_MS = 3 * HEARTBEAT_MS;

const label = (code: string) => `Dice room ${code}`;
const roomByCode = (ctx: MutationCtx, code: string) =>
  ctx.db.query('dice_rooms').withIndex('by_code', (q) => q.eq('code', code)).unique();
const membersOf = (ctx: MutationCtx, room: Doc<'dice_rooms'>) =>
  ctx.db.query('dice_members').withIndex('by_room', (q) => q.eq('room_id', room._id)).collect();

async function requireMember(ctx: MutationCtx, code: string, memberId: string) {
  const room = await roomByCode(ctx, code);
  const me = room && await ctx.db.query('dice_members')
    .withIndex('by_room_member', (q) => q.eq('room_id', room._id).eq('member_id', memberId)).unique();
  if (!room || !me) throw new ConvexError('You are no longer in this room.');
  if (room.stake !== undefined && me.user_id !== (await requireWalletUser(ctx))._id) {
    throw new ConvexError('You are no longer in this room.');
  }
  return { room, me };
}

/** If it is the turn of someone who has left, pass the turn to the next player still here. */
async function skipAbsentPlayer(ctx: MutationCtx, room: Doc<'dice_rooms'>) {
  const s = room.state as DiceState | undefined;
  if (!s || s.status !== 'playing') return;
  const online = new Set((await membersOf(ctx, room)).map((m) => m.member_id));
  if (online.size === 0 || online.has(s.players[s.currentPlayerIndex].id)) return;
  for (let k = 1; k < s.players.length; k++) {
    const i = (s.currentPlayerIndex + k) % s.players.length;
    if (online.has(s.players[i].id)) {
      await ctx.db.patch(room._id, { state: { ...s, currentPlayerIndex: i, updatedAt: Date.now() } });
      return;
    }
  }
}

// Leaving before a round starts returns your stake; leaving during a round forfeits it.
// If everyone leaves, nobody can win, so every stake still held is returned.
async function removeMember(ctx: MutationCtx, room: Doc<'dice_rooms'>, member: Doc<'dice_members'>) {
  await ctx.db.delete(member._id);
  if (room.pot_id && member.user_id) await unstake(ctx, room.pot_id, member.user_id, label(room.code));
  const rest = await membersOf(ctx, room);
  if (rest.length === 0) {
    if (room.pot_id) await voidPot(ctx, room.pot_id, label(room.code));
    await ctx.db.delete(room._id);
    return;
  }
  if (member.host) await ctx.db.patch(rest[0]._id, { host: true }); // the longest-waiting player takes over
  await skipAbsentPlayer(ctx, room);
}

export const room = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const room = await ctx.db.query('dice_rooms').withIndex('by_code', (q) => q.eq('code', code)).unique();
    if (!room) return null;
    const members = await ctx.db.query('dice_members').withIndex('by_room', (q) => q.eq('room_id', room._id)).collect();
    const pot = room.pot_id ? await ctx.db.get(room.pot_id) : null;
    const staked = pot
      ? new Set((await ctx.db.query('pot_entries').withIndex('by_pot', (q) => q.eq('pot_id', pot._id)).collect())
        .filter((e) => e.status === 'held').map((e) => e.user_id as string))
      : new Set<string>();
    return {
      state: (room.state ?? null) as DiceState | null,
      stake: room.stake ?? null,
      pot: pot && { total: pot.total, status: pot.status, feeBps: pot.fee_bps },
      lastPrize: room.last_prize ?? null,
      members: members.map((m) => ({
        id: m.member_id, name: m.name, host: m.host, joinedAt: m.joined_at, staked: !!m.user_id && staked.has(m.user_id),
      })),
    };
  },
});

/** The host creates the room (with a stake for a money room); guests join an existing one. */
export const join = mutation({
  args: { code: v.string(), memberId: v.string(), name: v.string(), host: v.boolean(), stake: v.optional(v.number()) },
  handler: async (ctx, { code, memberId, name, host, stake }) => {
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new ConvexError('Room codes are 6 letters and numbers.');
    const display = name.trim().slice(0, 20) || 'Player';
    let room = await roomByCode(ctx, code);
    if (host) {
      if (room) throw new ConvexError('That room code is already in use. Try creating the room again.');
      if (stake !== undefined && (!Number.isInteger(stake) || stake < WALLET_LIMITS.minStake || stake > WALLET_LIMITS.maxStake)) {
        throw new ConvexError(`The stake must be between ${formatLeones(WALLET_LIMITS.minStake)} and ${formatLeones(WALLET_LIMITS.maxStake)}.`);
      }
      if (stake !== undefined) await requireWalletUser(ctx); // check before creating anything
      room = (await ctx.db.get(await ctx.db.insert('dice_rooms', { code, stake })))!;
    } else if (!room) {
      throw new ConvexError(`Room ${code} was not found. Check the code and try again.`);
    }

    let userId: Doc<'users'>['_id'] | undefined;
    if (room.stake !== undefined) {
      const user = await requireWalletUser(ctx);
      if (memberId !== user._id) throw new ConvexError('Sign in again to join money rooms.');
      userId = user._id;
      if (!room.pot_id) {
        const potId = await openPot(ctx, 'dice', code, room.stake);
        await ctx.db.patch(room._id, { pot_id: potId });
        room = { ...room, pot_id: potId };
      }
    }

    const roomId = room._id;
    const members = await membersOf(ctx, room);
    const existing = members.find((m) => m.member_id === memberId);
    if (existing) {
      await ctx.db.patch(existing._id, { name: display, last_seen: Date.now() });
      return;
    }
    const inGame = (room.state as DiceState | undefined)?.players.some((p) => p.id === memberId);
    if (members.length >= MAX && !inGame) throw new ConvexError(`Room ${code} is full (${MAX} players max).`);
    if (userId && !inGame) {
      const pot = await ctx.db.get(room.pot_id!);
      if (pot?.status !== 'open') throw new ConvexError('A round is being played in this room. Join again when it ends.');
      await stakeIn(ctx, pot._id, userId, label(code));
    }
    const now = Date.now();
    await ctx.db.insert('dice_members', {
      room_id: roomId, member_id: memberId, user_id: userId, name: display, host, joined_at: now, last_seen: now,
    });
  },
});

/** Money rooms: put your stake in for the next round ("continue playing"). */
export const stake = mutation({
  args: { code: v.string(), memberId: v.string() },
  handler: async (ctx, { code, memberId }) => {
    const { room, me } = await requireMember(ctx, code, memberId);
    if (!room.pot_id || !me.user_id) throw new ConvexError('This room is not a money room.');
    await stakeIn(ctx, room.pot_id, me.user_id, label(code));
  },
});

/** Money rooms: take your stake back before the round starts. */
export const unstakeMe = mutation({
  args: { code: v.string(), memberId: v.string() },
  handler: async (ctx, { code, memberId }) => {
    const { room, me } = await requireMember(ctx, code, memberId);
    if (room.pot_id && me.user_id) await unstake(ctx, room.pot_id, me.user_id, label(code));
  },
});

export const heartbeat = mutation({
  args: { code: v.string(), memberId: v.string() },
  handler: async (ctx, { code, memberId }) => {
    const { me } = await requireMember(ctx, code, memberId);
    await ctx.db.patch(me._id, { last_seen: Date.now() });
  },
});

export const leave = mutation({
  args: { code: v.string(), memberId: v.string() },
  handler: async (ctx, { code, memberId }) => {
    const room = await roomByCode(ctx, code);
    const me = room && await ctx.db.query('dice_members')
      .withIndex('by_room_member', (q) => q.eq('room_id', room._id).eq('member_id', memberId)).unique();
    if (!room || !me) return;
    if (room.stake !== undefined) await requireMember(ctx, code, memberId); // only you can take yourself out
    await removeMember(ctx, room, me);
  },
});

/** Host only. Free rooms: (re)starts with the first players in the room. Money rooms: starts a round with everyone who staked. */
export const start = mutation({
  args: { code: v.string(), memberId: v.string(), target: v.number() },
  handler: async (ctx, { code, memberId, target }) => {
    const { room, me } = await requireMember(ctx, code, memberId);
    if (!me.host) throw new ConvexError('Only the host can start the game.');
    const members = await membersOf(ctx, room);
    let players = members.slice(0, MAX);

    if (room.pot_id) {
      if ((room.state as DiceState | undefined)?.status === 'playing') throw new ConvexError('Finish this round first.');
      const pot = await ctx.db.get(room.pot_id);
      if (pot?.status !== 'open') throw new ConvexError('This round has already started.');
      const staked = new Set((await heldEntries(ctx, pot._id)).map((e) => e.user_id));
      players = members.filter((m) => m.user_id && staked.has(m.user_id)).slice(0, MAX);
      if (players.length < 2) throw new ConvexError('At least 2 players must stake before the game can start.');
      await lockPot(ctx, pot._id);
    } else if (players.length < 2) {
      throw new ConvexError('Need at least 2 players to start.');
    }
    await ctx.db.patch(room._id, {
      state: engine.initialize(players.map((m) => ({ id: m.member_id, name: m.name, isAI: false })), { target }),
    });
  },
});

export const roll = mutation({
  args: { code: v.string(), memberId: v.string() },
  handler: async (ctx, { code, memberId }) => {
    const { room } = await requireMember(ctx, code, memberId);
    const s = room.state as DiceState | undefined;
    if (!s || s.status !== 'playing' || s.players[s.currentPlayerIndex].id !== memberId) return; // not your turn
    const next = engine.applyMove(s, rollDice());
    await ctx.db.patch(room._id, { state: next });

    if (room.pot_id && room.stake !== undefined && next.status === 'finished') {
      const winner = next.winner === null ? null : ctx.db.normalizeId('users', next.players[next.winner].id);
      const prize = await settlePot(ctx, room.pot_id, winner, label(code));
      // A fresh pot for the next round: players stake again to keep playing, or leave with their winnings.
      await ctx.db.patch(room._id, { pot_id: await openPot(ctx, 'dice', code, room.stake), last_prize: prize ?? undefined });
    }
  },
});

/** Cron: removes members whose heartbeat stopped (closed tab, lost connection). */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STALE_MS;
    const stale = await ctx.db.query('dice_members').filter((q) => q.lt(q.field('last_seen'), cutoff)).take(500);
    for (const m of stale) {
      const room = await ctx.db.get(m.room_id);
      if (room) await removeMember(ctx, room, m);
      else await ctx.db.delete(m._id);
    }
  },
});
