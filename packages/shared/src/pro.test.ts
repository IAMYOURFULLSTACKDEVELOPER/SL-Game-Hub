import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extendPro, isProActive, dayKey, PRO_DAYS } from './pro';

const DAY = 24 * 60 * 60 * 1000;

test('paying adds 30 days, on top of any time left', () => {
  const now = Date.UTC(2026, 10, 14);
  assert.equal(extendPro(null, now), now + PRO_DAYS * DAY);
  assert.equal(extendPro(now - DAY, now), now + PRO_DAYS * DAY, 'expired: starts from now');
  assert.equal(extendPro(now + 5 * DAY, now), now + 35 * DAY, 'still active: stacks');
  assert.equal(isProActive(now + 1, now), true);
  assert.equal(isProActive(now, now), false);
  assert.equal(isProActive(undefined, now), false);
});

test('daily count uses the UTC day', () => {
  assert.equal(dayKey(Date.UTC(2026, 10, 14, 23, 59)), '2026-11-14');
  assert.equal(dayKey(Date.UTC(2026, 10, 15, 0, 1)), '2026-11-15');
});
