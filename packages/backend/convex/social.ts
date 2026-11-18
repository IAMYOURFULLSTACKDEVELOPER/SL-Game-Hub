import { ConvexError, v } from 'convex/values';
import { query, mutation, internalMutation } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { currentUser, requireActiveUser, requireUser } from './lib';
import { isPro } from './pro';
import { roomByCode, membersOf } from './rooms';
import { ROOM_GAME_NAMES } from './roomGames';

// Following and the notification bell.
//  - Following is one-way (no request to accept). The people you follow, and the people who follow you,
//    are your "friends" list when you invite players to a room or a scheduled game.
//  - When someone you follow lists a room in Live games or schedules a public game, you get a
//    notification, unless you muted them (the bell on their profile).
//  - Invites go only to people you follow or who follow you, once per room, and never to someone who
//    blocked you, so the bell can't be used to spam strangers.

const MAX_INVITES_PER_CALL = 20;
const MAX_FAN_OUT = 2000; // followers told about a new game
const HOSTING_BUCKET_MS = 30 * 60_000; // "is hosting" at most once per host every half hour
const NOTIFICATION_TTL_MS = 30 * 24 * 3600_000; // notifications are kept 30 days
const LIST_LIMIT = 300;

export const notificationKindV = v.union(
  v.literal('follow'), v.literal('game_invite'), v.literal('new_game'), v.literal('game_open'), v.literal('group_invite'),
);
type Kind = Doc<'notifications'>['kind'];

const followRow = (ctx: QueryCtx, follower: Id<'users'>, followee: Id<'users'>) =>
  ctx.db.query('follows').withIndex('by_follower_id_and_followee_id', (q) => q.eq('follower_id', follower).eq('followee_id', followee)).unique();

const hasBlocked = async (ctx: QueryCtx, blocker: Id<'users'>, blocked: Id<'users'>) =>
  !!await ctx.db.query('user_blocks').withIndex('by_pair', (q) => q.eq('blocker_id', blocker).eq('blocked_id', blocked)).unique();

/** Is `other` someone `me` follows, or a follower of `me`? (Who you may invite.) */
export async function isConnection(ctx: QueryCtx, me: Id<'users'>, other: Id<'users'>) {
  return !!(await followRow(ctx, me, other)) || !!(await followRow(ctx, other, me));
}

/**
 * Put a notification in someone's bell. With `key`, nothing is added if they already have one with
 * that key (one invite per room, one follow notice per follower, ...). Returns whether it was added.
 */
export async function notify(ctx: MutationCtx, userId: Id<'users'>, n: { kind: Kind; text: string; href: string; actorId?: Id<'users'>; key?: string }) {
  if (n.actorId === userId) return false;
  if (n.key && await ctx.db.query('notifications').withIndex('by_user_id_and_key', (q) => q.eq('user_id', userId).eq('key', n.key)).first()) {
    return false;
  }
  await ctx.db.insert('notifications', {
    user_id: userId, kind: n.kind, actor_id: n.actorId, text: n.text.slice(0, 200), href: n.href, read: false, key: n.key,
  });
  return true;
}

/** Tell everyone following `actorId` (who hasn't muted them) about a new game. Runs as its own job. */
export const notifyFollowers = internalMutation({
  args: { actorId: v.id('users'), kind: notificationKindV, text: v.string(), href: v.string(), key: v.optional(v.string()) },
  handler: async (ctx, { actorId, kind, text, href, key }) => {
    const followers = await ctx.db.query('follows').withIndex('by_followee_id', (q) => q.eq('followee_id', actorId)).take(MAX_FAN_OUT);
    for (const f of followers) {
      if (!f.notify) continue;
      if (await hasBlocked(ctx, actorId, f.follower_id)) continue;
      await notify(ctx, f.follower_id, { kind, text, href, actorId, key });
    }
  },
});

