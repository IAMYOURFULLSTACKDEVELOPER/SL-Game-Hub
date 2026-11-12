import { ConvexError, v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { action, httpAction, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { CURRENCY } from '@slgh/shared/src/wallet';
import { verifyMonimeSignature } from '@slgh/shared/src/monime-signature';

// Talks to Monime (https://docs.monime.io): USSD payment codes for top-ups and mobile money payouts
// for withdrawals. Deployment environment variables:
//   MONIME_ACCESS_TOKEN          API token (mon_test_... for the sandbox, mon_... for live)
//   MONIME_SPACE_ID              spc-...
//   MONIME_WEBHOOK_SECRET        HMAC secret of the webhook pointing at <site url>/monime/webhook
//   MONIME_FINANCIAL_ACCOUNT_ID  optional fac-...; Monime's main account is used otherwise

const BASE = 'https://api.monime.io';
const API_VERSION = 'caph.2025-08-23';
const CODE_DURATION = '30m';

type Money = { currency: string; value: number };
type PaymentCode = { id: string; status: string; ussdCode: string; expireTime?: string; amount?: Money };
type Payout = { id: string; status: string; failureDetail?: { code?: string; message?: string } | null };

class MonimeError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
  /** Monime refused the request itself (so retrying the same request won't help). Network errors, 5xx and 429 may still go through. */
  get definitive() { return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429; }
}

async function monime<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const token = process.env.MONIME_ACCESS_TOKEN, space = process.env.MONIME_SPACE_ID;
  if (!token || !space) throw new MonimeError(0, 'Monime is not configured (MONIME_ACCESS_TOKEN / MONIME_SPACE_ID).');
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Monime-Space-Id': space, 'Monime-Version': API_VERSION };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new MonimeError(0, `Monime ${method} ${path}: ${(e as Error).message}`);
  }
  const json = (await res.json().catch(() => null)) as { success?: boolean; result?: T; messages?: unknown } | null;
  if (!res.ok || !json?.success) {
    throw new MonimeError(res.status, `Monime ${method} ${path} failed (${res.status}): ${JSON.stringify(json?.messages ?? json).slice(0, 300)}`);
  }
  return json.result as T;
}

const source = () => process.env.MONIME_FINANCIAL_ACCOUNT_ID;
const money = (m?: Money) => (m ? { currency: m.currency, value: m.value } : undefined);

// ---------- Top-ups ----------
export const createPaymentCode = internalAction({
  args: { depositId: v.id('deposits') },
  handler: async (ctx, { depositId }) => {
    const d = await ctx.runQuery(internal.wallet.depositForMonime, { depositId });
    if (!d || d.status !== 'creating') return;
    try {
      const code = await monime<PaymentCode>('POST', '/v1/payment-codes', {
        name: 'SL Game Hub wallet top-up',
        mode: 'one_time',
        amount: { currency: CURRENCY, value: d.amount },
        duration: CODE_DURATION,
        reference: depositId,
        metadata: { deposit_id: depositId, user_id: d.user_id },
        ...(source() ? { financialAccountId: source() } : {}),
      }, `deposit-${depositId}`);
      await ctx.runMutation(internal.wallet.depositCreated, {
        depositId, monimeId: code.id, ussdCode: code.ussdCode,
        expiresAt: code.expireTime ? Date.parse(code.expireTime) : Date.now() + 30 * 60_000,
      });
    } catch (e) {
      console.error(`deposit ${depositId}:`, (e as Error).message);
      await ctx.runMutation(internal.wallet.depositFailed, { depositId, error: 'Could not create a USSD code. Please try again.' });
    }
  },
});

export const deletePaymentCode = internalAction({
  args: { monimeId: v.string() },
  handler: async (_ctx, { monimeId }) => {
    // Only possible while nobody has paid it; a code that was paid anyway is credited as usual.
    await monime('DELETE', `/v1/payment-codes/${encodeURIComponent(monimeId)}`).catch((e) => console.warn((e as Error).message));
  },
});

/** "I've paid": asks Monime for the code's status instead of waiting for the webhook. */
export const refreshDeposit = action({
  args: { id: v.id('deposits') },
  handler: async (ctx, { id }): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    const d: Doc<'deposits'> | null = await ctx.runQuery(internal.wallet.depositForMonime, { depositId: id });
    if (!userId || !d || d.user_id !== userId) throw new ConvexError('Top-up not found.');
    if (!d.monime_id || d.status === 'completed') return d.status;
    const code = await monime<PaymentCode>('GET', `/v1/payment-codes/${encodeURIComponent(d.monime_id)}`)
      .catch(() => { throw new ConvexError('Could not reach mobile money right now. Try again in a minute.'); });
    await ctx.runMutation(internal.wallet.applyDepositStatus, { monimeId: d.monime_id, status: code.status, amount: money(code.amount) });
    return code.status;
  },
});

