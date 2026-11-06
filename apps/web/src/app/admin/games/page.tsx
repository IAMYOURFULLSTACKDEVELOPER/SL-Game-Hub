import { t, GAME_STATUSES } from '@slgh/shared';
import { createClient } from '@/lib/supabase/server';
import { setGameStatus } from '../../actions';
import Link from 'next/link';

export default async function AdminGames() {
  const supabase = createClient();
  const { data: games } = await supabase.from('games').select('id,slug,name,icon,status,version,coming_soon,is_builtin').order('sort_order');

  // Fetch version counts for non-built-in games
  const gameIds = games?.filter(g => !g.is_builtin).map(g => g.id) || [];
  const { data: versions } = gameIds.length > 0
    ? await supabase
        .from('game_versions')
        .select('game_id')
        .in('game_id', gameIds)
    : { data: [] };

  const versionCounts = (versions || []).reduce((acc, v) => {
    acc[v.game_id] = (acc[v.game_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1>{t('admin.games')}</h1>
        <Link href="/admin/games/upload" className="btn btn-primary">
          + Upload New Game
        </Link>
      </div>
      <ul className="space-y-2">
        {(games ?? []).map((g) => (
          <li key={g.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex-1">
              <span className="font-bold">{g.icon} {g.name}</span>
              <span className="font-normal text-muted ml-2">
                v{g.version}
                {g.coming_soon ? ` · ${t('library.comingSoon')}` : ''}
                {!g.is_builtin && versionCounts[g.id] ? ` · ${versionCounts[g.id]} version(s)` : ''}
              </span>
              {!g.is_builtin && (
                <div className="flex gap-2 mt-1">
                  <Link href={`/admin/games/${g.slug}/versions`} className="text-sm text-secondary hover:underline">
                    View Versions
                  </Link>
                  <Link href={`/admin/games/${g.slug}/preview`} className="text-sm text-secondary hover:underline">
                    Preview
                  </Link>
                </div>
              )}
            </div>
            <form action={setGameStatus} className="flex items-center gap-2">
              <input type="hidden" name="id" value={g.id} />
              <label className="sr-only" htmlFor={`s-${g.id}`}>{t('admin.status')}</label>
              <select id={`s-${g.id}`} name="status" defaultValue={g.status} className="input !min-h-[40px] !w-auto">
                {GAME_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-primary btn-sm">{t('admin.update')}</button>
            </form>
          </li>))}
      </ul>
    </>
  );
}
