import { t } from '@slgh/shared';
import { createClient } from '@/lib/supabase/server';

export default async function Overview() {
  const s = createClient();
  const count = (table: string, f?: (q: any) => any) => {
    const q = s.from(table).select('id', { count: 'exact', head: true });
    return (f ? f(q) : q).then((r: { count: number | null }) => r.count ?? 0);
  };
  const [players, games, reports] = await Promise.all([
    count('profiles'), count('games'), count('reports', (q) => q.eq('status', 'open')),
  ]);
  return (
    <>
      <h1 className="mb-4">{t('admin.overview')}</h1>
      <dl className="grid gap-3 sm:grid-cols-3">
        {[['totalPlayers', players], ['totalGames', games], ['openReports', reports]].map(([k, v]) => (
          <div key={k as string} className="card p-4"><dd className="text-4xl font-extrabold">{v}</dd><dt className="text-muted">{t(`admin.${k}`)}</dt></div>))}
      </dl>
    </>
  );
}
