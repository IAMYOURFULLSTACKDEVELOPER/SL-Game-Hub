'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from 'convex/react';
import { api } from '@slgh/backend/convex/_generated/api';
import { ConvexRoomProvider } from '@/components/ConvexRoomProvider';
import { PageHeader } from '@/components/PageHeader';
import { Icon } from '@/components/Icon';

// Watch broadcasts: tournaments and featured games streamed by the Dodo team, plus recordings of past ones.
// No account needed. The video player is only downloaded when there is something to play.

const BroadcastPlayer = dynamic(() => import('@/components/BroadcastPlayer').then((m) => m.BroadcastPlayer), {
  ssr: false,
  loading: () => <div className="aspect-video w-full animate-pulse rounded-2xl bg-black/80" />,
});

const thumb = (playbackId: string) => `https://image.mux.com/${playbackId}/thumbnail.webp?width=480&time=5`;
const minutes = (s: number | null) => (s === null ? '' : s < 60 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const since = (ms: number) => {
  const m = Math.max(1, Math.round((Date.now() - ms) / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export default function LiveClient() {
  return <ConvexRoomProvider><Live /></ConvexRoomProvider>;
}

type Pick = { kind: 'live' | 'recording'; id: string };

function Live() {
  const data = useQuery(api.mux.live);
  const [pick, setPick] = useState<Pick | null>(null);

  const live = data?.live ?? [];
  const recordings = data?.recordings ?? [];
  // Show what the viewer picked; otherwise the first broadcast on air
  const recording = pick?.kind === 'recording' ? recordings.find((r) => r.id === pick.id) : undefined;
  const current = recording ? undefined : (pick?.kind === 'live' ? live.find((s) => s.id === pick.id) : undefined) ?? live[0];
  const playing = recording ? { playbackId: recording.playbackId, title: recording.title, live: false }
    : current ? { playbackId: current.playbackId, title: current.title, live: true } : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <PageHeader icon="live" title="Live" subtitle="Tournaments and featured games, as they happen." />

      {data === undefined ? (
        <div className="aspect-video w-full animate-pulse rounded-2xl bg-black/80" />
      ) : playing ? (
        <section className="space-y-2" aria-label="Now playing">
          <BroadcastPlayer playbackId={playing.playbackId} live={playing.live} />
          <div className="flex flex-wrap items-center gap-2">
            {playing.live
              ? <span className="chip border-danger/50 font-bold text-danger"><span className="h-2 w-2 animate-pulse rounded-full bg-danger" />LIVE</span>
              : <span className="chip chip-muted">Recording</span>}
            <h2 className="min-w-0 flex-1 truncate text-lg">{playing.title}</h2>
            {recording && live.length > 0 && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setPick(null)}>Back to live</button>
            )}
          </div>
          {playing.live && <p className="text-xs text-muted">Live video runs a few seconds behind. Tap the sound icon to unmute.</p>}
        </section>
      ) : (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <Icon name="live" size={32} className="text-muted" />
          <p className="font-semibold">Nothing live right now.</p>
          <p className="text-sm text-muted">
            Tournaments and featured games are shown here when they start{recordings.length ? ', and you can watch past ones below' : ''}.
          </p>
        </div>
      )}

      {live.length > 1 && (
        <section aria-label="Also live">
          <h2 className="mb-2 text-base">Also live</h2>
          <ul className="flex flex-wrap gap-2">
            {live.map((s) => (
              <li key={s.id}>
                <button type="button" aria-pressed={current?.id === s.id} className="btn btn-sm btn-outline"
                  onClick={() => setPick({ kind: 'live', id: s.id })}>
                  <span className="h-2 w-2 rounded-full bg-danger" />{s.title} · {since(s.startedAt)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recordings.length > 0 && (
        <section aria-label="Past broadcasts">
          <h2 className="mb-2 text-base">Past broadcasts</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {recordings.map((r) => (
              <li key={r.id}>
                <button type="button" aria-pressed={recording?.id === r.id}
                  onClick={() => { setPick({ kind: 'recording', id: r.id }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="card block w-full overflow-hidden text-left transition hover:border-primary/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb(r.playbackId)} alt="" loading="lazy" className="aspect-video w-full bg-black object-cover" />
                  <span className="block p-2">
                    <span className="block truncate text-sm font-semibold">{r.title}</span>
                    <span className="block text-xs text-muted">{day(r.createdAt)}{r.duration !== null ? ` · ${minutes(r.duration)}` : ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
