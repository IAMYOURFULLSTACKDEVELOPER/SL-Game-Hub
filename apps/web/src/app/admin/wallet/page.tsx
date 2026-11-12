import { t } from '@slgh/shared';
import { displaySlPhone, formatLeones, providerName } from '@slgh/shared/src/wallet';
import { api, query } from '@/lib/convex';
import { reviewWithdrawal } from '../../actions';

export default async function AdminWallet({ searchParams }: { searchParams: { error?: string } }) {
  const w = await query(api.wallet.adminOverview, {});
  const row = (x: (typeof w.requested)[number], actions: React.ReactNode) => (
    <li key={x.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
      <span>
        <b>{formatLeones(x.amount)}</b> to {providerName(x.provider)} {displaySlPhone(x.phone)} · <b>{x.username}</b>
        {x.banned && <b className="ml-2 text-danger">{t('admin.suspended')}</b>}
        <span className="block text-xs text-muted">{new Date(x.created_at).toLocaleString('en-GB')}</span>
        {x.error && <span className="block text-sm text-danger">{x.error}</span>}
      </span>
      {actions}
    </li>
  );
  const buttons = (x: (typeof w.requested)[number], approveLabel: string, reject: boolean) => (
    <form action={reviewWithdrawal} className="flex gap-2">
      <input type="hidden" name="id" value={x.id} />
      <button name="decision" value="approve" className="btn btn-primary btn-sm">{approveLabel}</button>
      {reject && <button name="decision" value="reject" className="btn btn-outline btn-sm">Decline</button>}
    </form>
  );

  return (
    <>
      <h1 className="mb-4">{t('admin.wallet')}</h1>
      {!w.configured && <p className="card mb-4 p-3 text-danger">Monime is not configured: set MONIME_ACCESS_TOKEN and MONIME_SPACE_ID on the Convex deployment.</p>}
      {searchParams.error && <p className="card mb-4 p-3 text-danger">{searchParams.error}</p>}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[['Players’ balances', w.balances], ['Held in games & withdrawals', w.held], ['Fees earned', w.fees]].map(([k, n]) => (
          <div key={k as string} className="card p-4"><p className="text-sm text-muted">{k}</p><p className="text-2xl font-bold">{formatLeones(n as number)}</p></div>
        ))}
      </div>

      <h2 className="mb-2 font-bold">Withdrawals waiting for approval</h2>
      {!w.requested.length ? <p className="card mb-6 p-4 text-muted">None.</p> : (
        <ul className="mb-6 space-y-2">{w.requested.map((x) => row(x, buttons(x, 'Approve & send', true)))}</ul>
      )}

      <h2 className="mb-2 font-bold">Being paid out</h2>
      {!w.processing.length ? <p className="card p-4 text-muted">None.</p> : (
        <ul className="space-y-2">
          {w.processing.map((x) => row(x, x.error && !x.has_payout ? buttons(x, 'Retry payout', false) : <span className="chip chip-muted">Sending</span>))}
        </ul>
      )}
    </>
  );
}
