import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { isAdmin, publicProfile, requireActiveUser, requireUser } from './lib';
import { containsProfanity } from './chat';
import { ROOM_GAMES } from './roomGames';
import { roomByCode } from './rooms';
import { internal } from './_generated/api';
import { invitees, notify } from './social';

// Scheduled games. A player picks a game, a date and time, and either an online room or a tournament.
//  - A room: at game time the host opens the room from the schedule; its code is attached, and everyone
//    going gets a "Join room" button.
//  - A tournament: also creates a `tournaments` row open for registration until it starts (the host is registered).
// It can be shared with one of your groups (members see it, and it's announced in the group's first channel)
// or listed for everyone. People say whether they're going. The host or the group owner can cancel it.
// The host (and anyone going) can invite friends: they get a notification and can see the game even if it's
// private to a group. A public game is also announced to the host's followers.

const SCHEDULE_GAMES = [...ROOM_GAMES, 'dice'] as const;
const MIN_LEAD_MS = 5 * 60_000; // at least 5 minutes from now
const MAX_LEAD_MS = 60 * 24 * 3600_000; // at most 60 days ahead
const SHOW_AFTER_START_MS = 3 * 3600_000; // a game stays listed for 3 hours after it starts
const MAX_UPCOMING_PER_HOST = 10;

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Freetown',
});

async function memberOf(ctx: QueryCtx, groupId: Id<'groups'>, userId: Id<'users'>) {
  return ctx.db.query('group_members').withIndex('by_group_user', (q) => q.eq('group_id', groupId).eq('user_id', userId)).unique();
}

/** May this player see the event, and manage it? */
async function access(ctx: QueryCtx, e: Doc<'scheduled_games'>, user: Doc<'users'>) {
  const member = e.group_id ? await memberOf(ctx, e.group_id, user._id) : null;
  const invited = !e.public && !member && e.created_by !== user._id
    ? !!await ctx.db.query('schedule_rsvps').withIndex('by_event_id_and_user_id', (q) => q.eq('event_id', e._id).eq('user_id', user._id)).unique()
    : false;
  const see = e.public || e.created_by === user._id || !!member || invited;
  const manage = e.created_by === user._id || member?.role === 'owner' || isAdmin(user);
  return { see, manage };
}

async function toRow(ctx: QueryCtx, e: Doc<'scheduled_games'>, user: Doc<'users'>, manage: boolean) {
  const rsvps = await ctx.db.query('schedule_rsvps').withIndex('by_event_id_and_user_id', (q) => q.eq('event_id', e._id)).take(300);
  const going = rsvps.filter((r) => r.status === 'going');
  const game = await ctx.db.query('games').withIndex('by_slug', (q) => q.eq('slug', e.game)).unique();
  const group = e.group_id ? await ctx.db.get(e.group_id) : null;
  return {
    id: e._id, kind: e.kind, game: e.game, gameName: game?.name ?? e.game, title: e.title, note: e.note ?? null,
    startsAt: e.starts_at, status: e.status, public: e.public,
    host: { id: e.created_by, ...await publicProfile(ctx, e.created_by) },
    isHost: e.created_by === user._id, canManage: manage,
    group: group ? { id: group._id, name: group.name } : null,
    roomCode: e.room_code ?? null, tournamentId: e.tournament_id ?? null, maxPlayers: e.max_players ?? null,
    going: going.length, maybe: rsvps.filter((r) => r.status === 'maybe').length, invited: rsvps.filter((r) => r.status === 'invited').length,
    goingNames: await Promise.all(going.slice(0, 6).map(async (r) => (await publicProfile(ctx, r.user_id)).username)),
    myRsvp: rsvps.find((r) => r.user_id === user._id)?.status ?? null,
  };
}

/**
 * Upcoming games you can see: public ones, your groups', yours and ones you answered.
 * `now` comes from the page (queries can't read the clock); a group page passes `groupId` for just that group's.
 */
