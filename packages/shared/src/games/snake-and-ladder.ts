import type {
  GameState,
  GameEngine,
  Player,
  Difficulty,
  GameManifest,
} from '../types';
import { getRandomMove } from '../games';

/** What happened on the last roll, so UIs can animate and narrate it */
export interface SnakeAndLadderLastMove {
  playerIndex: number;
  roll: number;
  from: number; // square before the roll (0 = off the board)
  landed: number; // square reached by walking the roll (after any bounce back from 100)
  to: number; // final square after any snake or ladder
  kind: 'move' | 'snake' | 'ladder' | 'forfeit';
  bounced: boolean;
  extraTurn: boolean;
}

/** Snake & Ladder game state */
export interface SnakeAndLadderState extends GameState {
  boardSize: number; // 10x10 board (100 squares)
  playerPositions: number[]; // position of each player (0 = start, off the board; 1-100 on the board)
  snakes: Record<number, number>; // head -> tail (slide down)
  ladders: Record<number, number>; // foot -> top (climb up)
  diceValue: number | null; // last dice roll
  consecutiveSixes: number; // sixes rolled in a row by the current player this turn
  lastMove: SnakeAndLadderLastMove | null;
  winner: number | null;
}

/** Snake & Ladder move (dice roll 1-6) */
export type SnakeAndLadderMove = number;

export const SNAKE_AND_LADDER_START = 0;
export const SNAKE_AND_LADDER_FINISH = 100;
export const SNAKE_AND_LADDER_MAX_SIXES = 3;

/** Snake & Ladder game manifest */
export const SNAKE_AND_LADDER_MANIFEST: GameManifest = {
  id: 'snake-and-ladder',
  name: 'Snake & Ladder',
  description: 'Roll the dice and race to square 100.',
  thumbnail: '🎲',
  minPlayers: 2,
  maxPlayers: 6,
  modes: ['single', 'multi'],
  version: '2.0.0',
};

/** Snakes on the SL Game Hub board: head -> tail */
export const SNAKE_AND_LADDER_SNAKES: Record<number, number> = {
  27: 5,
  40: 3,
  43: 18,
  54: 31,
  66: 45,
  89: 53,
  95: 77,
  99: 41,
};

/** Ladders on the SL Game Hub board: foot -> top */
export const SNAKE_AND_LADDER_LADDERS: Record<number, number> = {
  4: 25,
  13: 46,
  42: 63,
  50: 69,
  62: 81,
  74: 92,
};

/** The official rulebook every player follows */
export const SNAKE_AND_LADDER_RULES: { title: string; rules: string[] }[] = [
  {
    title: 'Getting started',
    rules: [
      '2 to 6 players. Each player picks one coloured ring: Red, Yellow, Green, Blue, Cyan or Magenta.',
      'All rings start off the board, just before square 1.',
      'Player 1 (Red) goes first, then play passes in ring order.',
    ],
  },
  {
    title: 'Taking a turn',
    rules: [
      'Press Play to throw the red dice onto the board.',
      'Your ring moves forward exactly the number shown on the dice, following the numbers 1 → 100.',
      'You cannot choose to skip a roll or move fewer squares.',
      'Any number of rings may share the same square. Rings never knock each other off.',
    ],
  },
  {
    title: 'Ladders',
    rules: [
      'If your ring stops on the square at the foot of a ladder, it climbs straight up to the square at the top.',
      'Passing over a ladder without stopping on its foot does nothing.',
    ],
  },
  {
    title: 'Snakes',
    rules: [
      "If your ring stops on a snake's head, it slides down to the square at the snake's tail.",
      'Passing over a snake without stopping on its head is safe.',
    ],
  },
  {
    title: 'Rolling a six',
    rules: [
      'Rolling a 6 moves your ring and gives you another roll.',
      'Rolling three 6s in a row forfeits the third roll: your ring stays where it is and your turn ends.',
    ],
  },
  {
    title: 'Winning',
    rules: [
      'You must land exactly on square 100 to win.',
      'If your roll would take you past 100, your ring walks to 100 and bounces back the extra squares. Watch out for the snakes near the top!',
      'The first player to reach square 100 wins the game.',
    ],
  },
  {
    title: 'Fair play',
    rules: [
      'The dice is rolled by the game for every player and bot — no one picks their number.',
      'Only press Play on your own turn.',
    ],
  },
];