/** A host listed a room in Live games: their followers hear about it (at most every half hour). */
export async function announceHosting(ctx: MutationCtx, hostId: Id<'users'>, game: keyof typeof ROOM_GAME_NAMES) {
  const host = await ctx.db.get(hostId);
  if (!host || host.banned) return;
  const bucket = Math.floor(Date.now() / HOSTING_BUCKET_MS);
  await ctx.scheduler.runAfter(0, internal.social.notifyFollowers, {
    actorId: hostId, kind: 'new_game', href: '/lobby', key: `host:${hostId}:${bucket}`,
    text: `${host.username} is hosting a ${ROOM_GAME_NAMES[game]} game. Ask to join in Live games.`,
  });
}

// ---------- Profiles and lists ----------

async function person(ctx: QueryCtx, me: Doc<'users'> | null, u: Doc<'users'>) {
  return {
    id: u._id, username: u.username, avatar: u.avatar ?? 'av_lion', pro: isPro(u),
    iFollow: me ? !!await followRow(ctx, me._id, u._id) : false,
    followsMe: me ? !!await followRow(ctx, u._id, me._id) : false,
  };
}

/** A player's public page: their name, followers and whether you follow them. */
export const profile = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const me = await currentUser(ctx);
    const u = await ctx.db.query('users').withIndex('by_username_lower', (q) => q.eq('username_lower', username.toLowerCase())).unique();
    if (!u || u.banned) return null;
    const followers = await ctx.db.query('follows').withIndex('by_followee_id', (q) => q.eq('followee_id', u._id)).take(1001);
    const following = await ctx.db.query('follows').withIndex('by_follower_id_and_followee_id', (q) => q.eq('follower_id', u._id)).take(1001);
    const mine = me ? await followRow(ctx, me._id, u._id) : null;
    const together = me && me._id !== u._id
      ? await ctx.db.query('played_with').withIndex('by_user_id_and_other_id', (q) => q.eq('user_id', me._id).eq('other_id', u._id)).unique()
      : null;
    return {
      ...await person(ctx, me, u),
      fullName: me && u.is_public ? u.full_name : null, // real names only for signed-in players
      country: u.is_public ? u.country : null,
      joinedAt: u._creationTime,
      followers: followers.length, following: following.length, // 1001 means "1000+"
      isMe: me?._id === u._id,
      signedIn: !!me,
      notify: mine?.notify ?? false,
      gamesTogether: together?.games ?? 0,
    };
  },
});

/** Who someone follows, or who follows them. */
export const list = query({
  args: { username: v.string(), which: v.union(v.literal('followers'), v.literal('following')) },
  handler: async (ctx, { username, which }) => {
    const me = await currentUser(ctx);
    const u = await ctx.db.query('users').withIndex('by_username_lower', (q) => q.eq('username_lower', username.toLowerCase())).unique();
    if (!u || u.banned) return [];
    const rows = which === 'followers'
      ? (await ctx.db.query('follows').withIndex('by_followee_id', (q) => q.eq('followee_id', u._id)).order('desc').take(LIST_LIMIT)).map((f) => f.follower_id)
      : (await ctx.db.query('follows').withIndex('by_follower_id_and_followee_id', (q) => q.eq('follower_id', u._id)).take(LIST_LIMIT)).map((f) => f.followee_id);
    const out = [];
    for (const id of rows) {
      const p = await ctx.db.get(id);
      if (p && !p.banned) out.push(await person(ctx, me, p));
    }
    return out;
  },
});

/** Find players by the start of their username. */
export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const me = await requireUser(ctx);
    const term = q.trim().replace(/^@/, '').toLowerCase();
    if (term.length < 2) return [];
    const found = await ctx.db.query('users')
      .withIndex('by_username_lower', (x) => x.gte('username_lower', term).lt('username_lower', `${term}￿`)).take(20);
    const out = [];
    for (const u of found) if (u._id !== me._id && !u.banned) out.push(await person(ctx, me, u));
    return out;
  },
});

