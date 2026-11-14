import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorKeyFor, playerMessage } from './errors';
import { t } from './i18n';

const convexError = (data: string) => Object.assign(new Error(`[CONVEX M(x)] Uncaught ConvexError: ${data}`), { data });

test('maps Convex Auth errors to friendly keys', () => {
  assert.equal(errorKeyFor('Uncaught Error: Account edward@example.com already exists'), 'errors.emailTaken');
  assert.equal(errorKeyFor('InvalidSecret'), 'errors.invalidCredentials');
  assert.equal(errorKeyFor('InvalidAccountId'), 'errors.invalidCredentials');
  assert.equal(errorKeyFor('Could not verify code'), 'errors.codeInvalid');
  assert.equal(errorKeyFor('TooManyFailedAttempts'), 'errors.tooManyAttempts');
  assert.equal(errorKeyFor('TypeError: Failed to fetch'), 'errors.offline');
  assert.equal(errorKeyFor('errors.usernameTaken'), 'errors.usernameTaken');
  assert.equal(errorKeyFor('something odd happened'), 'errors.generic');
});

test('every key it can produce has English text', () => {
  for (const raw of ['Account a@b.c already exists', 'InvalidSecret', 'Invalid code', 'Too many', 'Invalid password',
    'auth required', 'forbidden', 'account banned', 'network']) {
    const key = errorKeyFor(raw);
    assert.notEqual(t(key), key, `${key} has no text`);
  }
});

test('shows players plain words, never raw server text', () => {
  assert.equal(playerMessage(convexError('errors.notEnoughCoins')), t('errors.notEnoughCoins'));
  assert.equal(playerMessage(convexError('Room ABC234 is full (4 players).')), 'Room ABC234 is full (4 players).');
  assert.equal(playerMessage(convexError('auth required')), t('errors.signInRequired'));
  assert.equal(playerMessage(convexError('amount must be positive')), t('errors.generic'));
  assert.equal(playerMessage(new Error('[Request ID: 81da] Server Error')), t('errors.generic'));
  assert.equal(playerMessage(new Error('Uncaught Error: Account x@y.com already exists')), t('errors.emailTaken'));
  assert.equal(playerMessage(new TypeError('Failed to fetch')), t('errors.offline'));
});
