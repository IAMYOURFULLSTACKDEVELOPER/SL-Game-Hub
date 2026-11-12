'use client';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/** Games whose play screen is saved on this device, read straight from the service worker's cache. */
export function OfflineGames() {
  const [games, setGames] = useState<string[] | null>(null);
  useEffect(() => {
    if (typeof caches === 'undefined') { setGames([]); return; }
    (async () => {
      const found = new Set<string>();
      for (const name of await caches.keys()) {
        if (!name.startsWith('slgh-pages')) continue;
        for (const req of await (await caches.open(name)).keys()) {
          const m = new URL(req.url).pathname.match(/^\/games\/([a-z0-9-]+)\/play$/);
          if (m) found.add(m[1]);
        }
      }
      setGames([...found].sort());
    })().catch(() => setGames([]));
  }, []);

  if (games === null) return null;
  if (!games.length) return <p className="text-muted">No games are saved on this device yet. Next time you&apos;re online, open a game (or tap <b>Download for offline</b> on its page) and it will work here too.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {games.map((slug, i) => (
        <li key={slug} className="pop-in" style={{ ['--i' as string]: i }}>
          {/* A plain <a>: a full page load lets the service worker serve the saved copy */}
          <a href={`/games/${slug}/play`} className="card card-hover flex items-center justify-between gap-3 p-4 font-semibold capitalize no-underline">
            {slug.replace(/-/g, ' ')}<span className="icon-badge h-9 w-9"><Icon name="play" size={16} /></span>
          </a>
        </li>
      ))}
    </ul>
  );
}