/** People you've played with (or shared a room with) recently and don't follow yet. */
async function suggestionsFor(ctx: QueryCtx, me: Doc<'users'>, limit: number) {
  const seen = new Map<Id<'users'>, { games: number; lastAt: number }>();
  const played = await ctx.db.query('played_with').withIndex('by_user_id_and_last_at', (q) => q.eq('user_id', me._id)).order('desc').take(60);
  for (const p of played) seen.set(p.other_id, { games: p.games, lastAt: p.last_at });
  const visits = await ctx.db.query('room_visits').withIndex('by_user_id_and_last_at', (q) => q.eq('user_id', me._id)).order('desc').take(20);
  for (const visit of visits) {
    const others = await ctx.db.query('room_visits').withIndex('by_room_id', (q) => q.eq('room_id', visit.room_id)).take(12);
    for (const o of others) {
      if (o.user_id === me._id || seen.has(o.user_id)) continue;
      seen.set(o.user_id, { games: 0, lastAt: Math.min(o.last_at, visit.last_at) });
    }
  }
  const out = [];
  for (const [id, info] of [...seen].sort((a, b) => b[1].lastAt - a[1].lastAt)) {
    if (out.length >= limit) break;
    if (await followRow(ctx, me._id, id)) continue;
    const u = await ctx.db.get(id);
    if (!u || u.banned || await hasBlocked(ctx, id, me._id)) continue;
    out.push({ ...await person(ctx, me, u), games: info.games });
  }
  return out;
}

const FOF_FRIENDS = 150; // people you follow that we look through
const FOF_EACH = 60; // ... and how many of the people each of them follows

/**
 * Friends of friends: people followed by the people you follow, most shared connections first, with
 * up to two of those friends named ("Followed by ada and 3 others you follow"). Private profiles
 * (all under-13s) are never suggested, nor anyone either of you has blocked.
 */
async function friendsOfFriendsFor(ctx: QueryCtx, me: Doc<'users'>, limit: number, skip: Set<Id<'users'>>) {
  const friends = await ctx.db.query('follows').withIndex('by_follower_id_and_followee_id', (q) => q.eq('follower_id', me._id)).take(FOF_FRIENDS);
  const mine = new Set(friends.map((f) => f.followee_id));
  const found = new Map<Id<'users'>, Id<'users'>[]>(); // candidate -> the friends who follow them
  for (const f of friends) {
    const theirs = await ctx.db.query('follows').withIndex('by_follower_id_and_followee_id', (q) => q.eq('follower_id', f.followee_id)).take(FOF_EACH);
    for (const t of theirs) {
      const id = t.followee_id;
      if (id === me._id || mine.has(id) || skip.has(id)) continue;
      const via = found.get(id);
      if (via) via.push(f.followee_id); else found.set(id, [f.followee_id]);
    }
  }
  const ranked = [...found].sort((x, y) => y[1].length - x[1].length);
  const names = new Map<Id<'users'>, string>();
  const nameOf = async (id: Id<'users'>) => {
    if (!names.has(id)) names.set(id, (await ctx.db.get(id))?.username ?? '');
    return names.get(id)!;
  };
  const out = [];
  for (const [id, via] of ranked) {
    if (out.length >= limit) break;
    const u = await ctx.db.get(id);
    if (!u || u.banned || !u.is_public || await hasBlocked(ctx, id, me._id) || await hasBlocked(ctx, me._id, id)) continue;
    const named = (await Promise.all(via.slice(0, 2).map(nameOf))).filter(Boolean);
    out.push({ ...await person(ctx, me, u), mutual: via.length, via: named });
  }
  return out;
}

/** The Friends page: who you follow, who follows you, and people you might know. */
export const people = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const followingRows = await ctx.db.query('follows').withIndex('by_follower_id_and_followee_id', (q) => q.eq('follower_id', me._id)).take(LIST_LIMIT);
    const followerRows = await ctx.db.query('follows').withIndex('by_followee_id', (q) => q.eq('followee_id', me._id)).order('desc').take(LIST_LIMIT);
    const following = [];
    for (const f of followingRows) {
      const u = await ctx.db.get(f.followee_id);
      if (u && !u.banned) following.push({ ...await person(ctx, me, u), notify: f.notify });
    }
    const followers = [];
    for (const f of followerRows) {
      const u = await ctx.db.get(f.follower_id);
      if (u && !u.banned) followers.push(await person(ctx, me, u));
    }
    following.sort((a, b) => a.username.localeCompare(b.username));
    const suggestions = await suggestionsFor(ctx, me, 12);
    const friendsOfFriends = await friendsOfFriendsFor(ctx, me, 12, new Set(suggestions.map((p) => p.id)));
    return { following, followers, suggestions, friendsOfFriends };
  },
});

