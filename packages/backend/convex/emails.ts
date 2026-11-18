import { v } from 'convex/values';
import { internalAction, internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { formatLeones, providerName } from '@slgh/shared/src/wallet';
import { PRO_PRICE } from '@slgh/shared/src/pro';
import * as T from './emailTemplates';

// Emails go through Resend (RESEND_API_KEY, sender AUTH_EMAIL_FROM, links to SITE_URL).
//  - Account and money emails always go: welcome, top-ups, Pro receipts, withdrawals.
//  - Reminders and invites respect users.email_reminders (on unless the player turns it off).
// Mutations only queue an email (emailUser); the `send` action does the HTTP call, so a slow or
// failing email never blocks or rolls back the thing that caused it.

const REMIND_BEFORE_MS = 30 * 60_000; // "starting soon" emails go out 30 minutes before
const FRESH_MS = 15 * 60_000; // no "starting soon" for a game scheduled in the last 15 minutes
const PRO_WARN_MS = 3 * 24 * 3600_000; // "your Pro ends soon" 3 days before
const MAX_ATTEMPTS = 4;

export const siteUrl = () => (process.env.SITE_URL ?? 'https://dodosalone.fun').replace(/\/+$/, '');
const from = () => process.env.AUTH_EMAIL_FROM ?? 'Dodo <onboarding@resend.dev>';
const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;

const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Freetown' };
export const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', DATE);
export const when = (ms: number) => new Date(ms).toLocaleString('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Freetown',
});

/**
 * Queue an email to a player. `key` must be unique per email (it is Resend's idempotency key, so a
 * retry never sends twice). With `reminder`, it is skipped for players who turned reminder emails off.
 */
export async function emailUser(
  ctx: MutationCtx, user: Doc<'users'> | Id<'users'> | null,
  build: (who: T.Who) => T.Mail, opts: { key: string; reminder?: boolean },
) {
  const u = typeof user === 'string' ? await ctx.db.get(user) : user;
  if (!u?.email || u.isAnonymous) return false;
  if (opts.reminder && (u.email_reminders === false || u.banned)) return false;
  const mail = build({ site: siteUrl(), name: firstName(u.full_name), username: u.username });
  await ctx.scheduler.runAfter(0, internal.emails.send, { to: u.email, ...mail, key: opts.key });
  return true;
}

export const send = internalAction({
  args: { to: v.string(), subject: v.string(), html: v.string(), text: v.string(), key: v.string(), attempt: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const apiKey = process.env.RESEND_API_KEY ?? process.env.AUTH_RESEND_KEY;
    if (!apiKey) { console.log(`email not sent, RESEND_API_KEY is not set: "${a.subject}"`); return null; }
    let status = 0, detail = '';
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': a.key.slice(0, 256) },
        body: JSON.stringify({ from: from(), to: [a.to], subject: a.subject, html: a.html, text: a.text }),
      });
      if (res.ok) return null;
      status = res.status; detail = (await res.text()).slice(0, 300);
    } catch (e) {
      detail = String(e).slice(0, 300); // network trouble: worth a retry
    }
    const attempt = a.attempt ?? 1;
    if ((status === 0 || status === 429 || status >= 500) && attempt < MAX_ATTEMPTS) {
      await ctx.scheduler.runAfter(30_000 * 2 ** attempt, internal.emails.send, { ...a, attempt: attempt + 1 });
      return null;
    }
    console.error(`email failed (${status || 'network'}) "${a.subject}": ${detail}`);
    return null;
  },
});

// ---------------------------------------------------------------------------------------------
// Money: called from wallet.ts and pro.ts in the same mutation as the change they describe

const balanceOf = async (ctx: MutationCtx, userId: Id<'users'>) =>
  formatLeones((await ctx.db.query('wallets').withIndex('by_user', (q) => q.eq('user_id', userId)).unique())?.balance ?? 0);

const payout = (w: Doc<'withdrawals'>) => ({
  amount: formatLeones(w.amount), fee: formatLeones(w.fee ?? 0), receive: formatLeones(w.amount - (w.fee ?? 0)),
  phone: w.phone, provider: providerName(w.provider),
});

export async function emailTopUp(ctx: MutationCtx, d: Doc<'deposits'>) {
  const balance = await balanceOf(ctx, d.user_id);
  await emailUser(ctx, d.user_id, (who) => T.topUp(who, { amount: formatLeones(d.amount), balance }), { key: `topup/${d._id}` });
}

export async function emailPro(ctx: MutationCtx, userId: Id<'users'>, o: { until: number; amount: number; gift: boolean; key: string }) {
  await emailUser(ctx, userId, (who) => T.proActive(who, {
    until: day(o.until), gift: o.gift, paid: o.gift || !o.amount ? undefined : formatLeones(o.amount),
  }), { key: `pro/${o.key}` });
}

