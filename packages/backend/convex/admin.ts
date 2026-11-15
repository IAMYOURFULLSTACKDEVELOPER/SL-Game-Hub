import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { formatLeones } from '@slgh/shared/src/wallet';
import { dayKey, isProActive } from '@slgh/shared/src/pro';
import { requireAdmin } from './lib';
import { post } from './wallet';
import { voidPot } from './pots';

// The admin control panel: a dashboard of what needs attention and what happened today, player search and
// management (wallet adjustments, Pro days, roles, suspensions), live rooms, and an audit log of every admin action.
// Every function checks the caller is an admin; every change is written to admin_actions.

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfToday = () => Date.parse(`${dayKey()}T00:00:00Z`);

async function audit(ctx: MutationCtx, adminId: Id<'users'>, action: string, details: string, target?: Id<'users'>, amount?: number) {
  await ctx.db.insert('admin_actions', { admin_id: adminId, action, details, target_user_id: target, amount });
}

const cleanReason = (reason: string) => {
  const r = reason.trim();
  if (r.length < 3 || r.length > 200) throw new ConvexError('Give a reason (3 to 200 characters). It is kept in the audit log.');
  return r;
};

/** The overview page: what needs attention, today's numbers, totals and a feed of recent activity. */
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const today = startOfToday();
    const [users, wallets, requested, openReports, flagged, rooms, plays] = await Promise.all([
      ctx.db.query('users').collect(),
      ctx.db.query('wallets').collect(),
      ctx.db.query('withdrawals').withIndex('by_status', (q) => q.eq('status', 'requested')).collect(),
      ctx.db.query('reports').withIndex('by_status', (q) => q.eq('status', 'open')).collect(),
      ctx.db.query('chat_messages').withIndex('by_flagged', (q) => q.eq('is_flagged', true).eq('is_deleted', false)).take(100),
      ctx.db.query('play_rooms').take(500),
      ctx.db.query('daily_plays').collect(),
    ]);
    const deposits = await ctx.db.query('deposits').order('desc').take(200);
    const withdrawals = await ctx.db.query('withdrawals').order('desc').take(200);
    const proPayments = await ctx.db.query('pro_payments').order('desc').take(200);
    const pots = await ctx.db.query('pots').withIndex('by_status', (q) => q.eq('status', 'settled')).order('desc').take(100);
    const names = new Map(users.map((u) => [u._id as string, u.username]));
    const nameOf = (id?: Id<'users'>) => (id && names.get(id)) || '?';
    const paidToday = deposits.filter((d) => d.status === 'completed' && (d.completed_at ?? 0) >= today);
    const payoutsToday = withdrawals.filter((w) => w.status === 'completed' && w.updated_at >= today);

    // Recent activity, newest first
    const feed = [
      ...users.slice(-20).map((u) => ({ at: u._creationTime, kind: 'signup', text: `${u.username} joined` })),
      ...deposits.filter((d) => d.status === 'completed').slice(0, 20).map((d) => ({
        at: d.completed_at ?? d._creationTime, kind: 'money-in',
        text: `${nameOf(d.user_id)} paid ${formatLeones(d.amount)} ${d.purpose === 'pro' ? 'for Pro' : 'into their wallet'}`,
      })),
      ...proPayments.filter((p) => p.method === 'wallet').slice(0, 20).map((p) => ({
        at: p._creationTime, kind: 'pro', text: `${nameOf(p.user_id)} bought Pro from their wallet`,
      })),
      ...withdrawals.slice(0, 20).map((w) => ({
        at: w.status === 'requested' ? w._creationTime : w.updated_at, kind: 'money-out',
        text: `${nameOf(w.user_id)} ${w.status === 'requested' ? 'asked to withdraw' : w.status === 'completed' ? 'was paid' : `withdrawal ${w.status}:`} ${formatLeones(w.amount)}`,
      })),
      ...pots.slice(0, 20).map((p) => ({
        at: p.settled_at ?? p._creationTime, kind: 'game', text: `${nameOf(p.winner_id)} won ${formatLeones(p.total - (p.fee ?? 0))} in a ${p.game} money game`,
      })),
    ].sort((a, b) => b.at - a.at).slice(0, 25);

    return {
      attention: {
        withdrawals: requested.length,
        withdrawalTotal: requested.reduce((s, w) => s + w.amount, 0),
        reports: openReports.length,
        flaggedMessages: flagged.length,
      },
      today: {
        newPlayers: users.filter((u) => u._creationTime >= today).length,
        moneyIn: paidToday.reduce((s, d) => s + d.amount, 0),
        payments: paidToday.length,
        paidOut: payoutsToday.reduce((s, w) => s + w.amount, 0),
        proSold: proPayments.filter((p) => p._creationTime >= today).length,
        onlineGames: plays.filter((p) => p.day === dayKey()).reduce((s, p) => s + p.count, 0),
      },
      totals: {
        players: users.length,
        activePro: users.filter((u) => isProActive(u.pro_until)).length,
        suspended: users.filter((u) => u.banned).length,
        balances: wallets.reduce((s, w) => s + w.balance, 0),
        held: wallets.reduce((s, w) => s + w.held, 0),
        liveRooms: rooms.filter((r) => (r.state as { status?: string } | undefined)?.status === 'playing').length,
        openRooms: rooms.length,
      },
      feed,
      recentActions: await Promise.all((await ctx.db.query('admin_actions').order('desc').take(15)).map(async (a) => ({
        id: a._id, at: a._creationTime, admin: nameOf(a.admin_id), action: a.action, details: a.details,
        target: a.target_user_id ? nameOf(a.target_user_id) : null,
      }))),
    };
  },
});

