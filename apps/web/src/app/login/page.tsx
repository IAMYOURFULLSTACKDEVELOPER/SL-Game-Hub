import Link from 'next/link';
import { t } from '@slgh/shared';
import { Flash } from '@/components/Flash';
import { AuthShell } from '@/components/AuthShell';
import { Icon } from '@/components/Icon';
import { AuthForm } from '@/components/AuthForm';

export const metadata = { title: t('auth.signInTitle') };

export default function Login({ searchParams }: { searchParams: { error?: string; notice?: string; next?: string } }) {
  return (
    <AuthShell title={t('auth.signInTitle')} subtitle="Welcome back. Your games are waiting.">
      <Flash error={searchParams.error} notice={searchParams.notice} />
      <AuthForm kind="signIn" className="space-y-4">
        <input type="hidden" name="next" value={searchParams.next ?? '/'} />
        <div><label className="label" htmlFor="email">{t('auth.email')}</label>
          <div className="input-icon"><Icon name="mail" />
            <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="input" /></div></div>
        <div>
          <div className="flex items-baseline justify-between"><label className="label" htmlFor="password">{t('auth.password')}</label>
            <Link href="/forgot-password" className="text-sm font-semibold text-secondary">{t('auth.forgot')}</Link></div>
          <div className="input-icon"><Icon name="lock" />
            <input id="password" name="password" type="password" required autoComplete="current-password" className="input" /></div></div>
        <button className="btn btn-primary btn-lg w-full"><Icon name="login" />{t('auth.submitSignIn')}</button>
      </AuthForm>
      <p className="mt-6 border-t border-border pt-5 text-center"><Link href="/signup" className="link-arrow">{t('auth.noAccount')}<Icon name="arrowRight" size={18} /></Link></p>
    </AuthShell>
  );
}
