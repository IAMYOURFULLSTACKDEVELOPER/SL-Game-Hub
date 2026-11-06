import Link from 'next/link';
import { t } from '@slgh/shared';
import { requireAdmin } from '@/lib/session';

export const metadata = { title: t('admin.title') };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin(); // non-admins are redirected before anything renders
  return (
    <div className="mx-auto max-w-5xl p-4">
      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t('admin.title')}>
        {[['/admin', 'overview'], ['/admin/games', 'games'], ['/admin/players', 'players'], ['/admin/reports', 'reports']]
          .map(([href, k]) => <Link key={href} href={href} className="btn btn-outline btn-sm">{t(`admin.${k}`)}</Link>)}
      </nav>
      {children}
    </div>
  );
}
