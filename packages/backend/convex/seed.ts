import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { Doc } from './_generated/dataModel';

// Reference data and the game catalog. Safe to run more than once:
// `npx convex run seed:run` (or `npm run seed`).

const DISTRICTS = [
  'Western Area Urban', 'Western Area Rural', 'Port Loko', 'Kambia', 'Karene', 'Bombali', 'Falaba',
  'Koinadugu', 'Tonkolili', 'Kono', 'Kailahun', 'Kenema', 'Bo', 'Bonthe', 'Moyamba', 'Pujehun',
];

const CATEGORIES = [
  { slug: 'arcade', name: 'Arcade', sort_order: 1 }, { slug: 'board', name: 'Board', sort_order: 2 },
  { slug: 'card', name: 'Card', sort_order: 3 }, { slug: 'word', name: 'Word', sort_order: 4 },
  { slug: 'puzzle', name: 'Puzzle', sort_order: 5 },
];

type Mode = Doc<'games'>['modes'][number];
const img = (id: string) => `https://images.unsplash.com/${id}?w=400&h=400&fit=crop`;
const GAMES: {
  slug: string; name: string; description: string; icon: string; thumbnail_url?: string; category: string;
  min_players: number; max_players: number; modes: Mode[]; sort_order: number; coming_soon: boolean;
}[] = [
  { slug: 'snake', name: 'Snake', description: 'Guide the snake, eat, grow, and avoid crashing.', icon: '🐍',
    thumbnail_url: img('photo-1551288049-bebda4e38f71'), category: 'arcade', min_players: 1, max_players: 1, modes: ['single'], sort_order: 1, coming_soon: false },
  { slug: 'snake-and-ladder', name: 'Snake & Ladder', icon: '🎲',
    description: 'Throw the red dice and race your coloured ring to square 100. Climb ladders, dodge snakes! 2-6 players.',
    thumbnail_url: img('photo-1526506118085-60ce8714f8c5'), category: 'board', min_players: 2, max_players: 6, modes: ['single', 'multi'], sort_order: 2, coming_soon: false },
  { slug: 'checkers', name: 'Checkers', description: "Jump and capture all your opponent's pieces.", icon: '🔴',
    thumbnail_url: img('photo-1596464716127-f2a82984de30'), category: 'board', min_players: 2, max_players: 2, modes: ['single', 'multi'], sort_order: 3, coming_soon: false },
  { slug: 'chess', name: 'Chess', description: 'The classic game of strategy.', icon: '♟️',
    thumbnail_url: img('photo-1523995462485-3d171b5c8fa9'), category: 'board', min_players: 2, max_players: 2, modes: ['single', 'multi'], sort_order: 4, coming_soon: false },
  { slug: 'word-search', name: 'Word Search', description: 'Find the hidden words in the grid.', icon: '🔤',
    thumbnail_url: img('photo-1454165804606-c3d57bc86b40'), category: 'word', min_players: 1, max_players: 1, modes: ['single'], sort_order: 5, coming_soon: false },
  { slug: 'scrabble', name: 'Scrabble', description: 'Build words on the board and score big.', icon: '🔠',
    thumbnail_url: img('photo-1456513080510-7bf3a84b82f8'), category: 'word', min_players: 2, max_players: 4, modes: ['single', 'multi'], sort_order: 6, coming_soon: false },
  { slug: 'uno', name: 'UNO', description: 'Match colours and numbers. Be first to empty your hand.', icon: '🃏',
    thumbnail_url: img('photo-1583939003579-730e3918a45a'), category: 'card', min_players: 2, max_players: 4, modes: ['single', 'multi'], sort_order: 7, coming_soon: false },
  { slug: 'salone-poly', name: 'Salone-Poly', icon: '🏝️',
    description: "Buy Sierra Leone's landmarks, build houses and hotels, and collect rent. Play bots, friends on one phone, or online.",
    category: 'board', min_players: 2, max_players: 6, modes: ['single', 'multi'], sort_order: 8, coming_soon: false },
  { slug: 'dice', name: 'Dice', icon: '🎲',
    description: 'Roll two dice and race to the target score. Doubles score double! Play online with up to 8 friends.',
    category: 'board', min_players: 2, max_players: 8, modes: ['single', 'multi'], sort_order: 9, coming_soon: false },
];

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const name of DISTRICTS) {
      if (!await ctx.db.query('districts').withIndex('by_name', (q) => q.eq('name', name)).unique()) {
        await ctx.db.insert('districts', { name });
      }
    }
    const categoryIds: Record<string, Doc<'categories'>['_id']> = {};
    for (const c of CATEGORIES) {
      const existing = await ctx.db.query('categories').withIndex('by_slug', (q) => q.eq('slug', c.slug)).unique();
      categoryIds[c.slug] = existing?._id ?? await ctx.db.insert('categories', c);
    }
    const now = Date.now();
    for (const { category, ...g } of GAMES) {
      const existing = await ctx.db.query('games').withIndex('by_slug', (q) => q.eq('slug', g.slug)).unique();
      if (existing) await ctx.db.patch(existing._id, { coming_soon: g.coming_soon });
      else await ctx.db.insert('games', {
        ...g, category_id: categoryIds[category], version: '1.0.0', status: 'published',
        is_builtin: true, published_at: now, updated_at: now,
      });
    }
  },
});

/** Makes a signed-up player an admin: `npx convex run seed:makeAdmin '{"username":"YOUR_NAME"}'`. */
export const makeAdmin = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const u = await ctx.db.query('users').withIndex('by_username_lower', (q) => q.eq('username_lower', username.toLowerCase())).unique();
    if (!u) throw new ConvexError(`No player called ${username}`);
    await ctx.db.patch(u._id, { role: 'admin', updated_at: Date.now() });
  },
});