/** Find players by the start of their username, or by exact email. Newest players when the search is empty. */
export const searchPlayers = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    await requireAdmin(ctx);
    const term = q.trim().toLowerCase();
    let users: Doc<'users'>[];
    if (!term) users = await ctx.db.query('users').order('desc').take(50);
    else if (term.includes('@')) users = await ctx.db.query('users').withIndex('email', (x) => x.eq('email', term)).take(5);
    else users = await ctx.db.query('users').withIndex('by_username_lower', (x) => x.gte('username_lower', term).lt('username_lower', `${term}￿`)).take(50);
    return Promise.all(users.map(async (u) => {
      const w = await ctx.db.query('wallets').withIndex('by_user', (x) => x.eq('user_id', u._id)).unique();
      return {
        id: u._id, username: u.username, email: u.email ?? null, role: u.role, banned: u.banned, age_band: u.age_band,
        pro: isProActive(u.pro_until), balance: w?.balance ?? 0, held: w?.held ?? 0, created_at: u._creationTime,
      };
    }));
  },
});

/** One player's full picture for the admin player page. */
export const player = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const uid = ctx.db.normalizeId('users', id);
    const u = uid && await ctx.db.get(uid);
    if (!u) return null;
    const [w, tx, deposits, withdrawals, plays, actions, groupsOwned] = await Promise.all([
      ctx.db.query('wallets').withIndex('by_user', (x) => x.eq('user_id', u._id)).unique(),
      ctx.db.query('wallet_transactions').withIndex('by_user', (x) => x.eq('user_id', u._id)).order('desc').take(25),
      ctx.db.query('deposits').withIndex('by_user', (x) => x.eq('user_id', u._id)).order('desc').take(10),
      ctx.db.query('withdrawals').withIndex('by_user', (x) => x.eq('user_id', u._id)).order('desc').take(10),
      ctx.db.query('daily_plays').withIndex('by_user_day', (x) => x.eq('user_id', u._id).eq('day', dayKey())).unique(),
      ctx.db.query('admin_actions').withIndex('by_target', (x) => x.eq('target_user_id', u._id)).order('desc').take(20),
      ctx.db.query('groups').withIndex('by_owner', (x) => x.eq('owner_id', u._id)).take(20),
    ]);
    const nameOf = async (aid: Id<'users'>) => (await ctx.db.get(aid))?.username ?? '?';
    return {
      id: u._id, username: u.username, full_name: u.full_name, email: u.email ?? null, role: u.role, banned: u.banned,
      age_band: u.age_band, created_at: u._creationTime, pro_until: u.pro_until ?? null, pro: isProActive(u.pro_until),
      balance: w?.balance ?? 0, held: w?.held ?? 0, gamesToday: plays?.count ?? 0, groupsOwned: groupsOwned.length,
      transactions: tx.map((t) => ({ id: t._id, at: t._creationTime, type: t.type, amount: t.amount, held_change: t.held_change, description: t.description, balance_after: t.balance_after })),
      deposits: deposits.map((d) => ({ id: d._id, at: d._creationTime, amount: d.amount, status: d.status, purpose: d.purpose ?? null })),
      withdrawals: withdrawals.map((x) => ({ id: x._id, at: x._creationTime, amount: x.amount, status: x.status, phone: x.phone, provider: x.provider })),
      actions: await Promise.all(actions.map(async (a) => ({ id: a._id, at: a._creationTime, admin: await nameOf(a.admin_id), action: a.action, details: a.details }))),
    };
  },
});

/** Credit (positive) or debit (negative) a player's wallet, with a reason for the audit log. */
export const adjustWallet = mutation({
  args: { userId: v.id('users'), amount: v.number(), reason: v.string() },
  handler: async (ctx, { userId, amount, reason }) => {
    const admin = await requireAdmin(ctx);
    const why = cleanReason(reason);
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10_000_000) throw new ConvexError('Enter an amount in leones (up to SLE 100,000).');
    if (!await ctx.db.get(userId)) throw new ConvexError('errors.notFound');
    await post(ctx, userId, 'adjustment', { amount }, `${amount > 0 ? 'Credit' : 'Debit'} from SL Game Hub: ${why}`);
    await audit(ctx, admin._id, amount > 0 ? 'wallet credit' : 'wallet debit', `${formatLeones(Math.abs(amount))}: ${why}`, userId, amount);
  },
});

