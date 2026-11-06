import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WordSearchEngine, WORD_SEARCH_MANIFEST } from './word-search';
import { createPlayer } from '../games';

describe('Word Search Game', () => {
  const engine = new WordSearchEngine();

  describe('manifest', () => {
    it('should have correct manifest', () => {
      assert.strictEqual(WORD_SEARCH_MANIFEST.id, 'word-search');
      assert.strictEqual(WORD_SEARCH_MANIFEST.name, 'Word Search');
      assert.strictEqual(WORD_SEARCH_MANIFEST.minPlayers, 1);
      assert.strictEqual(WORD_SEARCH_MANIFEST.maxPlayers, 1);
      assert.deepStrictEqual(WORD_SEARCH_MANIFEST.modes, ['single']);
    });
  });

  describe('initialization', () => {
    it('should initialize game state', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      assert.strictEqual(state.gameId, 'word-search');
      assert.strictEqual(state.players.length, 1);
      assert.strictEqual(state.status, 'playing');
      assert.strictEqual(state.gridSize, 10);
      assert.strictEqual(state.grid.length, 100);
      assert.ok(state.words.length > 0);
    });

    it('should use custom options', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player], { gridSize: 12, numWords: 5 });

      assert.strictEqual(state.gridSize, 12);
      assert.strictEqual(state.grid.length, 144);
    });
  });

  describe('move validation', () => {
    it('should allow valid word selection', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      const moves = engine.getLegalMoves(state);
      if (moves.length > 0) {
        assert.strictEqual(engine.isValidMove(state, moves[0], 0), true);
      }
    });

    it('should reject already found words', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      const moves = engine.getLegalMoves(state);
      if (moves.length > 0) {
        state.words[0].found = true;
        assert.strictEqual(engine.isValidMove(state, moves[0], 0), false);
      }
    });

    it('should reject moves from wrong player', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      const moves = engine.getLegalMoves(state);
      if (moves.length > 0) {
        assert.strictEqual(engine.isValidMove(state, moves[0], 1), false);
      }
    });

    it('should reject moves when game is finished', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);
      state.status = 'finished';

      const move: any = { word: 'TEST', start: 0, end: 5 };
      assert.strictEqual(engine.isValidMove(state, move, 0), false);
    });
  });

  describe('move application', () => {
    it('should mark word as found', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      const moves = engine.getLegalMoves(state);
      if (moves.length > 0) {
        const nextState = engine.applyMove(state, moves[0]);
        assert.ok(nextState.foundWords.includes(moves[0].word));
      }
    });

    it('should finish game when all words found', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      // Find all words one by one
      let currentState = state;
      for (const wordObj of state.words) {
        const move: any = {
          word: wordObj.word,
          start: wordObj.positions[0],
          end: wordObj.positions[wordObj.positions.length - 1],
        };
        currentState = engine.applyMove(currentState, move);
      }

      assert.strictEqual(currentState.status, 'finished');
      assert.strictEqual(currentState.winner, 0);
    });
  });

  describe('legal moves', () => {
    it('should return unfound words', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      const moves = engine.getLegalMoves(state);
      assert.ok(moves.length > 0);
      assert.ok(moves.every((m) => !state.words.find((w) => w.word === m.word)?.found));
    });
  });

  describe('AI moves', () => {
    it('should return a valid AI move for easy difficulty', () => {
      const player = createPlayer('p1', 'Player 1', true, 'easy');
      const state = engine.initialize([player]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'easy');
      assert.ok(legalMoves.some((m) => m.word === move.word));
    });

    it('should return a valid AI move for medium difficulty', () => {
      const player = createPlayer('p1', 'Player 1', true, 'medium');
      const state = engine.initialize([player]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'medium');
      assert.ok(legalMoves.some((m) => m.word === move.word));
    });

    it('should return a valid AI move for hard difficulty', () => {
      const player = createPlayer('p1', 'Player 1', true, 'hard');
      const state = engine.initialize([player]);
      const legalMoves = engine.getLegalMoves(state);

      const move = engine.getAIMove(state, 'hard');
      assert.ok(legalMoves.some((m) => m.word === move.word));
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize state', () => {
      const player = createPlayer('p1', 'Player 1');
      const state = engine.initialize([player]);

      const serialized = engine.serialize(state);
      const deserialized = engine.deserialize(serialized);

      assert.strictEqual(deserialized.gameId, state.gameId);
      assert.strictEqual(deserialized.players[0].id, state.players[0].id);
      assert.strictEqual(deserialized.status, state.status);
      assert.strictEqual(deserialized.gridSize, state.gridSize);
      assert.strictEqual(deserialized.words.length, state.words.length);
    });
  });
});
