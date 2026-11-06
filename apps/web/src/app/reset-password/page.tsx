import { t } from '@slgh/shared';
import { updatePassword } from '../actions';
import { Flash } from '@/components/Flash';

export const metadata = { title: t('auth.resetTitle') };

export default function Reset({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-4">{t('auth.newPassword')}</h1>
      <Flash error={searchParams.error} />
      <form action={updatePassword} className="card space-y-4 p-4">
        <div><label className="label" htmlFor="password">{t('auth.newPassword')}</label>
          <input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" /></div>
        <div><label className="label" htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" /></div>
        <button className="btn btn-primary w-full">{t('auth.savePassword')}</button>
      </form>
    </main>
  );
}
