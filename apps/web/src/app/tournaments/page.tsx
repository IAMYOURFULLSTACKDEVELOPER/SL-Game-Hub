import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function TournamentsPage({ searchParams }: { searchParams: { status?: string } }) {
  const supabase = createClient();
  const status = searchParams.status || 'upcoming';

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*, games!inner(slug,name,icon)')
    .eq('status', status)
    .order('starts_at', { ascending: true });

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-3xl font-bold">Tournaments</h1>

      {/* Status Filter */}
      <div className="card p-4">
        <div className="flex gap-2">
          <Link href="/tournaments?status=upcoming" className={`btn ${status === 'upcoming' ? 'btn-primary' : 'btn-secondary'}`}>
            Upcoming
          </Link>
          <Link href="/tournaments?status=registration" className={`btn ${status === 'registration' ? 'btn-primary' : 'btn-secondary'}`}>
            Registration Open
          </Link>
          <Link href="/tournaments?status=in_progress" className={`btn ${status === 'in_progress' ? 'btn-primary' : 'btn-secondary'}`}>
            In Progress
          </Link>
          <Link href="/tournaments?status=completed" className={`btn ${status === 'completed' ? 'btn-primary' : 'btn-secondary'}`}>
            Completed
          </Link>
        </div>
      </div>

      {/* Tournaments List */}
      <div className="grid gap-4 md:grid-cols-2">
        {tournaments && tournaments.length > 0 ? (
          tournaments.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))
        ) : (
          <div className="card p-6 text-center text-muted col-span-2">
            No tournaments found
          </div>
        )}
      </div>
    </main>
  );
}

function TournamentCard({ tournament }: { tournament: any }) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">{tournament.name}</h2>
          <p className="text-muted">{tournament.games.icon} {tournament.games.name}</p>
        </div>
        <span className={`px-2 py-1 text-xs rounded-full ${
          tournament.status === 'upcoming' ? 'bg-blue-100 text-blue-800' :
          tournament.status === 'registration' ? 'bg-green-100 text-green-800' :
          tournament.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {tournament.status}
        </span>
      </div>

      {tournament.description && (
        <p className="text-sm mb-4">{tournament.description}</p>
      )}

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Format:</span>
          <span className="font-medium">{tournament.format}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Max Players:</span>
          <span className="font-medium">{tournament.max_players}</span>
        </div>
        {tournament.prize_coins > 0 && (
          <div className="flex justify-between">
            <span className="text-muted">Prize:</span>
            <span className="font-medium text-yellow-600">🪙 {tournament.prize_coins}</span>
          </div>
        )}
        {tournament.entry_fee_coins > 0 && (
          <div className="flex justify-between">
            <span className="text-muted">Entry Fee:</span>
            <span className="font-medium">🪙 {tournament.entry_fee_coins}</span>
          </div>
        )}
        {tournament.starts_at && (
          <div className="flex justify-between">
            <span className="text-muted">Starts:</span>
            <span className="font-medium">{formatDate(tournament.starts_at)}</span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Link href={`/tournaments/${tournament.id}`} className="btn btn-primary w-full">
          View Details
        </Link>
      </div>
    </div>
  );
}
