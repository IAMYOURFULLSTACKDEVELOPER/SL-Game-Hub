import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { publicProfile, requireActiveUser, requireUser } from './lib';
import { containsProfanity } from './chat';
import { isPro } from './pro';

// Groups and forums for teams. Creating a group is a Pro feature; anyone signed in can join with the
// group's invite code and post. The owner shares the code, can remove members and any post, and can
// make a new code (the old one stops working). Everything is visible to the group's members only.

const MAX_GROUPS_PER_OWNER = 10;
const MAX_MEMBERS = 200;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

const membership = (ctx: QueryCtx, groupId: Id<'groups'>, userId: Id<'users'>) =>
  ctx.db.query('group_members').withIndex('by_group_user', (q) => q.eq('group_id', groupId).eq('user_id', userId)).unique();

async function requireMemberOf(ctx: QueryCtx, groupId: string, user: Doc<'users'>) {
  const id = ctx.db.normalizeId('groups', groupId);
  const group = id && await ctx.db.get(id);
  const me = group && await membership(ctx, group._id, user._id);
  if (!group || !me) throw new ConvexError('errors.notFound'); // same answer whether it exists or not
  return { group, me };
}

async function cleanText(ctx: QueryCtx, text: string, min: number, max: number, what: string) {
  const t = text.trim();
  if (t.length < min || t.length > max) throw new ConvexError(`${what} must be ${min} to ${max} characters.`);
  if (await containsProfanity(ctx, t)) throw new ConvexError('errors.inappropriateLanguage');
  return t;
}

async function uniqueCode(ctx: QueryCtx) {
  for (let i = 0; i < 20; i++) {
    const code = newCode();
    if (!await ctx.db.query('groups').withIndex('by_invite_code', (q) => q.eq('invite_code', code)).unique()) return code;
  }
  throw new ConvexError('errors.generic');
}

/** Groups I belong to, most active first. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query('group_members').withIndex('by_user', (q) => q.eq('user_id', me._id)).take(100);
    const groups = await Promise.all(rows.map(async (m) => {
      const g = await ctx.db.get(m.group_id);
      return g && {
        id: g._id, name: g.name, description: g.description ?? null, role: m.role,
        member_count: g.member_count, last_post_at: g.last_post_at ?? g._creationTime,
      };
    }));
    return {
      groups: groups.filter((g) => !!g).sort((a, b) => b.last_post_at - a.last_post_at),
      canCreate: isPro(me),
    };
  },
});

/** Pro only: start a group; you are its owner. */
export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const me = await requireActiveUser(ctx);
    if (!isPro(me)) throw new ConvexError('Creating groups is a Pro feature. Go Pro to create one for your team.');
    const owned = await ctx.db.query('groups').withIndex('by_owner', (q) => q.eq('owner_id', me._id)).take(MAX_GROUPS_PER_OWNER);
    if (owned.length >= MAX_GROUPS_PER_OWNER) throw new ConvexError(`You can own up to ${MAX_GROUPS_PER_OWNER} groups.`);
    const name = await cleanText(ctx, a.name, 3, 60, 'A group name');
    const description = a.description?.trim() ? await cleanText(ctx, a.description, 1, 300, 'The description') : undefined;
    const id = await ctx.db.insert('groups', {
      name, description, owner_id: me._id, invite_code: await uniqueCode(ctx), member_count: 1,
    });
    await ctx.db.insert('group_members', { group_id: id, user_id: me._id, role: 'owner', joined_at: Date.now() });
    return id;
  },
});

/** Join with the code a group owner shared. */
export const join = mutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, { inviteCode }) => {
    const me = await requireActiveUser(ctx);
    const code = inviteCode.trim().toUpperCase();
    const group = await ctx.db.query('groups').withIndex('by_invite_code', (q) => q.eq('invite_code', code)).unique();
    if (!group) throw new ConvexError('That invite code is not right, or it has been changed. Ask the group owner for the new one.');
    if (await membership(ctx, group._id, me._id)) return group._id;
    if (group.member_count >= MAX_MEMBERS) throw new ConvexError(`This group is full (${MAX_MEMBERS} members).`);
    await ctx.db.insert('group_members', { group_id: group._id, user_id: me._id, role: 'member', joined_at: Date.now() });
    await ctx.db.patch(group._id, { member_count: group.member_count + 1 });
    return group._id;
  },
});

/** A group's page: members and threads. Members only. */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const { group, me } = await requireMemberOf(ctx, id, user);
    const owner = me.role === 'owner';
    const members = await ctx.db.query('group_members').withIndex('by_group_user', (q) => q.eq('group_id', group._id)).take(MAX_MEMBERS);
    const threads = await ctx.db.query('group_threads').withIndex('by_group_last_post', (q) => q.eq('group_id', group._id)).order('desc').take(50);
    return {
      id: group._id, name: group.name, description: group.description ?? null, member_count: group.member_count,
      isOwner: owner, inviteCode: owner ? group.invite_code : null,
      members: await Promise.all(members.map(async (m) => ({ userId: m.user_id, role: m.role, ...await publicProfile(ctx, m.user_id) }))),
      threads: await Promise.all(threads.map(async (t) => ({
        id: t._id, title: t.title, reply_count: t.reply_count, last_post_at: t.last_post_at,
        author: (await publicProfile(ctx, t.author_id)).username,
      }))),
    };
  },
});

