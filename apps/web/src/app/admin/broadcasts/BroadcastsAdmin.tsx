'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAction, useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { playerMessage } from '@slgh/shared/src/errors';
import { Icon } from '@/components/Icon';

const BroadcastPlayer = dynamic(() => import('@/components/BroadcastPlayer').then((m) => m.BroadcastPlayer), { ssr: false });

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const mins = (s: number | null) => (s === null ? '' : ` · ${Math.max(1, Math.round(s / 60))} min`);

function Secret({ label, value }: { label: string; value: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setShown(true); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-xs font-semibold text-muted">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-lg bg-bg px-2 py-1 text-xs">{shown ? value : '•'.repeat(24)}</code>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShown((s) => !s)}>{shown ? 'Hide' : 'Show'}</button>
      <button type="button" className="btn btn-sm btn-outline" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

/** Broadcast channels: stream a tournament or featured game from OBS or a phone; spectators watch on /live. */
export default function BroadcastsAdmin() {
  const data = useQuery(api.mux.streams);
  const create = useAction(api.mux.create);
  const finish = useAction(api.mux.finish);
  const resetKey = useAction(api.mux.resetKey);
  const remove = useAction(api.mux.remove);
  const removeRecording = useAction(api.mux.removeRecording);
  const sync = useAction(api.mux.sync);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: done }); } catch (e) { setMsg({ ok: false, text: playerMessage(e) }); } finally { setBusy(null); }
  };

  if (data === undefined) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1">Broadcasts</h1>
        <Link href="/live" className="btn btn-sm btn-outline"><Icon name="live" size={16} />Open /live</Link>
      </div>
      <p className="text-sm text-muted">
        Stream a tournament or featured game to everyone on <b>/live</b>. Create a channel once, put its server and key into
        OBS (Settings → Stream → Service: Custom) or a phone app such as Larix Broadcaster, and start streaming. Viewers see it a few
        seconds later. Every broadcast is recorded and appears under “Past broadcasts”. The stream key lets anyone broadcast on Dodo:
        keep it private, and make a new one if it leaks.
      </p>

      {!data.configured && <p className="card p-3 font-semibold text-danger">Broadcasting isn’t set up on the server yet.</p>}
      {data.configured && !data.webhook && (
        <p className="card p-3 text-sm text-danger">Live status updates aren’t connected yet, so use “Check status” after you start or stop streaming.</p>
      )}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`card p-3 font-semibold ${msg.ok ? 'text-primary' : 'text-danger'}`}>{msg.text}</p>}

      <form className="card flex flex-wrap items-end gap-2 p-3" onSubmit={(e) => {
        e.preventDefault();
        void run('create', () => create({ title }), 'Channel created. Copy its server and key into your streaming app.').then(() => setTitle(''));
      }}>
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-sm font-semibold">New channel</span>
          <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Friday Scrabble Cup" maxLength={80} required minLength={3} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!data.configured || busy === 'create'}>
          <Icon name="plus" size={16} />{busy === 'create' ? 'Creating…' : 'Create'}
        </button>
      </form>

      {data.streams.length === 0 ? <p className="card p-4 text-muted">No channels yet.</p> : (
        <ul className="space-y-3">
          {data.streams.map((s) => {
            const id = s.id as Id<'live_streams'>;
            const on = s.status === 'active';
            return (
              <li key={s.id} className="card space-y-3 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="min-w-0 flex-1 truncate">{s.title}</b>
                  {on ? <span className="chip border-danger/50 font-bold text-danger"><span className="h-2 w-2 animate-pulse rounded-full bg-danger" />LIVE{s.startedAt ? ` since ${when(s.startedAt)}` : ''}</span>
                    : <span className="chip chip-muted">Off air</span>}
                </div>
                <Secret label="Server" value={data.serverUrl} />
                <Secret label="Stream key" value={s.streamKey} />
                <div className="flex flex-wrap gap-2">
                  {on && (
                    <>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => setPreview(preview === s.id ? null : s.id)}>
                        <Icon name="play" size={14} />{preview === s.id ? 'Hide preview' : 'Preview'}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline text-danger" disabled={busy !== null}
                        onClick={() => { if (confirm(`End the broadcast "${s.title}" for everyone watching?`)) void run(`end-${s.id}`, () => finish({ id }), 'Broadcast ended.'); }}>
                        End broadcast
                      </button>
                    </>
                  )}
                  <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => void run(`sync-${s.id}`, () => sync({ id }), 'Status updated.')}>
                    <Icon name="refresh" size={14} />{busy === `sync-${s.id}` ? 'Checking…' : 'Check status'}
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null}
                    onClick={() => { if (confirm('Make a new stream key? The old key stops working at once.')) void run(`key-${s.id}`, () => resetKey({ id }), 'New stream key made. Update your streaming app.'); }}>
                    <Icon name="lock" size={14} />New key
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost text-danger" disabled={busy !== null}
                    onClick={() => { if (confirm(`Delete "${s.title}" and all its recordings? This can't be undone.`)) void run(`del-${s.id}`, () => remove({ id }), 'Channel deleted.'); }}>
                    Delete
                  </button>
                </div>
                {on && preview === s.id && <BroadcastPlayer playbackId={s.playbackId} live />}
                {s.recordings.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold">Recordings ({s.recordings.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {s.recordings.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1">{when(r.createdAt)}{mins(r.duration)}</span>
                          <span className="chip chip-muted">{r.status === 'ready' ? 'On /live' : r.status === 'preparing' ? 'Processing' : 'Failed'}</span>
                          <button type="button" className="btn btn-sm btn-ghost text-danger" disabled={busy !== null}
                            onClick={() => { if (confirm('Delete this recording?')) void run(`rec-${r.id}`, () => removeRecording({ id: r.id as Id<'live_recordings'> }), 'Recording deleted.'); }}>
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
