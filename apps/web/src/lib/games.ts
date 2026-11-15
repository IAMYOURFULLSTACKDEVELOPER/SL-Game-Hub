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
/** Small square crop of each built-in game's cover (96px, ~4 KB) for the sidebar rail. Other games use their GameGlyph. */
export const gameIcon = (slug: string) => (slug in GAME_IMAGES ? `/games/icons/${slug}.webp` : null);
