import type {
  GameState,
  GameEngine,
  Player,
  Difficulty,
  GameManifest,
} from '../types';
import { getRandomMove, shuffle } from '../games';

/** Snake game state */
export interface SnakeState extends GameState {
  boardSize: number;
  snake: number[]; // array of cell indices
  food: number;
  direction: 'up' | 'down' | 'left' | 'right';
  nextDirection: 'up' | 'down' | 'left' | 'right';
  score: number;
  speed: number; // milliseconds per move
}

/** Snake move (direction change) */
export type SnakeMove = 'up' | 'down' | 'left' | 'right';

/** Snake game manifest */
export const SNAKE_MANIFEST: GameManifest = {
  id: 'snake',
  name: 'Snake',
  description: 'Guide the snake, eat, grow, and avoid crashing.',
  thumbnail: '🐍',
  minPlayers: 1,
  maxPlayers: 1,
  modes: ['single'],
  version: '1.0.0',
};

/** Direction vectors */
const DIRECTIONS: Record<SnakeMove, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** Convert cell index to x,y coordinates */
function indexToXY(index: number, size: number): [number, number] {
  return [index % size, Math.floor(index / size)];
}

/** Convert x,y coordinates to cell index */
function xyToIndex(x: number, y: number, size: number): number {
  return y * size + x;
}

/** Check if move is opposite to current direction */
function isOpposite(dir1: SnakeMove, dir2: SnakeMove): boolean {
  const opposites: Record<SnakeMove, SnakeMove> = {
    up: 'down',
    down: 'up',
    left: 'right',
    right: 'left',
  };
  return opposites[dir1] === dir2;
}

/** Snake game engine */
export class SnakeEngine implements GameEngine<SnakeState, SnakeMove> {
  private readonly boardSize: number;
  private readonly defaultSpeed: number;

  constructor(boardSize: number = 20, defaultSpeed: number = 200) {
    this.boardSize = boardSize;
    this.defaultSpeed = defaultSpeed;
  }

  initialize(players: Player[], options?: Record<string, unknown>): SnakeState {
    const size = (options?.boardSize as number) || this.boardSize;
    const speed = (options?.speed as number) || this.defaultSpeed;

    // Start snake in middle
    const startX = Math.floor(size / 2);
    const startY = Math.floor(size / 2);
    const snake = [xyToIndex(startX, startY, size)];

    // Place food randomly (not on snake)
    let food: number;
    do {
      food = Math.floor(Math.random() * size * size);
    } while (snake.includes(food));

    return {
      gameId: SNAKE_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      boardSize: size,
      snake,
      food,
      direction: 'right',
      nextDirection: 'right',
      score: 0,
      speed,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  isValidMove(state: SnakeState, move: SnakeMove, playerIndex: number): boolean {
    if (playerIndex !== 0) return false; // Only player 0 can move
    if (state.status !== 'playing') return false;
    if (isOpposite(state.direction, move)) return false; // Can't reverse
    return true;
  }

  applyMove(state: SnakeState, move: SnakeMove): SnakeState {
    const newState = { ...state, direction: state.nextDirection, nextDirection: move, updatedAt: Date.now() };
    return this.tick(newState);
  }

  tick(state: SnakeState): SnakeState {
    const { boardSize, snake, direction, food, score } = state;
    const head = snake[0];
    const [headX, headY] = indexToXY(head, boardSize);
    const [dx, dy] = DIRECTIONS[direction];

    const newX = headX + dx;
    const newY = headY + dy;

    // Check wall collision
    if (newX < 0 || newX >= boardSize || newY < 0 || newY >= boardSize) {
      return { ...state, status: 'finished', winner: null, updatedAt: Date.now() };
    }

    const newHead = xyToIndex(newX, newY, boardSize);

    // Check self collision
    if (snake.includes(newHead)) {
      return { ...state, status: 'finished', winner: null, updatedAt: Date.now() };
    }

    const newSnake = [newHead, ...snake];

    // Check if ate food
    if (newHead === food) {
      // Place new food
      let newFood: number;
      const allCells = Array.from({ length: boardSize * boardSize }, (_, i) => i);
      const availableCells = allCells.filter((c) => !newSnake.includes(c));
      newFood = availableCells[Math.floor(Math.random() * availableCells.length)];

      return {
        ...state,
        snake: newSnake,
        food: newFood,
        score: score + 10,
        direction: state.nextDirection,
        updatedAt: Date.now(),
      };
    }

    // Remove tail
    newSnake.pop();

    return {
      ...state,
      snake: newSnake,
      direction: state.nextDirection,
      updatedAt: Date.now(),
    };
  }

  getLegalMoves(state: SnakeState): SnakeMove[] {
    const moves: SnakeMove[] = ['up', 'down', 'left', 'right'];
    return moves.filter((move) => !isOpposite(state.direction, move));
  }

  checkGameOver(state: SnakeState): { isOver: boolean; winner: number | null } {
    return {
      isOver: state.status === 'finished',
      winner: state.winner,
    };
  }

  getAIMove(state: SnakeState, difficulty: Difficulty): SnakeMove {
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) return 'up';

    const head = state.snake[0];
    const [headX, headY] = indexToXY(head, state.boardSize);
    const [foodX, foodY] = indexToXY(state.food, state.boardSize);

    switch (difficulty) {
      case 'easy':
        // Random move
        return getRandomMove(moves);

      case 'medium':
        // Sometimes move towards food, sometimes random
        if (Math.random() < 0.6) {
          return this.getMoveTowardsFood(moves, headX, headY, foodX, foodY);
        }
        return getRandomMove(moves);

      case 'hard':
        // Always move towards food, but avoid immediate death
        const safeMoves = moves.filter((move) => this.isMoveSafe(state, move));
        if (safeMoves.length > 0) {
          return this.getMoveTowardsFood(safeMoves, headX, headY, foodX, foodY);
        }
        return getRandomMove(moves);

      default:
        return getRandomMove(moves);
    }
  }

  private getMoveTowardsFood(
    moves: SnakeMove[],
    headX: number,
    headY: number,
    foodX: number,
    foodY: number
  ): SnakeMove {
    // Sort moves by distance to food
    const scored = moves.map((move) => {
      const [dx, dy] = DIRECTIONS[move];
      const newX = headX + dx;
      const newY = headY + dy;
      const dist = Math.abs(newX - foodX) + Math.abs(newY - foodY);
      return { move, dist };
    });

    scored.sort((a, b) => a.dist - b.dist);
    return scored[0].move;
  }

  private isMoveSafe(state: SnakeState, move: SnakeMove): boolean {
    const head = state.snake[0];
    const [headX, headY] = indexToXY(head, state.boardSize);
    const [dx, dy] = DIRECTIONS[move];
    const newX = headX + dx;
    const newY = headY + dy;

    // Check wall
    if (newX < 0 || newX >= state.boardSize || newY < 0 || newY >= state.boardSize) {
      return false;
    }

    // Check self collision (excluding tail since it will move)
    const newHead = xyToIndex(newX, newY, state.boardSize);
    if (state.snake.slice(0, -1).includes(newHead)) {
      return false;
    }

    return true;
  }

  serialize(state: SnakeState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): SnakeState {
    const parsed = JSON.parse(data);
    // Ensure players have all required fields
    parsed.players = parsed.players.map((p: Player) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      difficulty: p.difficulty,
    }));
    return parsed;
  }
}
