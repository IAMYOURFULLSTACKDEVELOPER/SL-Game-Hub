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
};
export const gameImage = (g: Pick<GameRow, 'slug' | 'thumbnail_url'>) => GAME_IMAGES[g.slug] ?? g.thumbnail_url;
export const GAME_COLS =
  'id,slug,name,description,icon,thumbnail_url,min_players,max_players,modes,coming_soon,version';
