'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { sfx } from '@/lib/sound';

// Wraps every game while it is being played:
//  - Full screen by default: the app's menus are hidden, and on phones/browsers that allow it the page goes truly
//    full screen at the first tap (browsers only allow that after a tap). Players can turn it off; the choice is
//    remembered on this device.
//  - Leaving asks first: links, "Back" buttons, the browser's back button, and closing or reloading the tab.
//    Buttons that save before leaving opt out with `data-leave-ok`.

const PREF_KEY = 'slgh-game-fullscreen';

const ExpandIcon = ({ shrink = false }: { shrink?: boolean }) => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {shrink
      ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
  </svg>
);

const canBrowserFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;

export function GameShell({ exitHref, children }: { exitHref: string; children: ReactNode }) {
  const router = useRouter();
  const [full, setFull] = useState(true);
  const [browserFull, setBrowserFull] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState<(() => void) | null>(null);
  const leaving = useRef(false); // set once the player chose to leave, so nothing asks again
  const bypass = useRef(false); // lets the confirmed click through
  const userExited = useRef(false); // they left browser full screen themselves (Esc / back): don't force it again
  const stayRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback((go: () => void) => { sfx('click'); setConfirmLeave(() => go); }, []);

  // Remembered choice
  useEffect(() => {
    try { if (localStorage.getItem(PREF_KEY) === '0') setFull(false); } catch { /* private mode */ }
  }, []);

  // Hide the app's menus while full screen is on
  useEffect(() => {
    const root = document.documentElement;
    if (full) root.setAttribute('data-game-mode', ''); else root.removeAttribute('data-game-mode');
    return () => root.removeAttribute('data-game-mode');
  }, [full]);

  // Real browser full screen: entered on the first tap or key press (browsers require one)
  const enterBrowserFull = useCallback(() => {
    if (!canBrowserFullscreen() || document.fullscreenElement) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => { /* not allowed here */ });
  }, []);
  useEffect(() => {
    const onChange = () => {
      const on = !!document.fullscreenElement;
      setBrowserFull(on);
      if (!on && !leaving.current) userExited.current = true;
    };
    document.addEventListener('fullscreenchange', onChange);
    if (!full) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      return () => document.removeEventListener('fullscreenchange', onChange);
    }
    const onGesture = (e: Event) => {
      if (userExited.current || (e.target as Element | null)?.closest?.('[data-game-shell-bar], [data-game-shell-dialog]')) return;
      enterBrowserFull();
    };
    window.addEventListener('pointerup', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('pointerup', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [full, enterBrowserFull]);
  // Leaving the game page ends full screen
  useEffect(() => () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); }, []);

  const toggleFull = () => {
    const next = !full;
    setFull(next);
    try { localStorage.setItem(PREF_KEY, next ? '1' : '0'); } catch { /* private mode */ }
    userExited.current = false;
    if (next) enterBrowserFull();
    sfx(next ? 'toggleOn' : 'toggleOff');
  };

  // Ask before following any link or "Back" button out of the game
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (bypass.current) { bypass.current = false; return; }
      if (leaving.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as Element | null)?.closest?.('a[href], .back-link');
      if (!el || el.closest('[data-leave-ok], [data-game-shell-dialog]')) return;
      if (el instanceof HTMLAnchorElement) {
        if (el.target === '_blank' || el.hasAttribute('download')) return;
        const url = new URL(el.href, location.href);
        if (url.origin === location.origin && url.pathname === location.pathname) return; // same page
      }
      e.preventDefault();
      e.stopPropagation();
      ask(() => { leaving.current = true; bypass.current = true; (el as HTMLElement).click(); });
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [ask]);

  // Ask before the browser's back button leaves (an extra history entry catches the first press)
  useEffect(() => {
    history.pushState(history.state, '', location.href);
    const onPop = () => {
      if (leaving.current) return;
      history.pushState(history.state, '', location.href);
      ask(() => { leaving.current = true; history.go(-2); });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [ask]);

  // Closing or reloading the tab: the browser shows its own question
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  useEffect(() => {
    if (!confirmLeave) return;
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmLeave(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmLeave]);

  const leaveNow = () => ask(() => { leaving.current = true; router.push(exitHref); });

  return (
    <>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-2 pt-2 sm:px-4" data-game-shell-bar>
        <button type="button" className="btn btn-sm btn-ghost" onClick={leaveNow}>
          <Icon name="logout" size={16} />Leave game
        </button>
        <div className="flex items-center gap-1">
          {full && canBrowserFullscreen() && !browserFull && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => { userExited.current = false; enterBrowserFull(); }} aria-label="Fill the whole screen">
              <ExpandIcon />
            </button>
          )}
          <button type="button" className="btn btn-sm btn-outline" onClick={toggleFull} aria-pressed={full}>
            <ExpandIcon shrink={full} />{full ? 'Exit full screen' : 'Full screen'}
          </button>
        </div>
      </div>

      {children}

      {confirmLeave && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" data-game-shell-dialog
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmLeave(null); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-text" className="card pop-in w-full max-w-sm space-y-3 p-5 text-center">
            <span className="mx-auto inline-grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent"><Icon name="warning" size={26} /></span>
            <h2 id="leave-title">Leave the game?</h2>
            <p id="leave-text" className="text-sm text-muted">The game you are playing may be lost if you leave now.</p>
            <div className="flex gap-2">
              <button ref={stayRef} type="button" className="btn btn-primary flex-1" onClick={() => { setConfirmLeave(null); sfx('click'); }}>Keep playing</button>
              <button type="button" className="btn btn-outline flex-1 text-danger" onClick={() => { const go = confirmLeave; setConfirmLeave(null); go(); }}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
