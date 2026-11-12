import { api, query } from '@/lib/convex';
import { registerForTournament } from '@/app/actions';
import Link from 'next/link';

export default async function TournamentDetailPage({ params }: { params: { id: string } }) {
  const data = await query(api.tournaments.get, { id: params.id });

  if (!data) {
    return <div className="p-4">Tournament not found</div>;
  }
  const { tournament, registrations, matches } = data;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <Link href="/tournaments" className="text-secondary">
        ← Back to Tournaments
      </Link>

      <div>
        <h1 className="text-3xl font-bold">{tournament.name}</h1>
        <p className="text-muted">{tournament.games.icon} {tournament.games.name}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Tournament Info */}
        <div className="card p-6 space-y-4">
          <h2 className="text-xl font-bold">Tournament Info</h2>
          {tournament.description && (
            <p>{tournament.description}</p>
          )}

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Format:</span>
              <span className="font-medium">{tournament.format}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Status:</span>
              <span className="font-medium">{tournament.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Max Players:</span>
              <span className="font-medium">{tournament.max_players}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Registered:</span>
              <span className="font-medium">{registrations?.length || 0} / {tournament.max_players}</span>
            </div>
            {tournament.prize_coins > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Prize Pool:</span>
                <span className="font-medium text-yellow-600">🪙 {tournament.prize_coins}</span>
              </div>
            )}
            {tournament.entry_fee_coins > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Entry Fee:</span>
                <span className="font-medium">🪙 {tournament.entry_fee_coins}</span>
              </div>
            )}
            {tournament.registration_starts_at && (
              <div className="flex justify-between">
                <span className="text-muted">Registration:</span>
                <span className="font-medium">
                  {new Date(tournament.registration_starts_at).toLocaleDateString()} - {tournament.registration_ends_at ? new Date(tournament.registration_ends_at).toLocaleDateString() : '…'}
                </span>
              </div>
            )}
            {tournament.starts_at && (
              <div className="flex justify-between">
                <span className="text-muted">Starts:</span>
                <span className="font-medium">{new Date(tournament.starts_at).toLocaleString()}</span>
              </div>
            )}
          </div>

          {tournament.status === 'registration' && (
            <form action={registerForTournament}>
              <input type="hidden" name="tournamentId" value={tournament.id} />
              <button className="btn btn-primary w-full">
                Register
              </button>
            </form>
          )}
        </div>

        {/* Rules */}
        {tournament.rules && (
          <div className="card p-6">
            <h2 className="text-xl font-bold mb-4">Rules</h2>
            <p className="whitespace-pre-wrap">{tournament.rules}</p>
          </div>
        )}
      </div>

      {/* Participants */}
      <div className="card p-6">
        <h2 className="text-xl font-bold mb-4">Participants ({registrations?.length || 0})</h2>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {registrations?.map((reg: any) => (
            <div key={reg.id} className="flex items-center gap-2 p-2 bg-bg/60 rounded">
              <span className="text-2xl">{reg.profiles.avatar}</span>
              <span className="font-medium">{reg.profiles.username}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bracket/Matches */}
      {matches && matches.length > 0 && (
        <div className="card p-6">
          <h2 className="text-xl font-bold mb-4">Matches</h2>
          <div className="space-y-4">
            {matches.map((match: any) => (
              <div key={match.id} className="p-4 border rounded">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Round {match.round}</span>
                  <span className={`px-2 py-1 text-xs rounded ${
                    match.status === 'completed' ? 'bg-green-100 text-green-800' :
                    match.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {match.status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {match.player1_id && <span>Player 1</span>}
                    {match.score1 !== null && <span className="font-bold">{match.score1}</span>}
                  </div>
                  <span className="text-muted">vs</span>
                  <div className="flex items-center gap-2">
                    {match.score2 !== null && <span className="font-bold">{match.score2}</span>}
                    {match.player2_id && <span>Player 2</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
