'use client';
import { useEffect, useRef, useState } from 'react';
import { applyUpdate, getPwa, promptInstall, startPwa, subscribePwa, type PwaState } from '@/lib/pwa';
import { sfx } from '@/lib/sound';
import { Icon } from './Icon';
import { LogoMark } from './Art';

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DAYS = 14;
const ENGAGED_MS = 25000; // only suggest installing after someone has actually used the site

const dismissedRecently = () => {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_DAYS * 864e5; } catch { return false; }
};

/** Registers the service worker and shows the install, update and offline toasts. */
export function PwaManager() {
  const [s, setS] = useState<PwaState>(getPwa);
  const [engaged, setEngaged] = useState(false);
  const [hideInstall, setHideInstall] = useState(true);
  const [backOnline, setBackOnline] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    startPwa();
    setS(getPwa());
    setHideInstall(dismissedRecently());
    const t = setTimeout(() => setEngaged(true), ENGAGED_MS);
    return () => { clearTimeout(t); };
  }, []);
  useEffect(() => subscribePwa(setS), []);
  useEffect(() => {
    if (s.offline) { wasOffline.current = true; sfx('toggleOff'); return; }
    if (!wasOffline.current) return;
    wasOffline.current = false; setBackOnline(true); sfx('toggleOn');
    const t = setTimeout(() => setBackOnline(false), 3500);
    return () => clearTimeout(t);
  }, [s.offline]);

  const dismiss = () => {
    setHideInstall(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
  };
  const showInstall = engaged && !hideInstall && !s.installed && (s.installable || s.iosHint);

  return (
    <div className="toast-stack" aria-live="polite">
      {s.offline && (
        <div className="toast toast-dark" role="status">
          <span className="toast-icon bg-white/15"><Icon name="wifi" size={18} /></span>
          <div><p className="font-semibold">You&apos;re offline</p><p className="text-sm opacity-80">Games you&apos;ve opened before still work.</p></div>
        </div>
      )}
      {backOnline && (
        <div className="toast" role="status">
          <span className="toast-icon bg-primary/15 text-primary"><Icon name="check" size={18} strokeWidth={3} /></span>
          <p className="font-semibold">Back online</p>
        </div>
      )}
      {s.updateReady && (
        <div className="toast" role="status">
          <span className="toast-icon bg-secondary/15 text-secondary"><Icon name="sparkles" size={18} /></span>
          <div className="flex-1"><p className="font-semibold">A new version is ready</p><p className="text-sm text-muted">Refresh to get the latest games and fixes.</p></div>
          <button type="button" className="btn btn-primary btn-sm" onClick={applyUpdate}>Refresh</button>
        </div>
      )}
      {showInstall && (
        <div className="toast" role="dialog" aria-label="Install SL Game Hub">
          <LogoMark size={40} />
          <div className="flex-1">
            <p className="font-semibold">Install SL Game Hub</p>
            <p className="text-sm text-muted">
              {s.installable ? 'Play from your home screen, even offline.'
                : <>Tap <ShareGlyph /> then <b>Add to Home Screen</b>.</>}
            </p>
          </div>
          {s.installable && (
            <button type="button" className="btn btn-primary btn-sm" onClick={async () => { if (await promptInstall()) sfx('success'); else dismiss(); }}>Install</button>
          )}
          <button type="button" className="btn btn-ghost btn-icon h-8 w-8" aria-label="Not now" onClick={dismiss}><Icon name="close" size={16} /></button>
        </div>
      )}
    </div>
  );
}

function ShareGlyph() {
  return (
    <svg aria-label="Share" role="img" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-1">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
