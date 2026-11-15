import { ConvexError, v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { isAdmin, publicProfile, requireActiveUser, requireUser } from './lib';
import { cleanContent, containsProfanity } from './chat';

// Chat for the Chat page and for groups: public rooms (chat_rooms) and group channels (group_channels) share one
// message table and the same features: replies, emoji reactions, editing and deleting your own messages,
// "is typing", and unread counts. Channels are for the group's members only.

export const REACTIONS = ['👍', '❤️', '😂', '🔥', '🎉', '😮', '😢', '👏'] as const;
const PAGE = 60; // messages shown per place
const TYPING_MS = 5000;
const MAX_UNREAD = 50; // counted up to this, shown as "50+"

export const whereV = v.union(
  v.object({ room: v.id('chat_rooms') }),
  v.object({ channel: v.id('group_channels') }),
);
type Where = { room: Id<'chat_rooms'> } | { channel: Id<'group_channels'> };

type Place =
  | { kind: 'room'; key: string; room: Doc<'chat_rooms'>; canModerate: boolean }
  | { kind: 'channel'; key: string; channel: Doc<'group_channels'>; group: Doc<'groups'>; canModerate: boolean };

const keyOf = (w: Where) => ('room' in w ? `room:${w.room}` : `channel:${w.channel}`);

/** Where a message is, checked against who is asking: rooms are open to everyone signed in, channels to members. */
async function placeFor(ctx: QueryCtx, user: Doc<'users'>, w: Where): Promise<Place> {
  if ('room' in w) {
    const room = await ctx.db.get(w.room);
    if (!room?.is_active || room.type === 'direct') throw new ConvexError('errors.notFound');
    return { kind: 'room', key: keyOf(w), room, canModerate: isAdmin(user) };
  }
  const channel = await ctx.db.get(w.channel);
  const group = channel && await ctx.db.get(channel.group_id);
  const member = group && await ctx.db.query('group_members')
    .withIndex('by_group_user', (q) => q.eq('group_id', group._id).eq('user_id', user._id)).unique();
  if (!channel || !group || !member) throw new ConvexError('errors.notFound');
  return { kind: 'channel', key: keyOf(w), channel, group, canModerate: member.role === 'owner' || isAdmin(user) };
}

const latest = (ctx: QueryCtx, place: Place) => (place.kind === 'room'
  ? ctx.db.query('chat_messages').withIndex('by_room', (q) => q.eq('room_id', place.room._id))
  : ctx.db.query('chat_messages').withIndex('by_channel_id', (q) => q.eq('channel_id', place.channel._id)));

async function messagePlace(ctx: QueryCtx, user: Doc<'users'>, m: Doc<'chat_messages'>) {
  if (m.room_id) return placeFor(ctx, user, { room: m.room_id });
  if (m.channel_id) return placeFor(ctx, user, { channel: m.channel_id });
  throw new ConvexError('errors.notFound');
}

async function unreadIn(ctx: QueryCtx, me: Id<'users'>, place: { key: string; room?: Id<'chat_rooms'>; channel?: Id<'group_channels'> }) {
  const read = await ctx.db.query('chat_reads').withIndex('by_user_id_and_place', (q) => q.eq('user_id', me).eq('place', place.key)).unique();
  if (!read) return 0; // a place you've never opened isn't shouted at you
  const rows = place.room
    ? await ctx.db.query('chat_messages').withIndex('by_room', (q) => q.eq('room_id', place.room).gt('_creationTime', read.last_read)).take(MAX_UNREAD + 1)
    : await ctx.db.query('chat_messages').withIndex('by_channel_id', (q) => q.eq('channel_id', place.channel).gt('_creationTime', read.last_read)).take(MAX_UNREAD + 1);
  return rows.filter((m) => !m.is_deleted && m.user_id !== me).length;
}

/** The Chat page's side list: public rooms, then your groups and their channels, with unread counts. */
export const sidebar = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rooms = (await ctx.db.query('chat_rooms').withIndex('by_active', (q) => q.eq('is_active', true)).take(30))
      .filter((r) => r.type !== 'direct');
    const memberships = await ctx.db.query('group_members').withIndex('by_user', (q) => q.eq('user_id', me._id)).take(30);
    const groups = await Promise.all(memberships.map(async (m) => {
      const g = await ctx.db.get(m.group_id);
      if (!g) return null;
      const channels = await ctx.db.query('group_channels').withIndex('by_group_id_and_position', (q) => q.eq('group_id', g._id)).take(20);
      return {
        id: g._id, name: g.name, role: m.role, lastActive: g.last_post_at ?? g._creationTime,
        channels: await Promise.all(channels.map(async (c) => ({
          id: c._id, name: c.name, topic: c.topic ?? null,
          unread: await unreadIn(ctx, me._id, { key: `channel:${c._id}`, channel: c._id }),
        }))),
      };
    }));
    const invites = await ctx.db.query('group_invites').withIndex('by_user_id', (q) => q.eq('user_id', me._id)).take(20);
    return {
      rooms: await Promise.all(rooms.map(async (r) => ({
        id: r._id, name: r.name, description: r.description ?? null,
        unread: await unreadIn(ctx, me._id, { key: `room:${r._id}`, room: r._id }),
      }))),
      groups: groups.filter((g) => !!g).sort((a, b) => b.lastActive - a.lastActive),
      invites: invites.length,
    };
  },
});

