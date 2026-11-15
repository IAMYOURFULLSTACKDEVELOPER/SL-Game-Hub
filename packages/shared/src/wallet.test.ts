import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { formatLeones, parseLeones, normalizeSlPhone, displaySlPhone, ussdHref, splitPot, withMonimeFee } from './wallet';
import { verifyMonimeSignature } from './monime-signature';

test('formats leones from minor units', () => {
  assert.equal(formatLeones(500), 'SLE 5');
  assert.equal(formatLeones(1234), 'SLE 12.34');
  assert.equal(formatLeones(123456705), 'SLE 1,234,567.05');
  assert.equal(formatLeones(-250), '-SLE 2.50');
});

test('parses typed amounts', () => {
  assert.equal(parseLeones('25'), 2500);
  assert.equal(parseLeones('1,000'), 100000);
  assert.equal(parseLeones('Le 12.5'), 1250);
  assert.equal(parseLeones('SLE 0.05'), 5);
  for (const bad of ['', 'abc', '1.234', '-5', '1e3', '12345678']) assert.equal(parseLeones(bad), null, bad);
});

test('normalizes Sierra Leone phone numbers', () => {
  for (const p of ['076123456', '076 123 456', '+232 76 123456', '23276123456', '76123456']) {
    assert.equal(normalizeSlPhone(p), '23276123456', p);
  }
  for (const bad of ['', '12345', '+44 7700 900123', '0761234567', '011234567']) assert.equal(normalizeSlPhone(bad), null, bad);
  assert.equal(displaySlPhone('23276123456'), '076 123 456');
});

test('escapes # in USSD dial links', () => assert.equal(ussdHref('*715*1*123#'), 'tel:*715*1*123%23'));

test('splits a pot with a rounded-down fee', () => {
  assert.deepEqual(splitPot(1000, 0), { fee: 0, prize: 1000 });
  assert.deepEqual(splitPot(1000, 250), { fee: 25, prize: 975 });
  assert.deepEqual(splitPot(333, 500), { fee: 16, prize: 317 });
  assert.deepEqual(splitPot(1000, 20000), { fee: 1000, prize: 0 });
});

const SECRET = 'whsec_test_0123456789abcdef0123456789abcdef';
const sign = (t: number, body: string) => createHmac('sha256', SECRET).update(`${t}_${body}`).digest('base64');

test('accepts a valid Monime webhook signature', async () => {
  const body = '{"event":{"name":"payment_code.completed"}}';
  const now = 1_760_000_000;
  assert.equal(await verifyMonimeSignature(SECRET, `t=${now},v1=${sign(now, body)}`, body, now + 10), true);
});

test('rejects tampered, stale or unsigned webhooks', async () => {
  const body = '{"a":1}';
  const now = 1_760_000_000;
  const header = `t=${now},v1=${sign(now, body)}`;
  assert.equal(await verifyMonimeSignature(SECRET, header, '{"a":2}', now), false);
  assert.equal(await verifyMonimeSignature('other-secret-0123456789abcdef0123', header, body, now), false);
  assert.equal(await verifyMonimeSignature(SECRET, header, body, now + 301), false);
  assert.equal(await verifyMonimeSignature(SECRET, header, body, now - 61), false);
  assert.equal(await verifyMonimeSignature(SECRET, null, body, now), false);
  assert.equal(await verifyMonimeSignature(SECRET, `v1=${sign(now, body)}`, body, now), false);
  assert.equal(await verifyMonimeSignature(SECRET, `t=${now},v1=not base64!`, body, now), false);
});

test('adds the Monime fee on top so the hub receives the full amount', () => {
  assert.equal(withMonimeFee(1000), 1011); // SLE 10 -> the player pays SLE 10.11
  assert.equal(withMonimeFee(500), 506);
  assert.equal(withMonimeFee(1000, 0), 1000);
  for (const amount of [100, 500, 999, 1000, 2500, 10_000, 500_000]) {
    for (const bps of [50, 100, 150, 250]) {
      const charge = withMonimeFee(amount, bps);
      const feeRoundedUp = Math.ceil((charge * bps) / 10_000); // worst case: Monime rounds its fee up
      assert.ok(charge - feeRoundedUp >= amount - 1, `${amount}@${bps}: nets at least the amount (to the cent)`);
      assert.ok(charge - Math.floor((charge * bps) / 10_000) >= amount, `${amount}@${bps}: nets the full amount when the fee rounds down`);
      const f = bps / 10_000; // the exact difference from 'add the fee on top' is amount*f^2/(1-f), under a cent for normal amounts
      assert.ok(charge - amount * (1 + f) <= (amount * f * f) / (1 - f) + 1, `${amount}@${bps}: barely more than adding the fee on top`);
    }
  }
});
