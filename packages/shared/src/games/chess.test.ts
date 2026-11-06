import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ChessEngine, CHESS_MANIFEST } from './chess';
import { createPlayer } from '../games';

describe('ChessEngine', () => {
  const engine = new ChessEngine();

  it('should initialize a chess game', () => {
    const players = [
      createPlayer('1', 'White Player', false),
      createPlayer('2', 'Black Player', false),
    ];
    const state = engine.initialize(players);

    assert.strictEqual(state.gameId, CHESS_MANIFEST.id);
    assert.strictEqual(state.currentTurn, 'white');
    assert.strictEqual(state.board[6][4]?.type, 'pawn');
    assert.strictEqual(state.board[7][4]?.type, 'king');
    assert.strictEqual(state.inCheck, false);
  });

  it('should validate pawn moves', () => {
    const players = [
      createPlayer('1', 'White', false),
      createPlayer('2', 'Black', false),
    ];
    const state = engine.initialize(players);

    // Valid pawn move
    const validMove = {
      from: { row: 6, col: 4 },
      to: { row: 5, col: 4 },
    };
    assert.strictEqual(engine.isValidMove(state, validMove, 0), true);

    // Invalid backward move
    const invalidMove = {
      from: { row: 6, col: 4 },
      to: { row: 7, col: 4 },
    };
    assert.strictEqual(engine.isValidMove(state, invalidMove, 0), false);
  });

  it('should validate knight moves', () => {
    const players = [
      createPlayer('1', 'White', false),
      createPlayer('2', 'Black', false),
    ];
    const state = engine.initialize(players);

    // Valid knight move
    const validMove = {
      from: { row: 7, col: 1 },
      to: { row: 5, col: 2 },
    };
    assert.strictEqual(engine.isValidMove(state, validMove, 0), true);

    // Invalid knight move
    const invalidMove = {
      from: { row: 7, col: 1 },
      to: { row: 5, col: 1 },
    };
    assert.strictEqual(engine.isValidMove(state, invalidMove, 0), false);
  });

  it('should apply pawn move and switch turn', () => {
    const players = [
      createPlayer('1', 'White', false),
      createPlayer('2', 'Black', false),
    ];
    const state = engine.initialize(players);

    const move = {
      from: { row: 6, col: 4 },
      to: { row: 5, col: 4 },
    };
    const newState = engine.applyMove(state, move);

    assert.strictEqual(newState.board[5][4]?.type, 'pawn');
    assert.strictEqual(newState.board[6][4], null);
    assert.strictEqual(newState.currentTurn, 'black');
    assert.strictEqual(newState.currentPlayerIndex, 1);
  });

  it('should detect check', () => {
    const players = [
      createPlayer('1', 'White', false),
      createPlayer('2', 'Black', false),
    ];
    const state = engine.initialize(players);

    // Scholar's mate setup
    let state1 = engine.applyMove(state, { from: { row: 6, col: 5 }, to: { row: 5, col: 5 } });
    state1 = engine.applyMove(state1, { from: { row: 1, col: 4 }, to: { row: 3, col: 4 } });
    state1 = engine.applyMove(state1, { from: { row: 7, col: 6 }, to: { row: 5, col: 5 } });
    state1 = engine.applyMove(state1, { from: { row: 0, col: 3 }, to: { row: 4, col: 7 } });

    assert.strictEqual(state1.inCheck, true);
  });

  it('should prevent moving into check', () => {
    const players = [
      createPlayer('1', 'White', false),
      createPlayer('2', 'Black', false),
    ];
    const state = engine.initialize(players);

    // Move white king into check position
    const invalidMove = {
      from: { row: 7, col: 4 },
      to: { row: 6, col: 4 },
    };
    assert.strictEqual(engine.isValidMove(state, invalidMove, 0), false);
  });

  it('should get legal moves', () => {
    const players = [
      createPlayer('1', 'White', false),
      createPlayer('2', 'Black', false),
    ];
    const state = engine.initialize(players);

    const moves = engine.getLegalMoves(state);
    assert.ok(moves.length > 0);
  });

  it('should serialize and deserialize state', () => {
    const players = [
      createPlayer('1', 'White', false),
      createPlayer('2', 'Black', false),
    ];
    const state = engine.initialize(players);

    const serialized = engine.serialize(state);
    const deserialized = engine.deserialize(serialized);

    assert.strictEqual(deserialized.gameId, state.gameId);
    assert.strictEqual(deserialized.currentTurn, state.currentTurn);
    assert.strictEqual(deserialized.board.length, 8);
  });
});
