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
