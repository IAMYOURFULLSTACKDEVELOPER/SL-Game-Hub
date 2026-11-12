'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { LogoMark } from './Art';
import { SoundControls } from './SoundControls';
import { ThemeToggle } from './ThemeToggle';
import { getPwa, promptInstall, reportSession, subscribePwa } from '@/lib/pwa';

export type NavItem = { href: string; label: string; icon: IconName };
type Props = {
  appName: string;
  primary: NavItem[];
  tabs: NavItem[];
  more: NavItem[];
  user: { name: string; avatar: string } | null;
  signIn: string; signUp: string; themeLabel: string;
  signOut: ReactNode;
};

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function NavBar({ appName, primary, tabs, more, user, signIn, signUp, themeLabel, signOut }: Props) {
  const path = usePathname();
  const [hover, setHover] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const links = useRef<Record<string, HTMLAnchorElement | null>>({});
  const pill = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // While a game is being played the tab bar steps aside so the board gets the whole screen.
  const playing = /^\/games\/[^/]+\/play/.test(path);
  const target = hover ?? primary.find((l) => isActive(path, l.href))?.href;
  useIsoLayout(() => {
    const el = target ? links.current[target] : null;
    const p = pill.current; if (!p) return;
    if (!el) { p.style.opacity = '0'; return; }
    p.style.opacity = '1';
    p.style.transform = `translateX(${el.offsetLeft}px)`;
    p.style.width = `${el.offsetWidth}px`;
  }, [target, path]);

  const [installable, setInstallable] = useState(false);
  useEffect(() => { setInstallable(getPwa().installable); return subscribePwa((p) => setInstallable(p.installable)); }, []);
  useEffect(() => { reportSession(user?.name ?? ''); }, [user?.name]);

  useEffect(() => { setMenu(false); setSheet(false); }, [path]);
  useEffect(() => {
    if (!menu && !sheet) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setSheet(false); } };
    const out = (e: PointerEvent) => { if (menu && !menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', out);
    document.body.style.overflow = sheet ? 'hidden' : '';
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', out); document.body.style.overflow = ''; };
  }, [menu, sheet]);

  return (
    <>
      <header className="site-header sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="group flex items-center gap-2.5 no-underline" aria-label={appName}>
            <LogoMark />
            <span className="font-display text-xl font-bold tracking-tight text-text">
              SL <span className="text-gradient">Game Hub</span>
            </span>
          </Link>

          <nav className="relative ml-4 hidden items-center lg:flex" aria-label="Main" onMouseLeave={() => setHover(null)}>
            <span ref={pill} className="nav-pill" aria-hidden="true" />
            {primary.map((l) => (
              <Link key={l.href} href={l.href} ref={(el) => { links.current[l.href] = el; }}
                onMouseEnter={() => setHover(l.href)} aria-current={isActive(path, l.href) ? 'page' : undefined}
                className={`nav-link ${isActive(path, l.href) ? 'is-active' : ''}`}>
                <Icon name={l.icon} size={18} />{l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <SoundControls />
            <ThemeToggle label={themeLabel} />
            {user ? (
              <div className="relative hidden lg:block" ref={menuRef}>
                <button type="button" className="account-btn" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}>
                  <span className="avatar-ring" aria-hidden="true">{user.avatar}</span>
                  <span className="max-w-[9rem] truncate font-semibold">{user.name}</span>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-300 ${menu ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <div role="menu" className={`menu-pop ${menu ? 'is-open' : ''}`}>
                  {more.map((l, i) => (
                    <Link key={l.href} href={l.href} role="menuitem" className="menu-item" style={{ ['--i' as string]: i }}>
                      <Icon name={l.icon} size={18} />{l.label}
                    </Link>
                  ))}
                  <div className="my-1 border-t border-border" />
                  {signOut}
                </div>
              </div>
            ) : (
              <div className="hidden items-center gap-2 lg:flex">
                <Link href="/login" className="btn btn-ghost btn-sm"><Icon name="login" size={18} />{signIn}</Link>
                <Link href="/signup" className="btn btn-primary btn-sm"><Icon name="sparkles" size={18} />{signUp}</Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Phones: thumb-reachable tab bar */}
      <nav className={`tabbar lg:hidden ${playing ? 'is-hidden' : ''}`} aria-label="Main" {...(playing ? { inert: '' } : {}) as object}>
        {tabs.map((l) => {
          const on = isActive(path, l.href);
          return (
            <Link key={l.href} href={l.href} className={`tab ${on ? 'is-active' : ''}`} aria-current={on ? 'page' : undefined}>
              <span className="tab-icon"><Icon name={l.icon} size={22} /></span>{l.label}
            </Link>
          );
        })}
        <button type="button" className={`tab ${sheet ? 'is-active' : ''}`} aria-expanded={sheet} onClick={() => setSheet(true)}>
          <span className="tab-icon">{user ? <span className="text-xl leading-none">{user.avatar}</span> : <Icon name="menu" size={22} />}</span>
          {user ? 'Me' : 'Menu'}
        </button>
      </nav>

      <div className={`sheet-backdrop lg:hidden ${sheet ? 'is-open' : ''}`} onClick={() => setSheet(false)} aria-hidden="true" />
      <div className={`sheet lg:hidden ${sheet ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Menu" {...(sheet ? {} : { inert: '' }) as object}>
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border" />
        {user && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-primary/10 p-3">
            <span className="avatar-ring h-12 w-12 text-2xl" aria-hidden="true">{user.avatar}</span>
            <div><p className="font-display text-lg font-bold">{user.name}</p><p className="text-sm text-muted">Signed in</p></div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {[...primary, ...more].filter((l, i, a) => a.findIndex((x) => x.href === l.href) === i).map((l, i) => (
            <Link key={l.href} href={l.href} className={`sheet-item ${isActive(path, l.href) ? 'is-active' : ''}`} style={{ ['--i' as string]: i }}>
              <Icon name={l.icon} size={24} />{l.label}
            </Link>
          ))}
        </div>
        <div className="mt-4 grid gap-2">
          {installable && (
            <button type="button" className="btn btn-outline" onClick={() => promptInstall()}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
              Install the app
            </button>
          )}
          {user ? signOut : (
            <div className="grid grid-cols-2 gap-2">
              <Link href="/login" className="btn btn-outline"><Icon name="login" size={18} />{signIn}</Link>
              <Link href="/signup" className="btn btn-primary"><Icon name="sparkles" size={18} />{signUp}</Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