/** The latest messages in a room or channel, oldest first, with replies, reactions and who is typing. Live. */
export const list = query({
  args: { where: whereV },
  handler: async (ctx, { where }) => {
    const me = await requireUser(ctx);
    const place = await placeFor(ctx, me, where);
    const rows = (await latest(ctx, place).order('desc').take(PAGE)).reverse();
    const profiles = new Map<Id<'users'>, { username: string; avatar: string }>();
    const profile = async (id: Id<'users'>) => {
      if (!profiles.has(id)) profiles.set(id, await publicProfile(ctx, id));
      return profiles.get(id)!;
    };
    const messages = await Promise.all(rows.filter((m) => !m.is_deleted).map(async (m) => {
      const reacts = await ctx.db.query('chat_reactions').withIndex('by_message_id_and_user_id_and_emoji', (q) => q.eq('message_id', m._id)).take(200);
      const counts = new Map<string, { count: number; mine: boolean }>();
      for (const r of reacts) {
        const c = counts.get(r.emoji) ?? { count: 0, mine: false };
        counts.set(r.emoji, { count: c.count + 1, mine: c.mine || r.user_id === me._id });
      }
      const parent = m.reply_to ? await ctx.db.get(m.reply_to) : null;
      return {
        id: m._id,
        content: m.content,
        createdAt: m._creationTime,
        edited: m.edited_at !== undefined,
        author: { id: m.user_id, ...await profile(m.user_id) },
        mine: m.user_id === me._id,
        canDelete: m.user_id === me._id || place.canModerate,
        reply: parent ? {
          id: parent._id,
          author: (await profile(parent.user_id)).username,
          text: parent.is_deleted ? 'Message deleted' : parent.content.slice(0, 120),
        } : null,
        reactions: REACTIONS.filter((e) => counts.has(e)).map((e) => ({ emoji: e, ...counts.get(e)! })),
      };
    }));
    const typing = await ctx.db.query('chat_typing').withIndex('by_place_and_user_id', (q) => q.eq('place', place.key)).take(20);
    return {
      me: { id: me._id, username: me.username },
      title: place.kind === 'room' ? place.room.name : `#${place.channel.name}`,
      topic: place.kind === 'room' ? place.room.description ?? null : place.channel.topic ?? null,
      group: place.kind === 'channel' ? { id: place.group._id, name: place.group.name } : null,
      reactions: REACTIONS,
      messages,
      // The page hides entries whose `until` has passed (queries can't read the clock)
      typing: await Promise.all(typing.filter((t) => t.user_id !== me._id).map(async (t) => ({ username: (await profile(t.user_id)).username, until: t.until }))),
    };
  },
});

async function clearTyping(ctx: MutationCtx, key: string, userId: Id<'users'>) {
  const t = await ctx.db.query('chat_typing').withIndex('by_place_and_user_id', (q) => q.eq('place', key).eq('user_id', userId)).unique();
  if (t) await ctx.db.delete(t._id);
}

async function markReadAt(ctx: MutationCtx, userId: Id<'users'>, key: string, at: number) {
  const read = await ctx.db.query('chat_reads').withIndex('by_user_id_and_place', (q) => q.eq('user_id', userId).eq('place', key)).unique();
  if (read) { if (read.last_read < at) await ctx.db.patch(read._id, { last_read: at }); }
  else await ctx.db.insert('chat_reads', { user_id: userId, place: key, last_read: at });
}

