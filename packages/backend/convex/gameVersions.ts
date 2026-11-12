import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { gameMode } from './schema';
import { isAdmin, currentUser, makeCurrentVersion, requireAdmin } from './lib';

/** Admins upload bundles and thumbnails straight to Convex storage with this URL. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/** Records an uploaded build; creates the game (as a draft) the first time its slug is seen. */
export const create = mutation({
  args: {
    slug: v.string(), name: v.string(), description: v.string(), version: v.string(),
    min_players: v.number(), max_players: v.number(), modes: v.array(gameMode),
    manifest: v.any(), changelog: v.optional(v.string()),
    bundle_storage_id: v.id('_storage'), thumbnail_storage_id: v.optional(v.id('_storage')),
  },
  handler: async (ctx, a) => {
    const admin = await requireAdmin(ctx);
    if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(a.version)) throw new ConvexError('Invalid version');
    if (a.changelog && a.changelog.length > 1000) throw new ConvexError('Changelog is too long');

    const existing = await ctx.db.query('games').withIndex('by_slug', (q) => q.eq('slug', a.slug)).unique();
    const game_id = existing?._id ?? await ctx.db.insert('games', {
      slug: a.slug, name: a.name, description: a.description, icon: '🎮',
      min_players: a.min_players, max_players: a.max_players, modes: a.modes, version: a.version,
      status: 'draft', is_builtin: false, coming_soon: false, sort_order: 0, updated_at: Date.now(),
    });

    // Re-uploading the same version replaces it (the storage upload used upsert).
    const same = await ctx.db.query('game_versions')
      .withIndex('by_game_version', (q) => q.eq('game_id', game_id).eq('version', a.version)).unique();
    if (same) {
      await ctx.storage.delete(same.bundle_storage_id);
      if (same.thumbnail_storage_id) await ctx.storage.delete(same.thumbnail_storage_id);
      await ctx.db.delete(same._id);
    }
    const id = await ctx.db.insert('game_versions', {
      game_id, version: a.version, bundle_storage_id: a.bundle_storage_id, thumbnail_storage_id: a.thumbnail_storage_id,
      manifest: a.manifest, changelog: a.changelog || undefined, status: 'draft', is_current: false, created_by: admin._id,
    });
    await makeCurrentVersion(ctx, (await ctx.db.get(id))!);
    return game_id;
  },
});

export const list = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireAdmin(ctx);
    const game = await ctx.db.query('games').withIndex('by_slug', (q) => q.eq('slug', slug)).unique();
    if (!game) return null;
    const versions = await ctx.db.query('game_versions').withIndex('by_game_version', (q) => q.eq('game_id', game._id)).collect();
    return {
      game: { id: game._id, slug: game.slug, name: game.name, version: game.version },
      versions: versions.sort((a, b) => b._creationTime - a._creationTime).map((x) => ({
        id: x._id, version: x.version, status: x.status, is_current: x.is_current,
        changelog: x.changelog ?? null, created_at: new Date(x._creationTime).toISOString(),
      })),
    };
  },
});

export const rollback = mutation({
  args: { versionId: v.id('game_versions') },
  handler: async (ctx, { versionId }) => {
    await requireAdmin(ctx);
    const version = await ctx.db.get(versionId);
    if (!version) throw new ConvexError('version not found');
    await makeCurrentVersion(ctx, version);
    return (await ctx.db.get(version.game_id))?.slug ?? null;
  },
});

async function playable(ctx: QueryCtx, game: Doc<'games'>) {
  const version = await ctx.db.query('game_versions')
    .withIndex('by_game_current', (q) => q.eq('game_id', game._id).eq('is_current', true)).first();
  if (!version) return { error: 'No version available' as const };
  return {
    bundleUrl: await ctx.storage.getUrl(version.bundle_storage_id),
    manifest: version.manifest,
    version: version.version,
  };
}

/** The current build of an uploaded HTML5 game, for players (published only) or admins (preview, any status). */
export const current = query({
  args: { slug: v.string(), preview: v.optional(v.boolean()) },
  handler: async (ctx, { slug, preview }) => {
    if (preview && !isAdmin(await currentUser(ctx))) return { error: 'forbidden' as const };
    const game = await ctx.db.query('games').withIndex('by_slug', (q) => q.eq('slug', slug)).unique();
    if (!game || (!preview && game.status !== 'published')) return { error: 'Game not found' as const };
    if (game.is_builtin && !preview) return { error: 'Built-in games use a different play route' as const, builtin: true };
    return playable(ctx, game);
  },
});
