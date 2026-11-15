import { ConvexError, v } from 'convex/values';
import { query, mutation, internalMutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { publicProfile, requireActiveUser, requireUser } from './lib';
import { containsProfanity } from './chat';
import { isPro } from './pro';

// Groups for teams: chat channels (#general and any the owner adds; messages in convex/messaging.ts), a forum
// (threads and posts), and members. Creating a group is a Pro feature. People join with the group's invite code,
// or the owner invites them by username, email, or from the people they've played online with; an invited
// player accepts or declines. The owner can remove members and any post or message, and make a new code
// (the old one stops working). Everything is visible to the group's members only.

const MAX_GROUPS_PER_OWNER = 10;
const MAX_MEMBERS = 200;
const MAX_CHANNELS = 20;
const MAX_PENDING_INVITES = 50;
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
    await ctx.db.insert('group_channels', { group_id: id, name: 'general', topic: 'Talk about anything', position: 0, created_by: me._id });
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
    await addMember(ctx, group, me._id);
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
    const channels = await ctx.db.query('group_channels').withIndex('by_group_id_and_position', (q) => q.eq('group_id', group._id)).take(MAX_CHANNELS);
    const invites = owner
      ? await ctx.db.query('group_invites').withIndex('by_group_id_and_user_id', (q) => q.eq('group_id', group._id)).take(MAX_PENDING_INVITES)
      : [];
    return {
      id: group._id, name: group.name, description: group.description ?? null, member_count: group.member_count,
      isOwner: owner, inviteCode: owner ? group.invite_code : null,
      createdAt: group._creationTime,
      ownerName: (await publicProfile(ctx, group.owner_id)).username,
      members: await Promise.all(members.map(async (m) => ({ userId: m.user_id, role: m.role, joinedAt: m.joined_at, ...await publicProfile(ctx, m.user_id) }))),
      channels: channels.map((c) => ({ id: c._id, name: c.name, topic: c.topic ?? null, lastMessageAt: c.last_message_at ?? null })),
      invites: await Promise.all(invites.map(async (i) => ({ id: i._id, userId: i.user_id, createdAt: i.created_at, ...await publicProfile(ctx, i.user_id) }))),
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
    for (const c of await ctx.db.query('group_channels').withIndex('by_group_id_and_position', (q) => q.eq('group_id', group._id)).take(MAX_CHANNELS)) {
      await deleteChannelMessages(ctx, c._id);
      await ctx.db.delete(c._id);
    }
    for (const i of await ctx.db.query('group_invites').withIndex('by_group_id_and_user_id', (q) => q.eq('group_id', group._id)).take(MAX_PENDING_INVITES)) await ctx.db.delete(i._id);
    await ctx.db.delete(group._id);
  },
});

// ---- Members ------------------------------------------------------------------------------------------

async function addMember(ctx: MutationCtx, group: Doc<'groups'>, userId: Id<'users'>) {
  const invite = await ctx.db.query('group_invites').withIndex('by_group_id_and_user_id', (q) => q.eq('group_id', group._id).eq('user_id', userId)).unique();
  if (invite) await ctx.db.delete(invite._id);
  if (await membership(ctx, group._id, userId)) return;
  if (group.member_count >= MAX_MEMBERS) throw new ConvexError(`This group is full (${MAX_MEMBERS} members).`);
  await ctx.db.insert('group_members', { group_id: group._id, user_id: userId, role: 'member', joined_at: Date.now() });
  await ctx.db.patch(group._id, { member_count: group.member_count + 1 });
}

async function requireOwner(ctx: QueryCtx, groupId: string, user: Doc<'users'>) {
  const r = await requireMemberOf(ctx, groupId, user);
  if (r.me.role !== 'owner') throw new ConvexError('errors.forbidden');
  return r;
}

async function inviteUser(ctx: MutationCtx, group: Doc<'groups'>, from: Doc<'users'>, target: Doc<'users'> | null) {
  if (!target || target.banned) throw new ConvexError('No player found with that username or email.');
  if (target._id === from._id) throw new ConvexError('You are already in this group.');
  if (await membership(ctx, group._id, target._id)) throw new ConvexError(`${target.username} is already in this group.`);
  const blocked = await ctx.db.query('user_blocks').withIndex('by_pair', (q) => q.eq('blocker_id', target._id).eq('blocked_id', from._id)).unique();
  if (blocked) throw new ConvexError(`You can't invite ${target.username}.`);
  const existing = await ctx.db.query('group_invites').withIndex('by_group_id_and_user_id', (q) => q.eq('group_id', group._id).eq('user_id', target._id)).unique();
  if (existing) return target.username;
  const pending = await ctx.db.query('group_invites').withIndex('by_group_id_and_user_id', (q) => q.eq('group_id', group._id)).take(MAX_PENDING_INVITES);
  if (pending.length >= MAX_PENDING_INVITES) throw new ConvexError('Lots of invites are still waiting for an answer. Cancel some first.');
  await ctx.db.insert('group_invites', { group_id: group._id, user_id: target._id, invited_by: from._id, created_at: Date.now() });
  return target.username;
}

