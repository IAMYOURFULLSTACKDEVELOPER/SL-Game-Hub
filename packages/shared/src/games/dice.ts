import type { GameState, GameEngine, Player, Difficulty, GameManifest } from '../types';

export type DicePair = [number, number];

export interface DiceRoll {
  playerIndex: number;
  dice: DicePair;
  points: number;
}

/** Dice game state */
export interface DiceState extends GameState {
  scores: number[];
  target: number;
  lastRoll: DiceRoll | null;
  turn: number;
}

/** Dice move: the two dice values that were rolled (1-6 each) */
export type DiceMove = DicePair;

export const DICE_MANIFEST: GameManifest = {
  id: 'dice',
  name: 'Dice',
  description: 'Roll two dice and race to the target score. Doubles score double, snake eyes cost 10 points.',
  thumbnail: '🎲',
  minPlayers: 2,
  maxPlayers: 8,
  modes: ['single', 'multi'],
  version: '1.0.0',
};

export const DICE_TARGETS = [30, 50, 100] as const;
export const SNAKE_EYES_PENALTY = 10;

export const rollDie = () => Math.floor(Math.random() * 6) + 1;
export const rollDice = (): DicePair => [rollDie(), rollDie()];

/** Points for a roll: sum, doubled on doubles, snake eyes (1+1) is a penalty */
export function scoreRoll([a, b]: DicePair): number {
  if (a === 1 && b === 1) return -SNAKE_EYES_PENALTY;
  return a === b ? (a + b) * 2 : a + b;
}

const isDie = (n: number) => Number.isInteger(n) && n >= 1 && n <= 6;

export class DiceEngine implements GameEngine<DiceState, DiceMove> {
  initialize(players: Player[], options?: Record<string, unknown>): DiceState {
    if (players.length < DICE_MANIFEST.minPlayers || players.length > DICE_MANIFEST.maxPlayers) {
      throw new Error(`Dice needs ${DICE_MANIFEST.minPlayers}-${DICE_MANIFEST.maxPlayers} players`);
    }
    const target = typeof options?.target === 'number' && options.target > 0 ? options.target : 50;
    return {
      gameId: DICE_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      scores: players.map(() => 0),
      target,
      lastRoll: null,
      turn: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  isValidMove(state: DiceState, move: DiceMove, playerIndex: number): boolean {
    return state.status === 'playing'
      && playerIndex === state.currentPlayerIndex
      && Array.isArray(move) && move.length === 2 && move.every(isDie);
  }

  applyMove(state: DiceState, move: DiceMove): DiceState {
    const i = state.currentPlayerIndex;
    const points = scoreRoll(move);
    const scores = [...state.scores];
    scores[i] = Math.max(0, scores[i] + points);
    const won = scores[i] >= state.target;
    return {
      ...state,
      scores,
      lastRoll: { playerIndex: i, dice: [move[0], move[1]], points },
      status: won ? 'finished' : 'playing',
      winner: won ? i : null,
      currentPlayerIndex: won ? i : (i + 1) % state.players.length,
      turn: state.turn + 1,
      updatedAt: Date.now(),
    };
  }

  getLegalMoves(state: DiceState): DiceMove[] {
    if (state.status !== 'playing') return [];
    const moves: DiceMove[] = [];
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) moves.push([a, b]);
    return moves;
  }

  checkGameOver(state: DiceState): { isOver: boolean; winner: number | null } {
    return { isOver: state.status === 'finished', winner: state.winner };
  }

  /** Dice is pure luck, so every difficulty rolls fairly */
  getAIMove(_state: DiceState, _difficulty: Difficulty): DiceMove {
    return rollDice();
  }

  serialize(state: DiceState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): DiceState {
    return JSON.parse(data) as DiceState;
  }
}
