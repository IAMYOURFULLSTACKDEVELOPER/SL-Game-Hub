/** Preset avatars: no uploads, so zero extra data cost and nothing to moderate. */
export const AVATARS = [
  { id: 'av_lion', emoji: '🦁' }, { id: 'av_elephant', emoji: '🐘' }, { id: 'av_parrot', emoji: '🦜' },
  { id: 'av_leopard', emoji: '🐆' }, { id: 'av_eagle', emoji: '🦅' }, { id: 'av_turtle', emoji: '🐢' },
  { id: 'av_fish', emoji: '🐠' }, { id: 'av_lizard', emoji: '🦎' }, { id: 'av_butterfly', emoji: '🦋' },
  { id: 'av_monkey', emoji: '🐒' }, { id: 'av_buffalo', emoji: '🐃' }, { id: 'av_zebra', emoji: '🦓' },
] as const;
export const avatarEmoji = (id: string) => AVATARS.find((a) => a.id === id)?.emoji ?? '🙂';
export const isAvatarId = (id: string) => AVATARS.some((a) => a.id === id);
