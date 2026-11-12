import { t } from '@slgh/shared';
import { Flash } from '@/components/Flash';
import { AuthShell } from '@/components/AuthShell';
import { Icon } from '@/components/Icon';
import { AuthForm } from '@/components/AuthForm';

export const metadata = { title: t('auth.resetTitle') };

// Step 2 of a password reset: the code from the email plus the new password.
export default function Reset({ searchParams }: { searchParams: { error?: string; notice?: string; email?: string } }) {
  return (
    <AuthShell title={t('auth.newPassword')}>
      <Flash error={searchParams.error} notice={searchParams.notice} />
      <AuthForm kind="resetPassword" className="space-y-4">
        <div><label className="label" htmlFor="email">{t('auth.email')}</label>
          <div className="input-icon"><Icon name="mail" />
            <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={searchParams.email} className="input" /></div></div>
        <div><label className="label" htmlFor="code">{t('auth.resetCode')}</label>
          <div className="input-icon"><Icon name="lock" />
            <input id="code" name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className="input" /></div></div>
        <div><label className="label" htmlFor="password">{t('auth.newPassword')}</label>
          <div className="input-icon"><Icon name="lock" />
            <input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" /></div></div>
        <div><label className="label" htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
          <div className="input-icon"><Icon name="lock" />
            <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" /></div></div>
        <button className="btn btn-primary btn-lg w-full"><Icon name="check" />{t('auth.savePassword')}</button>
      </AuthForm>
    </AuthShell>
  );
}
