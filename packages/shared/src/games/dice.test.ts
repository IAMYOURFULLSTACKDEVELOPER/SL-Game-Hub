import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DiceEngine, DICE_MANIFEST, scoreRoll, rollDice } from './dice';
import { createPlayer } from '../games';

const players = (n: number) => Array.from({ length: n }, (_, i) => createPlayer(`p${i}`, `Player ${i + 1}`));

describe('Dice Game', () => {
  const engine = new DiceEngine();

  it('supports 2 to 8 players', () => {
    assert.strictEqual(DICE_MANIFEST.id, 'dice');
    assert.strictEqual(DICE_MANIFEST.maxPlayers, 8);
    assert.strictEqual(engine.initialize(players(8)).scores.length, 8);
    assert.throws(() => engine.initialize(players(1)));
    assert.throws(() => engine.initialize(players(9)));
  });

  it('uses the target option', () => {
    assert.strictEqual(engine.initialize(players(2)).target, 50);
    assert.strictEqual(engine.initialize(players(2), { target: 100 }).target, 100);
  });

  it('scores rolls', () => {
    assert.strictEqual(scoreRoll([2, 5]), 7);
    assert.strictEqual(scoreRoll([3, 3]), 12);
    assert.strictEqual(scoreRoll([1, 1]), -10);
  });

  it('validates moves', () => {
    const s = engine.initialize(players(3));
    assert.strictEqual(engine.isValidMove(s, [1, 6], 0), true);
    assert.strictEqual(engine.isValidMove(s, [1, 6], 1), false);
    assert.strictEqual(engine.isValidMove(s, [0, 7], 0), false);
    assert.strictEqual(engine.getLegalMoves(s).length, 36);
  });

  it('adds points, rotates turns and never goes below zero', () => {
    let s = engine.initialize(players(3));
    s = engine.applyMove(s, [2, 3]);
    assert.deepStrictEqual(s.scores, [5, 0, 0]);
    assert.strictEqual(s.currentPlayerIndex, 1);
    s = engine.applyMove(s, [1, 1]);
    assert.deepStrictEqual(s.scores, [5, 0, 0]);
    s = engine.applyMove(s, [4, 4]);
    assert.deepStrictEqual(s.scores, [5, 0, 16]);
    assert.strictEqual(s.currentPlayerIndex, 0);
  });

  it('declares a winner at the target', () => {
    let s = engine.initialize(players(2), { target: 20 });
    s = engine.applyMove(s, [6, 6]);
    assert.strictEqual(s.status, 'finished');
    assert.strictEqual(s.winner, 0);
    assert.deepStrictEqual(engine.checkGameOver(s), { isOver: true, winner: 0 });
    assert.strictEqual(engine.isValidMove(s, [1, 2], 0), false);
  });

  it('rolls valid dice and round-trips state', () => {
    for (let i = 0; i < 50; i++) rollDice().forEach((d) => assert.ok(d >= 1 && d <= 6));
    const s = engine.initialize(players(4));
    const copy = engine.deserialize(engine.serialize(s));
    assert.deepStrictEqual(copy.scores, s.scores);
    assert.deepStrictEqual(copy.players.map((p) => p.name), s.players.map((p) => p.name));
    assert.strictEqual(copy.target, s.target);
  });
});
