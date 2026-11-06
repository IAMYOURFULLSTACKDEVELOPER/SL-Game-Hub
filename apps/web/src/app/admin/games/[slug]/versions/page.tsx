import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/session';
import { rollbackToVersion } from '@/app/actions';
import Link from 'next/link';

export default async function GameVersionsPage({ params }: { params: { slug: string } }) {
  await requireAdmin();
  const supabase = createClient();

  // Get game
  const { data: game } = await supabase
    .from('games')
    .select('id,slug,name,version')
    .eq('slug', params.slug)
    .single();

  if (!game) {
    return <div className="p-4">Game not found</div>;
  }

  // Get versions
  const { data: versions } = await supabase
    .from('game_versions')
    .select('*')
    .eq('game_id', game.id)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      <Link href="/admin/games" className="text-secondary">
        ← Back to Games
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{game.name} - Version History</h1>
        <p className="text-muted">Current version: {game.version}</p>
      </div>

      <div className="card space-y-4 p-6">
        {(versions || []).length === 0 ? (
          <p className="text-muted">No versions uploaded yet</p>
        ) : (
          <ul className="space-y-4">
            {versions?.map((v) => (
              <li key={v.id} className="border-b pb-4 last:border-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">v{v.version}</span>
                      {v.is_current && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                          Current
                        </span>
                      )}
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                        {v.status}
                      </span>
                    </div>
                    {v.changelog && (
                      <p className="text-sm mt-2">{v.changelog}</p>
                    )}
                    <p className="text-sm text-muted mt-1">
                      Uploaded: {new Date(v.created_at).toLocaleString()}
                    </p>
                  </div>

                  {!v.is_current && v.status === 'published' && (
                    <form action={rollbackToVersion}>
                      <input type="hidden" name="versionId" value={v.id} />
                      <input type="hidden" name="gameId" value={game.id} />
                      <button className="btn btn-secondary btn-sm">Rollback to v{v.version}</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
