import Link from 'next/link';
import { t } from '@slgh/shared';
import { signIn } from '../actions';
import { Flash } from '@/components/Flash';

export const metadata = { title: t('auth.signInTitle') };

export default function Login({ searchParams }: { searchParams: { error?: string; notice?: string; next?: string } }) {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-4">{t('auth.signInTitle')}</h1>
      <Flash error={searchParams.error} notice={searchParams.notice} />
      <form action={signIn} className="card space-y-4 p-4">
        <input type="hidden" name="next" value={searchParams.next ?? '/'} />
        <div><label className="label" htmlFor="email">{t('auth.email')}</label>
          <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="input" /></div>
        <div><label className="label" htmlFor="password">{t('auth.password')}</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" /></div>
        <button className="btn btn-primary w-full">{t('auth.submitSignIn')}</button>
      </form>
      <p className="mt-4 space-y-2"><Link href="/forgot-password" className="block text-secondary">{t('auth.forgot')}</Link>
        <Link href="/signup" className="block text-secondary">{t('auth.noAccount')}</Link></p>
    </main>
  );
}
