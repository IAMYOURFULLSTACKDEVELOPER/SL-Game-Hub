import { ConvexError } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { PRO_PRICE, FREE_DAILY_ROOMS, isProActive, extendPro, dayKey } from '@slgh/shared/src/pro';
import { formatLeones } from '@slgh/shared/src/wallet';
import { currentUser, requireActiveUser } from './lib';
import { chargeFor, monimeConfigured, post, requireWalletUser } from './wallet';

// Dodo Pro: SLE 10 for 30 days, paid from the wallet (players aged 18+) or by a Monime USSD
// code (anyone, e.g. a parent pays). Paying again adds 30 more days; nothing renews by itself.
// Pro gives unlimited online rooms (free players create 10 a day; joining and playing are unlimited for everyone),
// creating groups, and talking in voice chat.

export const isPro = (u: Pick<Doc<'users'>, 'pro_until'> | null | undefined) => isProActive(u?.pro_until);

/** Adds 30 days of Pro and records the payment. */
export async function grantPro(ctx: MutationCtx, userId: Id<'users'>, method: 'wallet' | 'ussd', amount: number, depositId?: Id<'deposits'>) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  const proUntil = extendPro(user.pro_until);
  await ctx.db.patch(userId, { pro_until: proUntil, updated_at: Date.now() });
  await ctx.db.insert('pro_payments', { user_id: userId, method, amount, pro_until: proUntil, deposit_id: depositId });
}

const playsRow = (ctx: QueryCtx, userId: Id<'users'>, day = dayKey()) =>
  ctx.db.query('daily_plays').withIndex('by_user_day', (q) => q.eq('user_id', userId).eq('day', day)).unique();

/** Online rooms a player can still create today (null = unlimited, i.e. Pro). */
export async function roomsLeft(ctx: QueryCtx, user: Doc<'users'>) {
  if (isPro(user)) return null;
  return Math.max(0, FREE_DAILY_ROOMS - ((await playsRow(ctx, user._id))?.rooms ?? 0));
}

/** Uses one of today's free rooms, or explains the limit. Pro players aren't counted. */
export async function spendRoomAllowance(ctx: MutationCtx, user: Doc<'users'>) {
  if (isPro(user)) return;
  const day = dayKey();
  const row = await playsRow(ctx, user._id, day);
  const used = row?.rooms ?? 0;
  if (used >= FREE_DAILY_ROOMS) {
    throw new ConvexError(`You've made today's ${FREE_DAILY_ROOMS} free rooms. Rejoin one of your recent rooms, or go Pro to make as many as you like.`);
  }
  if (row) await ctx.db.patch(row._id, { rooms: used + 1 });
  else await ctx.db.insert('daily_plays', { user_id: user._id, day, count: 0, rooms: 1 });
}

/** Counts one online game for each free player, for the admin stats (Pro players aren't counted). */
export async function countGame(ctx: MutationCtx, userIds: Id<'users'>[]) {
  const day = dayKey();
  for (const id of new Set(userIds)) {
    const user = await ctx.db.get(id);
    if (!user || isPro(user)) continue;
    const row = await playsRow(ctx, id, day);
    if (row) await ctx.db.patch(row._id, { count: row.count + 1 });
    else await ctx.db.insert('daily_plays', { user_id: id, day, count: 1 });
  }
}

/** Everything the Pro page and the "rooms left" notices need. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUser(ctx);
    if (!me) return null;
    const pending = (await ctx.db.query('deposits').withIndex('by_user', (q) => q.eq('user_id', me._id)).order('desc').take(10))
      .find((d) => d.purpose === 'pro' && (d.status === 'creating' || d.status === 'pending'));
    const wallet = await ctx.db.query('wallets').withIndex('by_user', (q) => q.eq('user_id', me._id)).unique();
    return {
      pro: isPro(me),
      proUntil: me.pro_until ?? null,
      roomsLeft: await roomsLeft(ctx, me),
      freeDailyRooms: FREE_DAILY_ROOMS,
      price: PRO_PRICE,
      canUseWallet: me.age_band === '18_plus' && !me.banned,
      walletBalance: wallet?.balance ?? 0,
      ussdAvailable: monimeConfigured(),
      ussdCharge: chargeFor(PRO_PRICE), // the USSD price includes Monime's fee
      pendingUssd: pending ? {
        id: pending._id, status: pending.status, ussd_code: pending.ussd_code ?? null, expires_at: pending.expires_at ?? null,
        charge: pending.charge ?? pending.amount,
      } : null,
    };
  },
});

/** Pay for 30 days of Pro from the wallet. */
export const buyWithWallet = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireWalletUser(ctx);
    await post(ctx, me._id, 'pro', { amount: -PRO_PRICE }, `Dodo Pro: 30 days (${formatLeones(PRO_PRICE)})`);
    await grantPro(ctx, me._id, 'wallet', PRO_PRICE);
  },
});

/** Pay for 30 days of Pro with a Monime USSD code (works without a wallet, e.g. under-18s). */
export const buyWithUssd = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireActiveUser(ctx);
    if (!monimeConfigured()) throw new ConvexError('Paying by mobile money is not switched on yet.');
    const recent = await ctx.db.query('deposits').withIndex('by_user', (q) => q.eq('user_id', me._id)).order('desc').take(10);
    const open = recent.find((d) => d.purpose === 'pro' && (d.status === 'creating' || d.status === 'pending'));
    if (open) return open._id; // reuse the code they already have
    const id = await ctx.db.insert('deposits', {
      user_id: me._id, amount: PRO_PRICE, charge: chargeFor(PRO_PRICE), status: 'creating', purpose: 'pro', updated_at: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.monime.createPaymentCode, { depositId: id });
    return id;
  },
});
