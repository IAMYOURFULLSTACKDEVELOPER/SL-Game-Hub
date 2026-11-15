import Link from 'next/link';
import { formatLeones } from '@slgh/shared/src/wallet';
import { api, query } from '@/lib/convex';
import { Icon } from '@/components/Icon';

/** Find a player by username (starts with) or email (exact); empty search lists the newest players. */
export default async function AdminPlayers({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? '').slice(0, 80);
  const players = await query(api.admin.searchPlayers, { q });
  return (
    <div className="space-y-4">
      <h1>Players</h1>
      <form className="flex gap-2" role="search">
        <label className="sr-only" htmlFor="player-q">Search players</label>
        <input id="player-q" name="q" defaultValue={q} className="input min-w-0 flex-1" placeholder="Username or email" autoComplete="off" />
        <button className="btn btn-primary">Search</button>
      </form>
      <p className="text-sm text-muted">{q ? `${players.length} found` : 'Newest players'}</p>
      <ul className="space-y-2">
        {players.map((p) => (
          <li key={p.id}>
            <Link href={`/admin/players/${p.id}`} className="card card-hover flex flex-wrap items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <b>{p.username}</b>
                {p.role === 'admin' && <span className="chip chip-muted ml-2">Admin</span>}
                {p.pro && <span className="chip chip-accent ml-2"><Icon name="star" size={12} />Pro</span>}
                {p.banned && <span className="chip ml-2 border-danger/40 text-danger">Suspended</span>}
                <span className="block truncate text-xs text-muted">{p.email ?? 'no email'} · {p.age_band.replace('_', ' ')} · joined {new Date(p.created_at).toLocaleDateString('en-GB')}</span>
              </span>
              <span className="text-right text-sm">
                <b>{formatLeones(p.balance)}</b>
                {p.held > 0 && <span className="block text-xs text-muted">{formatLeones(p.held)} held</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