/** Owner: invite a player by their username or email address. They accept or decline on their Groups page. */
export const invite = mutation({
  args: { groupId: v.string(), who: v.string() },
  handler: async (ctx, { groupId, who }) => {
    const me = await requireActiveUser(ctx);
    const { group } = await requireOwner(ctx, groupId, me);
    const q = who.trim().replace(/^@/, '');
    if (q.length < 2 || q.length > 120) throw new ConvexError('Type a username or an email address.');
    const target = q.includes('@')
      ? await ctx.db.query('users').withIndex('email', (x) => x.eq('email', q.toLowerCase())).first()
      : await ctx.db.query('users').withIndex('by_username_lower', (x) => x.eq('username_lower', q.toLowerCase())).unique();
    return inviteUser(ctx, group, me, target);
  },
});

/** Owner: invite someone from "people you've played with". */
export const inviteUserId = mutation({
  args: { groupId: v.string(), userId: v.id('users') },
  handler: async (ctx, { groupId, userId }) => {
    const me = await requireActiveUser(ctx);
    const { group } = await requireOwner(ctx, groupId, me);
    return inviteUser(ctx, group, me, await ctx.db.get(userId));
  },
});

/** Owner: take back an invite that hasn't been answered. */
export const cancelInvite = mutation({
  args: { inviteId: v.id('group_invites') },
  handler: async (ctx, { inviteId }) => {
    const me = await requireUser(ctx);
    const inv = await ctx.db.get(inviteId);
    if (!inv) return;
    await requireOwner(ctx, inv.group_id, me);
    await ctx.db.delete(inv._id);
  },
});

/** Invites waiting for me. */
export const myInvites = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query('group_invites').withIndex('by_user_id', (q) => q.eq('user_id', me._id)).take(20);
    const out = await Promise.all(rows.map(async (i) => {
      const g = await ctx.db.get(i.group_id);
      return g && {
        id: i._id, groupId: g._id, name: g.name, description: g.description ?? null, members: g.member_count,
        from: (await publicProfile(ctx, i.invited_by)).username, createdAt: i.created_at,
      };
    }));
    return out.filter((x) => !!x);
  },
});

/** Accept (join the group) or decline an invite. */
export const answerInvite = mutation({
  args: { inviteId: v.id('group_invites'), accept: v.boolean() },
  handler: async (ctx, { inviteId, accept }) => {
    const me = await requireActiveUser(ctx);
    const inv = await ctx.db.get(inviteId);
    if (!inv || inv.user_id !== me._id) throw new ConvexError('That invite is no longer there.');
    const group = await ctx.db.get(inv.group_id);
    if (!accept || !group) { await ctx.db.delete(inv._id); return null; }
    await addMember(ctx, group, me._id);
    return group._id;
  },
});

/** Owner: people you've played online games with who aren't in the group yet, most recent first. */
export const suggestions = query({
  args: { groupId: v.string() },
  handler: async (ctx, { groupId }) => {
    const me = await requireUser(ctx);
    const { group } = await requireOwner(ctx, groupId, me);
    const seen = new Map<Id<'users'>, { games: number; lastAt: number }>();
    const played = await ctx.db.query('played_with').withIndex('by_user_id_and_last_at', (q) => q.eq('user_id', me._id)).order('desc').take(60);
    for (const p of played) seen.set(p.other_id, { games: p.games, lastAt: p.last_at });
    // Also everyone who was in the same online rooms recently
    const visits = await ctx.db.query('room_visits').withIndex('by_user_id_and_last_at', (q) => q.eq('user_id', me._id)).order('desc').take(30);
    for (const visit of visits) {
      const others = await ctx.db.query('room_visits').withIndex('by_room_id', (q) => q.eq('room_id', visit.room_id)).take(12);
      for (const o of others) {
        if (o.user_id === me._id || seen.has(o.user_id)) continue;
        seen.set(o.user_id, { games: 0, lastAt: Math.min(o.last_at, visit.last_at) });
      }
    }
    const out: { userId: Id<'users'>; username: string; avatar: string; games: number; lastAt: number; invited: boolean }[] = [];
    for (const [userId, info] of [...seen].sort((a, b) => b[1].lastAt - a[1].lastAt)) {
      if (out.length >= 30) break;
      if (await membership(ctx, group._id, userId)) continue;
      const u = await ctx.db.get(userId);
      if (!u || u.banned) continue;
      const invited = !!await ctx.db.query('group_invites').withIndex('by_group_id_and_user_id', (q) => q.eq('group_id', group._id).eq('user_id', userId)).unique();
      out.push({ userId, username: u.username, avatar: u.avatar ?? 'av_lion', games: info.games, lastAt: info.lastAt, invited });
    }
    return out;
  },
});