/** Walk a roll forward from a square, bouncing back off 100 */
export function walkRoll(from: number, roll: number): { landed: number; bounced: boolean } {
  const raw = from + roll;
  if (raw <= SNAKE_AND_LADDER_FINISH) return { landed: raw, bounced: false };
  return { landed: SNAKE_AND_LADDER_FINISH - (raw - SNAKE_AND_LADDER_FINISH), bounced: true };
}

/** Snake & Ladder game engine */
export class SnakeAndLadderEngine implements GameEngine<SnakeAndLadderState, SnakeAndLadderMove> {
  initialize(players: Player[], options?: Record<string, unknown>): SnakeAndLadderState {
    const { minPlayers, maxPlayers } = SNAKE_AND_LADDER_MANIFEST;
    if (players.length < minPlayers || players.length > maxPlayers) {
      throw new Error(`Snake & Ladder needs ${minPlayers}-${maxPlayers} players`);
    }
    return {
      gameId: SNAKE_AND_LADDER_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      boardSize: 10,
      playerPositions: players.map(() => SNAKE_AND_LADDER_START),
      snakes: { ...SNAKE_AND_LADDER_SNAKES },
      ladders: { ...SNAKE_AND_LADDER_LADDERS },
      diceValue: null,
      consecutiveSixes: 0,
      lastMove: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  isValidMove(state: SnakeAndLadderState, move: SnakeAndLadderMove, playerIndex: number): boolean {
    if (state.status !== 'playing') return false;
    if (playerIndex !== state.currentPlayerIndex) return false;
    if (!Number.isInteger(move) || move < 1 || move > 6) return false;
    return true;
  }

  applyMove(state: SnakeAndLadderState, move: SnakeAndLadderMove): SnakeAndLadderState {
    const playerIndex = state.currentPlayerIndex;
    const from = state.playerPositions[playerIndex];
    const sixes = move === 6 ? (state.consecutiveSixes ?? 0) + 1 : 0;
    const nextPlayer = (playerIndex + 1) % state.players.length;

    if (sixes >= SNAKE_AND_LADDER_MAX_SIXES) {
      return {
        ...state,
        diceValue: move,
        consecutiveSixes: 0,
        currentPlayerIndex: nextPlayer,
        lastMove: { playerIndex, roll: move, from, landed: from, to: from, kind: 'forfeit', bounced: false, extraTurn: false },
        updatedAt: Date.now(),
      };
    }

    const { landed, bounced } = walkRoll(from, move);
    let to = landed;
    let kind: SnakeAndLadderLastMove['kind'] = 'move';
    if (state.snakes[landed]) {
      to = state.snakes[landed];
      kind = 'snake';
    } else if (state.ladders[landed]) {
      to = state.ladders[landed];
      kind = 'ladder';
    }

    const playerPositions = [...state.playerPositions];
    playerPositions[playerIndex] = to;
    const won = to === SNAKE_AND_LADDER_FINISH;
    const extraTurn = !won && move === 6;

    return {
      ...state,
      playerPositions,
      diceValue: move,
      consecutiveSixes: extraTurn ? sixes : 0,
      status: won ? 'finished' : state.status,
      winner: won ? playerIndex : state.winner,
      currentPlayerIndex: won || extraTurn ? playerIndex : nextPlayer,
      lastMove: { playerIndex, roll: move, from, landed, to, kind, bounced, extraTurn },
      updatedAt: Date.now(),
    };
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
          const newPos = walkRoll(currentPos, move).landed;

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
          const newPos = walkRoll(currentPosHard, move).landed;

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
    parsed.consecutiveSixes ??= 0;
    parsed.lastMove ??= null;
    return parsed;
  }
}
