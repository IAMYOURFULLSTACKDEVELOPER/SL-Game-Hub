'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { LogoMark } from './Art';
import { Avatar } from './Avatar';
import { GameGlyph } from './GameGlyph';
import { SoundControls } from './SoundControls';
import { ThemeToggle } from './ThemeToggle';
import { getPwa, promptInstall, reportSession, subscribePwa } from '@/lib/pwa';

// The app shell, laid out like Discord: a rail of game icons on the far left, a sidebar of
// "channels" with the user panel at its foot, and a slim top bar over the page. On phones the
// rail + sidebar slide in as a drawer, and a tab bar sits at the bottom (hidden while playing).

export type NavItem = { href: string; label: string; icon: IconName };
export type NavSection = { title?: string; items: NavItem[] };
type Props = {
  appName: string;
  sections: NavSection[];
  tabs: NavItem[];
  /** `icon`: a small crop of the game's cover for the rail (null: the game's vector glyph) */
  games: { slug: string; name: string; icon?: string | null }[];
  account: NavItem[];
  /** `avatar`: the player's preset avatar id (drawn by <Avatar>) */
  user: { name: string; avatar: string | null } | null;
  signIn: string; signUp: string; themeLabel: string;
  signOut: ReactNode;
  /** Dodo Pro is active (unlocks playing your own music) */
  pro: boolean;
  /** The notification bell (signed in only), shown in the top bar */
  bell?: ReactNode;
};

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

