import type { MetadataRoute } from 'next';
import { t } from '@slgh/shared';

// form_factor/label drive the richer install sheet on Android; Next 14's types don't list them yet.
type Screenshot = NonNullable<MetadataRoute.Manifest['screenshots']>[number] & { form_factor: 'narrow' | 'wide'; label: string };
const SCREENSHOTS: Screenshot[] = [
  { src: '/screenshots/home-narrow.webp', sizes: '390x844', type: 'image/webp', form_factor: 'narrow', label: 'Home screen with featured games' },
  { src: '/screenshots/games-narrow.webp', sizes: '390x844', type: 'image/webp', form_factor: 'narrow', label: 'The game library' },
  { src: '/screenshots/home-wide.webp', sizes: '1280x800', type: 'image/webp', form_factor: 'wide', label: 'Home screen on a tablet or laptop' },
];

// Served at /manifest.webmanifest and linked automatically by Next.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: t('app.name'),
    short_name: 'Game Hub',
    description: t('home.heroText'),
    lang: 'en',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any', // board games are often nicer in landscape
    background_color: '#f2f7f5',
    theme_color: '#048750',
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    screenshots: SCREENSHOTS,
    shortcuts: [
      { name: 'Games', short_name: 'Games', url: '/games?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Leaderboards', short_name: 'Ranks', url: '/leaderboards?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Tournaments', short_name: 'Events', url: '/tournaments?source=pwa', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
