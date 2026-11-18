import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WELCOME_CREDIT, WELCOME_MATCHES_PRO, welcomeEligible, withdrawable } from './promo';

test('welcome credit: only November and December 2026 sign-ups', () => {
  assert.equal(welcomeEligible(Date.UTC(2026, 9, 31, 23, 59, 59)), false); // 31 Oct
  assert.equal(welcomeEligible(Date.UTC(2026, 10, 1)), true); // 1 Nov, midnight
  assert.equal(welcomeEligible(Date.UTC(2026, 11, 31, 23, 59, 59)), true); // 31 Dec
  assert.equal(welcomeEligible(Date.UTC(2027, 0, 1)), false); // 1 Jan
});

test('welcome credit is SLE 10 and buys exactly one month of Pro', () => {
  assert.equal(WELCOME_CREDIT.amount, 1_000);
  assert.equal(WELCOME_MATCHES_PRO, true);
});

test('unplayed welcome credit cannot be withdrawn', () => {
  assert.equal(withdrawable(1_000, 1_000), 0);
  assert.equal(withdrawable(7_000, 1_000), 6_000);
  assert.equal(withdrawable(500, 1_000), 0); // part of it is staked right now
  assert.equal(withdrawable(2_500, undefined), 2_500);
  assert.equal(withdrawable(2_500, 0), 2_500);
});