/** Called when an online game starts: remember who played with whom. */
export async function recordPlayedWith(ctx: MutationCtx, userIds: Id<'users'>[]) {
  const ids = [...new Set(userIds)].slice(0, 8);
  const now = Date.now();
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const row = await ctx.db.query('played_with').withIndex('by_user_id_and_other_id', (q) => q.eq('user_id', a).eq('other_id', b)).unique();
      if (row) await ctx.db.patch(row._id, { games: row.games + 1, last_at: now });
      else await ctx.db.insert('played_with', { user_id: a, other_id: b, games: 1, last_at: now });
    }
  }
}

// ---- Channels -----------------------------------------------------------------------------------------

function channelName(raw: string) {
  const n = raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (n.length < 2 || n.length > 30) throw new ConvexError('A channel name needs 2 to 30 letters, numbers or dashes.');
  return n;
}

async function deleteChannelMessages(ctx: MutationCtx, channelId: Id<'group_channels'>) {
  const msgs = await ctx.db.query('chat_messages').withIndex('by_channel_id', (q) => q.eq('channel_id', channelId)).take(1000);
  for (const m of msgs) {
    for (const r of await ctx.db.query('chat_reactions').withIndex('by_message_id_and_user_id_and_emoji', (q) => q.eq('message_id', m._id)).take(100)) await ctx.db.delete(r._id);
    await ctx.db.delete(m._id);
  }
}

/** Owner: add a chat channel. */
export const createChannel = mutation({
  args: { groupId: v.string(), name: v.string(), topic: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const me = await requireActiveUser(ctx);
    const { group } = await requireOwner(ctx, a.groupId, me);
    const name = channelName(a.name);
    const channels = await ctx.db.query('group_channels').withIndex('by_group_id_and_position', (q) => q.eq('group_id', group._id)).take(MAX_CHANNELS);
    if (channels.length >= MAX_CHANNELS) throw new ConvexError(`A group can have up to ${MAX_CHANNELS} channels.`);
    if (channels.some((c) => c.name === name)) throw new ConvexError(`There is already a #${name} channel.`);
    if (await containsProfanity(ctx, name)) throw new ConvexError('errors.inappropriateLanguage');
    const topic = a.topic?.trim() ? await cleanText(ctx, a.topic, 1, 120, 'The topic') : undefined;
    return ctx.db.insert('group_channels', {
      group_id: group._id, name, topic, position: (channels.at(-1)?.position ?? -1) + 1, created_by: me._id,
    });
  },
});

/** Owner: rename a channel or change its topic. */
export const updateChannel = mutation({
  args: { channelId: v.id('group_channels'), name: v.string(), topic: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const me = await requireActiveUser(ctx);
    const c = await ctx.db.get(a.channelId);
    if (!c) throw new ConvexError('errors.notFound');
    await requireOwner(ctx, c.group_id, me);
    const name = channelName(a.name);
    const clash = (await ctx.db.query('group_channels').withIndex('by_group_id_and_position', (q) => q.eq('group_id', c.group_id)).take(MAX_CHANNELS))
      .some((x) => x._id !== c._id && x.name === name);
    if (clash) throw new ConvexError(`There is already a #${name} channel.`);
    if (await containsProfanity(ctx, name)) throw new ConvexError('errors.inappropriateLanguage');
    const topic = a.topic?.trim() ? await cleanText(ctx, a.topic, 1, 120, 'The topic') : undefined;
    await ctx.db.patch(c._id, { name, topic });
  },
});

/** Owner: delete a channel and its messages (a group keeps at least one channel). */
export const removeChannel = mutation({
  args: { channelId: v.id('group_channels') },
  handler: async (ctx, { channelId }) => {
    const me = await requireUser(ctx);
    const c = await ctx.db.get(channelId);
    if (!c) return;
    await requireOwner(ctx, c.group_id, me);
    const count = (await ctx.db.query('group_channels').withIndex('by_group_id_and_position', (q) => q.eq('group_id', c.group_id)).take(2)).length;
    if (count < 2) throw new ConvexError('A group needs at least one channel.');
    await deleteChannelMessages(ctx, c._id);
    await ctx.db.delete(c._id);
  },
});

/** One-off: give groups made before channels existed a #general channel. */
export const addGeneralChannels = internalMutation({
  args: {},
  handler: async (ctx) => {
    let added = 0;
    for await (const g of ctx.db.query('groups')) {
      const has = await ctx.db.query('group_channels').withIndex('by_group_id_and_position', (q) => q.eq('group_id', g._id)).first();
      if (!has) {
        await ctx.db.insert('group_channels', { group_id: g._id, name: 'general', topic: 'Talk about anything', position: 0, created_by: g.owner_id });
        added++;
      }
    }
    return added;
  },
});
