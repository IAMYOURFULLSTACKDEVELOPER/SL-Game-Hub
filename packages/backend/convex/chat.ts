import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { publicProfile, requireActiveUser, requireAdmin, requireUser } from './lib';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function containsProfanity(ctx: QueryCtx, text: string) {
  const words = await ctx.db.query('profanity_words').collect();
  return words.some((w) => new RegExp(`\\b${escapeRe(w.word)}\\b`, 'i').test(text));
}

function cleanContent(content: string) {
  const c = content.trim();
  if (c.length < 1 || c.length > 500) throw new ConvexError('message must be 1-500 characters');
  return c;
}

export const rooms = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('chat_rooms').withIndex('by_active', (q) => q.eq('is_active', true)).collect();
    return rows.filter((r) => r.type !== 'direct').map((r) => ({ id: r._id, name: r.name, description: r.description ?? null }));
  },
});

/** The latest 50 visible messages of a room, oldest first. Live: the chat page subscribes to it. */
export const messages = query({
  args: { roomId: v.id('chat_rooms') },
  handler: async (ctx, { roomId }) => {
    await requireUser(ctx);
    const room = await ctx.db.get(roomId);
    if (!room?.is_active || room.type === 'direct') return [];
    const rows = await ctx.db.query('chat_messages').withIndex('by_room', (q) => q.eq('room_id', roomId)).order('desc')
      .filter((q) => q.eq(q.field('is_deleted'), false)).take(50);
    return Promise.all(rows.reverse().map(async (m) => ({
      id: m._id, content: m.content, created_at: new Date(m._creationTime).toISOString(), profiles: await publicProfile(ctx, m.user_id),
    })));
  },
});

/** Was send_chat_message. Sending joins the room, so moderators can mute the sender there. */
export const send = mutation({
  args: { roomId: v.id('chat_rooms'), content: v.string() },
  handler: async (ctx, { roomId, content }) => {
    const me = await requireActiveUser(ctx, 'account banned');
    const text = cleanContent(content);
    const room = await ctx.db.get(roomId);
    if (!room?.is_active || room.type === 'direct') throw new ConvexError('room not found');
    const p = await ctx.db.query('chat_participants').withIndex('by_room_user', (q) => q.eq('room_id', roomId).eq('user_id', me._id)).unique();
    if (p?.is_muted && (p.muted_until === undefined || p.muted_until > Date.now())) throw new ConvexError('you are muted in this room');
    if (await containsProfanity(ctx, text)) throw new ConvexError('message contains inappropriate language');
    if (!p) await ctx.db.insert('chat_participants', { room_id: roomId, user_id: me._id, joined_at: Date.now(), is_muted: false });
    return ctx.db.insert('chat_messages', { room_id: roomId, user_id: me._id, content: text, is_deleted: false, is_flagged: false });
  },
});

/** Was send_direct_message: one conversation per pair of players. */
export const sendDirect = mutation({
  args: { recipientId: v.id('users'), content: v.string() },
  handler: async (ctx, { recipientId, content }) => {
    const me = await requireActiveUser(ctx, 'account banned');
    const text = cleanContent(content);
    if (recipientId === me._id || !(await ctx.db.get(recipientId))) throw new ConvexError('user not found');
    const blocked = await ctx.db.query('user_blocks').withIndex('by_pair', (q) => q.eq('blocker_id', recipientId).eq('blocked_id', me._id)).unique()
      ?? await ctx.db.query('user_blocks').withIndex('by_pair', (q) => q.eq('blocker_id', me._id).eq('blocked_id', recipientId)).unique();
    if (blocked) throw new ConvexError('cannot send message to blocked user');
    if (await containsProfanity(ctx, text)) throw new ConvexError('message contains inappropriate language');

    const [user1_id, user2_id] = me._id < recipientId ? [me._id, recipientId] : [recipientId, me._id];
    const convo = await ctx.db.query('conversations').withIndex('by_pair', (q) => q.eq('user1_id', user1_id).eq('user2_id', user2_id)).unique();
    const conversation_id = convo?._id ?? await ctx.db.insert('conversations', { user1_id, user2_id });
    return ctx.db.insert('direct_messages', { conversation_id, sender_id: me._id, content: text, is_deleted: false, is_flagged: false });
  },
});

export const block = mutation({
  args: { blockedId: v.id('users') },
  handler: async (ctx, { blockedId }) => {
    const me = await requireUser(ctx);
    if (blockedId === me._id) throw new ConvexError('cannot block yourself');
    const existing = await ctx.db.query('user_blocks').withIndex('by_pair', (q) => q.eq('blocker_id', me._id).eq('blocked_id', blockedId)).unique();
    if (!existing) await ctx.db.insert('user_blocks', { blocker_id: me._id, blocked_id: blockedId, blocked_at: Date.now() });
  },
});

export const unblock = mutation({
  args: { blockedId: v.id('users') },
  handler: async (ctx, { blockedId }) => {
    const me = await requireUser(ctx);
    const existing = await ctx.db.query('user_blocks').withIndex('by_pair', (q) => q.eq('blocker_id', me._id).eq('blocked_id', blockedId)).unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

// ---------- Moderation ----------
export const moderation = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const flagged = await ctx.db.query('chat_messages')
      .withIndex('by_flagged', (q) => q.eq('is_flagged', true).eq('is_deleted', false)).order('desc').take(50);
    const muted = await ctx.db.query('chat_participants').withIndex('by_muted', (q) => q.eq('is_muted', true)).order('desc').collect();
    const roomName = async (id: (typeof flagged)[number]['room_id']) => ({ name: (await ctx.db.get(id))?.name ?? '' });
    return {
      flagged: await Promise.all(flagged.map(async (m) => ({
        id: m._id, content: m.content, created_at: new Date(m._creationTime).toISOString(),
        profiles: await publicProfile(ctx, m.user_id), chat_rooms: await roomName(m.room_id),
      }))),
      muted: await Promise.all(muted.map(async (p) => ({
        id: p._id, muted_until: p.muted_until === undefined ? null : new Date(p.muted_until).toISOString(),
        profiles: await publicProfile(ctx, p.user_id), chat_rooms: await roomName(p.room_id),
      }))),
    };
  },
});

export const deleteMessage = mutation({
  args: { messageId: v.id('chat_messages') },
  handler: async (ctx, { messageId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(messageId, { is_deleted: true });
  },
});

export const mute = mutation({
  args: { participantId: v.id('chat_participants'), minutes: v.number() },
  handler: async (ctx, { participantId, minutes }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(participantId, { is_muted: true, muted_until: Date.now() + minutes * 60_000 });
  },
});
