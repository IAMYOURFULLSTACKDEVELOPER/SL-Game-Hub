import Link from 'next/link';
import { t, AGE_BANDS } from '@slgh/shared';
import { Flash } from '@/components/Flash';
import { AuthShell } from '@/components/AuthShell';
import { Icon } from '@/components/Icon';
import { AuthForm } from '@/components/AuthForm';

export const metadata = { title: t('auth.signUpTitle') };
type SP = { error?: string; fullName?: string; username?: string; email?: string; ageBand?: string };

export default function SignUp({ searchParams: s }: { searchParams: SP }) {
  return (
    <AuthShell title={t('auth.signUpTitle')} subtitle="Free forever. Takes under a minute." wide>
      <Flash error={s.error} />
      <AuthForm kind="signUp" className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="fullName">{t('auth.fullName')}</label>
          <div className="input-icon"><Icon name="user" />
            <input id="fullName" name="fullName" required minLength={2} maxLength={80} autoComplete="name" defaultValue={s.fullName} className="input" /></div></div>
        <div><label className="label" htmlFor="username">{t('auth.username')}</label>
          <div className="input-icon"><Icon name="sparkles" />
            <input id="username" name="username" required pattern="[A-Za-z0-9_]{3,20}" autoComplete="username" autoCapitalize="none" defaultValue={s.username} className="input" aria-describedby="uh" /></div>
          <p id="uh" className="hint">{t('auth.usernameHint')}</p></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="email">{t('auth.email')}</label>
          <div className="input-icon"><Icon name="mail" />
            <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={s.email} className="input" /></div></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="ageBand">{t('auth.ageBand')}</label>
          <div className="input-icon"><Icon name="calendar" />
            <select id="ageBand" name="ageBand" required defaultValue={s.ageBand ?? ''} className="input" aria-describedby="ah">
              <option value="" disabled>{t('auth.ageChoose')}</option>
              {AGE_BANDS.map((b) => <option key={b} value={b}>{t(`auth.${b}`)}</option>)}
            </select></div>
          <p id="ah" className="hint">{t('auth.ageNote')}</p></div>
        <div><label className="label" htmlFor="password">{t('auth.password')}</label>
          <div className="input-icon"><Icon name="lock" />
            <input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" aria-describedby="ph" /></div>
          <p id="ph" className="hint">{t('auth.passwordHint')}</p></div>
        <div><label className="label" htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
          <div className="input-icon"><Icon name="lock" />
            <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" /></div></div>
        <button className="btn btn-primary btn-lg w-full sm:col-span-2"><Icon name="sparkles" />{t('auth.submitSignUp')}</button>
      </AuthForm>
      <p className="mt-6 border-t border-border pt-5 text-center"><Link href="/login" className="link-arrow">{t('auth.haveAccount')}<Icon name="arrowRight" size={18} /></Link></p>
    </AuthShell>
  );
}
