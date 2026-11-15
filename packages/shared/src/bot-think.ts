// How long a bot "thinks" before it plays, so it feels like a person at the table rather than an instant reply.
// Each game has a range (harder decisions take longer), the time is picked at random inside it, and now and then
// the bot takes a noticeably longer pause. Used by the games on the device and by the bots in online rooms.

export type BotThinkKind =
  | 'chess' | 'checkers' | 'uno' | 'salone-poly' | 'salone-poly-auction'
  | 'snake-and-ladder' | 'scrabble' | 'dice' | 'word-search';

/** [shortest, longest] thinking time in milliseconds. */
export const BOT_THINK_MS: Record<BotThinkKind, readonly [number, number]> = {
  chess: [1400, 3200],
  checkers: [1100, 2400],
  uno: [1300, 2600],
  'salone-poly': [1200, 2400],
  'salone-poly-auction': [700, 1500], // bids are quick, or the auction drags
  'snake-and-ladder': [1000, 1800], // only a dice roll to decide
  scrabble: [2200, 4200],
  dice: [1100, 1900],
  'word-search': [2500, 4500], // a person needs a while to spot a word
};

const LONG_PAUSE_CHANCE = 0.12;
const LONG_PAUSE_FACTOR = 1.5;

/** A thinking time for one bot turn. `random` is injectable for tests. */
export function botThinkMs(kind: BotThinkKind, random: () => number = Math.random): number {
  const [lo, hi] = BOT_THINK_MS[kind];
  let ms = lo + (hi - lo) * random();
  if (random() < LONG_PAUSE_CHANCE) ms *= LONG_PAUSE_FACTOR;
  return Math.round(ms);
}