/** Give Pro days for free (e.g. a prize or a refund), or end Pro now (days = 0). */
export const setPro = mutation({
  args: { userId: v.id('users'), days: v.number(), reason: v.string() },
  handler: async (ctx, { userId, days, reason }) => {
    const admin = await requireAdmin(ctx);
    const why = cleanReason(reason);
    const u = await ctx.db.get(userId);
    if (!u) throw new ConvexError('errors.notFound');
    if (!Number.isInteger(days) || days < 0 || days > 365) throw new ConvexError('Days must be 0 (end Pro now) to 365.');
    const now = Date.now();
    const until = days === 0 ? now : Math.max(now, u.pro_until ?? 0) + days * DAY_MS;
    await ctx.db.patch(userId, { pro_until: until, updated_at: now });
    await audit(ctx, admin._id, days === 0 ? 'end pro' : 'give pro', days === 0 ? `Pro ended: ${why}` : `${days} days of Pro: ${why}`, userId);
  },
});

/** Make someone an admin or a player again. You can't change your own role. */
export const setRole = mutation({
  args: { userId: v.id('users'), role: v.union(v.literal('player'), v.literal('admin')), reason: v.string() },
  handler: async (ctx, { userId, role, reason }) => {
    const admin = await requireAdmin(ctx);
    const why = cleanReason(reason);
    if (userId === admin._id) throw new ConvexError("You can't change your own role.");
    const u = await ctx.db.get(userId);
    if (!u) throw new ConvexError('errors.notFound');
    await ctx.db.patch(userId, { role, updated_at: Date.now() });
    await audit(ctx, admin._id, 'set role', `Now ${role}: ${why}`, userId);
  },
});

/** Suspend or restore an account, with a reason. You can't suspend yourself. */
export const setSuspended = mutation({
  args: { userId: v.id('users'), banned: v.boolean(), reason: v.string() },
  handler: async (ctx, { userId, banned, reason }) => {
    const admin = await requireAdmin(ctx);
    const why = cleanReason(reason);
    if (userId === admin._id) throw new ConvexError("You can't suspend your own account.");
    if (!await ctx.db.get(userId)) throw new ConvexError('errors.notFound');
    await ctx.db.patch(userId, { banned, updated_at: Date.now() });
    await audit(ctx, admin._id, banned ? 'suspend' : 'restore', why, userId);
  },
});

/** Every online room right now: game, players, whether a game is running, and any money at stake. */
export const rooms = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rooms = await ctx.db.query('play_rooms').order('desc').take(200);
    return Promise.all(rooms.map(async (r) => {
      const members = await ctx.db.query('play_members').withIndex('by_room_id_and_joined_at', (q) => q.eq('room_id', r._id)).take(16);
      const pot = r.pot_id ? await ctx.db.get(r.pot_id) : null;
      return {
        id: r._id, code: r.code, game: r.game, created_at: r.created_at, isPublic: !!r.is_public,
        playing: (r.state as { status?: string } | undefined)?.status === 'playing',
        players: members.map((m) => m.name), stake: r.stake ?? null, pot: pot ? { total: pot.total, status: pot.status } : null,
      };
    }));
  },
});

/** Close a room (e.g. abuse): stakes still held go back to the players, and everyone is removed. */
export const closeRoom = mutation({
  args: { roomId: v.id('play_rooms'), reason: v.string() },
  handler: async (ctx, { roomId, reason }) => {
    const admin = await requireAdmin(ctx);
    const why = cleanReason(reason);
    const room = await ctx.db.get(roomId);
    if (!room) return;
    if (room.pot_id) await voidPot(ctx, room.pot_id, `room ${room.code} (closed by SL Game Hub)`);
    for (const m of await ctx.db.query('play_members').withIndex('by_room_id_and_joined_at', (q) => q.eq('room_id', roomId)).take(50)) await ctx.db.delete(m._id);
    for (const r of await ctx.db.query('play_requests').withIndex('by_room_id_and_status', (q) => q.eq('room_id', roomId)).take(100)) await ctx.db.delete(r._id);
    for (const x of await ctx.db.query('voice_signals').withIndex('by_room_id_and_to', (q) => q.eq('room_id', roomId)).take(500)) await ctx.db.delete(x._id);
    await ctx.db.delete(roomId);
    await audit(ctx, admin._id, 'close room', `${room.game} room ${room.code}${room.stake ? ' (money room, stakes returned)' : ''}: ${why}`);
  },
});

/** The audit log, newest first. */
export const actions = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query('admin_actions').order('desc').take(200);
    return Promise.all(rows.map(async (a) => ({
      id: a._id, at: a._creationTime, action: a.action, details: a.details, amount: a.amount ?? null,
      admin: (await ctx.db.get(a.admin_id))?.username ?? '?',
      target: a.target_user_id ? { id: a.target_user_id, username: (await ctx.db.get(a.target_user_id))?.username ?? '?' } : null,
    })));
  },
});