export const send = mutation({
  args: { where: whereV, content: v.string(), replyTo: v.optional(v.id('chat_messages')) },
  handler: async (ctx, { where, content, replyTo }) => {
    const me = await requireActiveUser(ctx, 'errors.suspended');
    const place = await placeFor(ctx, me, where);
    const text = cleanContent(content);
    if (await containsProfanity(ctx, text)) throw new ConvexError('errors.inappropriateLanguage');
    if (replyTo) {
      const parent = await ctx.db.get(replyTo);
      const same = parent && (place.kind === 'room' ? parent.room_id === place.room._id : parent.channel_id === place.channel._id);
      if (!same) throw new ConvexError('errors.notFound');
    }
    const now = Date.now();
    if (place.kind === 'room') {
      const p = await ctx.db.query('chat_participants').withIndex('by_room_user', (q) => q.eq('room_id', place.room._id).eq('user_id', me._id)).unique();
      if (p?.is_muted && (p.muted_until === undefined || p.muted_until > now)) throw new ConvexError('errors.muted');
      if (!p) await ctx.db.insert('chat_participants', { room_id: place.room._id, user_id: me._id, joined_at: now, is_muted: false });
    } else {
      await ctx.db.patch(place.channel._id, { last_message_at: now });
      await ctx.db.patch(place.group._id, { last_post_at: now });
    }
    const id = await ctx.db.insert('chat_messages', {
      ...(place.kind === 'room' ? { room_id: place.room._id } : { channel_id: place.channel._id }),
      user_id: me._id, content: text, is_deleted: false, is_flagged: false, ...(replyTo ? { reply_to: replyTo } : {}),
    });
    await clearTyping(ctx, place.key, me._id);
    await markReadAt(ctx, me._id, place.key, now);
    return id;
  },
});

/** Change your own message. */
export const edit = mutation({
  args: { messageId: v.id('chat_messages'), content: v.string() },
  handler: async (ctx, { messageId, content }) => {
    const me = await requireActiveUser(ctx, 'errors.suspended');
    const m = await ctx.db.get(messageId);
    if (!m || m.is_deleted || m.user_id !== me._id) throw new ConvexError('errors.forbidden');
    await messagePlace(ctx, me, m); // still allowed in there
    const text = cleanContent(content);
    if (await containsProfanity(ctx, text)) throw new ConvexError('errors.inappropriateLanguage');
    if (text !== m.content) await ctx.db.patch(m._id, { content: text, edited_at: Date.now() });
  },
});

/** Delete a message: its author, the group owner in a channel, or an admin. */
export const remove = mutation({
  args: { messageId: v.id('chat_messages') },
  handler: async (ctx, { messageId }) => {
    const me = await requireUser(ctx);
    const m = await ctx.db.get(messageId);
    if (!m || m.is_deleted) return;
    const place = await messagePlace(ctx, me, m);
    if (m.user_id !== me._id && !place.canModerate) throw new ConvexError('errors.forbidden');
    await ctx.db.patch(m._id, { is_deleted: true });
  },
});

/** Add or take back an emoji reaction. */
export const react = mutation({
  args: { messageId: v.id('chat_messages'), emoji: v.string() },
  handler: async (ctx, { messageId, emoji }) => {
    const me = await requireActiveUser(ctx, 'errors.suspended');
    if (!(REACTIONS as readonly string[]).includes(emoji)) throw new ConvexError('errors.notFound');
    const m = await ctx.db.get(messageId);
    if (!m || m.is_deleted) throw new ConvexError('errors.notFound');
    await messagePlace(ctx, me, m);
    const mine = await ctx.db.query('chat_reactions')
      .withIndex('by_message_id_and_user_id_and_emoji', (q) => q.eq('message_id', m._id).eq('user_id', me._id).eq('emoji', emoji)).unique();
    if (mine) await ctx.db.delete(mine._id);
    else await ctx.db.insert('chat_reactions', { message_id: m._id, user_id: me._id, emoji });
  },
});

/** "I'm typing" (sent every few seconds while typing). */
export const typing = mutation({
  args: { where: whereV },
  handler: async (ctx, { where }) => {
    const me = await requireUser(ctx);
    const place = await placeFor(ctx, me, where);
    const until = Date.now() + TYPING_MS;
    const t = await ctx.db.query('chat_typing').withIndex('by_place_and_user_id', (q) => q.eq('place', place.key).eq('user_id', me._id)).unique();
    if (t) await ctx.db.patch(t._id, { until });
    else await ctx.db.insert('chat_typing', { place: place.key, user_id: me._id, until });
  },
});

/** You've seen everything here (clears the unread count). */
export const markRead = mutation({
  args: { where: whereV },
  handler: async (ctx, { where }) => {
    const me = await requireUser(ctx);
    const place = await placeFor(ctx, me, where);
    await markReadAt(ctx, me._id, place.key, Date.now());
  },
});

/** Cron: forget old "is typing" rows. */
export const sweepTyping = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db.query('chat_typing').withIndex('by_until', (q) => q.lt('until', Date.now() - 60_000)).take(500);
    for (const t of old) await ctx.db.delete(t._id);
  },
});
