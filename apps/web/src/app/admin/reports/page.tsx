import { t } from '@slgh/shared';
import { createClient } from '@/lib/supabase/server';
import { resolveReport } from '../../actions';

export default async function AdminReports() {
  const { data: reports } = await createClient().from('reports')
    .select('id,reason,details,created_at').eq('status', 'open').order('created_at', { ascending: false }).limit(100);
  return (
    <>
      <h1 className="mb-4">{t('admin.reports')}</h1>
      {!reports?.length ? <p className="card p-4 text-muted">{t('admin.noReports')}</p> : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="card space-y-2 p-3">
              <p><b>{r.reason}</b> <span className="text-muted">{new Date(r.created_at).toLocaleString('en-GB')}</span></p>
              {r.details && <p>{r.details}</p>}
              <form action={resolveReport} className="flex gap-2">
                <input type="hidden" name="id" value={r.id} />
                <button name="status" value="resolved" className="btn btn-primary btn-sm">{t('admin.resolve')}</button>
                <button name="status" value="dismissed" className="btn btn-outline btn-sm">{t('admin.dismiss')}</button>
              </form>
            </li>))}
        </ul>)}
    </>
  );
}
