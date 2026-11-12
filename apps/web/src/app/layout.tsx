import './globals.css';
import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata, Viewport } from 'next';
import { Fredoka } from 'next/font/google';
import { tokens, t } from '@slgh/shared';
import { Header } from '@/components/Header';
import { FX } from '@/components/FX';
import { LogoMark } from '@/components/Art';
import { PwaManager } from '@/components/PwaManager';

// One display face for headings only (self-hosted by Next, ~30 KB, swaps in so text never waits).
// Body text stays on the system font so the shell remains light.
const display = Fredoka({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: { default: t('app.name'), template: `%s | ${t('app.name')}` },
  description: t('home.heroText'),
  applicationName: t('app.name'),
  // Installed on iPhone/iPad: launches full screen with our icon and name
  appleWebApp: { capable: true, title: 'Game Hub', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f2f7f5' }, { media: '(prefers-color-scheme: dark)', color: '#060d1b' }],
};

const vars = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `--c-${k}:${v};`).join('');
const css = `:root{${vars(tokens.light)}color-scheme:light}[data-theme=dark]{${vars(tokens.dark)}color-scheme:dark}`;
// Runs before first paint so there is no light/dark flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={display.variable}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="app-bg" aria-hidden="true"><span className="orb orb-a" /><span className="orb orb-b" /><span className="orb orb-c" /></div>
        <a href="#main" className="skip-link">Skip to content</a>
        <Header />
        <Suspense fallback={null}><FX /></Suspense>
        <PwaManager />
        <div id="main" className="app-main">{children}</div>
        <footer className="mx-auto mt-16 max-w-6xl px-4 pb-28 pt-8 lg:pb-10">
          <div className="flag-rule mb-6" aria-hidden="true" />
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted sm:flex-row">
            <div className="flex items-center gap-2"><LogoMark size={28} /><span className="font-display font-semibold text-text">{t('app.name')}</span>
              <span>· Made in Salone</span></div>
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2" aria-label="Footer">
              <Link href="/games" className="footer-link">{t('nav.games')}</Link>
              <Link href="/leaderboards" className="footer-link">Leaderboards</Link>
              <Link href="/tournaments" className="footer-link">Tournaments</Link>
              <Link href="/roadmap" className="footer-link">Roadmap</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
