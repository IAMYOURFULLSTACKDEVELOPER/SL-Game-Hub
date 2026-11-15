import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMuxSignature } from './mux-signature';

const SECRET = 'mux-webhook-secret-for-tests';
const sign = (t: number, body: string, secret = SECRET) => createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

test('accepts a valid Mux webhook signature', async () => {
  const body = '{"type":"video.live_stream.active"}';
  const now = 1_790_000_000;
  assert.equal(await verifyMuxSignature(SECRET, `t=${now},v1=${sign(now, body)}`, body, now + 5), true);
});

test('rejects tampered, stale, wrongly signed or malformed webhooks', async () => {
  const body = '{"a":1}';
  const now = 1_790_000_000;
  const header = `t=${now},v1=${sign(now, body)}`;
  assert.equal(await verifyMuxSignature(SECRET, header, '{"a":2}', now), false);
  assert.equal(await verifyMuxSignature(SECRET, `t=${now},v1=${sign(now, body, 'other')}`, body, now), false);
  assert.equal(await verifyMuxSignature(SECRET, header, body, now + 301), false);
  assert.equal(await verifyMuxSignature(SECRET, header, body, now - 61), false);
  assert.equal(await verifyMuxSignature(SECRET, null, body, now), false);
  assert.equal(await verifyMuxSignature('', header, body, now), false);
  assert.equal(await verifyMuxSignature(SECRET, `t=${now},v1=zz`, body, now), false);
  // Monime-style "_" separator must not pass
  assert.equal(await verifyMuxSignature(SECRET, `t=${now},v1=${createHmac('sha256', SECRET).update(`${now}_${body}`).digest('hex')}`, body, now), false);
});