export function NavBar({ appName, sections, tabs, games, account, user, signIn, signUp, themeLabel, signOut, pro, bell }: Props) {
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const [installable, setInstallable] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // While a game is being played the tab bar steps aside so the board gets the whole screen.
  const playing = /^\/games\/[^/]+\/play/.test(path);

  useEffect(() => { setInstallable(getPwa().installable); return subscribePwa((p) => setInstallable(p.installable)); }, []);
  useEffect(() => { reportSession(user?.name ?? ''); }, [user?.name]);
  useEffect(() => { setDrawer(false); setMenu(false); setTip(null); }, [path]);
  useEffect(() => {
    if (!drawer && !menu) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawer(false); setMenu(false); } };
    const out = (e: PointerEvent) => { if (menu && !menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', out);
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', out); document.body.style.overflow = ''; };
  }, [drawer, menu]);

  // Title for the top bar: the game being viewed, else the matching sidebar entry.
  const game = games.find((g) => path === `/games/${g.slug}` || path.startsWith(`/games/${g.slug}/`));
  const items = sections.flatMap((s) => s.items).concat(account);
  const page = items.filter((i) => isActive(path, i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const title = game ? game.name : page?.label ?? appName;

  const showTip = (label: string) => (e: React.MouseEvent | React.FocusEvent) => {
    const el = e.currentTarget as HTMLElement;
    const r = (el.querySelector('.rail-icon') ?? el).getBoundingClientRect(); // line up with the icon, not its label
    setTip({ label, top: r.top + r.height / 2 });
  };
  const railProps = (label: string) => ({ onMouseEnter: showTip(label), onFocus: showTip(label), onMouseLeave: () => setTip(null), onBlur: () => setTip(null), 'aria-label': label });

  return (
    <>
      <div className={`shell-side ${drawer ? 'is-open' : ''}`}>
        {/* Game rail */}
        <nav className="rail" aria-label="Games">
          <Link href="/" className={`rail-item ${path === '/' ? 'is-active' : ''}`} {...railProps('Home')} aria-current={path === '/' ? 'page' : undefined}>
            <span className="rail-pill" /><span className="rail-icon rail-home"><LogoMark size={30} flat /></span>
            <span className="rail-label" aria-hidden="true">Home</span>
          </Link>
          <span className="rail-sep" aria-hidden="true" />
          {games.map((g) => {
            const on = game?.slug === g.slug;
            return (
              <Link key={g.slug} href={`/games/${g.slug}`} className={`rail-item ${on ? 'is-active' : ''}`} {...railProps(g.name)} aria-current={on ? 'page' : undefined}>
                <span className="rail-pill" />
                <span className="rail-icon">
                  {g.icon
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={g.icon} alt="" width={48} height={48} decoding="async" className="rail-thumb" draggable={false} />
                    : <GameGlyph slug={g.slug} name={g.name} size={48} />}
                </span>
                <span className="rail-label" aria-hidden="true">{g.name}</span>
              </Link>
            );
          })}
          <span className="rail-sep" aria-hidden="true" />
          <Link href="/lobby" className={`rail-item rail-green ${isActive(path, '/lobby') ? 'is-active' : ''}`} {...railProps('Live games')}>
            <span className="rail-pill" /><span className="rail-icon"><Icon name="compass" size={24} /></span>
            <span className="rail-label" aria-hidden="true">Live</span>
          </Link>
          {installable && (
            <button type="button" className="rail-item rail-green" onClick={() => promptInstall()} {...railProps('Install the app')}>
              <span className="rail-pill" /><span className="rail-icon"><Icon name="download" size={22} /></span>
              <span className="rail-label" aria-hidden="true">Install</span>
            </button>
          )}
        </nav>

        {/* Channel sidebar */}
        <div className="sidebar">
          <div className="sidebar-head">
            <span className="truncate">{appName}</span>
            <span className="flag-dots" aria-hidden="true"><i /><i /><i /></span>
          </div>
          <div className="sidebar-scroll">
            <Link href="/games" className="sidebar-search"><Icon name="search" size={15} />Find a game</Link>
            {sections.map((s, si) => (
              <div key={si} className="sidebar-group">
                {s.title && <p className="sidebar-cat">{s.title}</p>}
                {s.items.map((i) => {
                  const on = page?.href === i.href && !game;
                  return (
                    <Link key={i.href} href={i.href} className={`channel ${on ? 'is-active' : ''}`} aria-current={on ? 'page' : undefined}>
                      <Icon name={i.icon} size={20} />{i.label}
                      {i.href === '/live' && <span className="channel-live">LIVE</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          {/* User panel */}
          <div className="user-panel" ref={menuRef}>
            {user ? (
              <button type="button" className="user-chip" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}>
                <span className="user-avatar" aria-hidden="true"><Avatar id={user.avatar} size={32} /><span className="status-dot" /></span>
                <span className="min-w-0 text-left">
                  <span className="block truncate text-sm font-semibold text-heading">{user.name}</span>
                  <span className="block truncate text-xs text-muted">Online</span>
                </span>
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 gap-1.5">
                <Link href="/login" className="btn btn-sm btn-secondary min-w-0 flex-1 whitespace-nowrap px-2">{signIn}</Link>
                <Link href="/signup" className="btn btn-sm btn-primary min-w-0 flex-1 whitespace-nowrap px-2">{signUp}</Link>
              </div>
            )}
            <div className="flex items-center">
              <SoundControls pro={pro} />
              <ThemeToggle label={themeLabel} />
              {user && (
                <button type="button" className="btn btn-icon" aria-label="Account menu" title="Account" onClick={() => setMenu((m) => !m)}>
                  <Icon name="settings" size={18} />
                </button>
              )}
            </div>
            {user && (
              <div role="menu" className={`menu-pop ${menu ? 'is-open' : ''}`}>
                {account.map((l) => (
                  <Link key={l.href} href={l.href} role="menuitem" className="menu-item"><Icon name={l.icon} size={18} />{l.label}</Link>
                ))}
                <div className="menu-sep" />
                {signOut}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={`drawer-backdrop ${drawer ? 'is-open' : ''}`} onClick={() => setDrawer(false)} aria-hidden="true" />

      {tip && <span className="rail-tooltip" style={{ top: tip.top }} role="tooltip">{tip.label}</span>}

      {/* Top bar over the page */}
      <header className="topbar">
        <button type="button" className="btn btn-icon lg:hidden" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
          <Icon name="menu" size={22} />
        </button>
        {game ? <GameGlyph slug={game.slug} name={game.name} size={24} className="rounded-md" /> : <Icon name={page?.icon ?? 'home'} size={22} className="text-muted" />}
        <h2 className="truncate text-base font-bold text-heading">{title}</h2>
        {playing && <span className="topbar-tag">Playing</span>}
        <div className="ml-auto flex items-center gap-1">
          {bell}
          <Link href="/games" className="btn btn-icon" aria-label="Find a game" title="Find a game"><Icon name="search" size={20} /></Link>
          <Link href="/lobby" className="btn btn-icon" aria-label="Live games" title="Live games"><Icon name="live" size={20} /></Link>
        </div>
      </header>

      {/* Phones: thumb-reachable tab bar */}
      <nav className={`tabbar lg:hidden ${playing ? 'is-hidden' : ''}`} aria-label="Main" {...(playing ? { inert: '' } : {}) as object}>
        {tabs.map((l) => {
          const on = isActive(path, l.href) && !(l.href === '/games' && path.startsWith('/games/'));
          return (
            <Link key={l.href} href={l.href} className={`tab ${on ? 'is-active' : ''}`} aria-current={on ? 'page' : undefined}>
              <Icon name={l.icon} size={22} />{l.label}
            </Link>
          );
        })}
        <button type="button" className={`tab ${drawer ? 'is-active' : ''}`} aria-expanded={drawer} onClick={() => setDrawer(true)}>
          {user ? <Avatar id={user.avatar} size={28} /> : <Icon name="menu" size={22} />}
          {user ? 'You' : 'Menu'}
        </button>
      </nav>
    </>
  );
}