export const upcoming = query({
  args: { now: v.number(), groupId: v.optional(v.id('groups')) },
  handler: async (ctx, { now, groupId }) => {
    const me = await requireUser(ctx);
    const from = now - SHOW_AFTER_START_MS;
    const found = new Map<Id<'scheduled_games'>, Doc<'scheduled_games'>>();
    const add = (rows: Doc<'scheduled_games'>[]) => rows.forEach((r) => found.set(r._id, r));
    if (groupId) {
      if (!await memberOf(ctx, groupId, me._id)) throw new ConvexError('errors.notFound');
      add(await ctx.db.query('scheduled_games').withIndex('by_group_id_and_starts_at', (q) => q.eq('group_id', groupId).gte('starts_at', from)).take(40));
    } else {
      add(await ctx.db.query('scheduled_games').withIndex('by_public_and_starts_at', (q) => q.eq('public', true).gte('starts_at', from)).take(40));
      add(await ctx.db.query('scheduled_games').withIndex('by_created_by_and_starts_at', (q) => q.eq('created_by', me._id).gte('starts_at', from)).take(20));
      for (const m of await ctx.db.query('group_members').withIndex('by_user', (q) => q.eq('user_id', me._id)).take(30)) {
        add(await ctx.db.query('scheduled_games').withIndex('by_group_id_and_starts_at', (q) => q.eq('group_id', m.group_id).gte('starts_at', from)).take(10));
      }
      for (const r of await ctx.db.query('schedule_rsvps').withIndex('by_user_id', (q) => q.eq('user_id', me._id)).order('desc').take(30)) {
        const e = await ctx.db.get(r.event_id);
        if (e && e.starts_at >= from) found.set(e._id, e);
      }
    }
    const rows = [];
    for (const e of [...found.values()].sort((a, b) => a.starts_at - b.starts_at)) {
      if (e.status === 'cancelled' && e.created_by !== me._id) continue;
      const { see, manage } = await access(ctx, e, me);
      if (see) rows.push(await toRow(ctx, e, me, manage));
    }
    return { games: rows, groups: await myGroups(ctx, me._id) };
  },
});

async function myGroups(ctx: QueryCtx, userId: Id<'users'>) {
  const ms = await ctx.db.query('group_members').withIndex('by_user', (q) => q.eq('user_id', userId)).take(30);
  const out: { id: Id<'groups'>; name: string }[] = [];
  for (const m of ms) { const g = await ctx.db.get(m.group_id); if (g) out.push({ id: g._id, name: g.name }); }
  return out;
}

async function announce(ctx: MutationCtx, groupId: Id<'groups'>, userId: Id<'users'>, text: string) {
  const channel = await ctx.db.query('group_channels').withIndex('by_group_id_and_position', (q) => q.eq('group_id', groupId)).first();
  if (!channel) return;
  const now = Date.now();
  await ctx.db.insert('chat_messages', { channel_id: channel._id, user_id: userId, content: text.slice(0, 500), is_deleted: false, is_flagged: false });
  await ctx.db.patch(channel._id, { last_message_at: now });
  await ctx.db.patch(groupId, { last_post_at: now });
}

