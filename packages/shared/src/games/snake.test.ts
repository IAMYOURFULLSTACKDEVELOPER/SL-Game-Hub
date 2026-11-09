import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SnakeEngine, SNAKE_MANIFEST } from './snake';
import { createPlayer } from '../games';

describe('Snake Game', () => {
  const engine = new SnakeEngine(10, 200);

  describe('manifest', () => {
    it('should have correct manifest', () => {
      assert.strictEqual(SNAKE_MANIFEST.id, 'snake');
      assert.strictEqual(SNAKE_MANIFEST.name, 'Snake');
      assert.strictEqual(SNAKE_MANIFEST.minPlayers, 1);
      assert.strictEqual(SNAKE_MANIFEST.maxPlayers, 1);
      assert.deepStrictEqual(SNAKE_MANIFEST.modes, ['single']);
    });
  });

  describe('initialization', () => {
    it('should initialize game state', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      assert.strictEqual(state.gameId, 'snake');
      assert.strictEqual(state.players.length, 1);
      assert.strictEqual(state.status, 'playing');
      assert.strictEqual(state.score, 0);
      assert.strictEqual(state.snake.length, 1);
      assert.strictEqual(state.boardSize, 10);
    });

    it('should use custom options', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player], { boardSize: 15, speed: 150 });

      assert.strictEqual(state.boardSize, 15);
      assert.strictEqual(state.speed, 150);
    });
  });

  describe('move validation', () => {
    it('should allow valid moves', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      // Starting direction is right, so up, down, and right are valid
      assert.strictEqual(engine.isValidMove(state, 'up', 0), true);
      assert.strictEqual(engine.isValidMove(state, 'down', 0), true);
      assert.strictEqual(engine.isValidMove(state, 'right', 0), true);
    });

    it('should reject opposite direction', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      // Starting direction is right
      assert.strictEqual(engine.isValidMove(state, 'left', 0), false);
    });

    it('should reject moves from wrong player', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      assert.strictEqual(engine.isValidMove(state, 'up', 1), false);
    });

    it('should reject moves when game is finished', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);
      state.status = 'finished';

      assert.strictEqual(engine.isValidMove(state, 'up', 0), false);
    });
  });

  describe('move application', () => {
    it('should move snake', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);
      const nextState = engine.applyMove(state, 'up');

      assert.notDeepStrictEqual(state.snake, nextState.snake);
      assert.strictEqual(nextState.direction, 'up');
    });
  });

  describe('game progression', () => {
    it('should track score properly', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player], { boardSize: 10 });

      // Move multiple times
      let currentState = state;
      for (let i = 0; i < 30; i++) {
        currentState = engine.applyMove(currentState, 'right');
      }

      // Score should be tracked
      assert.strictEqual(typeof currentState.score, 'number');
      assert.ok(currentState.score >= 0);
    });

    it('should update snake position on move', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player], { boardSize: 10 });

      const nextState = engine.applyMove(state, 'up');

      // Snake should have moved
      assert.notDeepStrictEqual(state.snake, nextState.snake);
    });

    it('should update direction on move', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player], { boardSize: 10 });

      const nextState = engine.applyMove(state, 'up');

      // Direction should be updated
      assert.strictEqual(nextState.direction, 'up');
    });

    it('should finish game when hitting wall', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player], { boardSize: 5 });

      // Create a test state at the edge
      const edgeState = { ...state, snake: [0], direction: 'up' as const };

      const nextState = engine.tick(edgeState);
      assert.strictEqual(nextState.status, 'finished');
    });
  });

  describe('legal moves', () => {
    it('should return legal moves', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      const moves = engine.getLegalMoves(state);
      assert.ok(moves.length > 0);
      assert.ok(!moves.includes('left')); // opposite of right
    });
  });

  describe('AI moves', () => {
    it('should return a valid AI move for easy difficulty', () => {
      const player = createPlayer('p1', 'Player 1', true, 'easy');
      const state = engine.initialize([player]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'easy');
      assert.ok(legalMoves.includes(move));
    });

    it('should return a valid AI move for medium difficulty', () => {
      const player = createPlayer('p1', 'Player 1', true, 'medium');
      const state = engine.initialize([player]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'medium');
      assert.ok(legalMoves.includes(move));
    });

    it('should return a valid AI move for hard difficulty', () => {
      const player = createPlayer('p1', 'Player 1', true, 'hard');
      const state = engine.initialize([player]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'hard');
      assert.ok(legalMoves.includes(move));
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize state', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      const serialized = engine.serialize(state);
      const deserialized = engine.deserialize(serialized);

      // Check key fields match
      assert.strictEqual(deserialized.gameId, state.gameId);
      assert.strictEqual(deserialized.players[0].id, state.players[0].id);
      assert.strictEqual(deserialized.players[0].name, state.players[0].name);
      assert.strictEqual(deserialized.status, state.status);
      assert.strictEqual(deserialized.score, state.score);
      assert.deepStrictEqual(deserialized.snake, state.snake);
    });
  });
});
