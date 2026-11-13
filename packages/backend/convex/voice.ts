import { ConvexError, v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { memberBySecret, membersOf, requireMember, roomByCode } from './rooms';

// Voice chat for online rooms. The audio travels directly between the players' browsers (WebRTC);
// the server only passes along the short set-up messages (offer, answer, network candidates)
// from one member to another. Only members of the room can join, and each member can read only
// the messages addressed to them (their private room secret proves who they are).

const MAX_SIGNAL_BYTES = 16_000; // an SDP offer is a few KB; anything bigger isn't a signal
const MAX_INBOX = 50; // waiting messages per member, so one member can't flood another

/** Join or leave the room's voice chat. */
export const setVoice = mutation({
  args: { code: v.string(), secret: v.string(), on: v.boolean() },
  handler: async (ctx, { code, secret, on }) => {
    const { me } = await requireMember(ctx, code, secret);
    await ctx.db.patch(me._id, { voice: on });
  },
});

/** Pass a set-up message to another member who is in voice chat. */
export const signal = mutation({
  args: {
    code: v.string(), secret: v.string(), to: v.string(),
    kind: v.union(v.literal('offer'), v.literal('answer'), v.literal('ice')), data: v.string(),
  },
  handler: async (ctx, { code, secret, to, kind, data }) => {
    const { room, me } = await requireMember(ctx, code, secret);
    if (!me.voice) throw new ConvexError('Join voice chat first.');
    if (data.length > MAX_SIGNAL_BYTES) throw new ConvexError('Voice set-up message too large.');
    const target = (await membersOf(ctx, room._id)).find((m) => m.member_id === to);
    if (!target?.voice || target.member_id === me.member_id) return; // they left voice: nothing to do
    const waiting = await ctx.db.query('voice_signals')
      .withIndex('by_room_id_and_to', (q) => q.eq('room_id', room._id).eq('to', to)).take(MAX_INBOX);
    if (waiting.length >= MAX_INBOX) return;
    await ctx.db.insert('voice_signals', { room_id: room._id, from: me.member_id, to, kind, data, created_at: Date.now() });
  },
});

/** Set-up messages waiting for me, oldest first. */
export const inbox = query({
  args: { code: v.string(), secret: v.string() },
  handler: async (ctx, { code, secret }) => {
    const room = await roomByCode(ctx, code);
    const me = room && await memberBySecret(ctx, room._id, secret);
    if (!room || !me) return [];
    const rows = await ctx.db.query('voice_signals')
      .withIndex('by_room_id_and_to', (q) => q.eq('room_id', room._id).eq('to', me.member_id)).take(MAX_INBOX);
    return rows.map((r) => ({ id: r._id, from: r.from, kind: r.kind, data: r.data }));
  },
});

/** Delete messages I have handled. */
export const ack = mutation({
  args: { code: v.string(), secret: v.string(), ids: v.array(v.id('voice_signals')) },
  handler: async (ctx, { code, secret, ids }) => {
    const { room, me } = await requireMember(ctx, code, secret);
    for (const id of ids.slice(0, MAX_INBOX)) {
      const row = await ctx.db.get(id);
      if (row && row.room_id === room._id && row.to === me.member_id) await ctx.db.delete(id);
    }
  },
});
