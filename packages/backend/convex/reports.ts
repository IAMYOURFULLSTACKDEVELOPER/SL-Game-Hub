import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { requireActiveUser, requireAdmin } from './lib';

export const create = mutation({
  args: {
    reason: v.string(), details: v.optional(v.string()),
    target_user_id: v.optional(v.id('users')), game_id: v.optional(v.id('games')),
  },
  handler: async (ctx, a) => {
    const me = await requireActiveUser(ctx);
    const reason = a.reason.trim();
    if (reason.length < 3 || reason.length > 60) throw new ConvexError('bad reason');
    if (a.details && a.details.length > 1000) throw new ConvexError('details too long');
    return ctx.db.insert('reports', { ...a, reason, reporter_id: me._id, status: 'open' });
  },
});

export const listOpen = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query('reports').withIndex('by_status', (q) => q.eq('status', 'open')).order('desc').take(100);
    return rows.map((r) => ({
      id: r._id, reason: r.reason, details: r.details ?? null, created_at: new Date(r._creationTime).toISOString(),
    }));
  },
});

export const resolve = mutation({
  args: { id: v.id('reports'), status: v.union(v.literal('resolved'), v.literal('dismissed')) },
  handler: async (ctx, { id, status }) => {
    const admin = await requireAdmin(ctx);
    await ctx.db.patch(id, { status, resolved_by: admin._id });
  },
});
