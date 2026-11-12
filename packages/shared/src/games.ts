import type { GameRegistration, GameState, GameEngine, Player, Difficulty } from './types';

/**
 * Game Library Registry
 * All games register themselves here via registerGame()
 */
const gameRegistry = new Map<string, GameRegistration<any, any>>();

/**
 * Register a game in the library
 */
export function registerGame<TState extends GameState, TMove = unknown>(
  registration: GameRegistration<TState, TMove>
): void {
  gameRegistry.set(registration.manifest.id, registration);
}

/**
 * Get a game registration by ID
 */
export function getGame<TState extends GameState, TMove = unknown>(
  gameId: string
): GameRegistration<TState, TMove> | undefined {
  return gameRegistry.get(gameId);
}

/**
 * Get all registered games
 */
export function getAllGames(): GameRegistration<any, any>[] {
  return Array.from(gameRegistry.values());
}

/**
 * Check if a game is registered
 */
export function hasGame(gameId: string): boolean {
  return gameRegistry.has(gameId);
}

/**
 * Create a player (human or AI)
 */
export function createPlayer(id: string, name: string, isAI: boolean = false, difficulty?: Difficulty): Player {
  return { id, name, isAI, difficulty };
}

/**
 * Helper for AI move selection with randomization to avoid predictable play
 */
export function getRandomMove<TMove>(moves: TMove[]): TMove {
  return moves[Math.floor(Math.random() * moves.length)];
}

/**
 * Helper to shuffle array (Fisher-Yates)
 */
export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Third-person verbs that change when the player is called "You" (vs-bots games name the human "You").
const YOU_VERBS: Record<string, string> = {
  is: 'are', has: 'have', plays: 'play', draws: 'draw', keeps: 'keep', passes: 'pass', wins: 'win', picks: 'pick',
  owes: 'owe', goes: 'go', drops: 'drop', bids: 'bid', collects: 'collect', leaves: 'leave', pays: 'pay', stays: 'stay',
  receives: 'receive', lands: 'land', gets: 'get',
};

/** Fix a log line's grammar when its subject is "You": "You plays" becomes "You play", "You's turn" becomes "Your turn". */
export function youGrammar(text: string): string {
  let t = text.replace(/\bYou's\b/g, 'Your').replace(/\b(to|by|from|with|for) You\b/g, '$1 you');
  if (/^[^A-Za-z]*You\b/.test(t)) t = t.replace(/\b(is|has|plays|draws|keeps|passes|wins|picks|owes|goes|drops|bids|collects|leaves|pays|stays|receives|lands|gets)\b/g, (w) => YOU_VERBS[w]);
  return t;
}
