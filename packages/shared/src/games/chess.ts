import type {
  GameState,
  GameEngine,
  Player,
  Difficulty,
  GameManifest,
} from '../types';
import { getRandomMove } from '../games';

/** Chess piece types */
export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type PieceColor = 'white' | 'black';

/** Chess piece with color and type */
export interface ChessPiece {
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean; // for castling and pawn movement tracking
}

/** Chess move representation */
export interface ChessMove {
  from: { row: number; col: number };
  to: { row: number; col: number };
  promotion?: PieceType; // for pawn promotion
  castle?: 'kingside' | 'queenside'; // for castling
  enPassant?: boolean; // for en passant capture
}

/** Chess game state */
export interface ChessState extends GameState {
  board: (ChessPiece | null)[][];
  currentTurn: PieceColor;
  castlingRights: {
    whiteKingside: boolean;
    whiteQueenside: boolean;
    blackKingside: boolean;
    blackQueenside: boolean;
  };
  enPassantTarget: { row: number; col: number } | null; // square behind pawn that moved 2 squares
  halfMoveClock: number; // for 50-move rule
  fullMoveNumber: number;
  inCheck: boolean;
  checkmate: boolean;
  stalemate: boolean;
}

/** Chess game manifest */
export const CHESS_MANIFEST: GameManifest = {
  id: 'chess',
  name: 'Chess',
  description: 'The classic game of kings. Capture the opponent\'s king to win.',
  thumbnail: '♔',
  minPlayers: 2,
  maxPlayers: 2,
  modes: ['single', 'multi'],
  version: '1.0.0',
};

/** Chess game engine */
export class ChessEngine implements GameEngine<ChessState, ChessMove> {
  initialize(players: Player[], options?: Record<string, unknown>): ChessState {
    const board: (ChessPiece | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));

    // Place pawns
    for (let col = 0; col < 8; col++) {
      board[1][col] = { type: 'pawn', color: 'black', hasMoved: false };
      board[6][col] = { type: 'pawn', color: 'white', hasMoved: false };
    }

    // Place black pieces
    board[0][0] = { type: 'rook', color: 'black', hasMoved: false };
    board[0][1] = { type: 'knight', color: 'black', hasMoved: false };
    board[0][2] = { type: 'bishop', color: 'black', hasMoved: false };
    board[0][3] = { type: 'queen', color: 'black', hasMoved: false };
    board[0][4] = { type: 'king', color: 'black', hasMoved: false };
    board[0][5] = { type: 'bishop', color: 'black', hasMoved: false };
    board[0][6] = { type: 'knight', color: 'black', hasMoved: false };
    board[0][7] = { type: 'rook', color: 'black', hasMoved: false };

    // Place white pieces
    board[7][0] = { type: 'rook', color: 'white', hasMoved: false };
    board[7][1] = { type: 'knight', color: 'white', hasMoved: false };
    board[7][2] = { type: 'bishop', color: 'white', hasMoved: false };
    board[7][3] = { type: 'queen', color: 'white', hasMoved: false };
    board[7][4] = { type: 'king', color: 'white', hasMoved: false };
    board[7][5] = { type: 'bishop', color: 'white', hasMoved: false };
    board[7][6] = { type: 'knight', color: 'white', hasMoved: false };
    board[7][7] = { type: 'rook', color: 'white', hasMoved: false };