// ---------- Withdrawals ----------
export const sendPayout = internalAction({
  args: { withdrawalId: v.id('withdrawals') },
  handler: async (ctx, { withdrawalId }) => {
    const w = await ctx.runQuery(internal.wallet.withdrawalForMonime, { withdrawalId });
    if (!w || w.status !== 'processing' || w.monime_id) return;
    try {
      const p = await monime<Payout>('POST', '/v1/payouts', {
        amount: { currency: CURRENCY, value: w.amount },
        destination: { type: 'momo', providerId: w.provider, phoneNumber: w.phone },
        metadata: { withdrawal_id: withdrawalId },
        ...(source() ? { source: { financialAccountId: source() } } : {}),
      }, `withdrawal-${withdrawalId}`); // same key on a retry, so Monime never pays twice
      await ctx.runMutation(internal.wallet.payoutStarted, { withdrawalId, monimeId: p.id });
      if (p.status === 'completed' || p.status === 'failed') {
        await ctx.runMutation(internal.wallet.applyPayoutStatus, { monimeId: p.id, status: p.status, error: p.failureDetail?.message });
      }
    } catch (e) {
      const err = e instanceof MonimeError ? e : new MonimeError(0, String(e));
      console.error(`withdrawal ${withdrawalId}:`, err.message);
      await ctx.runMutation(internal.wallet.payoutError, { withdrawalId, error: err.message.slice(0, 300), definitive: err.definitive });
    }
  },
});

// ---------- Webhook and safety net ----------
type WebhookEvent = {
  event?: { id?: string; name?: string };
  object?: { id?: string; type?: string };
  data?: { id?: string; status?: string; amount?: Money; failureDetail?: { message?: string } | null };
};

/** POST <CONVEX_SITE_URL>/monime/webhook. Signed with MONIME_WEBHOOK_SECRET; anything unsigned is refused. */
export const webhook = httpAction(async (ctx, req) => {
  const raw = await req.text();
  if (!(await verifyMonimeSignature(process.env.MONIME_WEBHOOK_SECRET ?? '', req.headers.get('monime-signature'), raw))) {
    return new Response('invalid signature', { status: 401 });
  }
  let body: WebhookEvent;
  try { body = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const name = body.event?.name ?? '';
  const id = body.object?.id ?? body.data?.id;
  if (id && /^payment_code\.(completed|expired|cancelled)$/.test(name)) {
    await ctx.runMutation(internal.wallet.applyDepositStatus, { monimeId: id, status: name.split('.')[1], amount: money(body.data?.amount) });
  } else if (id && /^payout\.(completed|failed)$/.test(name)) {
    await ctx.runMutation(internal.wallet.applyPayoutStatus, {
      monimeId: id, status: name.split('.')[1], error: body.data?.failureDetail?.message ?? undefined,
    });
  }
  return new Response(null, { status: 200 }); // other events are acknowledged and ignored
});

/** Cron: re-checks top-ups and payouts whose webhook never arrived. */
export const syncPending = internalAction({
  args: {},
  handler: async (ctx) => {
    const { deposits, stuckDeposits, payouts } = await ctx.runQuery(internal.wallet.toSync, {});
    for (const depositId of stuckDeposits) {
      await ctx.runMutation(internal.wallet.depositFailed, { depositId, error: 'Could not create a USSD code. Please try again.' });
    }
    for (const monimeId of deposits) {
      const code = await monime<PaymentCode>('GET', `/v1/payment-codes/${encodeURIComponent(monimeId)}`).catch(() => null);
      if (code) await ctx.runMutation(internal.wallet.applyDepositStatus, { monimeId, status: code.status, amount: money(code.amount) });
    }
    for (const monimeId of payouts) {
      const p = await monime<Payout>('GET', `/v1/payouts/${encodeURIComponent(monimeId)}`).catch(() => null);
      if (p) await ctx.runMutation(internal.wallet.applyPayoutStatus, { monimeId, status: p.status, error: p.failureDetail?.message });
    }
  },
});