/** Schedule a game: an online room at a set time, or a tournament. */
export const create = mutation({
  args: {
    kind: v.union(v.literal('room'), v.literal('tournament')),
    game: v.string(),
    title: v.string(),
    startsAt: v.number(),
    note: v.optional(v.string()),
    groupId: v.optional(v.id('groups')),
    maxPlayers: v.optional(v.number()),
    invite: v.optional(v.array(v.id('users'))), // friends to invite
  },
  handler: async (ctx, a) => {
    const me = await requireActiveUser(ctx, 'errors.suspended');
    const now = Date.now();
    if (!(SCHEDULE_GAMES as readonly string[]).includes(a.game)) throw new ConvexError('That game can’t be scheduled yet.');
    if (a.kind === 'tournament' && a.game === 'snake') throw new ConvexError('Snake can’t be played as a tournament yet.');
    const game = await ctx.db.query('games').withIndex('by_slug', (q) => q.eq('slug', a.game)).unique();
    if (!game) throw new ConvexError('That game can’t be scheduled yet.');
    if (!Number.isFinite(a.startsAt) || a.startsAt < now + MIN_LEAD_MS) throw new ConvexError('Pick a time at least 5 minutes from now.');
    if (a.startsAt > now + MAX_LEAD_MS) throw new ConvexError('Pick a time within the next 60 days.');
    const title = a.title.trim().replace(/\s+/g, ' ');
    if (title.length < 3 || title.length > 80) throw new ConvexError('Give it a title of 3 to 80 characters.');
    const note = a.note?.trim() ? a.note.trim().slice(0, 300) : undefined;
    if (await containsProfanity(ctx, `${title} ${note ?? ''}`)) throw new ConvexError('errors.inappropriateLanguage');
    if (a.groupId && !await memberOf(ctx, a.groupId, me._id)) throw new ConvexError('errors.notFound');
    const mine = await ctx.db.query('scheduled_games').withIndex('by_created_by_and_starts_at', (q) => q.eq('created_by', me._id).gt('starts_at', now)).take(MAX_UPCOMING_PER_HOST + 1);
    if (mine.filter((e) => e.status === 'scheduled').length >= MAX_UPCOMING_PER_HOST) {
      throw new ConvexError(`You can have up to ${MAX_UPCOMING_PER_HOST} games scheduled at once.`);
    }

    let tournamentId: Id<'tournaments'> | undefined;
    let maxPlayers: number | undefined;
    if (a.kind === 'tournament') {
      maxPlayers = Math.min(64, Math.max(4, Math.round(a.maxPlayers ?? 8)));
      tournamentId = await ctx.db.insert('tournaments', {
        game_id: game._id, name: title, description: note, format: 'single_elimination', max_players: maxPlayers,
        status: 'registration', registration_starts_at: now, registration_ends_at: a.startsAt, starts_at: a.startsAt,
        prize_coins: 0, entry_fee_coins: 0, created_by: me._id, updated_at: now,
      });
      await ctx.db.insert('tournament_registrations', { tournament_id: tournamentId, user_id: me._id, registered_at: now, status: 'registered' });
    }
    const id = await ctx.db.insert('scheduled_games', {
      kind: a.kind, game: a.game, title, note, starts_at: a.startsAt, created_by: me._id,
      group_id: a.groupId, public: !a.groupId, status: 'scheduled', tournament_id: tournamentId, max_players: maxPlayers,
    });
    await ctx.db.insert('schedule_rsvps', { event_id: id, user_id: me._id, status: 'going' });
    const what = a.kind === 'tournament' ? 'a tournament' : 'a game';
    await inviteFriends(ctx, me, (await ctx.db.get(id))!, game.name, a.invite ?? []);
    if (!a.groupId) {
      // Followers hear about public games (the friends just invited already have their invite)
      await ctx.scheduler.runAfter(0, internal.social.notifyFollowers, {
        actorId: me._id, kind: 'new_game', href: '/schedule', key: `event:${id}`,
        text: `${me.username} scheduled ${what}: ${title} (${game.name}), ${when(a.startsAt)}.`,
      });
    }
    if (a.groupId) {
      await announce(ctx, a.groupId, me._id,
        `📅 I scheduled ${a.kind === 'tournament' ? 'a tournament' : 'a game'}: ${title} (${game.name}), ${when(a.startsAt)}. Open the group's Games tab to say if you're coming.`);
    }
    return id;
  },
});

async function inviteFriends(ctx: MutationCtx, me: Doc<'users'>, e: Doc<'scheduled_games'>, gameName: string, userIds: Id<'users'>[]) {
  let sent = 0;
  for (const u of await invitees(ctx, me, userIds)) {
    const r = await ctx.db.query('schedule_rsvps').withIndex('by_event_id_and_user_id', (q) => q.eq('event_id', e._id).eq('user_id', u._id)).unique();
    if (!r) await ctx.db.insert('schedule_rsvps', { event_id: e._id, user_id: u._id, status: 'invited' });
    const added = await notify(ctx, u._id, {
      kind: 'game_invite', actorId: me._id, href: '/schedule', key: `event:${e._id}`,
      text: `${me.username} invited you to ${e.kind === 'tournament' ? 'a tournament' : 'a game'}: ${e.title} (${gameName}), ${when(e.starts_at)}.`,
    });
    if (added) sent++;
  }
  return sent;
}

/** The host, or anyone going: invite friends to a scheduled game. */
export const invite = mutation({
  args: { eventId: v.id('scheduled_games'), userIds: v.array(v.id('users')) },
  handler: async (ctx, { eventId, userIds }) => {
    const me = await requireActiveUser(ctx, 'errors.suspended');
    const e = await ctx.db.get(eventId);
    if (!e || !(await access(ctx, e, me)).see) throw new ConvexError('errors.notFound');
    if (e.status === 'cancelled') throw new ConvexError('This game was cancelled.');
    if (e.starts_at + SHOW_AFTER_START_MS < Date.now()) throw new ConvexError('This game is over.');
    const mine = await ctx.db.query('schedule_rsvps').withIndex('by_event_id_and_user_id', (q) => q.eq('event_id', e._id).eq('user_id', me._id)).unique();
    if (e.created_by !== me._id && mine?.status !== 'going') throw new ConvexError('Say you are going first, then invite friends.');
    const game = await ctx.db.query('games').withIndex('by_slug', (q) => q.eq('slug', e.game)).unique();
    return { sent: await inviteFriends(ctx, me, e, game?.name ?? e.game, userIds) };
  },
});

