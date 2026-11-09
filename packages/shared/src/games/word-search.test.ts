import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  WordSearchEngine, WORD_SEARCH_MANIFEST, WORD_SEARCH_LEVELS, WORD_SEARCH_BOARD_COUNT, WORD_SEARCH_POINTS,
  getWordSearchBoard, selectionPath, dailyChallenge, difficultyForBoard, type WordSearchState,
} from './word-search';
import { createPlayer } from '../games';

const engine = new WordSearchEngine();
const solo = (board = 200, round = 1) => engine.initialize([createPlayer('p1', 'Player 1')], { board, round });
const endpoints = (s: WordSearchState, i: number) => ({ start: s.words[i].positions[0], end: s.words[i].positions.at(-1)! });

describe('Word Search boards', () => {
  it('has 500 boards, each with a bank of 30+ words that fit its difficulty', () => {
    assert.strictEqual(WORD_SEARCH_BOARD_COUNT, 500);
    for (let n = 1; n <= 500; n++) {
      const b = getWordSearchBoard(n);
      const lvl = WORD_SEARCH_LEVELS[b.difficulty];
      assert.ok(b.bank.length >= 30, `board ${n} (${b.theme}) has only ${b.bank.length} words`);
      assert.ok(b.bank.every((w) => w.length >= lvl.minLen && w.length <= lvl.maxLen), `board ${n} word length`);
    }
  });

  it('assigns difficulty tiers by board number', () => {
    assert.strictEqual(difficultyForBoard(1), 'easy');
    assert.strictEqual(difficultyForBoard(125), 'easy');
    assert.strictEqual(difficultyForBoard(126), 'medium');
    assert.strictEqual(difficultyForBoard(300), 'hard');
    assert.strictEqual(difficultyForBoard(500), 'expert');
  });

  it('boards are deterministic', () => {
    assert.deepStrictEqual(getWordSearchBoard(42), getWordSearchBoard(42));
    const a = solo(300, 7), b = solo(300, 7);
    assert.deepStrictEqual(a.grid, b.grid);
  });

  it('daily challenge is stable for a date', () => {
    const d = new Date('2026-11-09T10:00:00Z');
    assert.deepStrictEqual(dailyChallenge(d), dailyChallenge(new Date('2026-11-09T23:00:00Z')));
    assert.ok(dailyChallenge(d).board >= 1 && dailyChallenge(d).board <= 500);
  });
});

describe('Word Search puzzles', () => {
  for (const [board, diff] of [[1, 'easy'], [130, 'medium'], [260, 'hard'], [400, 'expert']] as const) {
    it(`${diff} puzzle uses the level's grid, word count and directions`, () => {
      for (let round = 0; round < 5; round++) {
        const s = solo(board, round);
        const lvl = WORD_SEARCH_LEVELS[diff];
        assert.strictEqual(s.gridSize, lvl.gridSize);
        assert.strictEqual(s.grid.length, lvl.gridSize ** 2);
        assert.strictEqual(s.words.length, lvl.wordCount);
        for (const w of s.words) {
          assert.strictEqual(w.positions.map((p) => s.grid[p]).join(''), w.word);
          const path = selectionPath(w.positions[0], w.positions.at(-1)!, s.gridSize);
          assert.deepStrictEqual(path, w.positions);
          const step = w.positions[1] - w.positions[0];
          if (diff === 'easy') assert.ok(step === 1 || step === s.gridSize, 'easy is left-to-right / top-to-bottom only');
        }
      }
    });
  }

  it('selectionPath rejects lines that are not straight', () => {
    assert.strictEqual(selectionPath(0, 12, 10), null);
    assert.deepStrictEqual(selectionPath(0, 22, 10), [0, 11, 22]);
    assert.deepStrictEqual(selectionPath(9, 0, 10), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });
});

describe('Word Search play', () => {
  it('manifest supports solo and multiplayer', () => {
    assert.strictEqual(WORD_SEARCH_MANIFEST.id, 'word-search');
    assert.strictEqual(WORD_SEARCH_MANIFEST.maxPlayers, 4);
    assert.deepStrictEqual(WORD_SEARCH_MANIFEST.modes, ['single', 'multi']);
  });

  it('scores a found word forwards or backwards', () => {
    const s = solo();
    const fwd = engine.applyMove(s, endpoints(s, 0));
    assert.ok(fwd.words[0].found);
    assert.strictEqual(fwd.scores[0], WORD_SEARCH_POINTS.find + WORD_SEARCH_POINTS.noHintBonus);
    const { start, end } = endpoints(s, 1);
    const back = engine.applyMove(fwd, { start: end, end: start });
    assert.ok(back.words[1].found);
  });

  it('wrong selections score 0 and count against accuracy', () => {
    const s = solo();
    const next = engine.applyMove(s, { start: 0, end: 0 });
    assert.strictEqual(next.scores[0], 0);
    assert.strictEqual(next.selections, 1);
    assert.strictEqual(next.correctSelections, 0);
  });

  it('hints cost 25 and remove the no-hint bonus', () => {
    let s = engine.useHint(solo());
    assert.strictEqual(s.scores[0], WORD_SEARCH_POINTS.hint);
    const i = s.words.findIndex((w) => w.word === s.hint!.word);
    s = engine.applyMove(s, endpoints(s, i));
    assert.strictEqual(s.scores[0], WORD_SEARCH_POINTS.hint + WORD_SEARCH_POINTS.find);
  });

  it('finishing awards the completion bonus', () => {
    let s = solo(1, 3);
    for (let i = 0; i < s.words.length; i++) s = engine.applyMove(s, endpoints(s, i));
    assert.strictEqual(s.status, 'finished');
    assert.strictEqual(s.scores[0], s.words.length * 150 + WORD_SEARCH_POINTS.complete);
  });

  it('multiplayer: wrong selection passes the turn, correct keeps it', () => {
    let s = engine.initialize([createPlayer('a', 'A'), createPlayer('b', 'B')], { board: 10, round: 1 });
    s = engine.applyMove(s, endpoints(s, 0));
    assert.strictEqual(s.currentPlayerIndex, 0);
    s = engine.applyMove(s, { start: 0, end: 0 });
    assert.strictEqual(s.currentPlayerIndex, 1);
  });

  it('timer expiry ends the game', () => {
    const s = engine.expire(solo());
    assert.strictEqual(s.status, 'finished');
    assert.ok(s.timedOut);
  });

  it('custom word lists build a puzzle', () => {
    const s = engine.initialize([createPlayer('p', 'P')], { words: ['apple', 'banana', 'orange', 'mango', 'grapes'], difficulty: 'medium', round: 1 });
    assert.strictEqual(s.words.length, 5);
    assert.strictEqual(s.boardNumber, null);
  });

  it('AI hard always finds a word; serialization round-trips', () => {
    const s = solo();
    const next = engine.applyMove(s, engine.getAIMove(s, 'hard'));
    assert.strictEqual(next.foundWords.length, 1);
    assert.deepStrictEqual(engine.deserialize(engine.serialize(s)).grid, s.grid);
  });
});
