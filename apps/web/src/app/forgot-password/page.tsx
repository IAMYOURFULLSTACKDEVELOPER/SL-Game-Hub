import Link from 'next/link';
import { t } from '@slgh/shared';
import { Flash } from '@/components/Flash';
import { AuthShell } from '@/components/AuthShell';
import { Icon } from '@/components/Icon';
import { AuthForm } from '@/components/AuthForm';

export const metadata = { title: t('auth.resetTitle') };

export default function Forgot({ searchParams }: { searchParams: { error?: string; notice?: string } }) {
  return (
    <AuthShell title={t('auth.resetTitle')}>
      <Flash error={searchParams.error} notice={searchParams.notice} />
      <AuthForm kind="requestReset" className="space-y-4">
        <div><label className="label" htmlFor="email">{t('auth.email')}</label>
          <div className="input-icon"><Icon name="mail" />
            <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="input" /></div></div>
        <button className="btn btn-primary btn-lg w-full"><Icon name="mail" />{t('auth.resetSend')}</button>
      </AuthForm>
      <p className="mt-6 border-t border-border pt-5 text-center"><Link href="/login" className="back-link"><Icon name="arrowLeft" size={18} />{t('auth.signInTitle')}</Link></p>
    </AuthShell>
  );
}
