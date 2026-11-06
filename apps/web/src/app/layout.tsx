import './globals.css';
import type { Metadata, Viewport } from 'next';
import { tokens, t } from '@slgh/shared';
import { Header } from '@/components/Header';

export const metadata: Metadata = {
  title: { default: t('app.name'), template: `%s | ${t('app.name')}` },
  description: t('home.heroText'),
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

const vars = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `--c-${k}:${v};`).join('');
const css = `:root{${vars(tokens.light)}color-scheme:light}[data-theme=dark]{${vars(tokens.dark)}color-scheme:dark}`;
// Runs before first paint so there is no light/dark flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
