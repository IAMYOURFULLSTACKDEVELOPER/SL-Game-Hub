import Link from 'next/link';
import { t, AGE_BANDS } from '@slgh/shared';
import { signUp } from '../actions';
import { Flash } from '@/components/Flash';

export const metadata = { title: t('auth.signUpTitle') };
type SP = { error?: string; fullName?: string; username?: string; email?: string; ageBand?: string };

export default function SignUp({ searchParams: s }: { searchParams: SP }) {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-4">{t('auth.signUpTitle')}</h1>
      <Flash error={s.error} />
      <form action={signUp} className="card space-y-4 p-4">
        <div><label className="label" htmlFor="fullName">{t('auth.fullName')}</label>
          <input id="fullName" name="fullName" required minLength={2} maxLength={80} autoComplete="name" defaultValue={s.fullName} className="input" /></div>
        <div><label className="label" htmlFor="username">{t('auth.username')}</label>
          <input id="username" name="username" required pattern="[A-Za-z0-9_]{3,20}" autoComplete="username" autoCapitalize="none" defaultValue={s.username} className="input" aria-describedby="uh" />
          <p id="uh" className="hint">{t('auth.usernameHint')}</p></div>
        <div><label className="label" htmlFor="email">{t('auth.email')}</label>
          <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" defaultValue={s.email} className="input" /></div>
        <div><label className="label" htmlFor="ageBand">{t('auth.ageBand')}</label>
          <select id="ageBand" name="ageBand" required defaultValue={s.ageBand ?? ''} className="input" aria-describedby="ah">
            <option value="" disabled>{t('auth.ageChoose')}</option>
            {AGE_BANDS.map((b) => <option key={b} value={b}>{t(`auth.${b}`)}</option>)}
          </select>
          <p id="ah" className="hint">{t('auth.ageNote')}</p></div>
        <div><label className="label" htmlFor="password">{t('auth.password')}</label>
          <input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" aria-describedby="ph" />
          <p id="ph" className="hint">{t('auth.passwordHint')}</p></div>
        <div><label className="label" htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" /></div>
        <button className="btn btn-primary w-full">{t('auth.submitSignUp')}</button>
      </form>
      <p className="mt-4"><Link href="/login" className="text-secondary">{t('auth.haveAccount')}</Link></p>
    </main>
  );
}