/** A new withdrawal: a receipt for the player, and a heads-up for every admin. */
export async function emailWithdrawalRequested(ctx: MutationCtx, w: Doc<'withdrawals'>, player: Doc<'users'>) {
  const p = payout(w);
  await emailUser(ctx, player, (who) => T.withdrawalRequested(who, p), { key: `withdrawal/${w._id}/requested` });
  for (const admin of await ctx.db.query('users').withIndex('by_role', (q) => q.eq('role', 'admin')).take(20)) {
    if (admin._id === player._id) continue;
    await emailUser(ctx, admin, (who) => T.adminWithdrawal(who, { ...p, player: player.username }), { key: `withdrawal/${w._id}/admin/${admin._id}` });
  }
}

export async function emailWithdrawalPaid(ctx: MutationCtx, w: Doc<'withdrawals'>) {
  await emailUser(ctx, w.user_id, (who) => T.withdrawalPaid(who, payout(w)), { key: `withdrawal/${w._id}/paid` });
}

/** The money came back: an admin declined it, or the payout failed. (Players cancelling their own get no email.) */
export async function emailWithdrawalReturned(ctx: MutationCtx, w: Doc<'withdrawals'>, declined: boolean) {
  const balance = await balanceOf(ctx, w.user_id);
  await emailUser(ctx, w.user_id, (who) => T.withdrawalReturned(who, { amount: formatLeones(w.amount), declined, balance }),
    { key: `withdrawal/${w._id}/returned` });
}

// ---------------------------------------------------------------------------------------------
// Reminders (cron, every 5 minutes)

const gameName = async (ctx: MutationCtx, slug: string) =>
  (await ctx.db.query('games').withIndex('by_slug', (q) => q.eq('slug', slug)).unique())?.name ?? slug;

export async function emailScheduleInvite(ctx: MutationCtx, e: Doc<'scheduled_games'>, host: Doc<'users'>, to: Id<'users'>, name: string) {
  await emailUser(ctx, to, (who) => T.scheduleInvite(who, {
    title: e.title, gameName: name, when: when(e.starts_at), host: host.username, tournament: e.kind === 'tournament',
  }), { key: `invite/${e._id}/${to}`, reminder: true });
}

export const remind = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Scheduled games starting in the next 30 minutes: the host and everyone going or maybe
    for (const isPublic of [true, false]) {
      const soon = await ctx.db.query('scheduled_games')
        .withIndex('by_public_and_starts_at', (q) => q.eq('public', isPublic).gt('starts_at', now).lte('starts_at', now + REMIND_BEFORE_MS))
        .take(200);
      for (const e of soon) {
        if (e.status !== 'scheduled' || e.reminded_at || now - e._creationTime < FRESH_MS) continue;
        await ctx.db.patch(e._id, { reminded_at: now });
        const host = await ctx.db.get(e.created_by);
        if (!host) continue;
        const name = await gameName(ctx, e.game);
        const minutes = Math.max(1, Math.round((e.starts_at - now) / 60_000));
        const rsvps = await ctx.db.query('schedule_rsvps').withIndex('by_event_id_and_user_id', (q) => q.eq('event_id', e._id)).take(300);
        const people = new Set<Id<'users'>>([e.created_by, ...rsvps.filter((r) => r.status === 'going' || r.status === 'maybe').map((r) => r.user_id)]);
        for (const id of people) {
          const isHost = id === e.created_by;
          const path = e.room_code ? `/games/${e.game}/play?room=${e.room_code}` : isHost ? `/games/${e.game}/play?online=1` : '/schedule';
          await emailUser(ctx, id, (who) => T.gameReminder(who, {
            title: e.title, gameName: name, when: when(e.starts_at), host: host.username, tournament: e.kind === 'tournament',
            minutes, isHost, path,
          }), { key: `remind/${e._id}/${id}`, reminder: true });
        }
      }
    }

    // Pro ending within 3 days, once per Pro period (renewing moves pro_until, so the next period gets its own)
    const ending = await ctx.db.query('users')
      .withIndex('by_pro_until', (q) => q.gt('pro_until', now).lte('pro_until', now + PRO_WARN_MS))
      .take(500);
    for (const u of ending) {
      if (!u.pro_until || u.pro_reminder_for === u.pro_until) continue;
      await ctx.db.patch(u._id, { pro_reminder_for: u.pro_until });
      const until = day(u.pro_until);
      await emailUser(ctx, u, (who) => T.proEnding(who, { until, price: formatLeones(PRO_PRICE) }),
        { key: `pro-ending/${u._id}/${u.pro_until}`, reminder: true });
    }
    return null;
  },
});
