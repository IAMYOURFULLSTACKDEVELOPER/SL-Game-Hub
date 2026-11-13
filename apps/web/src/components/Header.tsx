import { t, avatarEmoji } from '@slgh/shared';
import { getMe } from '@/lib/session';
import { NavBar, type NavItem } from './NavBar';
import { Icon } from './Icon';
import { SignOutButton } from './SignOutButton';

export async function Header() {
  const me = await getMe();
  const primary: NavItem[] = [
    { href: '/games', label: t('nav.games'), icon: 'gamepad' },
    { href: '/lobby', label: 'Live games', icon: 'globe' },
    { href: '/leaderboards', label: 'Leaderboards', icon: 'trophy' },
    { href: '/tournaments', label: 'Tournaments', icon: 'swords' },
    ...(me ? [{ href: '/chat', label: 'Chat', icon: 'chat' } as NavItem] : []),
  ];
  const tabs: NavItem[] = [
    { href: '/', label: t('nav.home'), icon: 'home' },
    { href: '/games', label: t('nav.games'), icon: 'gamepad' },
    { href: '/leaderboards', label: 'Ranks', icon: 'trophy' },
    { href: '/tournaments', label: 'Events', icon: 'swords' },
  ];
  const more: NavItem[] = [
    ...(me ? [
      { href: '/profile', label: t('nav.profile'), icon: 'user' },
      { href: '/achievements', label: 'Achievements', icon: 'medal' },
      { href: '/wallet', label: 'Wallet', icon: 'wallet' },
      { href: '/shop', label: 'Shop', icon: 'bag' },
    ] as NavItem[] : []),
    ...(me?.role === 'admin' ? [{ href: '/admin', label: t('nav.admin'), icon: 'shield' } as NavItem] : []),
    { href: '/roadmap', label: 'Roadmap', icon: 'map' },
  ];

  return (
    <NavBar
      appName={t('app.name')} primary={primary} tabs={tabs} more={more}
      user={me ? { name: me.username, avatar: avatarEmoji(me.avatar) } : null}
      signIn={t('nav.signIn')} signUp={t('nav.signUp')} themeLabel={t('nav.theme')}
      signOut={
        <SignOutButton className="menu-item w-full text-danger"><Icon name="logout" size={18} />{t('nav.signOut')}</SignOutButton>
      }
    />
  );
}
