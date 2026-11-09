import type {
  GameState,
  GameEngine,
  Player,
  Difficulty,
  GameManifest,
} from '../types';
import { getRandomMove, shuffle } from '../games';

/** Checkers piece type */
export type Piece = 'red' | 'black' | 'red_king' | 'black_king';

/** Checkers move: from position to position */
export interface CheckersMove {
  from: number; // board index (0-63)
  to: number; // board index (0-63)
  isJump: boolean;
}

/** Checkers game state */
export interface CheckersState extends GameState {
  board: (Piece | null)[]; // 8x8 board, null = empty
  currentTurn: 'red' | 'black';
  mustJump: boolean; // true if current player has a jump available
  redPieces: number;
  blackPieces: number;
  /** During a multi-jump, the square of the piece that must keep jumping */
  jumpingFrom?: number | null;
  /** Moves by both players since the last capture or crowning (draw at 80 = 40 each) */
  quietMoves?: number;
}

/** Checkers game manifest */
export const CHECKERS_MANIFEST: GameManifest = {
  id: 'checkers',
  name: 'Checkers',
  description: 'Jump and capture all your opponent\'s pieces.',
  thumbnail: '🔴',
  minPlayers: 2,
  maxPlayers: 2,
  modes: ['single', 'multi'],
  version: '1.0.0',
};

