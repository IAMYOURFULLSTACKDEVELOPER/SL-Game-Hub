import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function LeaderboardsPage({ searchParams }: { searchParams: { type?: string; game?: string } }) {
  const supabase = createClient();
  const type = searchParams.type || 'global';
  const gameSlug = searchParams.game;

  // Get games for filter
  const { data: games } = await supabase
    .from('games')
    .select('id,slug,name')
    .eq('status', 'published')
    .order('name');

  // Get leaderboards
  let query = supabase
    .from('leaderboards')
    .select('*, games!inner(slug,name)');

  if (type === 'per_game' && gameSlug) {
    query = query.eq('games.slug', gameSlug);
  } else if (type === 'per_district') {
    // District leaderboards would need user's district
    query = query.eq('type', 'per_district');
  } else {
    query = query.eq('type', type);
  }

  const { data: leaderboards } = await query.order('created_at', { ascending: false });

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-3xl font-bold">Leaderboards</h1>

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
      <LeaderboardEntries leaderboardId={leaderboard.id} />
    </div>
  );
}

async function LeaderboardEntries({ leaderboardId }: { leaderboardId: string }) {
  const supabase = createClient();

  const { data: entries } = await supabase
    .from('leaderboard_entries')
    .select('*, profiles!inner(username, avatar)')
    .eq('leaderboard_id', leaderboardId)
    .order('score', { ascending: false })
    .limit(10);

  if (!entries || entries.length === 0) {
    return <p className="text-muted">No entries yet</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          className={`flex items-center justify-between p-3 rounded ${
            index === 0 ? 'bg-yellow-50 border border-yellow-200' :
            index === 1 ? 'bg-gray-50 border border-gray-200' :
            index === 2 ? 'bg-orange-50 border border-orange-200' :
            'bg-gray-50'
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