    return {
      gameId: CHESS_MANIFEST.id,
      players,
      currentPlayerIndex: 0,
      status: 'playing',
      winner: null,
      board,
      currentTurn: 'white',
      castlingRights: {
        whiteKingside: true,
        whiteQueenside: true,
        blackKingside: true,
        blackQueenside: true,
      },
      enPassantTarget: null,
      halfMoveClock: 0,
      fullMoveNumber: 1,
      inCheck: false,
      checkmate: false,
      stalemate: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  isValidMove(state: ChessState, move: ChessMove, playerIndex: number): boolean {
    if (state.status !== 'playing') return false;
    if (playerIndex !== state.currentPlayerIndex) return false;

    const playerColor = playerIndex === 0 ? 'white' : 'black';
    if (state.currentTurn !== playerColor) return false;

    const { from, to } = move;

    // Check bounds
    if (from.row < 0 || from.row >= 8 || from.col < 0 || from.col >= 8) return false;
    if (to.row < 0 || to.row >= 8 || to.col < 0 || to.col >= 8) return false;

    const piece = state.board[from.row][from.col];
    if (!piece) return false;
    if (piece.color !== playerColor) return false;

    // Check if destination has own piece
    const destPiece = state.board[to.row][to.col];
    if (destPiece && destPiece.color === playerColor) return false;

    // Validate move based on piece type
    const validMove = this.validatePieceMove(state, move, piece);
    if (!validMove) return false;

    // Check if move leaves king in check
    const testState = this.applyMoveRaw(state, move);
    if (this.isKingInCheck(testState, playerColor)) return false;

    return true;
  }

  private validatePieceMove(state: ChessState, move: ChessMove, piece: ChessPiece): boolean {
    const { from, to } = move;
    const rowDiff = to.row - from.row;
    const colDiff = to.col - from.col;
    const absRowDiff = Math.abs(rowDiff);
    const absColDiff = Math.abs(colDiff);

    switch (piece.type) {
      case 'pawn':
        return this.validatePawnMove(state, move, piece);

      case 'rook':
        if (rowDiff !== 0 && colDiff !== 0) return false;
        return this.isPathClear(state, from, to);

      case 'knight':
        return (absRowDiff === 2 && absColDiff === 1) || (absRowDiff === 1 && absColDiff === 2);

      case 'bishop':
        if (absRowDiff !== absColDiff) return false;
        return this.isPathClear(state, from, to);

      case 'queen':
        if (rowDiff !== 0 && colDiff !== 0 && absRowDiff !== absColDiff) return false;
        return this.isPathClear(state, from, to);

      case 'king':
        if (absRowDiff > 1 || absColDiff > 1) {
          // Check for castling
          return this.validateCastling(state, move, piece);
        }
        return true;

      default:
        return false;
    }
  }

  private validatePawnMove(state: ChessState, move: ChessMove, piece: ChessPiece): boolean {
    const { from, to } = move;
    const rowDiff = to.row - from.row;
    const colDiff = to.col - from.col;
    const absColDiff = Math.abs(colDiff);
    const direction = piece.color === 'white' ? -1 : 1;

    // Regular forward move
    if (colDiff === 0) {
      if (rowDiff === direction) {
        // Move one square forward
        return state.board[to.row][to.col] === null;
      }
      if (rowDiff === 2 * direction && !piece.hasMoved) {
        // Move two squares forward from starting position
        if (state.board[from.row + direction][from.col] !== null) return false;
        return state.board[to.row][to.col] === null;
      }
      return false;
    }

    // Capture move
    if (absColDiff === 1 && rowDiff === direction) {
      const destPiece = state.board[to.row][to.col];
      if (destPiece && destPiece.color !== piece.color) return true;

      // En passant capture
      if (state.enPassantTarget && state.enPassantTarget.row === to.row && state.enPassantTarget.col === to.col) {
        return true;
      }
      return false;
    }

    return false;
  }

  private validateCastling(state: ChessState, move: ChessMove, piece: ChessPiece): boolean {
    if (piece.type !== 'king') return false;
    if (piece.hasMoved) return false;
    if (state.inCheck) return false;

    const { from, to } = move;
    const row = from.row;

    // Kingside castling
    if (move.castle === 'kingside') {
      if (piece.color === 'white' && !state.castlingRights.whiteKingside) return false;
      if (piece.color === 'black' && !state.castlingRights.blackKingside) return false;

      // Check squares between king and rook are empty
      if (state.board[row][5] !== null || state.board[row][6] !== null) return false;

      // Check king doesn't pass through check
      const tempState1 = { ...state, board: state.board.map(r => [...r]) };
      tempState1.board[row][5] = piece;
      tempState1.board[row][4] = null;
      if (this.isKingInCheck(tempState1, piece.color)) return false;

      const tempState2 = { ...state, board: state.board.map(r => [...r]) };
      tempState2.board[row][6] = piece;
      tempState2.board[row][4] = null;
      if (this.isKingInCheck(tempState2, piece.color)) return false;

      return to.row === row && to.col === 6;
    }

    // Queenside castling
    if (move.castle === 'queenside') {
      if (piece.color === 'white' && !state.castlingRights.whiteQueenside) return false;
      if (piece.color === 'black' && !state.castlingRights.blackQueenside) return false;

      // Check squares between king and rook are empty
      if (state.board[row][1] !== null || state.board[row][2] !== null || state.board[row][3] !== null) return false;

      // Check king doesn't pass through check
      const tempState1 = { ...state, board: state.board.map(r => [...r]) };
      tempState1.board[row][3] = piece;
      tempState1.board[row][4] = null;
      if (this.isKingInCheck(tempState1, piece.color)) return false;

      const tempState2 = { ...state, board: state.board.map(r => [...r]) };
      tempState2.board[row][2] = piece;
      tempState2.board[row][4] = null;
      if (this.isKingInCheck(tempState2, piece.color)) return false;

      return to.row === row && to.col === 2;
    }

    return false;
  }

  private isPathClear(state: ChessState, from: { row: number; col: number }, to: { row: number; col: number }): boolean {
    const rowDiff = to.row - from.row;
    const colDiff = to.col - from.col;
    const steps = Math.max(Math.abs(rowDiff), Math.abs(colDiff));
    const rowStep = rowDiff === 0 ? 0 : rowDiff / Math.abs(rowDiff);
    const colStep = colDiff === 0 ? 0 : colDiff / Math.abs(colDiff);

    for (let i = 1; i < steps; i++) {
      const checkRow = from.row + i * rowStep;
      const checkCol = from.col + i * colStep;
      if (state.board[checkRow][checkCol] !== null) return false;
    }

    return true;
  }

  private applyMoveRaw(state: ChessState, move: ChessMove): ChessState {
    const newState = { ...state, board: state.board.map(r => [...r]) };
    const { from, to } = move;
    const piece = newState.board[from.row][from.col]!;

    newState.board[to.row][to.col] = piece;
    newState.board[from.row][from.col] = null;

    // Handle en passant capture
    if (move.enPassant) {
      const captureRow = piece.color === 'white' ? to.row + 1 : to.row - 1;
      newState.board[captureRow][to.col] = null;
    }

    // Handle castling
    if (move.castle === 'kingside') {
      newState.board[from.row][5] = newState.board[from.row][7];
      newState.board[from.row][7] = null;
    } else if (move.castle === 'queenside') {
      newState.board[from.row][3] = newState.board[from.row][0];
      newState.board[from.row][0] = null;
    }

    // Handle pawn promotion
    if (move.promotion) {
      newState.board[to.row][to.col] = { type: move.promotion, color: piece.color, hasMoved: true };
    } else {
      newState.board[to.row][to.col] = { ...piece, hasMoved: true };
    }

    return newState;
  }

  applyMove(state: ChessState, move: ChessMove): ChessState {
    const newState = this.applyMoveRaw(state, move);
    newState.updatedAt = Date.now();

    const { from, to } = move;
    const piece = state.board[from.row][from.col]!;

    // Update castling rights
    if (piece.type === 'king') {
      if (piece.color === 'white') {
        newState.castlingRights.whiteKingside = false;
        newState.castlingRights.whiteQueenside = false;
      } else {
        newState.castlingRights.blackKingside = false;
        newState.castlingRights.blackQueenside = false;
      }
    }

    if (piece.type === 'rook') {
      if (from.row === 7 && from.col === 0) newState.castlingRights.whiteQueenside = false;
      if (from.row === 7 && from.col === 7) newState.castlingRights.whiteKingside = false;
      if (from.row === 0 && from.col === 0) newState.castlingRights.blackQueenside = false;
      if (from.row === 0 && from.col === 7) newState.castlingRights.blackKingside = false;
    }

    // Update en passant target
    if (piece.type === 'pawn' && Math.abs(to.row - from.row) === 2) {
      newState.enPassantTarget = {
        row: (from.row + to.row) / 2,
        col: from.col,
      };
    } else {
      newState.enPassantTarget = null;
    }

    // Update half move clock (reset on pawn move or capture)
    const capturedPiece = state.board[to.row][to.col];
    if (piece.type === 'pawn' || capturedPiece || move.enPassant) {
      newState.halfMoveClock = 0;
    } else {
      newState.halfMoveClock++;
    }

    // Update full move number
    if (state.currentTurn === 'black') {
      newState.fullMoveNumber++;
    }

    // Switch turn
    newState.currentTurn = state.currentTurn === 'white' ? 'black' : 'white';
    newState.currentPlayerIndex = newState.currentTurn === 'white' ? 0 : 1;

    // Check for check
    newState.inCheck = this.isKingInCheck(newState, newState.currentTurn);

    // Check for checkmate or stalemate
    const legalMoves = this.getLegalMoves(newState);
    if (legalMoves.length === 0) {
      if (newState.inCheck) {
        newState.checkmate = true;
        newState.status = 'finished';
        newState.winner = newState.currentTurn === 'white' ? 1 : 0;
      } else {
        newState.stalemate = true;
        newState.status = 'finished';
        newState.winner = null;
      }
    }

    // Check for 50-move rule
    if (newState.halfMoveClock >= 100) {
      newState.stalemate = true;
      newState.status = 'finished';
      newState.winner = null;
    }

    return newState;
  }

  private isKingInCheck(state: ChessState, color: PieceColor): boolean {
    // Find king position
    let kingPos: { row: number; col: number } | null = null;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row][col];
        if (piece && piece.type === 'king' && piece.color === color) {
          kingPos = { row, col };
          break;
        }
      }
      if (kingPos) break;
    }

    if (!kingPos) return true; // King captured (shouldn't happen)

    // Check if any opponent piece can attack the king
    const opponentColor = color === 'white' ? 'black' : 'white';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row][col];
        if (piece && piece.color === opponentColor) {
          const move: ChessMove = { from: { row, col }, to: kingPos };
          if (this.validatePieceMove(state, move, piece)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  getLegalMoves(state: ChessState): ChessMove[] {
    const moves: ChessMove[] = [];
    const currentColor = state.currentTurn;

    for (let fromRow = 0; fromRow < 8; fromRow++) {
      for (let fromCol = 0; fromCol < 8; fromCol++) {
        const piece = state.board[fromRow][fromCol];
        if (piece && piece.color === currentColor) {
          const pieceMoves = this.getMovesForPiece(state, fromRow, fromCol, piece);
          moves.push(...pieceMoves);
        }
      }
    }

    return moves;
  }

  private getMovesForPiece(state: ChessState, fromRow: number, fromCol: number, piece: ChessPiece): ChessMove[] {
    const moves: ChessMove[] = [];

    for (let toRow = 0; toRow < 8; toRow++) {
      for (let toCol = 0; toCol < 8; toCol++) {
        const move: ChessMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };

        // Handle pawn promotion
        if (piece.type === 'pawn') {
          const promotionRow = piece.color === 'white' ? 0 : 7;
          if (toRow === promotionRow) {
            for (const promotionType of ['queen', 'rook', 'bishop', 'knight'] as PieceType[]) {
              const promoMove = { ...move, promotion: promotionType };
              if (this.isValidMove(state, promoMove, state.currentPlayerIndex)) {
                moves.push(promoMove);
              }
            }
            continue;
          }
        }

        // Handle en passant
        if (piece.type === 'pawn' && state.enPassantTarget) {
          if (toRow === state.enPassantTarget.row && toCol === state.enPassantTarget.col) {
            const enPassantMove = { ...move, enPassant: true };
            if (this.isValidMove(state, enPassantMove, state.currentPlayerIndex)) {
              moves.push(enPassantMove);
            }
            continue;
          }
        }

        // Handle castling
        if (piece.type === 'king' && !piece.hasMoved) {
          if (toCol === 6 && toRow === fromRow) {
            const castleMove = { ...move, castle: 'kingside' };
            if (this.isValidMove(state, castleMove, state.currentPlayerIndex)) {
              moves.push(castleMove);
            }
          }
          if (toCol === 2 && toRow === fromRow) {
            const castleMove = { ...move, castle: 'queenside' };
            if (this.isValidMove(state, castleMove, state.currentPlayerIndex)) {
              moves.push(castleMove);
            }
          }
        }

        if (this.isValidMove(state, move, state.currentPlayerIndex)) {
          moves.push(move);
        }
      }
    }

    return moves;
  }

  checkGameOver(state: ChessState): { isOver: boolean; winner: number | null } {
    return {
      isOver: state.status === 'finished',
      winner: state.winner,
    };
  }

  getAIMove(state: ChessState, difficulty: Difficulty): ChessMove {
    const moves = this.getLegalMoves(state);
    if (moves.length === 0) {
      return { from: { row: 0, col: 0 }, to: { row: 0, col: 0 } };
    }

    switch (difficulty) {
      case 'easy':
        return getRandomMove(moves);

      case 'medium':
        // Prefer captures and checks
        const scoredMoves = moves.map((move) => {
          let score = 0;
          const destPiece = state.board[move.to.row][move.to.col];
          if (destPiece) {
            score += this.getPieceValue(destPiece.type) * 10;
          }

          // Prefer checks
          const testState = this.applyMoveRaw(state, move);
          if (this.isKingInCheck(testState, state.currentTurn === 'white' ? 'black' : 'white')) {
            score += 5;
          }

          return { move, score };
        });

        scoredMoves.sort((a, b) => b.score - a.score);
        // Pick from top 3 moves to add variety
        const topMoves = scoredMoves.slice(0, Math.min(3, scoredMoves.length));
        return getRandomMove(topMoves.map((m) => m.move));

      case 'hard':
        // Use piece-square tables and material evaluation
        const bestMoves = moves.map((move) => {
          let score = 0;
          const destPiece = state.board[move.to.row][move.to.col];
          if (destPiece) {
            score += this.getPieceValue(destPiece.type) * 10;
          }

          // Position evaluation using simplified piece-square tables
          score += this.getPositionValue(state.board[move.from.row][move.from.col]!.type, move.to.row, move.to.col, state.currentTurn);

          // Prefer checks
          const testState = this.applyMoveRaw(state, move);
          if (this.isKingInCheck(testState, state.currentTurn === 'white' ? 'black' : 'white')) {
            score += 5;
          }

          // Avoid moving into check
          if (this.isKingInCheck(testState, state.currentTurn)) {
            score -= 100;
          }

          return { move, score };
        });

        bestMoves.sort((a, b) => b.score - a.score);
        return bestMoves[0].move;

      default:
        return getRandomMove(moves);
    }
  }

  private getPieceValue(type: PieceType): number {
    const values: Record<PieceType, number> = {
      pawn: 1,
      knight: 3,
      bishop: 3,
      rook: 5,
      queen: 9,
      king: 0,
    };
    return values[type];
  }

  private getPositionValue(type: PieceType, row: number, col: number, color: PieceColor): number {
    // Simplified position evaluation - prefer center control
    const centerBonus = (3.5 - Math.abs(row - 3.5)) + (3.5 - Math.abs(col - 3.5));
    return centerBonus;
  }

  serialize(state: ChessState): string {
    return JSON.stringify(state);
  }

  deserialize(data: string): ChessState {
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
