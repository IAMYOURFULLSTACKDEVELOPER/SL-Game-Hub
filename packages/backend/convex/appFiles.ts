import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

// Named files the server stores for its own use (see scrabbleNode.ts). Internal only.

export const get = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) =>
    (await ctx.db.query('app_files').withIndex('by_key', (q) => q.eq('key', key)).unique())?.storage_id ?? null,
});

export const set = internalMutation({
  args: { key: v.string(), storageId: v.id('_storage') },
  handler: async (ctx, { key, storageId }) => {
    const existing = await ctx.db.query('app_files').withIndex('by_key', (q) => q.eq('key', key)).unique();
    if (existing) {
      await ctx.storage.delete(existing.storage_id);
      await ctx.db.patch(existing._id, { storage_id: storageId });
    } else {
      await ctx.db.insert('app_files', { key, storage_id: storageId });
    }
  },
});
