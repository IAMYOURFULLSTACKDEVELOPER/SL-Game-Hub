import { api, query } from '@/lib/convex';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';

const TYPES = ['global', 'per_game', 'weekly', 'monthly', 'per_district'] as const;

export default async function LeaderboardsPage({ searchParams }: { searchParams: { type?: string; game?: string } }) {
  const type = TYPES.find((x) => x === searchParams.type) ?? 'global';
  const gameSlug = searchParams.game;

  // Games for the filter, and the leaderboards (each with its top 10)
  const [games, leaderboards] = await Promise.all([
    query(api.games.list, {}).then((list) => list.sort((a, b) => a.name.localeCompare(b.name))),
    query(api.leaderboards.list, { type, gameSlug: gameSlug || undefined }),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <PageHeader icon="trophy" tone="gold" title="Leaderboards" subtitle="See who is on top this week." />

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="label" htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue={type} className="input">
              <option value="global">Global</option>
              <option value="per_game">Per Game</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="per_district">Per District</option>
            </select>
          </div>
          {type === 'per_game' && (
            <div>
              <label className="label" htmlFor="game">Game</label>
              <select id="game" name="game" defaultValue={gameSlug} className="input">
                <option value="">All Games</option>
                {games?.map((g) => (
                  <option key={g.id} value={g.slug}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn btn-primary mt-6">Apply</button>
        </div>
      </div>

      {/* Leaderboards */}
      <div className="space-y-4">
        {leaderboards && leaderboards.length > 0 ? (
          leaderboards.map((lb) => (
            <LeaderboardCard key={lb.id} leaderboard={lb} />
          ))
        ) : (
          <div className="card p-6 text-center text-muted">
            No leaderboards found
          </div>
        )}
      </div>
    </main>
  );
}

function LeaderboardCard({ leaderboard }: { leaderboard: any }) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">{leaderboard.name}</h2>
        {leaderboard.description && (
          <p className="text-muted">{leaderboard.description}</p>
        )}
      </div>
      <LeaderboardEntries entries={leaderboard.entries} />
    </div>
  );
}

function LeaderboardEntries({ entries }: { entries: { id: string; score: number; rank: number | null; profiles: { username: string; avatar: string } }[] }) {
  if (entries.length === 0) {
    return <p className="text-muted">No entries yet</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          className={`flex items-center justify-between p-3 rounded ${
            index === 0 ? 'bg-accent/10 border border-accent/40' :
            index === 1 ? 'bg-bg/60 border border-border' :
            index === 2 ? 'bg-orange-500/10 border border-orange-500/30' :
            'bg-bg/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg w-8">#{entry.rank || index + 1}</span>
            <span className="text-2xl">{entry.profiles.avatar}</span>
            <span className="font-medium">{entry.profiles.username}</span>
          </div>
          <span className="font-bold text-lg">{entry.score}</span>
        </div>
      ))}
    </div>
  );
}
