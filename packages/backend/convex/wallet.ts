import { ConvexError, v, type Infer } from 'convex/values';
import { query, mutation, internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import {
  WALLET_LIMITS, formatLeones, isMomoProvider, normalizeSlPhone, providerName, CURRENCY,
} from '@slgh/shared/src/wallet';
import { currentUser, requireActiveUser, requireAdmin } from './lib';
import type { walletTxType } from './schema';

// Real-money wallet. Amounts are minor units (100 = SLE 1). Money only enters through a Monime
// payment the webhook (or a status check) confirms, and only leaves through an admin-approved payout.
// Every change goes through post(), which updates the wallet and writes the ledger row together.

type TxType = Infer<typeof walletTxType>;

export const monimeConfigured = () => !!(process.env.MONIME_ACCESS_TOKEN && process.env.MONIME_SPACE_ID);
export const walletAllowed = (u: Doc<'users'>) => u.age_band === '18_plus' && !u.banned;

/** Signed in, not suspended, and 18 or over. */
export async function requireWalletUser(ctx: QueryCtx) {
  const me = await requireActiveUser(ctx, 'Your account is suspended.');
  if (me.age_band !== '18_plus') throw new ConvexError('The wallet is only for players aged 18 and over.');
  return me;
}

const walletRow = (ctx: QueryCtx, userId: Id<'users'>) =>
  ctx.db.query('wallets').withIndex('by_user', (q) => q.eq('user_id', userId)).unique();

export async function post(
  ctx: MutationCtx, userId: Id<'users'>, type: TxType,
  change: { amount?: number; held?: number }, description: string, ref?: string,
) {
  const amount = change.amount ?? 0, heldChange = change.held ?? 0;
  if (!Number.isInteger(amount) || !Number.isInteger(heldChange)) throw new Error('wallet amounts must be whole minor units');
  let w = await walletRow(ctx, userId);
  if (!w) w = (await ctx.db.get(await ctx.db.insert('wallets', { user_id: userId, balance: 0, held: 0, updated_at: Date.now() })))!;
  const balance = w.balance + amount, held = w.held + heldChange;
  if (balance < 0) throw new ConvexError(`Not enough money in your wallet (you have ${formatLeones(w.balance)}).`);
  if (held < 0) throw new Error(`held amount of ${userId} would go below zero`);
  await ctx.db.patch(w._id, { balance, held, updated_at: Date.now() });
  await ctx.db.insert('wallet_transactions', {
    user_id: userId, type, amount, held_change: heldChange, balance_after: balance, description, ref,
  });
}

function checkAmount(amount: number, min: number, max: number, what: string) {
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    throw new ConvexError(`${what} must be between ${formatLeones(min)} and ${formatLeones(max)}.`);
  }
}

// ---------- Player ----------
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUser(ctx);
    if (!me) return null;
    const w = await walletRow(ctx, me._id);
    const [deposits, withdrawals, transactions] = await Promise.all([
      ctx.db.query('deposits').withIndex('by_user', (q) => q.eq('user_id', me._id)).order('desc').take(5),
      ctx.db.query('withdrawals').withIndex('by_user', (q) => q.eq('user_id', me._id)).order('desc').take(10),
      ctx.db.query('wallet_transactions').withIndex('by_user', (q) => q.eq('user_id', me._id)).order('desc').take(30),
    ]);
    return {
      eligible: walletAllowed(me),
      configured: monimeConfigured(),
      balance: w?.balance ?? 0,
      held: w?.held ?? 0,
      deposits: deposits.map((d) => ({
        id: d._id, amount: d.amount, status: d.status, ussd_code: d.ussd_code ?? null,
        expires_at: d.expires_at ?? null, error: d.error ?? null, created_at: d._creationTime,
      })),
      withdrawals: withdrawals.map((w) => ({
        id: w._id, amount: w.amount, phone: w.phone, provider: w.provider, status: w.status,
        error: w.error ?? null, created_at: w._creationTime,
      })),
      transactions: transactions.map((t) => ({
        id: t._id, type: t.type, amount: t.amount, held_change: t.held_change,
        balance_after: t.balance_after, description: t.description, created_at: t._creationTime,
      })),
    };
  },
});

