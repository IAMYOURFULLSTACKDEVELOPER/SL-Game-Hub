import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CheckersEngine, CHECKERS_MANIFEST } from './checkers';
import { createPlayer } from '../games';

describe('Checkers Game', () => {
  const engine = new CheckersEngine();

  describe('manifest', () => {
    it('should have correct manifest', () => {
      assert.strictEqual(CHECKERS_MANIFEST.id, 'checkers');
      assert.strictEqual(CHECKERS_MANIFEST.name, 'Checkers');
      assert.strictEqual(CHECKERS_MANIFEST.minPlayers, 2);
      assert.strictEqual(CHECKERS_MANIFEST.maxPlayers, 2);
      assert.deepStrictEqual(CHECKERS_MANIFEST.modes, ['single', 'multi']);
    });
  });

  describe('initialization', () => {
    it('should initialize game state', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      assert.strictEqual(state.gameId, 'checkers');
      assert.strictEqual(state.players.length, 2);
      assert.strictEqual(state.status, 'playing');
      assert.strictEqual(state.currentTurn, 'red');
      assert.strictEqual(state.redPieces, 12);
      assert.strictEqual(state.blackPieces, 12);
      assert.strictEqual(state.board.length, 64);
    });

    it('should place pieces correctly', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      // Check that red pieces are in top rows
      let redCount = 0;
      for (let i = 0; i < 24; i++) {
        if (state.board[i] === 'red') redCount++;
      }
      assert.strictEqual(redCount, 12);

      // Check that black pieces are in bottom rows
      let blackCount = 0;
      for (let i = 40; i < 64; i++) {
        if (state.board[i] === 'black') blackCount++;
      }
      assert.strictEqual(blackCount, 12);
    });
  });

  describe('move validation', () => {
    it('should allow valid moves from legal moves list', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      const moves = engine.getLegalMoves(state);
      assert.ok(moves.length > 0);

      // Test that at least one move from the list is valid
      const isValid = engine.isValidMove(state, moves[0], 0);
      assert.strictEqual(isValid, true);
    });

    it('should reject moves from wrong player', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      const moves = engine.getLegalMoves(state);
      if (moves.length > 0) {
        assert.strictEqual(engine.isValidMove(state, moves[0], 1), false);
      }
    });

    it('should reject moves when game is finished', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);
      state.status = 'finished';

      const move: any = { from: 1, to: 9, isJump: false };
      assert.strictEqual(engine.isValidMove(state, move, 0), false);
    });
  });

  describe('move application', () => {
    it('should move piece to new position', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      const move: any = { from: 1, to: 9, isJump: false };
      const nextState = engine.applyMove(state, move);

      assert.strictEqual(nextState.board[1], null);
      assert.strictEqual(nextState.board[9], 'red');
    });

    it('should switch turns after move', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      const move: any = { from: 1, to: 9, isJump: false };
      const nextState = engine.applyMove(state, move);

      assert.strictEqual(nextState.currentTurn, 'black');
      assert.strictEqual(nextState.currentPlayerIndex, 1);
    });

    it('should capture opponent piece on jump', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      // Set up a jump scenario - red at 5, black at 10, target 15
      state.board[5] = 'red';
      state.board[10] = 'black';
      state.board[15] = null;

      const move: any = { from: 5, to: 15, isJump: true };
      const nextState = engine.applyMove(state, move);

      assert.strictEqual(nextState.board[10], null);
      assert.strictEqual(nextState.blackPieces, 11);
    });

    it('should promote piece to king at end', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      // Place red piece near promotion
      state.board[55] = 'red';
      state.board[60] = null;
      state.board[61] = null;
      state.board[62] = null;
      state.board[63] = null;

      const move: any = { from: 55, to: 62, isJump: false };
      const nextState = engine.applyMove(state, move);

      assert.strictEqual(nextState.board[62], 'red_king');
    });
  });

  describe('legal moves', () => {
    it('should return legal moves for piece', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      const moves = engine.getLegalMoves(state);
      assert.ok(moves.length > 0);
    });
  });

  describe('game over detection', () => {
    it('should detect winner when all pieces captured', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      state.blackPieces = 0;
      state.status = 'finished';
      state.winner = 0;

      const result = engine.checkGameOver(state);
      assert.strictEqual(result.isOver, true);
      assert.strictEqual(result.winner, 0);
    });
  });

  describe('AI moves', () => {
    it('should return a valid AI move for easy difficulty', () => {
      const player1 = createPlayer('p1', 'Player 1', true, 'easy');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'easy');
      assert.ok(legalMoves.some((m) => m.from === move.from && m.to === move.to));
    });

    it('should return a valid AI move for medium difficulty', () => {
      const player1 = createPlayer('p1', 'Player 1', true, 'medium');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'medium');
      assert.ok(legalMoves.some((m) => m.from === move.from && m.to === move.to));
    });

    it('should return a valid AI move for hard difficulty', () => {
      const player1 = createPlayer('p1', 'Player 1', true, 'hard');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'hard');
      assert.ok(legalMoves.some((m) => m.from === move.from && m.to === move.to));
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize state', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      const serialized = engine.serialize(state);
      const deserialized = engine.deserialize(serialized);

      assert.strictEqual(deserialized.gameId, state.gameId);
      assert.strictEqual(deserialized.players[0].id, state.players[0].id);
      assert.strictEqual(deserialized.status, state.status);
      assert.strictEqual(deserialized.redPieces, state.redPieces);
      assert.strictEqual(deserialized.blackPieces, state.blackPieces);
    });
  });
});
