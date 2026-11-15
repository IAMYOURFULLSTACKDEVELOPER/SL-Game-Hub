import { ConvexError, v } from 'convex/values';
import { action, httpAction, internalMutation, internalQuery, query } from './_generated/server';
import type { ActionCtx, MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { verifyMuxSignature } from '@slgh/shared/src/mux-signature';
import { requireAdmin } from './lib';

// Broadcasts to spectators (Mux Video). An admin creates a channel here, pastes the server URL and stream key
// into OBS / Streamlabs / Larix (phone), and goes live; everyone watches on /live with a few seconds of delay.
// Every broadcast is recorded and the recording can be watched on /live afterwards.
// Real-time talk between players is NOT this: that is voice/video chat in game rooms (convex/livekit.ts).
//
// Deployment environment (`npx convex env set NAME value` in packages/backend):
//   MUX_TOKEN_ID, MUX_TOKEN_SECRET   Mux access token with Mux Video read + write
//   MUX_WEBHOOK_SECRET               signing secret of the webhook pointing at <site url>/mux/webhook

const API = 'https://api.mux.com/video/v1';
export const RTMPS_URL = 'rtmps://global-live.mux.com:443/app';
const RECONNECT_WINDOW_S = 60; // a dropped encoder can come back within this without ending the broadcast

const configured = () => !!(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET);

async function mux<T>(path: string, init: RequestInit = {}): Promise<T> {
  const id = process.env.MUX_TOKEN_ID, secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) throw new ConvexError('Broadcasting is not set up on the server yet.');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 404 && init.method === 'DELETE') return {} as T; // already gone
  if (!res.ok) {
    console.error('mux', init.method ?? 'GET', path, res.status, (await res.text()).slice(0, 300));
    throw new ConvexError('The broadcast service did not accept that. Try again in a minute.');
  }
  if (res.status === 204) return {} as T;
  return ((await res.json()) as { data: T }).data;
}

type PlaybackId = { id: string; policy: string };
type MuxStream = { id: string; stream_key: string; status: 'idle' | 'active' | 'disabled'; playback_ids?: PlaybackId[]; recent_asset_ids?: string[] };
type MuxAsset = { id: string; status: 'preparing' | 'ready' | 'errored'; duration?: number; playback_ids?: PlaybackId[]; live_stream_id?: string };
const publicPlayback = (ids?: PlaybackId[]) => ids?.find((p) => p.policy === 'public')?.id;

// ---- Public -------------------------------------------------------------------------------------------

/** What /live shows: broadcasts on air now, and recent recordings. Never includes stream keys. */
export const live = query({
  args: {},
  handler: async (ctx) => {
    const onAir = await ctx.db.query('live_streams').withIndex('by_status', (q) => q.eq('status', 'active')).take(10);
    const ready = await ctx.db.query('live_recordings').withIndex('by_status', (q) => q.eq('status', 'ready')).order('desc').take(12);
    const titles = new Map<Id<'live_streams'>, string>();
    for (const r of ready) if (!titles.has(r.stream_id)) titles.set(r.stream_id, (await ctx.db.get(r.stream_id))?.title ?? 'Broadcast');
    return {
      live: onAir.map((s) => ({ id: s._id, title: s.title, playbackId: s.playback_id, startedAt: s.started_at ?? s.created_at })),
      recordings: ready.filter((r) => r.playback_id).map((r) => ({
        id: r._id, title: titles.get(r.stream_id)!, playbackId: r.playback_id!, duration: r.duration ?? null, createdAt: r.created_at,
      })),
    };
  },
});

// ---- Admin --------------------------------------------------------------------------------------------