/** Starts a top-up: a USSD payment code is created on Monime straight after (see monime.ts). */
export const createDeposit = mutation({
  args: { amount: v.number() },
  handler: async (ctx, { amount }) => {
    const me = await requireWalletUser(ctx);
    if (!monimeConfigured()) throw new ConvexError('Mobile money top-ups are not switched on yet.');
    checkAmount(amount, WALLET_LIMITS.minDeposit, WALLET_LIMITS.maxDeposit, 'A top-up');
    const recent = await ctx.db.query('deposits').withIndex('by_user', (q) => q.eq('user_id', me._id)).order('desc').take(20);
    if (recent.filter((d) => d.status === 'creating' || d.status === 'pending').length >= WALLET_LIMITS.maxPendingDeposits) {
      throw new ConvexError('You already have top-ups waiting. Pay or cancel one of them first.');
    }
    const id = await ctx.db.insert('deposits', { user_id: me._id, amount, status: 'creating', updated_at: Date.now() });
    await ctx.scheduler.runAfter(0, internal.monime.createPaymentCode, { depositId: id });
    return id;
  },
});

/** Hides a top-up the player no longer wants. If they pay it anyway, it is still credited. */
export const cancelDeposit = mutation({
  args: { id: v.id('deposits') },
  handler: async (ctx, { id }) => {
    const me = await requireActiveUser(ctx);
    const d = await ctx.db.get(id);
    if (!d || d.user_id !== me._id) throw new ConvexError('Top-up not found.');
    if (d.status !== 'creating' && d.status !== 'pending') return;
    await ctx.db.patch(id, { status: 'cancelled', updated_at: Date.now() });
    if (d.monime_id) await ctx.scheduler.runAfter(0, internal.monime.deletePaymentCode, { monimeId: d.monime_id });
  },
});

export const requestWithdrawal = mutation({
  args: { amount: v.number(), phone: v.string(), provider: v.string() },
  handler: async (ctx, a) => {
    const me = await requireWalletUser(ctx);
    checkAmount(a.amount, WALLET_LIMITS.minWithdrawal, WALLET_LIMITS.maxWithdrawal, 'A withdrawal');
    const phone = normalizeSlPhone(a.phone);
    if (!phone) throw new ConvexError('Enter a Sierra Leone mobile number, e.g. 076 123 456.');
    if (!isMomoProvider(a.provider)) throw new ConvexError('Choose Orange Money or Africell Money.');
    const id = await ctx.db.insert('withdrawals', {
      user_id: me._id, amount: a.amount, phone, provider: a.provider, status: 'requested', updated_at: Date.now(),
    });
    await post(ctx, me._id, 'withdrawal_hold', { amount: -a.amount, held: a.amount },
      `Withdrawal to ${providerName(a.provider)} ${phone} (waiting for approval)`, id);
    return id;
  },
});

export const cancelWithdrawal = mutation({
  args: { id: v.id('withdrawals') },
  handler: async (ctx, { id }) => {
    const me = await requireActiveUser(ctx);
    const w = await ctx.db.get(id);
    if (!w || w.user_id !== me._id) throw new ConvexError('Withdrawal not found.');
    if (w.status !== 'requested') throw new ConvexError('This withdrawal is already being paid out.');
    await ctx.db.patch(id, { status: 'cancelled', updated_at: Date.now() });
    await post(ctx, me._id, 'withdrawal_refund', { amount: w.amount, held: -w.amount }, 'Withdrawal cancelled', id);
  },
});

// ---------- Admin ----------
export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const wallets = await ctx.db.query('wallets').collect();
    const settled = await ctx.db.query('pots').withIndex('by_status', (q) => q.eq('status', 'settled')).collect();
    const queue = async (status: Doc<'withdrawals'>['status']) => {
      const rows = await ctx.db.query('withdrawals').withIndex('by_status', (q) => q.eq('status', status)).order('desc').take(50);
      return Promise.all(rows.map(async (w) => {
        const u = await ctx.db.get(w.user_id);
        return {
          id: w._id, amount: w.amount, phone: w.phone, provider: w.provider, status: w.status,
          error: w.error ?? null, has_payout: !!w.monime_id, created_at: w._creationTime,
          username: u?.username ?? '?', banned: u?.banned ?? false,
        };
      }));
    };
    return {
      configured: monimeConfigured(),
      balances: wallets.reduce((s, w) => s + w.balance, 0),
      held: wallets.reduce((s, w) => s + w.held, 0),
      fees: settled.reduce((s, p) => s + (p.fee ?? 0), 0),
      requested: await queue('requested'),
      processing: await queue('processing'),
    };
  },
});

