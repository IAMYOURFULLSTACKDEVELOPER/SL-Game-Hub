import { t } from '@slgh/shared';
import { displaySlPhone, formatLeones, providerName } from '@slgh/shared/src/wallet';
import { api, query } from '@/lib/convex';
import { reviewWithdrawal } from '../../actions';

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<string, string> = {
  completed: 'Paid', failed: 'Failed, refunded', rejected: 'Declined, refunded', cancelled: 'Cancelled by player',
  pending: 'Waiting for payment', creating: 'Creating code', expired: 'Expired',
};

/** Admin money dashboard: totals, the withdrawal queue, and everything that moved money recently. */
export default async function AdminWallet({ searchParams }: { searchParams: { error?: string } }) {
  const w = await query(api.wallet.adminOverview, {});
  type W = (typeof w.requested)[number];
  const row = (x: W, actions: React.ReactNode) => (
    <li key={x.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
      <span>
        Send <b>{formatLeones(x.amount - x.fee)}</b> to {providerName(x.provider)} {displaySlPhone(x.phone)} · <b>{x.username}</b>
        {x.fee > 0 && <span className="text-xs text-muted"> (withdrew {formatLeones(x.amount)}, fee {formatLeones(x.fee)})</span>}
        {x.banned && <b className="ml-2 text-danger">{t('admin.suspended')}</b>}
        <span className="block text-xs text-muted">Asked {when(x.created_at)}</span>
        {x.error && <span className="block text-sm text-danger">{x.error}</span>}
      </span>
      {actions}
    </li>
  );
  const buttons = (x: W, approveLabel: string, reject: boolean) => (
    <form action={reviewWithdrawal} className="flex gap-2">
      <input type="hidden" name="id" value={x.id} />
      <button name="decision" value="approve" className="btn btn-primary btn-sm">{approveLabel}</button>
      {reject && <button name="decision" value="reject" className="btn btn-outline btn-sm">Decline</button>}
    </form>
  );
  const error = searchParams.error && (searchParams.error.startsWith('errors.') ? t(searchParams.error) : searchParams.error);
  const table = (head: string[], rows: React.ReactNode[][], empty: string) => !rows.length ? <p className="card p-4 text-muted">{empty}</p> : (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-border text-muted">{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border/60 last:border-0">{r.map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-2">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-8">
      <h1>Money</h1>
      {!w.configured && <p className="card p-3 text-danger">Mobile money payments are not set up yet.</p>}
      {error && <p role="alert" className="card p-3 text-danger">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {([
          ['Players’ balances', formatLeones(w.balances)],
          ['Held in games & withdrawals', formatLeones(w.held)],
          ['Fees from money games', formatLeones(w.fees)],
          ['Withdrawal fees', formatLeones(w.withdrawalFees)],
          ['Pro revenue', formatLeones(w.proRevenue)],
          ['Active Pro players', String(w.proActive)],
        ] as const).map(([k, n]) => (
          <div key={k} className="card p-4"><p className="text-sm text-muted">{k}</p><p className="text-2xl font-bold">{n}</p></div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Withdrawals waiting for approval ({w.requested.length})</h2>
        <p className="text-sm text-muted">"Approve &amp; send" pays the player straight away to the number shown. "Decline" returns the money to their wallet.</p>
        {!w.requested.length ? <p className="card p-4 text-muted">None waiting.</p> : (
          <ul className="space-y-2">{w.requested.map((x) => row(x, buttons(x, 'Approve & send', true)))}</ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Being paid out</h2>
        {!w.processing.length ? <p className="card p-4 text-muted">None.</p> : (
          <ul className="space-y-2">
            {w.processing.map((x) => row(x, x.error && !x.has_payout ? buttons(x, 'Retry payout', false) : <span className="chip chip-muted">Sending</span>))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Recent withdrawals</h2>
        {table(['When', 'Player', 'Amount', 'To', 'Result'], w.withdrawalHistory.map((x) => [
          when(x.updated_at), x.username, `${formatLeones(x.amount - x.fee)}${x.fee ? ` (+${formatLeones(x.fee)} fee)` : ''}`, `${providerName(x.provider)} ${displaySlPhone(x.phone)}`,
          <span key="s" className={x.status === 'completed' ? 'font-semibold text-primary' : 'text-muted'}>{STATUS[x.status] ?? x.status}{x.error ? ` (${x.error})` : ''}</span>,
        ]), 'No finished withdrawals yet.')}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Recent payments in (USSD)</h2>
        {table(['When', 'Player', 'For', 'Amount', 'Player paid', 'Status'], w.deposits.map((d) => [
          when(d.created_at), d.username, d.purpose, formatLeones(d.amount), formatLeones(d.charge),
          <span key="s" className={d.status === 'completed' ? 'font-semibold text-primary' : 'text-muted'}>{STATUS[d.status] ?? d.status}{d.error ? ` (${d.error})` : ''}</span>,
        ]), 'No payments yet.')}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Pro payments</h2>
        {table(['When', 'Player', 'Paid', 'How', 'Pro until'], w.pro.map((p) => [
          when(p.created_at), p.username, formatLeones(p.amount), p.method === 'wallet' ? 'Wallet' : 'USSD', when(p.until),
        ]), 'No Pro payments yet.')}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Money games paid out</h2>
        {table(['When', 'Game', 'Room', 'Pot', 'Fee', 'Winner'], w.pots.map((p) => [
          when(p.settled_at), p.game, p.room, formatLeones(p.total), formatLeones(p.fee), p.winner,
        ]), 'No money games finished yet.')}
      </section>
    </div>
  );
}