/** Going, maybe, or can't make it. */
export const rsvp = mutation({
  args: { eventId: v.id('scheduled_games'), status: v.union(v.literal('going'), v.literal('maybe'), v.literal('no')) },
  handler: async (ctx, { eventId, status }) => {
    const me = await requireActiveUser(ctx, 'errors.suspended');
    const e = await ctx.db.get(eventId);
    if (!e || !(await access(ctx, e, me)).see) throw new ConvexError('errors.notFound');
    if (e.status === 'cancelled') throw new ConvexError('This game was cancelled.');
    const r = await ctx.db.query('schedule_rsvps').withIndex('by_event_id_and_user_id', (q) => q.eq('event_id', e._id).eq('user_id', me._id)).unique();
    if (r) await ctx.db.patch(r._id, { status });
    else await ctx.db.insert('schedule_rsvps', { event_id: e._id, user_id: me._id, status });
    // Going to a tournament also registers you for it
    if (e.tournament_id && status === 'going') {
      const reg = await ctx.db.query('tournament_registrations').withIndex('by_tournament_user', (q) => q.eq('tournament_id', e.tournament_id!).eq('user_id', me._id)).unique();
      if (!reg) {
        const regs = await ctx.db.query('tournament_registrations').withIndex('by_tournament_status', (q) => q.eq('tournament_id', e.tournament_id!).eq('status', 'registered')).take(65);
        if (regs.length >= (e.max_players ?? 64)) throw new ConvexError('errors.tournamentFull');
        await ctx.db.insert('tournament_registrations', { tournament_id: e.tournament_id, user_id: me._id, registered_at: Date.now(), status: 'registered' });
      } else if (reg.status === 'withdrawn') await ctx.db.patch(reg._id, { status: 'registered' });
    }
    if (e.tournament_id && status !== 'going') {
      const reg = await ctx.db.query('tournament_registrations').withIndex('by_tournament_user', (q) => q.eq('tournament_id', e.tournament_id!).eq('user_id', me._id)).unique();
      if (reg?.status === 'registered') await ctx.db.patch(reg._id, { status: 'withdrawn' });
    }
  },
});

/** Host (or group owner): cancel. A tournament is cancelled too. */
export const cancel = mutation({
  args: { eventId: v.id('scheduled_games') },
  handler: async (ctx, { eventId }) => {
    const me = await requireUser(ctx);
    const e = await ctx.db.get(eventId);
    if (!e) return;
    if (!(await access(ctx, e, me)).manage) throw new ConvexError('errors.forbidden');
    await ctx.db.patch(e._id, { status: 'cancelled' });
    if (e.tournament_id) await ctx.db.patch(e.tournament_id, { status: 'cancelled', updated_at: Date.now() });
    if (e.group_id) await announce(ctx, e.group_id, me._id, `❌ Cancelled: ${e.title} (${when(e.starts_at)}).`);
  },
});

/** Host: the room you just opened for this game, so everyone going can join it. */
export const attachRoom = mutation({
  args: { eventId: v.id('scheduled_games'), code: v.string() },
  handler: async (ctx, { eventId, code }) => {
    const me = await requireUser(ctx);
    const e = await ctx.db.get(eventId);
    if (!e || e.created_by !== me._id || e.kind !== 'room' || e.status !== 'scheduled') return;
    const room = await roomByCode(ctx, code);
    if (!room || room.game !== e.game) return;
    await ctx.db.patch(e._id, { room_code: room.code });
    // Everyone who said yes or maybe, or was invited, hears that the room is open
    const rsvps = await ctx.db.query('schedule_rsvps').withIndex('by_event_id_and_user_id', (q) => q.eq('event_id', e._id)).take(300);
    for (const r of rsvps) {
      if (r.status === 'no') continue;
      await notify(ctx, r.user_id, {
        kind: 'game_open', actorId: me._id, href: `/games/${e.game}/play?room=${room.code}`, key: `open:${e._id}`,
        text: `${e.title} is starting: ${me.username} opened the room. Join now.`,
      });
    }
    if (e.group_id) await announce(ctx, e.group_id, me._id, `🎮 ${e.title} is open now. Join from the group's Games tab.`);
  },
});
