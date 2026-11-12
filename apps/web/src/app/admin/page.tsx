import { t } from '@slgh/shared';
import { api, query } from '@/lib/convex';

export default async function Overview() {
  const { players, games, reports } = await query(api.games.adminOverview, {});
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
