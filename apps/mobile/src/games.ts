export interface GameRow {
  id: string; slug: string; name: string; description: string; icon: string; thumbnail_url: string | null;
  min_players: number; max_players: number; modes: ('single' | 'multi')[]; coming_soon: boolean; version: string;
  categories: { slug: string; name: string } | null;
}
export const GAME_COLS = 'id,slug,name,description,icon,thumbnail_url,min_players,max_players,modes,coming_soon,version';
