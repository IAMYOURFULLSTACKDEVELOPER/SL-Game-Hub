/* SL Game Hub service worker. Hand-written, no build step.
 *
 * Strategy
 *  - /_next/static/*     cache-first (file names are content-hashed, so never stale)
 *  - images, icons, the Scrabble dictionary   stale-while-revalidate (instant, refreshed in the background)
 *  - page navigations    network-first with a timeout, then the cached copy, then /offline
 *  - everything else (API, auth, server actions, router data requests) goes straight to the network
 *
 * Privacy: private pages (profile, wallet, admin, chat...) are never cached, and the page cache is wiped
 * whenever the signed-in account changes, so a shared phone never shows the last person's pages.
 * Bump VERSION to retire every cache on the next visit.
 */
const VERSION = 'v1';
const STATIC = `slgh-static-${VERSION}`;
const PAGES = `slgh-pages-${VERSION}`;
const ASSETS = `slgh-assets-${VERSION}`;
const META = 'slgh-meta';
const OFFLINE = '/offline';
const NAV_TIMEOUT_MS = 6000; // on a slow connection, show the saved copy rather than a blank wait
const MAX_PAGES = 40;
const MAX_ASSETS = 80;

const CACHEABLE_PAGE = /^\/($|games(\/|$)|leaderboards$|tournaments(\/|$)|roadmap$|offline$)/;
// Pages whose HTML carries the player's Convex auth token (Dice, for money rooms): never stored.
const TOKEN_PAGE = /^\/games\/dice\/play\/?$/;
const isCacheablePage = (path) => CACHEABLE_PAGE.test(path) && !TOKEN_PAGE.test(path);
const ASSET = /^\/(games\/.+\.(webp|png|jpe?g|svg|txt)|icons\/.+|screenshots\/.+|icon\.svg|manifest\.webmanifest)$/;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC);
    await cache.addAll(['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg']);
    // The offline page, fetched signed-out so it never contains anyone's name, plus the JS/CSS it needs.
    const res = await fetch(OFFLINE, { credentials: 'omit', cache: 'no-store' });
    if (res.ok) {
      await cache.put(OFFLINE, res.clone());
      await cacheSubresources(await res.text());
    }
  })());
  // First install takes over at once; later updates wait until the player chooses to refresh.
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC, PAGES, ASSETS, META]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'SESSION') event.waitUntil(checkSession(String(msg.user || '')));
  if (msg.type === 'SAVE_OFFLINE') event.waitUntil(saveOffline(msg.urls || [], event.source));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Client-side router data and dev tooling must stay live.
  if (req.headers.get('RSC') || url.searchParams.has('_rsc') || url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/webpack-hmr')) return;

  if (url.pathname.startsWith('/_next/static/')) return event.respondWith(cacheFirst(req, STATIC));
  if (req.mode === 'navigate') return event.respondWith(page(event, url));
  if (ASSET.test(url.pathname)) return event.respondWith(staleWhileRevalidate(event, req, ASSETS));
});

// ---------- strategies ----------
async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(name)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(event, req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req).then(async (res) => {
    if (res.ok) { await cache.put(req, res.clone()); trim(name, MAX_ASSETS); }
    return res;
  }).catch(() => hit);
  if (hit) { event.waitUntil(fresh); return hit; }
  return fresh;
}

async function page(event, url) {
  const cacheable = isCacheablePage(url.pathname);
  const key = url.pathname; // ignore ?source=pwa and other tracking params
  const network = (async () => {
    const res = (await event.preloadResponse) || (await fetch(event.request));
    if (cacheable && res.ok && res.type === 'basic' && !res.redirected) {
      const copy = res.clone();
      event.waitUntil(storePage(key, copy).then(() => trim(PAGES, MAX_PAGES)));
    }
    return res;
  })();

  try {
    if (!cacheable) return await network;
    const saved = await caches.match(key, { cacheName: PAGES });
    if (!saved) return await network;
    // Saved copy exists: give the network a fair chance, then fall back to it.
    return await Promise.race([network, new Promise((r) => setTimeout(() => r(saved), NAV_TIMEOUT_MS))]);
  } catch {
    return (cacheable && (await caches.match(key, { cacheName: PAGES }))) || (await caches.match(OFFLINE)) || Response.error();
  }
}

// ---------- helpers ----------
// A signed JWT (header.payload.signature, both JSON parts starting {" = eyJ). Pages that embed the
// player's auth token for live features must never sit in Cache Storage, whatever the allowlist says.
const JWT = /eyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]+/;

/** Save a page for offline use, unless its HTML carries an auth token. Returns false if refused. */
async function storePage(path, res) {
  const html = await res.text();
  const cache = await caches.open(PAGES);
  if (JWT.test(html)) { await cache.delete(path); return false; }
  await cache.put(path, new Response(html, { status: res.status, statusText: res.statusText, headers: res.headers }));
  await cacheSubresources(html);
  return true;
}

/** Cache the hashed JS/CSS/fonts a page references, so it hydrates fully when opened offline. */
async function cacheSubresources(html) {
  const urls = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []);
  const cache = await caches.open(STATIC);
  await Promise.all([...urls].map(async (u) => {
    if (await cache.match(u)) return;
    try { const res = await fetch(u); if (res.ok) await cache.put(u, res); } catch { /* offline: try next time */ }
  }));
}

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function checkSession(user) {
  const meta = await caches.open(META);
  const prev = await meta.match('/__session');
  const last = prev ? await prev.text() : null;
  if (last !== null && last !== user) await caches.delete(PAGES);
  await meta.put('/__session', new Response(user));
}

/** "Download for offline": fetch pages (and what they need) or plain files into the cache. */
async function saveOffline(urls, client) {
  let ok = true;
  for (const u of urls) {
    try {
      const res = await fetch(u, { credentials: 'same-origin' });
      if (!res.ok) { ok = false; continue; }
      const path = new URL(u, self.location.origin).pathname;
      if (ASSET.test(path)) { await (await caches.open(ASSETS)).put(path, res); continue; }
      if (!isCacheablePage(path) || !(await storePage(path, res))) ok = false;
    } catch { ok = false; }
  }
  if (client) client.postMessage({ type: 'SAVED_OFFLINE', urls, ok });
}