/** Checkers game engine */
export class CheckersEngine implements GameEngine<CheckersState, CheckersMove> {
  initialize(players: Player[], options?: Record<string, unknown>): CheckersState {
    const board: (Piece | null)[] = Array(64).fill(null);

    // Place red pieces (top 3 rows)
    for (let i = 0; i < 24; i++) {
      const row = Math.floor(i / 8);
      const col = i % 8;
      if ((row + col) % 2 === 1) {
        board[i] = 'red';
      }
    }

    // Place black pieces (bottom 3 rows)
    for (let i = 40; i < 64; i++) {
      const row = Math.floor(i / 8);
      const col = i % 8;
      if ((row + col) % 2 === 1) {
        board[i] = 'black';
      }
    }

    return {
      gameId: CHECKERS_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      board,
      currentTurn: 'red',
      mustJump: false,
      redPieces: 12,
      blackPieces: 12,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  isValidMove(state: CheckersState, move: CheckersMove, playerIndex: number): boolean {
    if (state.status !== 'playing') return false;
    if (playerIndex !== state.currentPlayerIndex) return false;

    const playerColor = playerIndex === 0 ? 'red' : 'black';
    if (state.currentTurn !== playerColor) return false;

    const { from, to, isJump } = move;

    // Check bounds
    if (from < 0 || from >= 64 || to < 0 || to >= 64) return false;

    const piece = state.board[from];
    if (!piece) return false;

    // Check if piece belongs to current player
    if (!piece.startsWith(playerColor)) return false;

    // Check if must jump and this is not a jump
    if (state.mustJump && !isJump) return false;
    if (state.jumpingFrom != null && from !== state.jumpingFrom) return false;

    const fromRow = Math.floor(from / 8);
    const fromCol = from % 8;
    const toRow = Math.floor(to / 8);
    const toCol = to % 8;

    // Check if destination is empty
    if (state.board[to] !== null) return false;

    // Check if move is diagonal
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);
    if (rowDiff !== colDiff) return false;

    if (isJump) {
      // Jump must be 2 squares
      if (rowDiff !== 2) return false;

      // Check if there's an opponent piece to jump
      const midRow = (fromRow + toRow) / 2;
      const midCol = (fromCol + toCol) / 2;
      const midIndex = midRow * 8 + midCol;
      const midPiece = state.board[midIndex];

      if (!midPiece) return false;
      if (midPiece.startsWith(playerColor)) return false;
    } else {
      // Regular move must be 1 square
      if (rowDiff !== 1) return false;

      // Check direction (non-kings can only move forward)
      const isKing = piece.endsWith('_king');
      if (!isKing) {
        if (playerColor === 'red' && toRow <= fromRow) return false; // red moves down
        if (playerColor === 'black' && toRow >= fromRow) return false; // black moves up
      }
    }

    return true;
  }

  applyMove(state: CheckersState, move: CheckersMove): CheckersState {
    const newState = { ...state, updatedAt: Date.now() };
    newState.board = [...state.board];

    const { from, to, isJump } = move;
    const piece = newState.board[from]!;
    newState.board[from] = null;
    newState.board[to] = piece;

    // Handle jump capture
    if (isJump) {
      const fromRow = Math.floor(from / 8);
      const fromCol = from % 8;
      const toRow = Math.floor(to / 8);
      const toCol = to % 8;
      const midRow = (fromRow + toRow) / 2;
      const midCol = (fromCol + toCol) / 2;
      const midIndex = midRow * 8 + midCol;
      const capturedPiece = newState.board[midIndex]!;

      newState.board[midIndex] = null;

      if (capturedPiece.startsWith('red')) {
        newState.redPieces--;
      } else {
        newState.blackPieces--;
      }
    }

    // Check for king promotion
    const toRow = Math.floor(to / 8);
    let crowned = false;
    if (piece === 'red' && toRow === 7) {
      newState.board[to] = 'red_king';
      crowned = true;
    } else if (piece === 'black' && toRow === 0) {
      newState.board[to] = 'black_king';
      crowned = true;
    }
    newState.quietMoves = isJump || crowned ? 0 : (state.quietMoves ?? 0) + 1;

    // Multi-jump: the same piece must keep jumping (a piece that is crowned ends its move)
    if (isJump && !crowned) {
      newState.jumpingFrom = to;
      if (this.hasJumpAvailable(newState, to, state.currentTurn)) {
        newState.mustJump = true;
        return newState;
      }
    }
    newState.jumpingFrom = null;

    // Switch turn
    newState.currentTurn = state.currentTurn === 'red' ? 'black' : 'red';
    newState.currentPlayerIndex = newState.currentTurn === 'red' ? 0 : 1;
    newState.mustJump = this.hasAnyJumpAvailable(newState, newState.currentTurn);

    // Check for game over
    if (newState.redPieces === 0) {
      newState.status = 'finished';
      newState.winner = 1;
    } else if (newState.blackPieces === 0) {
      newState.status = 'finished';
      newState.winner = 0;
    } else if (!this.hasAnyValidMove(newState, newState.currentTurn)) {
      newState.status = 'finished';
      newState.winner = newState.currentTurn === 'red' ? 1 : 0;
    } else if ((newState.quietMoves ?? 0) >= 80) {
      newState.status = 'finished';
      newState.winner = null;
    }

    return newState;
  }

  getLegalMoves(state: CheckersState): CheckersMove[] {
    const moves: CheckersMove[] = [];
    const playerColor = state.currentTurn;

    if (state.jumpingFrom != null) return this.getJumpsForPiece(state, state.jumpingFrom);

    // If must jump, only return jumps
    if (state.mustJump) {
      for (let i = 0; i < 64; i++) {
        const piece = state.board[i];
        if (piece && piece.startsWith(playerColor)) {
          const jumps = this.getJumpsForPiece(state, i);
          moves.push(...jumps);
        }
      }
      return moves;
    }

    // Get all jumps first
    for (let i = 0; i < 64; i++) {
      const piece = state.board[i];
      if (piece && piece.startsWith(playerColor)) {
        const jumps = this.getJumpsForPiece(state, i);
        moves.push(...jumps);
      }
    }

    // If there are jumps, only return jumps
    if (moves.length > 0) return moves;

    // Otherwise return regular moves
    for (let i = 0; i < 64; i++) {
      const piece = state.board[i];
      if (piece && piece.startsWith(playerColor)) {
        const regularMoves = this.getRegularMovesForPiece(state, i);
        moves.push(...regularMoves);
      }
    }

    return moves;
  }

  private getJumpsForPiece(state: CheckersState, from: number): CheckersMove[] {
    const jumps: CheckersMove[] = [];
    const piece = state.board[from]!;
    const isKing = piece.endsWith('_king');
    const fromRow = Math.floor(from / 8);
    const fromCol = from % 8;

    const directions = isKing
      ? [[-2, -2], [-2, 2], [2, -2], [2, 2]]
      : piece.startsWith('red')
      ? [[2, -2], [2, 2]]
      : [[-2, -2], [-2, 2]];

    for (const [rowDiff, colDiff] of directions) {
      const toRow = fromRow + rowDiff;
      const toCol = fromCol + colDiff;

      if (toRow >= 0 && toRow < 8 && toCol >= 0 && toCol < 8) {
        const to = toRow * 8 + toCol;
        const move: CheckersMove = { from, to, isJump: true };
        if (this.isValidMove(state, move, state.currentPlayerIndex)) {
          jumps.push(move);
        }
      }
    }

    return jumps;
  }

  private getRegularMovesForPiece(state: CheckersState, from: number): CheckersMove[] {
    const moves: CheckersMove[] = [];
    const piece = state.board[from]!;
    const isKing = piece.endsWith('_king');
    const fromRow = Math.floor(from / 8);
    const fromCol = from % 8;

    const directions = isKing
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : piece.startsWith('red')
      ? [[1, -1], [1, 1]]
      : [[-1, -1], [-1, 1]];

    for (const [rowDiff, colDiff] of directions) {
      const toRow = fromRow + rowDiff;
      const toCol = fromCol + colDiff;

      if (toRow >= 0 && toRow < 8 && toCol >= 0 && toCol < 8) {
        const to = toRow * 8 + toCol;
        const move: CheckersMove = { from, to, isJump: false };
        if (this.isValidMove(state, move, state.currentPlayerIndex)) {
          moves.push(move);
        }
      }
    }

    return moves;
  }

  private hasJumpAvailable(state: CheckersState, from: number, color: 'red' | 'black'): boolean {
    const jumps = this.getJumpsForPiece(state, from);
    return jumps.length > 0;
  }

  private hasAnyJumpAvailable(state: CheckersState, color: 'red' | 'black'): boolean {
    for (let i = 0; i < 64; i++) {
      const piece = state.board[i];
      if (piece && piece.startsWith(color)) {
        if (this.hasJumpAvailable(state, i, color)) return true;
      }
    }
    return false;
  }

  private hasAnyValidMove(state: CheckersState, color: 'red' | 'black'): boolean {
    for (let i = 0; i < 64; i++) {
      const piece = state.board[i];
      if (piece && piece.startsWith(color)) {
        if (this.getJumpsForPiece(state, i).length > 0) return true;
        if (this.getRegularMovesForPiece(state, i).length > 0) return true;
      }
    }
    return false;
  }

  checkGameOver(state: CheckersState): { isOver: boolean; winner: number | null } {
    return {
      isOver: state.status === 'finished',
      winner: state.winner,
    };
  }

  getAIMove(state: CheckersState, difficulty: Difficulty): CheckersMove {
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) {
      // Should not happen if game is still playing
      return { from: 0, to: 0, isJump: false };
    }

    switch (difficulty) {
      case 'easy':
        return getRandomMove(moves);

      case 'medium':
        // Prefer jumps
        const jumps = moves.filter((m) => m.isJump);
        if (jumps.length > 0 && Math.random() < 0.7) {
          return getRandomMove(jumps);
        }
        return getRandomMove(moves);

      case 'hard':
        // Use simple evaluation: prefer jumps, then moves that advance pieces
        const scoredMoves = moves.map((move) => {
          let score = 0;
          if (move.isJump) score += 10;

          // Prefer advancing pieces toward promotion
          const toRow = Math.floor(move.to / 8);
          if (state.currentTurn === 'red') {
            score += toRow;
          } else {
            score += 7 - toRow;
          }

          // Prefer king promotion
          const piece = state.board[move.from];
          if (piece === 'red' && toRow === 7) score += 20;
          if (piece === 'black' && toRow === 0) score += 20;

          return { move, score };
        });

        scoredMoves.sort((a, b) => b.score - a.score);
        return scoredMoves[0].move;

      default:
        return getRandomMove(moves);
    }
  }

  serialize(state: CheckersState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): CheckersState {
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
