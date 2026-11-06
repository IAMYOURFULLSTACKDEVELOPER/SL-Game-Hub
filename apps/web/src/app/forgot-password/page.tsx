import { t } from '@slgh/shared';
import { requestPasswordReset } from '../actions';
import { Flash } from '@/components/Flash';

export const metadata = { title: t('auth.resetTitle') };

export default function Forgot({ searchParams }: { searchParams: { error?: string; notice?: string } }) {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-4">{t('auth.resetTitle')}</h1>
      <Flash error={searchParams.error} notice={searchParams.notice} />
      <form action={requestPasswordReset} className="card space-y-4 p-4">
        <div><label className="label" htmlFor="email">{t('auth.email')}</label>
          <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="input" /></div>
        <button className="btn btn-primary w-full">{t('auth.resetSend')}</button>
      </form>
    </main>
  );
}