export const approveWithdrawal = mutation({
  args: { id: v.id('withdrawals') },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx);
    const w = await ctx.db.get(id);
    if (!w) throw new ConvexError('Withdrawal not found.');
    const retry = w.status === 'processing' && !w.monime_id && !!w.error; // the payout call failed before Monime took it
    if (w.status !== 'requested' && !retry) throw new ConvexError('This withdrawal is not waiting for approval.');
    await ctx.db.patch(id, { status: 'processing', reviewed_by: admin._id, error: undefined, updated_at: Date.now() });
    await ctx.scheduler.runAfter(0, internal.monime.sendPayout, { withdrawalId: id });
  },
});

export const rejectWithdrawal = mutation({
  args: { id: v.id('withdrawals') },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx);
    const w = await ctx.db.get(id);
    if (!w || w.status !== 'requested') throw new ConvexError('This withdrawal is not waiting for approval.');
    await ctx.db.patch(id, { status: 'rejected', reviewed_by: admin._id, updated_at: Date.now() });
    await post(ctx, w.user_id, 'withdrawal_refund', { amount: w.amount, held: -w.amount }, 'Withdrawal declined, money returned', id);
  },
});

/** For testing without real payments: `npx convex run wallet:testCredit '{"username":"x","amount":5000}'`.
 *  Only works on deployments where WALLET_TEST_CREDITS=true. */
export const testCredit = internalMutation({
  args: { username: v.string(), amount: v.number() },
  handler: async (ctx, { username, amount }) => {
    if (process.env.WALLET_TEST_CREDITS !== 'true') throw new Error('Set WALLET_TEST_CREDITS=true on this deployment first.');
    const u = await ctx.db.query('users').withIndex('by_username_lower', (q) => q.eq('username_lower', username.toLowerCase())).unique();
    if (!u) throw new Error(`no user ${username}`);
    await post(ctx, u._id, 'adjustment', { amount }, 'Test credit');
  },
});

// ---------- Called by monime.ts ----------
export const depositForMonime = internalQuery({
  args: { depositId: v.id('deposits') },
  handler: (ctx, { depositId }) => ctx.db.get(depositId),
});

export const depositCreated = internalMutation({
  args: { depositId: v.id('deposits'), monimeId: v.string(), ussdCode: v.string(), expiresAt: v.number() },
  handler: async (ctx, a) => {
    const d = await ctx.db.get(a.depositId);
    if (!d) return;
    await ctx.db.patch(d._id, {
      monime_id: a.monimeId, ussd_code: a.ussdCode, expires_at: a.expiresAt, updated_at: Date.now(),
      ...(d.status === 'creating' ? { status: 'pending' as const } : {}),
    });
  },
});

export const depositFailed = internalMutation({
  args: { depositId: v.id('deposits'), error: v.string() },
  handler: async (ctx, { depositId, error }) => {
    const d = await ctx.db.get(depositId);
    if (d?.status === 'creating') await ctx.db.patch(depositId, { status: 'failed', error, updated_at: Date.now() });
  },
});

