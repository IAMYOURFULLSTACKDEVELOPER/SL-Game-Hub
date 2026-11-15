export interface GameRow {
  id: string; slug: string; name: string; description: string; icon: string;
  thumbnail_url: string | null; min_players: number; max_players: number;
  modes: ('single' | 'multi')[]; coming_soon: boolean; version: string;
  categories: { slug: string; name: string } | null;
}
const GAME_IMAGES: Record<string, string> = {
  checkers: '/games/checkers.webp',
  chess: '/games/chess.webp',
  scrabble: '/games/scrabble.webp',
  'snake-and-ladder': '/games/snake-and-ladder.webp',
  snake: '/games/snake.webp',
  uno: '/games/uno.webp',
  'word-search': '/games/word-search.webp',
  dice: '/games/dice.webp',
  'salone-poly': '/games/salone-poly.webp',
};
export const gameImage = (g: Pick<GameRow, 'slug' | 'thumbnail_url'>) => GAME_IMAGES[g.slug] ?? g.thumbnail_url;
/** Each game's own colour, taken from its cover art; tints its page (glow, record ring, variants). */
const ACCENTS: Record<string, string> = {
  uno: '#eb459e', chess: '#d4a017', checkers: '#e03c31', snake: '#23a55a', 'snake-and-ladder': '#e0a10b',
  'word-search': '#0e9f9f', scrabble: '#c8913f', 'salone-poly': '#1d7bd6', dice: '#f23f43',
};
export const gameAccent = (slug: string) => ACCENTS[slug] ?? '#5865f2';
/** Small square crop of each built-in game's cover (96px, ~4 KB) for the sidebar rail. Other games use their GameGlyph. */
export const gameIcon = (slug: string) => (slug in GAME_IMAGES ? `/games/icons/${slug}.webp` : null);
