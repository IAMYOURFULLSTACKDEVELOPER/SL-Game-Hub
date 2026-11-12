'use client';
// Install prompt, update and offline state for the PWA, shared by PwaManager, the nav menu and
// "Download for offline" buttons. Same tiny subscribe pattern as lib/sound.ts.

type BeforeInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
export type PwaState = {
  installable: boolean; // Chrome/Edge/Android: we hold a deferred install prompt
  iosHint: boolean;     // iOS Safari: no prompt exists, show "Share → Add to Home Screen"
  installed: boolean;   // running as an installed app
  updateReady: boolean; // a new version is waiting
  offline: boolean;
};

const state: PwaState = { installable: false, iosHint: false, installed: false, updateReady: false, offline: false };
const listeners = new Set<(s: PwaState) => void>();
let deferred: BeforeInstallPrompt | null = null;
let waiting: ServiceWorker | null = null;

const set = (patch: Partial<PwaState>) => { Object.assign(state, patch); listeners.forEach((fn) => fn({ ...state })); };
export const getPwa = (): PwaState => ({ ...state });
export function subscribePwa(fn: (s: PwaState) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

let started = false;
/** Called once by PwaManager. Registers the service worker in production builds. */
export function startPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  set({ installed: standalone, iosHint: ios && !standalone, offline: !navigator.onLine });

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstallPrompt; set({ installable: true }); });
  window.addEventListener('appinstalled', () => { deferred = null; set({ installable: false, installed: true }); });
  window.addEventListener('online', () => set({ offline: false }));
  window.addEventListener('offline', () => set({ offline: true }));

  if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    const track = (sw: ServiceWorker | null) => {
      if (!sw) return;
      const check = () => { if (sw.state === 'installed' && navigator.serviceWorker.controller) { waiting = sw; set({ updateReady: true }); } };
      check(); sw.addEventListener('statechange', check);
    };
    track(reg.waiting);
    reg.addEventListener('updatefound', () => track(reg.installing));
    // Long-lived tabs (an installed app can stay open for days) still pick up new versions.
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => { /* unsupported or blocked: the site works without it */ });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (waiting && !reloading) { reloading = true; location.reload(); } });
  if (pendingUser !== undefined) postSession(pendingUser);
}

export async function promptInstall() {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  set({ installable: false });
  return outcome === 'accepted';
}

export function applyUpdate() { waiting?.postMessage({ type: 'SKIP_WAITING' }); }

// Tell the worker who is signed in; it clears saved pages when that changes (shared phones).
let pendingUser: string | undefined;
function postSession(user: string) {
  navigator.serviceWorker?.ready.then((reg) => reg.active?.postMessage({ type: 'SESSION', user })).catch(() => {});
}
export function reportSession(user: string) {
  pendingUser = user;
  if (started && 'serviceWorker' in navigator) postSession(user);
}

/** Save pages/files for offline use. Resolves true when everything was stored. */
export function saveOffline(urls: string[]): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'SAVED_OFFLINE' || e.data.urls?.[0] !== urls[0]) return;
      navigator.serviceWorker.removeEventListener('message', onMsg);
      resolve(!!e.data.ok);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    navigator.serviceWorker.controller!.postMessage({ type: 'SAVE_OFFLINE', urls });
  });
}

/** True if every URL is already in a cache. */
export async function isSavedOffline(urls: string[]) {
  if (typeof caches === 'undefined') return false;
  const hits = await Promise.all(urls.map((u) => caches.match(u)));
  return hits.every(Boolean);
}