/** A thread and its posts, oldest first. Members only. */
export const thread = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const tid = ctx.db.normalizeId('group_threads', id);
    const t = tid && await ctx.db.get(tid);
    if (!t) throw new ConvexError('errors.notFound');
    const { group, me } = await requireMemberOf(ctx, t.group_id, user);
    const posts = await ctx.db.query('group_posts').withIndex('by_thread', (q) => q.eq('thread_id', t._id)).take(300);
    return {
      id: t._id, title: t.title, group: { id: group._id, name: group.name },
      posts: await Promise.all(posts.map(async (p) => ({
        id: p._id, body: p.body, created_at: p._creationTime, ...await publicProfile(ctx, p.author_id),
        canDelete: p.author_id === user._id || me.role === 'owner',
      }))),
    };
  },
});

export const createThread = mutation({
  args: { groupId: v.string(), title: v.string(), body: v.string() },
  handler: async (ctx, a) => {
    const me = await requireActiveUser(ctx);
    const { group } = await requireMemberOf(ctx, a.groupId, me);
    const title = await cleanText(ctx, a.title, 3, 100, 'A title');
    const body = await cleanText(ctx, a.body, 1, 2000, 'A post');
    const now = Date.now();
    const id = await ctx.db.insert('group_threads', { group_id: group._id, author_id: me._id, title, reply_count: 0, last_post_at: now });
    await ctx.db.insert('group_posts', { thread_id: id, group_id: group._id, author_id: me._id, body });
    await ctx.db.patch(group._id, { last_post_at: now });
    return id;
  },
});

export const reply = mutation({
  args: { threadId: v.string(), body: v.string() },
  handler: async (ctx, a) => {
    const me = await requireActiveUser(ctx);
    const tid = ctx.db.normalizeId('group_threads', a.threadId);
    const t = tid && await ctx.db.get(tid);
    if (!t) throw new ConvexError('errors.notFound');
    const { group } = await requireMemberOf(ctx, t.group_id, me);
    const body = await cleanText(ctx, a.body, 1, 2000, 'A post');
    const now = Date.now();
    await ctx.db.insert('group_posts', { thread_id: t._id, group_id: group._id, author_id: me._id, body });
    await ctx.db.patch(t._id, { reply_count: t.reply_count + 1, last_post_at: now });
    await ctx.db.patch(group._id, { last_post_at: now });
  },
});

/** Delete a post: its author or the group owner. A thread with no posts left is removed too. */
export const deletePost = mutation({
  args: { postId: v.string() },
  handler: async (ctx, { postId }) => {
    const me = await requireUser(ctx);
    const pid = ctx.db.normalizeId('group_posts', postId);
    const p = pid && await ctx.db.get(pid);
    if (!p) return;
    const { me: member } = await requireMemberOf(ctx, p.group_id, me);
    if (p.author_id !== me._id && member.role !== 'owner') throw new ConvexError('errors.forbidden');
    await ctx.db.delete(p._id);
    const left = await ctx.db.query('group_posts').withIndex('by_thread', (q) => q.eq('thread_id', p.thread_id)).first();
    const t = await ctx.db.get(p.thread_id);
    if (!left) { if (t) await ctx.db.delete(t._id); return { threadDeleted: true }; }
    if (t) await ctx.db.patch(t._id, { reply_count: Math.max(0, t.reply_count - 1) });
    return { threadDeleted: false };
  },
});

async function dropMember(ctx: MutationCtx, group: Doc<'groups'>, userId: Id<'users'>) {
  const m = await membership(ctx, group._id, userId);
  if (!m) return;
  await ctx.db.delete(m._id);
  await ctx.db.patch(group._id, { member_count: Math.max(0, group.member_count - 1) });
}

/** Owner only: remove someone from the group. */
export const removeMember = mutation({
  args: { groupId: v.string(), userId: v.id('users') },
  handler: async (ctx, { groupId, userId }) => {
    const me = await requireUser(ctx);
    const { group, me: member } = await requireMemberOf(ctx, groupId, me);
    if (member.role !== 'owner') throw new ConvexError('errors.forbidden');
    if (userId === me._id) throw new ConvexError("You can't remove yourself. Delete the group instead.");
    await dropMember(ctx, group, userId);
  },
});

/** Leave a group (owners delete theirs instead). */
export const leave = mutation({
  args: { groupId: v.string() },
  handler: async (ctx, { groupId }) => {
    const me = await requireUser(ctx);
    const { group, me: member } = await requireMemberOf(ctx, groupId, me);
    if (member.role === 'owner') throw new ConvexError('You own this group. Delete it instead of leaving.');
    await dropMember(ctx, group, me._id);
  },
});

/** Owner only: a new invite code (the old one stops working). */
export const newInviteCode = mutation({
  args: { groupId: v.string() },
  handler: async (ctx, { groupId }) => {
    const me = await requireUser(ctx);
    const { group, me: member } = await requireMemberOf(ctx, groupId, me);
    if (member.role !== 'owner') throw new ConvexError('errors.forbidden');
    await ctx.db.patch(group._id, { invite_code: await uniqueCode(ctx) });
  },
});

/** Owner only: delete the group with all its threads and posts. */
export const remove = mutation({
  args: { groupId: v.string() },
  handler: async (ctx, { groupId }) => {
    const me = await requireUser(ctx);
    const { group, me: member } = await requireMemberOf(ctx, groupId, me);
    if (member.role !== 'owner') throw new ConvexError('errors.forbidden');
    const threads = await ctx.db.query('group_threads').withIndex('by_group_last_post', (q) => q.eq('group_id', group._id)).take(500);
    for (const t of threads) {
      for (const p of await ctx.db.query('group_posts').withIndex('by_thread', (q) => q.eq('thread_id', t._id)).take(500)) await ctx.db.delete(p._id);
      await ctx.db.delete(t._id);
    }
    for (const m of await ctx.db.query('group_members').withIndex('by_group_user', (q) => q.eq('group_id', group._id)).take(MAX_MEMBERS)) await ctx.db.delete(m._id);
    await ctx.db.delete(group._id);
  },
});
