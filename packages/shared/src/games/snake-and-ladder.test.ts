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
      assert.strictEqual(SNAKE_AND_LADDER_MANIFEST.maxPlayers, 6);
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
      assert.strictEqual(state.playerPositions[0], 0);
      assert.strictEqual(state.playerPositions[1], 0);
      assert.strictEqual(state.boardSize, 10);
    });

    it('should start off the board for all players', () => {
      const players = [
        createPlayer('p1', 'Player 1'),
        createPlayer('p2', 'Player 2'),
        createPlayer('p3', 'Player 3'),
      ];
      const state = engine.initialize(players);

      assert.deepStrictEqual(state.playerPositions, [0, 0, 0]);
    });

    it('should allow 2 to 6 players only', () => {
      const make = (n: number) => Array.from({ length: n }, (_, i) => createPlayer(`p${i}`, `Player ${i + 1}`));
      assert.strictEqual(engine.initialize(make(6)).playerPositions.length, 6);
      assert.throws(() => engine.initialize(make(1)));
      assert.throws(() => engine.initialize(make(7)));
    });

    it('should rotate through all 6 players and back to the first', () => {
      const players = Array.from({ length: 6 }, (_, i) => createPlayer(`p${i}`, `Player ${i + 1}`));
      let state = engine.initialize(players);
      const order: number[] = [];
      for (let i = 0; i < 7; i++) {
        order.push(state.currentPlayerIndex);
        state = engine.applyMove(state, 1);
      }
      assert.deepStrictEqual(order, [0, 1, 2, 3, 4, 5, 0]);
    });

    it('should let the sixth player win', () => {
      const players = Array.from({ length: 6 }, (_, i) => createPlayer(`p${i}`, `Player ${i + 1}`));
      const state = engine.initialize(players);
      state.currentPlayerIndex = 5;
      state.playerPositions[5] = 98;
      const next = engine.applyMove(state, 2);
      assert.strictEqual(next.status, 'finished');
      assert.strictEqual(next.winner, 5);
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

      const nextState = engine.applyMove(state, 3);
      assert.strictEqual(nextState.playerPositions[0], 3);
      assert.strictEqual(nextState.diceValue, 3);
      assert.deepStrictEqual(nextState.lastMove, { playerIndex: 0, roll: 3, from: 0, landed: 3, to: 3, kind: 'move', bounced: false, extraTurn: false });
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

      // Move player to position 25, then roll 2 to land on 27 (snake to 5)
      state.playerPositions[0] = 25;
      const nextState = engine.applyMove(state, 2);

      assert.strictEqual(nextState.playerPositions[0], 5);
      assert.strictEqual(nextState.lastMove?.kind, 'snake');
      assert.strictEqual(nextState.lastMove?.landed, 27);
    });

    it('should handle ladder climb', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      // From the start, roll 4 to land on 4 (ladder to 25)
      const nextState = engine.applyMove(state, 4);

      assert.strictEqual(nextState.playerPositions[0], 25);
      assert.strictEqual(nextState.lastMove?.kind, 'ladder');
    });

    it('should bounce back when exceeding 100', () => {
      const player1 = createPlayer('p1', 'Player 1');
      const player2 = createPlayer('p2', 'Player 2');
      const state = engine.initialize([player1, player2]);

      // Move player to position 97, then roll 5 (would be 102, bounce to 98)
      state.playerPositions[0] = 97;
      const nextState = engine.applyMove(state, 5);

      assert.strictEqual(nextState.playerPositions[0], 98);
      assert.strictEqual(nextState.lastMove?.bounced, true);
    });

    it('should slide down a snake after bouncing onto its head', () => {
      const state = engine.initialize([createPlayer('p1', 'Player 1'), createPlayer('p2', 'Player 2')]);
      state.playerPositions[0] = 97;
      const nextState = engine.applyMove(state, 4); // 101 -> bounce to 99 -> snake to 41

      assert.strictEqual(nextState.playerPositions[0], 41);
    });

    it('should give an extra roll on a six', () => {
      const state = engine.initialize([createPlayer('p1', 'Player 1'), createPlayer('p2', 'Player 2')]);
      const nextState = engine.applyMove(state, 6);

      assert.strictEqual(nextState.playerPositions[0], 6);
      assert.strictEqual(nextState.currentPlayerIndex, 0);
      assert.strictEqual(nextState.lastMove?.extraTurn, true);
      assert.strictEqual(nextState.consecutiveSixes, 1);
    });

    it('should forfeit the third six in a row and pass the turn', () => {
      const state = engine.initialize([createPlayer('p1', 'Player 1'), createPlayer('p2', 'Player 2')]);
      const s2 = engine.applyMove(engine.applyMove(state, 6), 6);
      assert.strictEqual(s2.playerPositions[0], 12);
      const s3 = engine.applyMove(s2, 6);

      assert.strictEqual(s3.playerPositions[0], 12);
      assert.strictEqual(s3.lastMove?.kind, 'forfeit');
      assert.strictEqual(s3.currentPlayerIndex, 1);
      assert.strictEqual(s3.consecutiveSixes, 0);
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