/**
 * Friends to invite to a game: people you follow and people who follow you, the ones you've played
 * with most recently first. With `code`, says who is already in that room or was already invited.
 */
export const invitable = query({
  args: { code: v.optional(v.string()), eventId: v.optional(v.id('scheduled_games')) },
  handler: async (ctx, { code, eventId }) => {
    const me = await currentUser(ctx);
    if (!me) return [];
    const ids = new Set<Id<'users'>>();
    for (const f of await ctx.db.query('follows').withIndex('by_follower_id_and_followee_id', (q) => q.eq('follower_id', me._id)).take(LIST_LIMIT)) ids.add(f.followee_id);
    for (const f of await ctx.db.query('follows').withIndex('by_followee_id', (q) => q.eq('followee_id', me._id)).take(LIST_LIMIT)) ids.add(f.follower_id);
    const room = code ? await roomByCode(ctx, code) : null;
    const inRoom = new Set(room ? (await membersOf(ctx, room._id)).map((m) => m.user_id).filter(Boolean) : []);
    const recent = new Map((await ctx.db.query('played_with').withIndex('by_user_id_and_last_at', (q) => q.eq('user_id', me._id)).order('desc').take(100))
      .map((p) => [p.other_id, p.last_at] as const));
    const out = [];
    for (const id of ids) {
      const u = await ctx.db.get(id);
      if (!u || u.banned || await hasBlocked(ctx, id, me._id)) continue;
      const key = room ? `room:${room.code}` : eventId ? `event:${eventId}` : null;
      const invited = key
        ? !!await ctx.db.query('notifications').withIndex('by_user_id_and_key', (q) => q.eq('user_id', id).eq('key', key)).first()
        : false;
      out.push({ ...await person(ctx, me, u), inRoom: inRoom.has(id), invited, lastPlayed: recent.get(id) ?? 0 });
    }
    return out.sort((a, b) => b.lastPlayed - a.lastPlayed || a.username.localeCompare(b.username));
  },
});

// ---------- Following ----------

export const follow = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const me = await requireActiveUser(ctx);
    if (userId === me._id) throw new ConvexError("You can't follow yourself.");
    const u = await ctx.db.get(userId);
    if (!u || u.banned) throw new ConvexError('errors.notFound');
    if (await hasBlocked(ctx, userId, me._id)) throw new ConvexError(`You can't follow ${u.username}.`);
    if (await followRow(ctx, me._id, userId)) return;
    const mine = await ctx.db.query('follows').withIndex('by_follower_id_and_followee_id', (q) => q.eq('follower_id', me._id)).take(2001);
    if (mine.length >= 2000) throw new ConvexError('You follow lots of people already. Unfollow some first.');
    await ctx.db.insert('follows', { follower_id: me._id, followee_id: userId, notify: true });
    const back = !!await followRow(ctx, userId, me._id);
    await notify(ctx, userId, {
      kind: 'follow', actorId: me._id, href: `/u/${me.username}`, key: `follow:${me._id}`,
      text: back ? `${me.username} followed you back. You can now invite each other to games.` : `${me.username} started following you.`,
    });
  },
});

export const unfollow = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const me = await requireUser(ctx);
    const row = await followRow(ctx, me._id, userId);
    if (row) await ctx.db.delete(row._id);
  },
});

/** Hear (or stop hearing) when someone you follow hosts or schedules a game. */
export const setNotify = mutation({
  args: { userId: v.id('users'), on: v.boolean() },
  handler: async (ctx, { userId, on }) => {
    const me = await requireUser(ctx);
    const row = await followRow(ctx, me._id, userId);
    if (!row) throw new ConvexError('Follow them first.');
    await ctx.db.patch(row._id, { notify: on });
  },
});

