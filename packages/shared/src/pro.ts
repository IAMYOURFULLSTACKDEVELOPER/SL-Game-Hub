// SL Game Hub Pro: a paid month of extras. Used by the Convex backend, the web app and the mobile app.
// Amounts are minor units like the wallet (100 = SLE 1).

export const PRO_PRICE = 1_000; // SLE 10
export const PRO_DAYS = 30; // each payment adds 30 days
export const FREE_DAILY_ONLINE_GAMES = 10; // online games a free player can play each day (UTC day)

export const PRO_PERKS = [
  'Unlimited online games (free players get 10 a day)',
  'Create groups and forums for your team',
  'Talk in voice chat (free players can only listen)',
] as const;

export const isProActive = (proUntil: number | null | undefined, now = Date.now()) => !!proUntil && proUntil > now;

/** New end date after paying: stacks on top of time still left. */
export const extendPro = (proUntil: number | null | undefined, now = Date.now()) =>
  Math.max(now, proUntil ?? 0) + PRO_DAYS * 24 * 60 * 60 * 1000;

/** UTC day key used for the daily game count, e.g. "2026-11-14" (Sierra Leone is on UTC). */
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
