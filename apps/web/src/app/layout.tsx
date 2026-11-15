import './globals.css';
import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { tokens, t } from '@slgh/shared';
import { Header } from '@/components/Header';
import { FX } from '@/components/FX';
import { PwaManager } from '@/components/PwaManager';
import { PhysicsFX } from '@/components/PhysicsFX';
import { MusicDock } from '@/components/MusicDock';

// Type is the system UI stack (no font download): crisp at small sizes and instant on slow networks.

export const metadata: Metadata = {
  title: { default: t('app.name'), template: `%s | ${t('app.name')}` },
  description: t('home.heroText'),
  applicationName: t('app.name'),
  // Installed on iPhone/iPad: launches full screen with our icon and name
  appleWebApp: { capable: true, title: 'Dodo', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#1e1f22' }],
};

const vars = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `--c-${k}:${v};`).join('');
const css = `:root{${vars(tokens.light)}color-scheme:light}[data-theme=dark]{${vars(tokens.dark)}color-scheme:dark}`;
// Runs before first paint so there is no light/dark flash. Dark unless the player chose light.
const themeScript = `try{var t=localStorage.getItem('theme')||'dark';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="dark">
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <Header />
        <Suspense fallback={null}><FX /></Suspense>
        <PwaManager />
        <PhysicsFX />
        <div id="main" className="app-main">{children}</div>
        <MusicDock />
      </body>
    </html>
  );
}
