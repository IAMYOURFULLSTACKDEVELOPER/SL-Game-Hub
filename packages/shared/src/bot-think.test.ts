import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_THINK_MS, botThinkMs, type BotThinkKind } from './bot-think';

test('bot thinking time stays inside each game\'s range (or the occasional long pause)', () => {
  for (const kind of Object.keys(BOT_THINK_MS) as BotThinkKind[]) {
    const [lo, hi] = BOT_THINK_MS[kind];
    assert.ok(lo > 0 && hi > lo, kind);
    for (let i = 0; i < 200; i++) {
      const ms = botThinkMs(kind);
      assert.ok(ms >= lo && ms <= Math.round(hi * 1.5), `${kind}: ${ms}`);
    }
  }
});

test('bot thinking time: shortest, longest and a long pause', () => {
  const seq = (...xs: number[]) => () => xs.shift()!;
  assert.equal(botThinkMs('chess', seq(0, 0.9)), 1400);
  assert.equal(botThinkMs('chess', seq(1, 0.9)), 3200);
  assert.equal(botThinkMs('chess', seq(0, 0.01)), 2100); // 1400 × 1.5
});

test('harder decisions take longer than dice rolls', () => {
  assert.ok(BOT_THINK_MS.chess[0] > BOT_THINK_MS.dice[0]);
  assert.ok(BOT_THINK_MS.scrabble[1] > BOT_THINK_MS['snake-and-ladder'][1]);
});
