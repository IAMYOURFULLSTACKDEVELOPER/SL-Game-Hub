import type {
  GameState,
  GameEngine,
  Player,
  Difficulty,
  GameManifest,
} from '../types';
import { getRandomMove } from '../games';

/** Snake & Ladder game state */
export interface SnakeAndLadderState extends GameState {
  boardSize: number; // 10x10 board (100 squares)
  playerPositions: number[]; // position of each player (1-100)
  snakes: Record<number, number>; // start -> end (slide down)
  ladders: Record<number, number>; // start -> end (climb up)
  diceValue: number | null; // last dice roll
  winner: number | null;
}

/** Snake & Ladder move (dice roll 1-6) */
export type SnakeAndLadderMove = number;

/** Snake & Ladder game manifest */
export const SNAKE_AND_LADDER_MANIFEST: GameManifest = {
  id: 'snake-and-ladder',
  name: 'Snake & Ladder',
  description: 'Roll the dice and race to square 100.',
  thumbnail: '🎲',
  minPlayers: 2,
  maxPlayers: 4,
  modes: ['single', 'multi'],
  version: '1.0.0',
};

/** Standard snakes and ladders positions */
const SNAKES: Record<number, number> = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
};

const LADDERS: Record<number, number> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
};

/** Snake & Ladder game engine */
export class SnakeAndLadderEngine implements GameEngine<SnakeAndLadderState, SnakeAndLadderMove> {
  initialize(players: Player[], options?: Record<string, unknown>): SnakeAndLadderState {
    return {
      gameId: SNAKE_AND_LADDER_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      boardSize: 10,
      playerPositions: players.map(() => 1), // All start at position 1
      snakes: { ...SNAKES },
      ladders: { ...LADDERS },
      diceValue: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  isValidMove(state: SnakeAndLadderState, move: SnakeAndLadderMove, playerIndex: number): boolean {
    if (state.status !== 'playing') return false;
    if (playerIndex !== state.currentPlayerIndex) return false;
    if (move < 1 || move > 6) return false;
    return true;
  }

  applyMove(state: SnakeAndLadderState, move: SnakeAndLadderMove): SnakeAndLadderState {
    const newState = { ...state, updatedAt: Date.now(), diceValue: move };
    const currentPos = newState.playerPositions[newState.currentPlayerIndex];
    let newPos = currentPos + move;

    // Check if exact roll to reach 100
    if (newPos > 100) {
      // Bounce back
      newPos = 100 - (newPos - 100);
    }

    // Check for snake
    if (newState.snakes[newPos]) {
      newPos = newState.snakes[newPos];
    }

    // Check for ladder
    if (newState.ladders[newPos]) {
      newPos = newState.ladders[newPos];
    }

    newState.playerPositions = [...newState.playerPositions];
    newState.playerPositions[newState.currentPlayerIndex] = newPos;

    // Check for winner
    if (newPos === 100) {
      newState.status = 'finished';
      newState.winner = newState.currentPlayerIndex;
    } else {
      // Move to next player
      newState.currentPlayerIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
    }

    return newState;
  }

  getLegalMoves(state: SnakeAndLadderState): SnakeAndLadderMove[] {
    return [1, 2, 3, 4, 5, 6];
  }

  checkGameOver(state: SnakeAndLadderState): { isOver: boolean; winner: number | null } {
    return {
      isOver: state.status === 'finished',
      winner: state.winner,
    };
  }

  getAIMove(state: SnakeAndLadderState, difficulty: Difficulty): SnakeAndLadderMove {
    const moves = this.getLegalMoves(state);

    switch (difficulty) {
      case 'easy':
        // Random move
        return getRandomMove(moves);

      case 'medium':
        // Prefer moves that land on ladders or avoid snakes
        const currentPos = state.playerPositions[state.currentPlayerIndex];
        const scoredMoves = moves.map((move) => {
          let newPos = currentPos + move;
          if (newPos > 100) newPos = 100 - (newPos - 100);

          let score = move; // Prefer higher rolls
          if (state.ladders[newPos]) score += 10; // Bonus for ladder
          if (state.snakes[newPos]) score -= 10; // Penalty for snake
          if (newPos === 100) score += 20; // Bonus for winning

          return { move, score };
        });

        scoredMoves.sort((a, b) => b.score - a.score);
        // Sometimes pick randomly from top 3
        if (Math.random() < 0.7) {
          return scoredMoves[0].move;
        }
        return getRandomMove(moves.slice(0, 3));

      case 'hard':
        // Always pick best move
        const currentPosHard = state.playerPositions[state.currentPlayerIndex];
        const scoredMovesHard = moves.map((move) => {
          let newPos = currentPosHard + move;
          if (newPos > 100) newPos = 100 - (newPos - 100);

          let score = move;
          if (state.ladders[newPos]) score += 15;
          if (state.snakes[newPos]) score -= 15;
          if (newPos === 100) score += 25;

          return { move, score };
        });

        scoredMovesHard.sort((a, b) => b.score - a.score);
        return scoredMovesHard[0].move;

      default:
        return getRandomMove(moves);
    }
  }

  serialize(state: SnakeAndLadderState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): SnakeAndLadderState {
    const parsed = JSON.parse(data);
    parsed.players = parsed.players.map((p: Player) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      difficulty: p.difficulty,
    }));
    return parsed;
  }
}
