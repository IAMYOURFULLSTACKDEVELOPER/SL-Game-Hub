import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ScrabbleEngine, SCRABBLE_MANIFEST, SCRABBLE_SQUARES, TILE_DISTRIBUTION, analyzePlay, type ScrabbleState, type Tile } from './scrabble';
import { createPlayer } from '../games';

const WORDS = ['CAT', 'CATS', 'AT', 'TA', 'ACT', 'SCAT', 'HAT', 'QI', 'ZA', 'TEA', 'EAT', 'ATE'];
const t = (letter: string, value?: number): Tile => ({ letter, value: value ?? (TILE_DISTRIBUTION.find((x) => x.letter === letter)!.value), isBlank: letter === '' || undefined });
const setup = (rack: Tile[], other: Tile[] = [t('S'), t('E'), t('A'), t('T'), t('H'), t('Q'), t('I')]) => {
  const engine = new ScrabbleEngine(WORDS);
  const s = engine.initialize([createPlayer('1', 'A'), createPlayer('2', 'B')]);
  s.currentPlayerIndex = 0;
  s.racks = [rack, other];
  return { engine, s };
};
const cat = [t('C'), t('A'), t('T'), t('S'), t('E'), t('E'), t('E')];
const playCat = (s: ScrabbleState) => [0, 1, 2].map((i) => ({ row: 7, col: 6 + i, rackIndex: i, letter: 'CAT'[i] }));

describe('Scrabble', () => {
  it('has 100 tiles with two blanks and 7-tile racks', () => {
    assert.strictEqual(TILE_DISTRIBUTION.reduce((s, x) => s + x.count, 0), 100);
    const e = new ScrabbleEngine();
    const s = e.initialize([createPlayer('1', 'A'), createPlayer('2', 'B'), createPlayer('3', 'C')]);
    assert.ok(s.racks.every((r) => r.length === 7));
    assert.strictEqual(s.bag.length, 100 - 21);
    assert.strictEqual(SCRABBLE_MANIFEST.maxPlayers, 4);
  });

  it('board premiums match the standard layout', () => {
    const count = (k: string) => SCRABBLE_SQUARES.flat().filter((x) => x === k).length;
    assert.strictEqual(count('triple_word'), 8);
    assert.strictEqual(count('double_word'), 16);
    assert.strictEqual(count('triple_letter'), 12);
    assert.strictEqual(count('double_letter'), 24);
    assert.strictEqual(SCRABBLE_SQUARES[7][7], 'center');
    assert.strictEqual(SCRABBLE_SQUARES[0][3], 'double_letter'); // A4
    assert.strictEqual(SCRABBLE_SQUARES[1][5], 'triple_letter'); // B6
  });

  it('first word must cover H8 and the centre doubles the word', () => {
    const { engine, s } = setup(cat);
    assert.strictEqual(engine.isValidMove(s, { type: 'play', placements: [0, 1, 2].map((i) => ({ row: 0, col: i, rackIndex: i, letter: 'CAT'[i] })) }, 0), false);
    const a = analyzePlay(s, playCat(s));
    assert.ok(a.ok && a.score === 10); // (3+1+1) x 2
  });

  it('rejects invalid words, diagonals and gaps', () => {
    const { engine, s } = setup([t('T'), t('A'), t('C'), t('E'), t('E'), t('E'), t('E')]);
    assert.strictEqual(engine.isValidMove(s, { type: 'play', placements: [0, 1, 2].map((i) => ({ row: 7, col: 6 + i, rackIndex: i, letter: 'TAC'[i] })) }, 0), false);
    assert.strictEqual(engine.isValidMove(s, { type: 'play', placements: [{ row: 7, col: 7, rackIndex: 0, letter: 'T' }, { row: 8, col: 8, rackIndex: 1, letter: 'A' }] }, 0), false);
    assert.strictEqual(engine.isValidMove(s, { type: 'play', placements: [{ row: 7, col: 7, rackIndex: 0, letter: 'T' }, { row: 7, col: 9, rackIndex: 1, letter: 'A' }] }, 0), false);
  });

  it('scores the whole word including existing tiles, and cross words', () => {
    const { engine, s } = setup(cat);
    let g = engine.applyMove(s, { type: 'play', placements: playCat(s) });
    assert.strictEqual(g.scores[0], 10);
    // B adds S to make CATS at H9 (col index 9): C3 A1 T1 S1 = 6, no premium at H10
    const sIdx = g.racks[1].findIndex((x) => x.letter === 'S');
    g = engine.applyMove(g, { type: 'play', placements: [{ row: 7, col: 9, rackIndex: sIdx, letter: 'S' }] });
    assert.strictEqual(g.scores[1], 6);
    assert.strictEqual(g.racks[1].length, 7);
  });

  it('blank tiles score zero', () => {
    const { engine, s } = setup([t('C'), t(''), t('T'), t('E'), t('E'), t('E'), t('E')]);
    const g = engine.applyMove(s, { type: 'play', placements: [0, 1, 2].map((i) => ({ row: 7, col: 6 + i, rackIndex: i, letter: 'CAT'[i] })) });
    assert.strictEqual(g.scores[0], 8); // (3+0+1) x 2
    assert.strictEqual(g.board[7][7]!.isBlank, true);
  });

  it('exchange needs 7 tiles in the bag; passes end the game', () => {
    const { engine, s } = setup(cat);
    assert.ok(engine.isValidMove(s, { type: 'exchange', indices: [0, 1] }, 0));
    assert.strictEqual(engine.isValidMove({ ...s, bag: s.bag.slice(0, 6) }, { type: 'exchange', indices: [0] }, 0), false);
    let g = s;
    for (let i = 0; i < 4; i++) g = engine.applyMove(g, { type: 'pass' });
    assert.strictEqual(g.status, 'finished');
    assert.ok(g.endAdjustments!.every((x) => x < 0));
  });

  it('going out adds opponents\u2019 remaining tiles', () => {
    const { engine, s } = setup([t('A'), t('T')]);
    const g = engine.applyMove({ ...s, bag: [] }, { type: 'play', placements: [{ row: 7, col: 7, rackIndex: 0, letter: 'A' }, { row: 7, col: 8, rackIndex: 1, letter: 'T' }] });
    assert.strictEqual(g.status, 'finished');
    const other = s.racks[1].reduce((x, y) => x + y.value, 0);
    assert.strictEqual(g.scores[0], 4 + other);
    assert.strictEqual(g.winner, 0);
  });

  it('bot finds a legal play', () => {
    const { engine, s } = setup(cat);
    const m = engine.getAIMove(s, 'hard');
    assert.strictEqual(m.type, 'play');
    assert.ok(engine.isValidMove(s, m, 0));
  });

  it('serializes', () => {
    const { engine, s } = setup(cat);
    assert.strictEqual(JSON.stringify(engine.deserialize(engine.serialize(s)).racks), JSON.stringify(s.racks));
  });
});
