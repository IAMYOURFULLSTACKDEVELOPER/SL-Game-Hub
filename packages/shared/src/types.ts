export type AgeBand = 'under_13' | '13_17' | '18_plus';
export type Role = 'player' | 'admin';
export type GameMode = 'single' | 'multi';
export type GameStatus = 'draft' | 'review' | 'approved' | 'published' | 'unpublished';
export type Difficulty = 'easy' | 'medium' | 'hard';
export const AGE_BANDS: AgeBand[] = ['under_13', '13_17', '18_plus'];
export const GAME_STATUSES: GameStatus[] = ['draft', 'review', 'approved', 'published', 'unpublished'];
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Every game (built-in or uploaded) describes itself with this one manifest. Used from Phase 2. */
export interface GameManifest {
  id: string;            // slug, e.g. "chess"
  name: string;
  description: string;
  thumbnail: string;     // URL or emoji for built-ins
  minPlayers: number;
  maxPlayers: number;
  modes: GameMode[];
  version: string;       // semver
}

/** Base game state interface - all games must implement this */
export interface GameState {
  gameId: string;
  players: Player[];
  currentPlayerIndex: number;
  status: 'waiting' | 'playing' | 'finished';
  winner: number | null; // index of winning player, null if no winner
  createdAt: number;
  updatedAt: number;
}

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  difficulty?: Difficulty; // for AI players
}

/** Base game engine interface - all games must implement this */
export interface GameEngine<TState extends GameState, TMove = unknown> {
  /** Initialize a new game state */
  initialize(players: Player[], options?: Record<string, unknown>): TState;

  /** Validate if a move is legal */
  isValidMove(state: TState, move: TMove, playerIndex: number): boolean;

  /** Apply a move to the state, returning new state */
  applyMove(state: TState, move: TMove): TState;

  /** Get all legal moves for the current player */
  getLegalMoves(state: TState): TMove[];

  /** Check if the game is over and who won */
  checkGameOver(state: TState): { isOver: boolean; winner: number | null };

  /** Get AI move for the current player */
  getAIMove(state: TState, difficulty: Difficulty): TMove;

  /** Serialize state for storage */
  serialize(state: TState): string;

  /** Deserialize state from storage */
  deserialize(data: string): TState;
}

/** Game registration entry */
export interface GameRegistration<TState extends GameState, TMove = unknown> {
  manifest: GameManifest;
  engine: GameEngine<TState, TMove>;
}