/** Monime says a payment code changed. Completing credits the wallet exactly once. */
export const applyDepositStatus = internalMutation({
  args: {
    monimeId: v.string(), status: v.string(),
    amount: v.optional(v.object({ currency: v.string(), value: v.number() })),
  },
  handler: async (ctx, { monimeId, status, amount }) => {
    const d = await ctx.db.query('deposits').withIndex('by_monime_id', (q) => q.eq('monime_id', monimeId)).unique();
    if (!d || d.status === 'completed') return;
    if (status === 'completed') {
      if (amount && (amount.currency !== CURRENCY || amount.value !== d.amount)) {
        // Never expected for a one-time code; leave it for a person to look at rather than guess.
        console.error(`deposit ${d._id}: Monime reported ${amount.value} ${amount.currency}, expected ${d.amount}`);
        await ctx.db.patch(d._id, { error: 'Amount mismatch, contact support.', updated_at: Date.now() });
        return;
      }
      await ctx.db.patch(d._id, { status: 'completed', completed_at: Date.now(), error: undefined, updated_at: Date.now() });
      await post(ctx, d.user_id, 'deposit', { amount: d.amount }, 'Mobile money top-up', d._id);
    } else if ((status === 'expired' || status === 'cancelled') && (d.status === 'pending' || d.status === 'creating')) {
      await ctx.db.patch(d._id, { status, updated_at: Date.now() });
    }
  },
});

export const withdrawalForMonime = internalQuery({
  args: { withdrawalId: v.id('withdrawals') },
  handler: (ctx, { withdrawalId }) => ctx.db.get(withdrawalId),
});

export const payoutStarted = internalMutation({
  args: { withdrawalId: v.id('withdrawals'), monimeId: v.string() },
  handler: async (ctx, { withdrawalId, monimeId }) => {
    await ctx.db.patch(withdrawalId, { monime_id: monimeId, error: undefined, updated_at: Date.now() });
  },
});

/** The payout call itself failed. A definite refusal returns the money; otherwise an admin can retry. */
export const payoutError = internalMutation({
  args: { withdrawalId: v.id('withdrawals'), error: v.string(), definitive: v.boolean() },
  handler: async (ctx, { withdrawalId, error, definitive }) => {
    const w = await ctx.db.get(withdrawalId);
    if (!w || w.status !== 'processing' || w.monime_id) return;
    if (!definitive) { await ctx.db.patch(w._id, { error, updated_at: Date.now() }); return; }
    await ctx.db.patch(w._id, { status: 'failed', error, updated_at: Date.now() });
    await post(ctx, w.user_id, 'withdrawal_refund', { amount: w.amount, held: -w.amount }, 'Withdrawal failed, money returned', w._id);
  },
});

/** Monime says a payout finished. */
export const applyPayoutStatus = internalMutation({
  args: { monimeId: v.string(), status: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, { monimeId, status, error }) => {
    const w = await ctx.db.query('withdrawals').withIndex('by_monime_id', (q) => q.eq('monime_id', monimeId)).unique();
    if (!w || w.status !== 'processing') return;
    if (status === 'completed') {
      await ctx.db.patch(w._id, { status: 'completed', updated_at: Date.now() });
      await post(ctx, w.user_id, 'withdrawal_paid', { held: -w.amount },
        `Paid ${formatLeones(w.amount)} to ${providerName(w.provider)} ${w.phone}`, w._id);
    } else if (status === 'failed') {
      await ctx.db.patch(w._id, { status: 'failed', error: error?.slice(0, 300) ?? 'Payout failed', updated_at: Date.now() });
      await post(ctx, w.user_id, 'withdrawal_refund', { amount: w.amount, held: -w.amount }, 'Withdrawal failed, money returned', w._id);
    }
  },
});

/** What the sync cron should re-check with Monime (in case a webhook was missed). */
export const toSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const overdue = await ctx.db.query('deposits')
      .withIndex('by_status_expires', (q) => q.eq('status', 'pending').lt('expires_at', now - 60_000)).take(25);
    const stuck = await ctx.db.query('deposits')
      .withIndex('by_status_expires', (q) => q.eq('status', 'creating')).take(25);
    const payouts = await ctx.db.query('withdrawals').withIndex('by_status', (q) => q.eq('status', 'processing')).take(25);
    return {
      deposits: overdue.flatMap((d) => (d.monime_id ? [d.monime_id] : [])),
      stuckDeposits: stuck.filter((d) => d._creationTime < now - 5 * 60_000).map((d) => d._id),
      payouts: payouts.filter((w) => w.monime_id && w.updated_at < now - 10 * 60_000).map((w) => w.monime_id!),
    };
  },
});
