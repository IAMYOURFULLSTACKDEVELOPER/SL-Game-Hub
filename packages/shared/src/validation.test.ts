import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSignUp, validatePasswords, isEmail, USERNAME_RE } from './validation';

const ok = { fullName: 'Aminata Kamara', username: 'aminata_k', email: 'a@example.com',
  password: 'longenough1', confirmPassword: 'longenough1', ageBand: '18_plus' };

test('valid sign-up has no errors', () => assert.deepEqual(validateSignUp(ok), {}));
test('rejects short name', () => assert.equal(validateSignUp({ ...ok, fullName: 'A' }).fullName, 'errors.fullNameRequired'));
test('rejects bad usernames', () => {
  for (const u of ['ab', 'has space', 'bad-dash', 'x'.repeat(21), 'émile']) {
    assert.equal(validateSignUp({ ...ok, username: u }).username, 'errors.usernameInvalid', u);
  }
});
test('accepts good usernames', () => { for (const u of ['abc', 'A_1', 'x'.repeat(20)]) assert.ok(USERNAME_RE.test(u)); });
test('rejects bad emails', () => { for (const e of ['', 'a', 'a@b', 'a b@c.com', '@c.com']) assert.equal(isEmail(e), false, e); });
test('requires a valid age band', () => {
  assert.equal(validateSignUp({ ...ok, ageBand: '' }).ageBand, 'errors.ageRequired');
  assert.equal(validateSignUp({ ...ok, ageBand: 'adult' }).ageBand, 'errors.ageRequired');
});
test('password length and match', () => {
  assert.equal(validatePasswords('short', 'short').password, 'errors.passwordShort');
  assert.equal(validatePasswords('x'.repeat(73), 'x'.repeat(73)).password, 'errors.passwordShort');
  assert.equal(validatePasswords('longenough1', 'different11').confirmPassword, 'errors.passwordMismatch');
  assert.deepEqual(validatePasswords('longenough1', 'longenough1'), {});
});