// ---------- Inviting friends ----------

/** Check a list of friends to invite: deduplicated, capped, and only people you follow or who follow you. */
export async function invitees(ctx: QueryCtx, me: Doc<'users'>, userIds: Id<'users'>[]) {
  const unique = [...new Set(userIds)].filter((id) => id !== me._id);
  if (unique.length > MAX_INVITES_PER_CALL) throw new ConvexError(`Invite up to ${MAX_INVITES_PER_CALL} friends at a time.`);
  const out: Doc<'users'>[] = [];
  for (const id of unique) {
    const u = await ctx.db.get(id);
    if (!u || u.banned || !await isConnection(ctx, me._id, id) || await hasBlocked(ctx, id, me._id)) continue;
    out.push(u);
  }
  return out;
}

/** Anyone in an online room: invite friends to it. They get a notification that opens the room. */
export const inviteToRoom = mutation({
  args: { code: v.string(), userIds: v.array(v.id('users')) },
  handler: async (ctx, { code, userIds }) => {
    const me = await requireActiveUser(ctx);
    const room = await roomByCode(ctx, code);
    if (!room) throw new ConvexError('errors.notFound');
    const members = await membersOf(ctx, room._id);
    if (!members.some((m) => m.user_id === me._id)) throw new ConvexError('You are no longer in this room.');
    const name = ROOM_GAME_NAMES[room.game];
    let sent = 0;
    for (const u of await invitees(ctx, me, userIds)) {
      if (members.some((m) => m.user_id === u._id)) continue;
      const added = await notify(ctx, u._id, {
        kind: 'game_invite', actorId: me._id, key: `room:${room.code}`,
        href: `/games/${room.game}/play?room=${room.code}`,
        text: `${me.username} invited you to play ${name}${room.stake !== undefined ? ' for money' : ''}. Room ${room.code}.`,
      });
      if (added) sent++;
    }
    return { sent };
  },
});

// ---------- The bell ----------

export const notifications = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUser(ctx);
    if (!me) return { items: [], unread: 0 };
    const rows = await ctx.db.query('notifications').withIndex('by_user_id', (q) => q.eq('user_id', me._id)).order('desc').take(30);
    const unread = (await ctx.db.query('notifications').withIndex('by_user_id_and_read', (q) => q.eq('user_id', me._id).eq('read', false)).take(100)).length;
    const items = [];
    for (const n of rows) {
      const actor = n.actor_id ? await ctx.db.get(n.actor_id) : null;
      items.push({
        id: n._id, kind: n.kind, text: n.text, href: n.href, read: n.read, createdAt: n._creationTime,
        actor: actor ? { id: actor._id, username: actor.username, avatar: actor.avatar ?? 'av_lion', iFollow: !!await followRow(ctx, me._id, actor._id) } : null,
      });
    }
    return { items, unread };
  },
});

export const markRead = mutation({
  args: { id: v.id('notifications') },
  handler: async (ctx, { id }) => {
    const me = await requireUser(ctx);
    const n = await ctx.db.get(id);
    if (n && n.user_id === me._id && !n.read) await ctx.db.patch(n._id, { read: true });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query('notifications').withIndex('by_user_id_and_read', (q) => q.eq('user_id', me._id).eq('read', false)).take(200);
    for (const n of rows) await ctx.db.patch(n._id, { read: true });
  },
});

export const removeNotification = mutation({
  args: { id: v.id('notifications') },
  handler: async (ctx, { id }) => {
    const me = await requireUser(ctx);
    const n = await ctx.db.get(id);
    if (n && n.user_id === me._id) await ctx.db.delete(n._id);
  },
});

/** Daily: forget notifications older than 30 days. */
export const sweepNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - NOTIFICATION_TTL_MS;
    const old = await ctx.db.query('notifications').withIndex('by_creation_time', (q) => q.lt('_creationTime', cutoff)).take(500);
    for (const n of old) await ctx.db.delete(n._id);
    if (old.length === 500) await ctx.scheduler.runAfter(0, internal.social.sweepNotifications, {});
  },
});
