import { ConvexError, v } from 'convex/values';
import { query, mutation, action, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { memberBySecret, membersOf, requireMember, roomByCode } from './rooms';

// Voice chat for online rooms. The audio travels directly between the players' browsers (WebRTC);
// the server only passes along the short set-up messages (offer, answer, network candidates)
// from one member to another. Only members of the room can join, and each member can read only
// the messages addressed to them (their private room secret proves who they are).
//
// Many mobile networks hide phones behind shared addresses, so a direct connection can't be made.
// A TURN relay fixes that. Set either:
//   CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN  (Cloudflare Realtime TURN; short-lived credentials per player)
//   TURN_URLS (comma-separated) + TURN_USERNAME + TURN_CREDENTIAL  (any other TURN server)
// on the Convex deployment. Without one, only players on friendly networks can hear each other.

const MAX_SIGNAL_BYTES = 16_000; // an SDP offer is a few KB; anything bigger isn't a signal
const MAX_INBOX = 50; // waiting messages per member, so one member can't flood another
const TURN_TTL_SECONDS = 4 * 3600; // long enough for a game night, short enough to be useless if leaked

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

/** True if `secret` belongs to a member of room `code` (used before handing out relay credentials). */
export const isMember = internalQuery({
  args: { code: v.string(), secret: v.string() },
  handler: async (ctx, { code, secret }) => {
    const room = await roomByCode(ctx, code);
    return !!(room && await memberBySecret(ctx, room._id, secret));
  },
});

type IceServer = { urls: string[]; username?: string; credential?: string };
const STUN: IceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

const clean = (s: unknown): IceServer | null => {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  const urls = (Array.isArray(o.urls) ? o.urls : [o.urls]).filter((u): u is string => typeof u === 'string');
  if (!urls.length) return null;
  return {
    urls,
    ...(typeof o.username === 'string' ? { username: o.username } : {}),
    ...(typeof o.credential === 'string' ? { credential: o.credential } : {}),
  };
};

/**
 * The network helpers a member's browser should use: STUN always, plus a TURN relay when one is
 * configured. Cloudflare credentials are generated per request and expire, so the API token never
 * leaves the server. `relay` tells the page whether players on strict networks can be reached.
 */
export const iceServers = action({
  args: { code: v.string(), secret: v.string() },
  handler: async (ctx, args): Promise<{ iceServers: IceServer[]; relay: boolean }> => {
    const member: boolean = await ctx.runQuery(internal.voice.isMember, args);
    if (!member) return { iceServers: STUN, relay: false };

    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID, token = process.env.CLOUDFLARE_TURN_API_TOKEN;
    if (keyId && token) {
      try {
        const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
        });
        if (res.ok) {
          const body = (await res.json()) as { iceServers?: unknown };
          const list = (Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers]).map(clean).filter((s): s is IceServer => !!s);
          if (list.some((s) => s.urls.some((u) => u.startsWith('turn')))) return { iceServers: [...STUN, ...list], relay: true };
        }
      } catch { /* Cloudflare unreachable: fall back below */ }
    }

    const urls = process.env.TURN_URLS?.split(',').map((u) => u.trim()).filter(Boolean);
    if (urls?.length) {
      const relay: IceServer = { urls };
      if (process.env.TURN_USERNAME) relay.username = process.env.TURN_USERNAME;
      if (process.env.TURN_CREDENTIAL) relay.credential = process.env.TURN_CREDENTIAL;
      return { iceServers: [...STUN, relay], relay: true };
    }
    return { iceServers: STUN, relay: false };
  },
});
