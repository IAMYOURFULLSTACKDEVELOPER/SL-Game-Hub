import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

// These guards replace the Postgres helpers (auth.uid(), is_admin(), the "banned" checks)
// that Row Level Security used to apply. Every public function calls one of them.

export async function currentUser(ctx: QueryCtx): Promise<Doc<'users'> | null> {
  const id = await getAuthUserId(ctx);
  return id ? ctx.db.get(id) : null;
}

export async function requireUser(ctx: QueryCtx) {
  const me = await currentUser(ctx);
  if (!me) throw new ConvexError('auth required');
  return me;
}

/** Signed in and not suspended. */
export async function requireActiveUser(ctx: QueryCtx, bannedMessage = 'forbidden') {
  const me = await requireUser(ctx);
  if (me.banned) throw new ConvexError(bannedMessage);
  return me;
}

export const isAdmin = (u: Doc<'users'> | null) => !!u && u.role === 'admin' && !u.banned;

export async function requireAdmin(ctx: QueryCtx) {
  const me = await requireUser(ctx);
  if (!isAdmin(me)) throw new ConvexError('forbidden');
  return me;
}

/** The public bits of a player shown next to their scores and messages. */
export async function publicProfile(ctx: QueryCtx, id: Id<'users'>) {
  const u = await ctx.db.get(id);
  return { username: u?.username ?? 'Player', avatar: u?.avatar ?? 'av_lion' };
}

/** Shape every games list renders (the old GAME_COLS + categories join). */
export async function toGameRow(ctx: QueryCtx, g: Doc<'games'>) {
  const cat = g.category_id ? await ctx.db.get(g.category_id) : null;
  return {
    id: g._id, slug: g.slug, name: g.name, description: g.description, icon: g.icon,
    thumbnail_url: g.thumbnail_url ?? null, min_players: g.min_players, max_players: g.max_players,
    modes: g.modes, coming_soon: g.coming_soon, version: g.version,
    categories: cat ? { slug: cat.slug, name: cat.name } : null,
  };
}

/** Replaces the game_versions triggers: one current version per game, synced onto the game when published. */
export async function makeCurrentVersion(ctx: MutationCtx, version: Doc<'game_versions'>) {
  const others = await ctx.db.query('game_versions')
    .withIndex('by_game_current', (q) => q.eq('game_id', version.game_id).eq('is_current', true)).collect();
  for (const o of others) if (o._id !== version._id) await ctx.db.patch(o._id, { is_current: false });
  await ctx.db.patch(version._id, { is_current: true });
  if (version.status === 'published') {
    const thumb = version.thumbnail_storage_id ? await ctx.storage.getUrl(version.thumbnail_storage_id) : null;
    await ctx.db.patch(version.game_id, { version: version.version, thumbnail_url: thumb ?? undefined, updated_at: Date.now() });
  }
}

export const today = () => new Date().toISOString().slice(0, 10);
