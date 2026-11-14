'use client';
import { useEffect, useState } from 'react';
import { getMusic, subscribeMusic, setMinimized, stopMyMusic, type Track } from '@/lib/music';
import { Icon } from './Icon';

export const SourceLogo = ({ source, size = 16 }: { source: Track['source']; size?: number }) => source === 'spotify' ? (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="12" fill="#1ED760" />
    <path d="M6.5 9.3c3.7-1.1 8-.8 11.2 1.1M7.2 12.3c3-.9 6.5-.6 9.2 1M7.9 15.1c2.4-.7 5-.5 7.1.8" stroke="#000" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
) : (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><rect width="24" height="24" rx="6" fill="#FA243C" />
    <path d="M15.5 6.2v8.3a2 2 0 1 1-1.4-1.9V8.7l-4.6 1v5.9a2 2 0 1 1-1.4-1.9V8.6z" fill="#fff" /></svg>
);

/**
 * The docked mini-player for a Spotify / Apple Music link. It lives in the root layout, so music keeps
 * playing while you move between pages. Minimising only slides it out of the way: the player stays loaded.
 */
export function MusicDock() {
  const [m, setM] = useState<ReturnType<typeof getMusic>>({ track: null, minimized: false });
  useEffect(() => { setM(getMusic()); return subscribeMusic(() => setM(getMusic())); }, []);
  const t = m.track;
  if (!t) return null;
  const name = t.source === 'spotify' ? 'Spotify' : 'Apple Music';
  return (
    <aside className={`music-dock ${m.minimized ? 'is-min' : ''}`} aria-label={`Your music from ${name}`}>
      <div className="music-dock-head">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setMinimized(!m.minimized)}
          aria-expanded={!m.minimized} title={m.minimized ? 'Show player' : 'Hide player'}>
          <SourceLogo source={t.source} />
          <span className="min-w-0 truncate text-[13px] font-semibold text-heading">Your music · <span className="font-normal text-muted">{name}</span></span>
          {m.minimized && <span className="eq text-success" aria-hidden><i /><i /><i /><i /></span>}
        </button>
        <button type="button" className="btn btn-icon h-7 w-7" onClick={() => setMinimized(!m.minimized)} aria-label={m.minimized ? 'Show player' : 'Hide player'}>
          <Icon name="chevronDown" size={16} className={`transition-transform ${m.minimized ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" className="btn btn-icon h-7 w-7" onClick={stopMyMusic} aria-label="Stop and close the player">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="music-dock-body">
        <iframe
          key={t.embed}
          title={`${name} player`}
          src={t.embed}
          height={t.height}
          className="block w-full border-0"
          style={{ borderRadius: 12, background: 'transparent' }}
          allow="autoplay *; clipboard-write; encrypted-media *; fullscreen *; picture-in-picture"
          {...(t.source === 'apple' ? { sandbox: 'allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation' } : {})}
          loading="lazy"
        />
      </div>
    </aside>
  );
}
