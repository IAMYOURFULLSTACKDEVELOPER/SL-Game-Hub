// Preset avatars: no uploads, so zero extra data cost and nothing to moderate. Each is a coloured tile with
// a simple vector mark (drawn by the web Avatar component). Ids are stored on accounts, so never rename them.
export const AVATARS = [
  { id: 'av_lion', name: 'Sun', color: '#e0a10b' }, { id: 'av_elephant', name: 'Mountain', color: '#5865f2' },
  { id: 'av_parrot', name: 'Leaf', color: '#23a55a' }, { id: 'av_leopard', name: 'Bolt', color: '#f26522' },
  { id: 'av_eagle', name: 'Rocket', color: '#1d7bd6' }, { id: 'av_turtle', name: 'Hexagon', color: '#0e9f9f' },
  { id: 'av_fish', name: 'Wave', color: '#0891b2' }, { id: 'av_lizard', name: 'Diamond', color: '#65a30d' },
  { id: 'av_butterfly', name: 'Flower', color: '#eb459e' }, { id: 'av_monkey', name: 'Moon', color: '#8e44ad' },
  { id: 'av_buffalo', name: 'Star', color: '#d83c3e' }, { id: 'av_zebra', name: 'Rings', color: '#4e5058' },
] as const;
export type AvatarId = (typeof AVATARS)[number]['id'];
const FALLBACK = { id: 'none', name: 'Player', color: '#5865f2' } as const;
/** Name and colour for an avatar id (unknown ids get a plain fallback). */
export const avatarInfo = (id: string | null | undefined): { id: string; name: string; color: string } =>
  AVATARS.find((a) => a.id === id) ?? FALLBACK;
export const isAvatarId = (id: string) => AVATARS.some((a) => a.id === id);
