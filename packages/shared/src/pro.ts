// Dodo Pro: a paid month of extras. Used by the Convex backend, the web app and the mobile app.
// Amounts are minor units like the wallet (100 = SLE 1).

export const PRO_PRICE = 1_000; // SLE 10
export const PRO_DAYS = 30; // each payment adds 30 days
export const FREE_DAILY_ROOMS = 10; // online rooms a free player can create each day (UTC day); joining and playing are unlimited
export const ROOM_IDLE_DAYS = 7; // a room nobody is in is kept this long, so its players can come back to it

export const PRO_PERKS = [
  'Create unlimited online rooms (free players get 10 a day)',
  'Create groups and forums for your team',
  'Turn on your camera in game rooms (everyone can talk)',
  'Play your own music from Spotify or Apple Music while you play',
  'Lower withdrawal fee: 2% instead of 5%',
] as const;

export const isProActive = (proUntil: number | null | undefined, now = Date.now()) => !!proUntil && proUntil > now;

/** New end date after paying: stacks on top of time still left. */
export const extendPro = (proUntil: number | null | undefined, now = Date.now()) =>
  Math.max(now, proUntil ?? 0) + PRO_DAYS * 24 * 60 * 60 * 1000;

/** UTC day key used for the daily room and game counts, e.g. "2026-11-14" (Sierra Leone is on UTC). */
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