/** Admin → Broadcasts: every channel with its stream key, plus whether the server keys are in place. */
export const streams = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query('live_streams').order('desc').take(50);
    return {
      configured: configured(),
      webhook: !!process.env.MUX_WEBHOOK_SECRET,
      serverUrl: RTMPS_URL,
      streams: await Promise.all(rows.map(async (s) => {
        const recs = await ctx.db.query('live_recordings').withIndex('by_stream_id', (q) => q.eq('stream_id', s._id)).order('desc').take(20);
        return {
          id: s._id, title: s.title, status: s.status, streamKey: s.stream_key, playbackId: s.playback_id,
          createdAt: s.created_at, startedAt: s.started_at ?? null,
          recordings: recs.map((r) => ({ id: r._id, status: r.status, duration: r.duration ?? null, playbackId: r.playback_id ?? null, createdAt: r.created_at })),
        };
      })),
    };
  },
});

export const adminCaller = internalQuery({
  args: {},
  handler: async (ctx) => (await requireAdmin(ctx))._id,
});

export const streamRow = internalQuery({
  args: { id: v.id('live_streams') },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const recordingRow = internalQuery({
  args: { id: v.id('live_recordings') },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

const audit = (ctx: MutationCtx, adminId: Id<'users'>, action: string, details: string) =>
  ctx.db.insert('admin_actions', { admin_id: adminId, action, details });

export const saveStream = internalMutation({
  args: { adminId: v.id('users'), title: v.string(), muxId: v.string(), streamKey: v.string(), playbackId: v.string() },
  handler: async (ctx, a) => {
    await ctx.db.insert('live_streams', {
      title: a.title, mux_id: a.muxId, stream_key: a.streamKey, playback_id: a.playbackId,
      status: 'idle', created_by: a.adminId, created_at: Date.now(),
    });
    await audit(ctx, a.adminId, 'broadcast.create', `Created broadcast channel "${a.title}"`);
  },
});

export const patchStream = internalMutation({
  args: {
    adminId: v.optional(v.id('users')), id: v.id('live_streams'), log: v.optional(v.string()),
    streamKey: v.optional(v.string()), status: v.optional(v.union(v.literal('idle'), v.literal('active'))), deleted: v.optional(v.boolean()),
  },
  handler: async (ctx, { adminId, id, log, streamKey, status, deleted }) => {
    const s = await ctx.db.get(id);
    if (!s) return;
    if (deleted) {
      for (const r of await ctx.db.query('live_recordings').withIndex('by_stream_id', (q) => q.eq('stream_id', id)).take(200)) await ctx.db.delete(r._id);
      await ctx.db.delete(id);
    } else {
      await ctx.db.patch(id, {
        ...(streamKey ? { stream_key: streamKey } : {}),
        ...(status ? { status, ...(status === 'active' && s.status !== 'active' ? { started_at: Date.now() } : {}) } : {}),
      });
    }
    if (adminId && log) await audit(ctx, adminId, 'broadcast.update', `${log} "${s.title}"`);
  },
});

const title = (raw: string) => {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (t.length < 3 || t.length > 80) throw new ConvexError('Give the broadcast a title of 3 to 80 characters.');
  return t;
};

/** Create a broadcast channel. It can be reused for any number of broadcasts. */
export const create = action({
  args: { title: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const adminId: Id<'users'> = await ctx.runQuery(internal.mux.adminCaller, {});
    const name = title(args.title);
    const s = await mux<MuxStream>('/live-streams', {
      method: 'POST',
      body: JSON.stringify({
        playback_policies: ['public'],
        new_asset_settings: { playback_policies: ['public'], video_quality: 'basic' },
        latency_mode: 'low',
        reconnect_window: RECONNECT_WINDOW_S,
        passthrough: name.slice(0, 255),
      }),
    });
    const playbackId = publicPlayback(s.playback_ids);
    if (!playbackId) throw new ConvexError('The broadcast service did not return a playback link. Try again.');
    await ctx.runMutation(internal.mux.saveStream, { adminId, title: name, muxId: s.id, streamKey: s.stream_key, playbackId });
  },
});

async function adminAndStream(ctx: ActionCtx, id: Id<'live_streams'>) {
  const adminId: Id<'users'> = await ctx.runQuery(internal.mux.adminCaller, {});
  const s: Doc<'live_streams'> | null = await ctx.runQuery(internal.mux.streamRow, { id });
  if (!s) throw new ConvexError('That broadcast channel no longer exists.');
  return { adminId, s };
}

/** End the broadcast that is on air now (the encoder is disconnected; the channel stays for next time). */
export const finish = action({
  args: { id: v.id('live_streams') },
  handler: async (ctx, { id }): Promise<void> => {
    const { adminId, s } = await adminAndStream(ctx, id);
    await mux(`/live-streams/${s.mux_id}/complete`, { method: 'PUT' });
    await ctx.runMutation(internal.mux.patchStream, { adminId, id, status: 'idle', log: 'Ended broadcast' });
  },
});

/** New stream key, e.g. if the old one was shared by mistake. The old key stops working at once. */
export const resetKey = action({
  args: { id: v.id('live_streams') },
  handler: async (ctx, { id }): Promise<void> => {
    const { adminId, s } = await adminAndStream(ctx, id);
    const fresh = await mux<MuxStream>(`/live-streams/${s.mux_id}/reset-stream-key`, { method: 'POST' });
    await ctx.runMutation(internal.mux.patchStream, { adminId, id, streamKey: fresh.stream_key, log: 'Reset stream key of' });
  },
});

/** Delete a channel and its recordings, here and at Mux. */
export const remove = action({
  args: { id: v.id('live_streams') },
  handler: async (ctx, { id }): Promise<void> => {
    const { adminId, s } = await adminAndStream(ctx, id);
    const asset = await mux<MuxStream>(`/live-streams/${s.mux_id}`).catch(() => null);
    for (const a of asset?.recent_asset_ids ?? []) await mux(`/assets/${a}`, { method: 'DELETE' }).catch(() => null);
    await mux(`/live-streams/${s.mux_id}`, { method: 'DELETE' });
    await ctx.runMutation(internal.mux.patchStream, { adminId, id, deleted: true, log: 'Deleted broadcast channel' });
  },
});

/** Delete one recording. */
export const removeRecording = action({
  args: { id: v.id('live_recordings') },
  handler: async (ctx, { id }): Promise<void> => {
    const adminId: Id<'users'> = await ctx.runQuery(internal.mux.adminCaller, {});
    const r: Doc<'live_recordings'> | null = await ctx.runQuery(internal.mux.recordingRow, { id });
    if (!r) return;
    await mux(`/assets/${r.asset_id}`, { method: 'DELETE' });
    await ctx.runMutation(internal.mux.applyAsset, { assetId: r.asset_id, deleted: true, adminId });
  },
});

/** Re-read a channel's state and recordings from Mux, in case a webhook was missed. */
export const sync = action({
  args: { id: v.id('live_streams') },
  handler: async (ctx, { id }): Promise<void> => {
    const { s } = await adminAndStream(ctx, id);
    const fresh = await mux<MuxStream>(`/live-streams/${s.mux_id}`);
    await ctx.runMutation(internal.mux.patchStream, { id, status: fresh.status === 'active' ? 'active' : 'idle' });
    for (const assetId of (fresh.recent_asset_ids ?? []).slice(-10)) {
      const a = await mux<MuxAsset>(`/assets/${assetId}`).catch(() => null);
      if (a) await ctx.runMutation(internal.mux.applyAsset, assetFields(a, s.mux_id));
    }
  },
});

// ---- Webhook ------------------------------------------------------------------------------------------

const assetFields = (a: MuxAsset, liveStreamId?: string) => ({
  assetId: a.id, liveStreamId: a.live_stream_id ?? liveStreamId, status: a.status,
  playbackId: publicPlayback(a.playback_ids), duration: typeof a.duration === 'number' ? a.duration : undefined,
});

export const applyAsset = internalMutation({
  args: {
    assetId: v.string(), liveStreamId: v.optional(v.string()), deleted: v.optional(v.boolean()), adminId: v.optional(v.id('users')),
    status: v.optional(v.union(v.literal('preparing'), v.literal('ready'), v.literal('errored'))),
    playbackId: v.optional(v.string()), duration: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const row = await ctx.db.query('live_recordings').withIndex('by_asset_id', (q) => q.eq('asset_id', a.assetId)).unique();
    if (a.deleted) {
      if (row) {
        await ctx.db.delete(row._id);
        if (a.adminId) await audit(ctx, a.adminId, 'broadcast.update', 'Deleted a broadcast recording');
      }
      return;
    }
    const fields = {
      ...(a.status ? { status: a.status } : {}),
      ...(a.playbackId ? { playback_id: a.playbackId } : {}),
      ...(a.duration !== undefined ? { duration: a.duration } : {}),
    };
    if (row) return void await ctx.db.patch(row._id, fields);
    if (!a.liveStreamId) return; // an upload that isn't a broadcast recording: not ours
    const stream = await ctx.db.query('live_streams').withIndex('by_mux_id', (q) => q.eq('mux_id', a.liveStreamId!)).unique();
    if (!stream) return;
    await ctx.db.insert('live_recordings', { stream_id: stream._id, asset_id: a.assetId, status: 'preparing', created_at: Date.now(), ...fields });
  },
});

export const applyStream = internalMutation({
  args: { muxId: v.string(), event: v.union(v.literal('active'), v.literal('idle'), v.literal('deleted')) },
  handler: async (ctx, { muxId, event }) => {
    const s = await ctx.db.query('live_streams').withIndex('by_mux_id', (q) => q.eq('mux_id', muxId)).unique();
    if (!s) return;
    if (event === 'deleted') {
      for (const r of await ctx.db.query('live_recordings').withIndex('by_stream_id', (q) => q.eq('stream_id', s._id)).take(200)) await ctx.db.delete(r._id);
      return void await ctx.db.delete(s._id);
    }
    await ctx.db.patch(s._id, { status: event, ...(event === 'active' && s.status !== 'active' ? { started_at: Date.now() } : {}) });
  },
});

/** POST <CONVEX_SITE_URL>/mux/webhook. Signed with MUX_WEBHOOK_SECRET; anything unsigned is refused. */
export const webhook = httpAction(async (ctx, req) => {
  const raw = await req.text();
  if (!(await verifyMuxSignature(process.env.MUX_WEBHOOK_SECRET ?? '', req.headers.get('mux-signature'), raw))) {
    return new Response('bad signature', { status: 401 });
  }
  let evt: { type?: string; data?: Record<string, unknown> };
  try { evt = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const type = evt.type ?? '', data = evt.data ?? {};
  const id = typeof data.id === 'string' ? data.id : '';
  if (!id) return new Response('ok');

  if (type === 'video.live_stream.active') await ctx.runMutation(internal.mux.applyStream, { muxId: id, event: 'active' });
  else if (type === 'video.live_stream.idle' || type === 'video.live_stream.disabled') await ctx.runMutation(internal.mux.applyStream, { muxId: id, event: 'idle' });
  else if (type === 'video.live_stream.deleted') await ctx.runMutation(internal.mux.applyStream, { muxId: id, event: 'deleted' });
  else if (type === 'video.asset.deleted') await ctx.runMutation(internal.mux.applyAsset, { assetId: id, deleted: true });
  else if (type.startsWith('video.asset.')) {
    const status = data.status === 'ready' || data.status === 'errored' || data.status === 'preparing' ? data.status : undefined;
    await ctx.runMutation(internal.mux.applyAsset, {
      ...assetFields({ ...(data as unknown as MuxAsset), status: status ?? 'preparing' }),
      status: type === 'video.asset.ready' ? 'ready' : type === 'video.asset.errored' ? 'errored' : status,
    });
  }
  return new Response('ok');
});
