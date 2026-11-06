import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from './i18n';
import { avatarEmoji, isAvatarId } from './avatars';

test('translates and interpolates', () => {
  assert.equal(t('app.name'), 'SL Game Hub');
  assert.equal(t('library.players', { min: 2, max: 4 }), '2 to 4 players');
});
test('missing key returns the key; unknown locale falls back to English', () => {
  assert.equal(t('nope.nothing'), 'nope.nothing');
  assert.equal(t('app.name', undefined, 'kri'), 'SL Game Hub');
});
test('avatars', () => {
  assert.ok(isAvatarId('av_lion'));
  assert.equal(isAvatarId('av_hacker'), false);
  assert.equal(avatarEmoji('missing'), '🙂');
});
