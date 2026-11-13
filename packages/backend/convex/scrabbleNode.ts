'use node';

import { ConvexError, v } from 'convex/values';
import { action, internalAction, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import { ScrabbleEngine, analyzePlay, type ScrabbleState } from '@slgh/shared/src/games/scrabble';
import { scrabbleMoveV } from './roomGames';

// Online Scrabble needs the 270,000-word dictionary: the `word-list` package, the same list the
// Scrabble screen downloads. Word checks and Scrabble bots run here, in the Node runtime (enough memory
// for the whole list), then hand the move to rooms.ts, which applies it if the game hasn't moved on meanwhile.
// The list lives in Convex storage; the very first load fetches it from the npm CDN and stores it.

const DICTIONARY_KEY = 'scrabble-words@4.1.0';
const DICTIONARY_SOURCE = 'https://cdn.jsdelivr.net/npm/word-list@4.1.0/words.txt';

let loading: Promise<ScrabbleEngine> | null = null; // kept between calls while this runtime stays warm
function withDictionary(ctx: ActionCtx) {
  loading ??= (async () => {
    const id = await ctx.runQuery(internal.appFiles.get, { key: DICTIONARY_KEY });
    let text = id ? await (await ctx.storage.get(id))?.text() : undefined;
    if (!text) {
      const res = await fetch(DICTIONARY_SOURCE);
      if (!res.ok) throw new Error(`dictionary download failed: ${res.status}`);
      text = await res.text();
      const storageId = await ctx.storage.store(new Blob([text], { type: 'text/plain' }));
      await ctx.runMutation(internal.appFiles.set, { key: DICTIONARY_KEY, storageId });
    }
    return new ScrabbleEngine(text.split('\n').map((w) => w.trim().toUpperCase()).filter((w) => /^[A-Z]{2,15}$/.test(w)));
  })().catch((e) => {
    loading = null; // try again next time
    console.error(e);
    throw new ConvexError('The Scrabble dictionary could not be loaded. Try again in a minute.');
  });
  return loading;
}

/** Every Scrabble move in an online room comes through here. */
export const move = action({
  args: { code: v.string(), secret: v.string(), move: scrabbleMoveV },
  handler: async (ctx, { code, secret, move: m }): Promise<null> => {
    const r = await ctx.runQuery(internal.rooms.seatFor, { code, secret });
    if (!r) throw new ConvexError('You are no longer in this room.');
    const s = r.state as ScrabbleState | null;
    if (r.game !== 'scrabble' || !s || s.status !== 'playing') throw new ConvexError('The game is not running.');
    if (r.seat < 0) throw new ConvexError('You are watching this game, not playing in it.');
    if (r.seat !== s.currentPlayerIndex) throw new ConvexError('It is not your turn.');
    if (m.type === 'play') {
      const a = analyzePlay(s, m.placements, (await withDictionary(ctx)).isWord);
      if (!a.ok) throw new ConvexError(a.error);
      if (a.invalid.length) throw new ConvexError(`Not in the dictionary: ${a.invalid.join(', ')}.`);
    }
    await ctx.runMutation(internal.rooms.applyChecked, { roomId: r.roomId, version: r.version, seat: r.seat, move: m });
    return null;
  },
});

/** A Scrabble bot's turn, scheduled by rooms.ts. */
export const botMove = internalAction({
  args: { roomId: v.id('play_rooms'), version: v.number() },
  handler: async (ctx, { roomId, version }) => {
    const room = await ctx.runQuery(internal.rooms.roomById, { roomId });
    if (!room || room.version !== version || room.game !== 'scrabble') return;
    const s = room.state as ScrabbleState;
    const bot = s.players[s.currentPlayerIndex];
    if (s.status !== 'playing' || !bot?.isAI) return;
    const m = (await withDictionary(ctx)).getAIMove(s, bot.difficulty ?? 'medium');
    await ctx.runMutation(internal.rooms.applyBotMove, { roomId, version, move: m });
  },
});
