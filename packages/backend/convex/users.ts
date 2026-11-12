import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { USERNAME_RE } from '@slgh/shared/src/validation';
import { isAvatarId } from '@slgh/shared/src/avatars';
import { currentUser, requireAdmin, requireActiveUser } from './lib';

/** The signed-in player's profile, or null. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const u = await currentUser(ctx);
    if (!u) return null;
    return {
      id: u._id, username: u.username, full_name: u.full_name, avatar: u.avatar, role: u.role,
      age_band: u.age_band, banned: u.banned, is_public: u.is_public,
      district_id: u.district_id ?? null, created_at: new Date(u._creationTime).toISOString(),
    };
  },
});

export const usernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const taken = await ctx.db.query('users')
      .withIndex('by_username_lower', (q) => q.eq('username_lower', username.trim().toLowerCase())).first();
    return !taken;
  },
});

export const updateProfile = mutation({
  args: {
    full_name: v.string(), username: v.string(), avatar: v.string(),
    district_id: v.union(v.string(), v.null()), is_public: v.boolean(),
  },
  handler: async (ctx, a) => {
    const me = await requireActiveUser(ctx);
    const full_name = a.full_name.trim(), username = a.username.trim();
    if (full_name.length < 2 || full_name.length > 80) throw new ConvexError('errors.fullNameRequired');
    if (!USERNAME_RE.test(username)) throw new ConvexError('errors.usernameInvalid');
    if (!isAvatarId(a.avatar)) throw new ConvexError('errors.generic');
    const district_id = a.district_id === null ? undefined : ctx.db.normalizeId('districts', a.district_id) ?? null;
    if (district_id === null) throw new ConvexError('errors.generic');

    const username_lower = username.toLowerCase();
    const taken = await ctx.db.query('users').withIndex('by_username_lower', (q) => q.eq('username_lower', username_lower)).first();
    if (taken && taken._id !== me._id) throw new ConvexError('errors.usernameTaken');

    await ctx.db.patch(me._id, {
      full_name, username, username_lower, avatar: a.avatar, district_id,
      is_public: me.age_band === 'under_13' ? false : a.is_public, // under-13 profiles are never public
      updated_at: Date.now(),
    });
  },
});

// ---------- Admin ----------
export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query('users').order('desc').take(100);
    return users.map((u) => ({
      id: u._id, username: u.username, full_name: u.full_name, avatar: u.avatar, role: u.role,
      age_band: u.age_band, banned: u.banned, created_at: new Date(u._creationTime).toISOString(),
    }));
  },
});

export const setBanned = mutation({
  args: { id: v.id('users'), banned: v.boolean() },
  handler: async (ctx, { id, banned }) => {
    const admin = await requireAdmin(ctx);
    if (id === admin._id) throw new ConvexError('cannot suspend yourself');
    await ctx.db.patch(id, { banned, updated_at: Date.now() });
  },
});
