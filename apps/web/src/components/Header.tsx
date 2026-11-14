import { t, avatarEmoji } from '@slgh/shared';
import { getMe } from '@/lib/session';
import { api, query } from '@/lib/convex';
import { NavBar, type NavItem, type NavSection } from './NavBar';
import { Icon } from './Icon';
import { SignOutButton } from './SignOutButton';

export async function Header() {
  // The rail lists the published games; fetched alongside the session so pages don't wait twice.
  const [me, catalog] = await Promise.all([getMe(), query(api.games.list, {}).catch(() => [])]);

  const sections: NavSection[] = [
    { items: [
      { href: '/', label: t('nav.home'), icon: 'home' },
      { href: '/games', label: 'Browse games', icon: 'gamepad' },
      { href: '/lobby', label: 'Live games', icon: 'live' },
    ] },
    { title: 'Compete', items: [
      { href: '/leaderboards', label: 'Leaderboards', icon: 'trophy' },
      { href: '/tournaments', label: 'Tournaments', icon: 'swords' },
    ] },
    { title: 'Community', items: [
      ...(me ? [{ href: '/chat', label: 'chat', icon: 'hash' } as NavItem] : []),
      { href: '/roadmap', label: 'roadmap', icon: 'hash' },
    ] },
    ...(me ? [{ title: 'You', items: [
      { href: '/profile', label: t('nav.profile'), icon: 'user' },
      { href: '/achievements', label: 'Achievements', icon: 'medal' },
      { href: '/wallet', label: 'Wallet', icon: 'wallet' },
      { href: '/shop', label: 'Shop', icon: 'bag' },
      { href: '/groups', label: 'Groups', icon: 'users' },
      { href: '/pro', label: 'Pro', icon: 'star' },
      ...(me.role === 'admin' ? [{ href: '/admin', label: t('nav.admin'), icon: 'shield' } as NavItem] : []),
    ] as NavItem[] }] : []),
  ];
  const tabs: NavItem[] = [
    { href: '/', label: t('nav.home'), icon: 'home' },
    { href: '/games', label: t('nav.games'), icon: 'gamepad' },
    { href: '/lobby', label: 'Live', icon: 'live' },
    { href: '/leaderboards', label: 'Ranks', icon: 'trophy' },
  ];
  const account: NavItem[] = me ? [
    { href: '/profile', label: t('nav.profile'), icon: 'user' },
    { href: '/wallet', label: 'Wallet', icon: 'wallet' },
    { href: '/achievements', label: 'Achievements', icon: 'medal' },
  ] : [];

  return (
    <NavBar
      appName={t('app.name')} sections={sections} tabs={tabs} account={account}
      games={catalog.map((g) => ({ slug: g.slug, name: g.name }))}
      user={me ? { name: me.username, avatar: avatarEmoji(me.avatar) } : null}
      signIn={t('nav.signIn')} signUp={t('nav.signUp')} themeLabel={t('nav.theme')}
      signOut={
        <SignOutButton className="menu-item w-full menu-danger"><Icon name="logout" size={18} />{t('nav.signOut')}</SignOutButton>
      }
    />
  );
}
