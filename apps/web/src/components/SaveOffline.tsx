'use client';
import { useEffect, useState } from 'react';
import { isSavedOffline, saveOffline } from '@/lib/pwa';
import { sfx } from '@/lib/sound';
import { Icon } from './Icon';

/** "Download for offline" on a game page. Hidden where there is no service worker (dev, old browsers). */
export function SaveOffline({ slug, extra = [] }: { slug: string; extra?: string[] }) {
  const urls = [`/games/${slug}/play`, `/games/${slug}`, ...extra];
  const [status, setStatus] = useState<'hidden' | 'idle' | 'saving' | 'saved' | 'failed'>('hidden');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    isSavedOffline(urls).then((ok) => setStatus(ok ? 'saved' : 'idle'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (status === 'hidden') return null;
  if (status === 'saved') {
    return <p className="flex items-center justify-center gap-2 text-sm font-semibold text-primary"><Icon name="check" size={16} strokeWidth={3} />Saved: plays offline on this device</p>;
  }
  return (
    <button type="button" className="btn btn-outline w-full" disabled={status === 'saving'}
      onClick={async () => {
        setStatus('saving');
        const ok = await saveOffline(urls);
        setStatus(ok ? 'saved' : 'failed');
        sfx(ok ? 'success' : 'error');
      }}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={status === 'saving' ? 'animate-bounce' : ''}>
        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
      </svg>
      {status === 'saving' ? 'Saving for offline…' : status === 'failed' ? 'Couldn’t save. Tap to retry' : 'Download for offline play'}
    </button>
  );
}
