'use client';
// "Your music": a Spotify or Apple Music link plays in the docked mini-player while you browse and play.
// The services' own embed players do the playing, so there are no API keys, sign-ins or downloads here.
// Spotify Premium and Apple Music subscribers (signed in to the service in this browser) hear full songs;
// everyone else hears the services' 30-second previews.

export type MusicSource = 'spotify' | 'apple';
export interface Track { link: string; source: MusicSource; embed: string; height: number; kind: string }

const KEY = 'my_music';
const listeners = new Set<() => void>();
let current: Track | null = null;
let minimized = false;
let loaded = false;

/**
 * Turn a pasted share link into its embed player, or null if it isn't one we know.
 * Spotify: open.spotify.com/(intl-xx/)<track|album|playlist|artist|episode|show>/<id> or spotify:<type>:<id>
 * Apple Music: music.apple.com/<cc>/<song|album|playlist|station|music-video>/...
 */
export function parseMusicLink(input: string): Track | null {
  const raw = input.trim();
  const uri = /^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]{10,40})$/.exec(raw);
  if (uri) return spotify(uri[1], uri[2], raw);
  let url: URL;
  try { url = new URL(raw.startsWith('http') ? raw : `https://${raw}`); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  if (url.hostname === 'open.spotify.com') {
    const m = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]{10,40})\/?$/.exec(url.pathname);
    return m ? spotify(m[1], m[2], raw) : null;
  }
  if (url.hostname === 'music.apple.com' || url.hostname === 'embed.music.apple.com') {
    const m = /^\/([a-z]{2})\/(song|album|playlist|station|music-video)\/[^?#]*$/.exec(url.pathname);
    if (!m || !/^[\w\-./%]+$/.test(url.pathname)) return null;
    const i = url.searchParams.get('i'); // a single song inside an album link
    const song = m[2] === 'song' || (m[2] === 'album' && !!i);
    const embed = `https://embed.music.apple.com${url.pathname}${i && /^\d+$/.test(i) ? `?i=${i}` : ''}`;
    return { link: raw, source: 'apple', embed, height: song ? 175 : 330, kind: song ? 'song' : m[2] };
  }
  return null;
}

function spotify(kind: string, id: string, link: string): Track {
  return { link, source: 'spotify', embed: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`, height: 152, kind };
}

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { link?: string; min?: boolean } | null;
    if (saved?.link) { current = parseMusicLink(saved.link); minimized = !!saved.min; }
  } catch { /* private mode or bad data */ }
}
function persist() {
  try {
    if (current) localStorage.setItem(KEY, JSON.stringify({ link: current.link, min: minimized }));
    else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
}
const emit = () => { persist(); listeners.forEach((fn) => fn()); };

export const getMusic = () => { load(); return { track: current, minimized }; };
export function subscribeMusic(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function playLink(input: string): Track | null {
  const t = parseMusicLink(input);
  if (t) { current = t; minimized = false; emit(); }
  return t;
}
export function stopMyMusic() { current = null; minimized = false; emit(); }
export function setMinimized(v: boolean) { minimized = v; emit(); }

/** The single gate for choosing your own Spotify / Apple Music: a Dodo Pro feature. */
export function canChooseMusic(pro: boolean): boolean {
  return pro;
}
