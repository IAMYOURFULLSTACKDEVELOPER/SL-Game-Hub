import Link from 'next/link';
import { formatLeones } from '@slgh/shared/src/wallet';
import { api, query } from '@/lib/convex';

const when = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Audit log: every admin action, newest first. */
export default async function AdminLog() {
  const rows = await query(api.admin.actions, {});
  return (
    <div className="space-y-4">
      <h1>Audit log</h1>
      <p className="text-sm text-muted">Every admin action: money adjustments, Pro, roles, suspensions and closed rooms. Entries can't be edited or deleted.</p>
      {rows.length === 0 ? <p className="card p-4 text-muted">No admin actions yet.</p> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-border text-muted">{['When', 'Admin', 'Action', 'Player', 'Details'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">{when(r.at)}</td>
                  <td className="px-3 py-2">{r.admin}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.action}{r.amount !== null && <span className="text-muted"> ({r.amount > 0 ? '+' : ''}{formatLeones(r.amount)})</span>}</td>
                  <td className="px-3 py-2">{r.target ? <Link href={`/admin/players/${r.target.id}`} className="text-secondary">{r.target.username}</Link> : '—'}</td>
                  <td className="px-3 py-2">{r.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
