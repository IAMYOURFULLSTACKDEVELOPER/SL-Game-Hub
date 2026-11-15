import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from './i18n';
import { avatarInfo, isAvatarId } from './avatars';

test('translates and interpolates', () => {
  assert.equal(t('app.name'), 'Dodo');
  assert.equal(t('library.players', { min: 2, max: 4 }), '2 to 4 players');
});
test('missing key returns the key; unknown locale falls back to English', () => {
  assert.equal(t('nope.nothing'), 'nope.nothing');
  assert.equal(t('app.name', undefined, 'kri'), 'Dodo');
});
test('avatars', () => {
  assert.ok(isAvatarId('av_lion'));
  assert.equal(isAvatarId('av_hacker'), false);
  assert.equal(avatarInfo('missing').name, 'Player');
  assert.equal(avatarInfo('av_lion').name, 'Sun');
});
