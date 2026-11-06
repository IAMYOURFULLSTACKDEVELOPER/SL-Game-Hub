import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SnakeAndLadderEngine, SNAKE_AND_LADDER_MANIFEST } from './snake-and-ladder';
import { createPlayer } from '../games';

describe('Snake & Ladder Game', () => {
  const engine = new SnakeAndLadderEngine();

  describe('manifest', () => {
    it('should have correct manifest', () => {
      assert.strictEqual(SNAKE_AND_LADDER_MANIFEST.id, 'snake-and-ladder');
      assert.strictEqual(SNAKE_AND_LADDER_MANIFEST.name, 'Snake & Ladder');
      assert.strictEqual(SNAKE_AND_LADDER_MANIFEST.minPlayers, 2);
      assert.strictEqual(SNAKE_AND_LADDER_MANIFEST.maxPlayers, 4);
      assert.deepStrictEqual(SNAKE_AND_LADDER_MANIFEST.modes, ['single', 'multi']);
    });
  });

  describe('initialization', () => {
    it('should initialize game state', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      assert.strictEqual(state.gameId, 'snake-and-ladder');
      assert.strictEqual(state.players.length, 2);
      assert.strictEqual(state.status, 'playing');
      assert.strictEqual(state.playerPositions[0], 1);
      assert.strictEqual(state.playerPositions[1], 1);
      assert.strictEqual(state.boardSize, 10);
    });

    it('should start at position 1 for all players', () => {
      const players = [
        createPlayer('p1', 'Player 1'),
        createPlayer('p2', 'Player 2'),
        createPlayer('p3', 'Player 3'),
      ];
      const state = engine.initialize(players);

      assert.deepStrictEqual(state.playerPositions, [1, 1, 1]);
    });
  });

  describe('move validation', () => {
    it('should allow valid dice rolls', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      assert.strictEqual(engine.isValidMove(state, 1, 0), true);
      assert.strictEqual(engine.isValidMove(state, 6, 0), true);
    });

    it('should reject invalid dice rolls', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      assert.strictEqual(engine.isValidMove(state, 0, 0), false);
      assert.strictEqual(engine.isValidMove(state, 7, 0), false);
    });

    it('should reject moves from wrong player', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      assert.strictEqual(engine.isValidMove(state, 3, 1), false);
    });

    it('should reject moves when game is finished', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);
      state.status = 'finished';

      assert.strictEqual(engine.isValidMove(state, 3, 0), false);
    });
  });

  describe('move application', () => {
    it('should move player forward', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      const nextState = engine.applyMove(state, 4);
      assert.strictEqual(nextState.playerPositions[0], 5);
      assert.strictEqual(nextState.diceValue, 4);
    });

    it('should rotate to next player', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      const nextState = engine.applyMove(state, 3);
      assert.strictEqual(nextState.currentPlayerIndex, 1);
    });

    it('should handle snake slide', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      // Move player to position 15, then roll 1 to land on 16 (snake to 6)
      state.playerPositions[0] = 15;
      const nextState = engine.applyMove(state, 1);

      assert.strictEqual(nextState.playerPositions[0], 6);
    });

    it('should handle ladder climb', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      // Move player to position 0 (needs to be at 0 to land on 1 with roll 1)
      state.playerPositions[0] = 0;
      const nextState = engine.applyMove(state, 1);

      assert.strictEqual(nextState.playerPositions[0], 38); // ladder from 1 to 38
    });

    it('should bounce back when exceeding 100', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      // Move player to position 97, then roll 4 (would be 101, bounce to 99)
      state.playerPositions[0] = 97;
      const nextState = engine.applyMove(state, 4);

      assert.strictEqual(nextState.playerPositions[0], 99);
    });

    it('should detect winner when reaching 100', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      // Move player to position 99, then roll 1
      state.playerPositions[0] = 99;
      const nextState = engine.applyMove(state, 1);

      assert.strictEqual(nextState.status, 'finished');
      assert.strictEqual(nextState.winner, 0);
    });
  });

  describe('legal moves', () => {
    it('should return all dice values', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      const moves = engine.getLegalMoves(state);
      assert.deepStrictEqual(moves, [1, 2, 3, 4, 5, 6]);
    });
  });

  describe('AI moves', () => {
    it('should return a valid AI move for easy difficulty', () => {
      const player1 = createPlayer('p1', 'Player 1', true, 'easy');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'easy');
      assert.ok(legalMoves.includes(move));
    });

    it('should return a valid AI move for medium difficulty', () => {
      const player1 = createPlayer('p1', 'Player 1', true, 'medium');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'medium');
      assert.ok(legalMoves.includes(move));
    });

    it('should return a valid AI move for hard difficulty', () => {
      const player1 = createPlayer('p1', 'Player 1', true, 'hard');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'hard');
      assert.ok(legalMoves.includes(move));
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
      assert.deepStrictEqual(deserialized.playerPositions, state.playerPositions);
    });
  });
});
