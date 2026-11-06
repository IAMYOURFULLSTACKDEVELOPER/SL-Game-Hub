import Link from 'next/link';
import { t, avatarEmoji } from '@slgh/shared';
import { getMe } from '@/lib/session';
import { signOut } from '@/app/actions';
import { ThemeToggle } from './ThemeToggle';

export async function Header() {
  const me = await getMe();
  return (
    <header className="border-b-2 border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <Link href="/" className="text-xl font-extrabold text-primary no-underline">{t('app.name')}</Link>
        <nav className="flex flex-wrap items-center gap-2">
          <Link href="/games" className="btn btn-outline btn-sm">{t('nav.games')}</Link>
          <Link href="/leaderboards" className="btn btn-outline btn-sm">Leaderboards</Link>
          <Link href="/tournaments" className="btn btn-outline btn-sm">Tournaments</Link>
          {me ? (
            <>
              <Link href="/achievements" className="btn btn-outline btn-sm">Achievements</Link>
              <Link href="/chat" className="btn btn-outline btn-sm">Chat</Link>
              <Link href="/shop" className="btn btn-outline btn-sm">Shop</Link>
              {me.role === 'admin' && <Link href="/admin" className="btn btn-outline btn-sm">{t('nav.admin')}</Link>}
              <Link href="/profile" className="btn btn-outline btn-sm">{avatarEmoji(me.avatar)} {me.username}</Link>
              <form action={signOut}><button className="btn btn-outline btn-sm">{t('nav.signOut')}</button></form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-outline btn-sm">{t('nav.signIn')}</Link>
              <Link href="/signup" className="btn btn-primary btn-sm">{t('nav.signUp')}</Link>
            </>
          )}
          <Link href="/roadmap" className="btn btn-outline btn-sm">Roadmap</Link>
          <ThemeToggle label={t('nav.theme')} />
        </nav>
      </div>
    </header>
  );
}
