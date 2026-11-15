import Link from 'next/link';
import { formatLeones } from '@slgh/shared/src/wallet';
import { api, query } from '@/lib/convex';
import { Icon, type IconName } from '@/components/Icon';

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const FEED_ICON: Record<string, IconName> = { signup: 'user', 'money-in': 'download', pro: 'star', 'money-out': 'wallet', game: 'trophy' };

/** Admin overview: what needs attention, today's numbers, totals, and what happened recently. */
export default async function Overview() {
  const d = await query(api.admin.dashboard, {});
  const a = d.attention;
  const todo = [
    a.withdrawals > 0 && { href: '/admin/wallet', text: `${a.withdrawals} withdrawal${a.withdrawals === 1 ? '' : 's'} waiting (${formatLeones(a.withdrawalTotal)})`, cta: 'Review & send' },
    a.reports > 0 && { href: '/admin/reports', text: `${a.reports} open report${a.reports === 1 ? '' : 's'}`, cta: 'Review' },
    a.flaggedMessages > 0 && { href: '/admin/chat', text: `${a.flaggedMessages} flagged chat message${a.flaggedMessages === 1 ? '' : 's'}`, cta: 'Moderate' },
  ].filter(Boolean) as { href: string; text: string; cta: string }[];
  const stat = (label: string, value: string | number, href?: string) => {
    const body = <><p className="text-sm text-muted">{label}</p><p className="text-2xl font-bold">{value}</p></>;
    return href ? <Link key={label} href={href} className="card card-hover p-4">{body}</Link> : <div key={label} className="card p-4">{body}</div>;
  };

  return (
    <div className="space-y-8">
      <h1>Admin</h1>

      <section className="space-y-2">
        <h2 className="font-bold">Needs your attention</h2>
        {todo.length === 0 ? <p className="card p-4 text-muted">All clear: nothing waiting.</p> : (
          <ul className="space-y-2">
            {todo.map((x) => (
              <li key={x.href} className="card flex flex-wrap items-center justify-between gap-3 border-accent/50 p-4">
                <span className="font-semibold">{x.text}</span>
                <Link href={x.href} className="btn btn-primary btn-sm">{x.cta}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Today</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stat('New players', d.today.newPlayers, '/admin/players')}
          {stat('Money in', formatLeones(d.today.moneyIn), '/admin/wallet')}
          {stat('Payments', d.today.payments, '/admin/wallet')}
          {stat('Paid out', formatLeones(d.today.paidOut), '/admin/wallet')}
          {stat('Pro sold', d.today.proSold, '/admin/wallet')}
          {stat('Online games', d.today.onlineGames, '/admin/rooms')}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Totals</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stat('Players', d.totals.players, '/admin/players')}
          {stat('Pro players', d.totals.activePro)}
          {stat('Suspended', d.totals.suspended)}
          {stat('Wallet balances', formatLeones(d.totals.balances), '/admin/wallet')}
          {stat('Held in games', formatLeones(d.totals.held), '/admin/wallet')}
          {stat('Rooms (playing)', `${d.totals.openRooms} (${d.totals.liveRooms})`, '/admin/rooms')}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-bold">Recent activity</h2>
          {d.feed.length === 0 ? <p className="card p-4 text-muted">Nothing yet.</p> : (
            <ul className="card divide-y divide-border p-0">
              {d.feed.map((f, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <Icon name={FEED_ICON[f.kind] ?? 'info'} size={16} className="mt-0.5 text-muted" />
                  <span className="min-w-0 flex-1">{f.text}</span>
                  <span className="shrink-0 text-xs text-muted">{when(f.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="flex items-center justify-between font-bold">Recent admin actions <Link href="/admin/log" className="text-sm font-semibold text-secondary">Full log</Link></h2>
          {d.recentActions.length === 0 ? <p className="card p-4 text-muted">No admin actions yet.</p> : (
            <ul className="card divide-y divide-border p-0">
              {d.recentActions.map((x) => (
                <li key={x.id} className="px-4 py-2.5 text-sm">
                  <b>{x.admin}</b> · {x.action}{x.target && <> · {x.target}</>}
                  <span className="block text-xs text-muted">{x.details} · {when(x.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
