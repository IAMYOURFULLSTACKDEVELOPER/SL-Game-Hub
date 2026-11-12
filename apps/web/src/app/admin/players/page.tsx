import { t, avatarEmoji } from '@slgh/shared';
import { api, query } from '@/lib/convex';
import { requireAdmin } from '@/lib/session';
import { setPlayerBanned } from '../../actions';

export default async function AdminPlayers() {
  const me = await requireAdmin();
  const players = await query(api.users.adminList, {});
  return (
    <>
      <h1 className="mb-4">{t('admin.players')}</h1>
      <ul className="space-y-2">
        {(players ?? []).map((p) => (
          <li key={p.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
            <span><span aria-hidden>{avatarEmoji(p.avatar)}</span> <b>{p.username}</b> <span className="text-muted">{p.full_name} · {t(`auth.${p.age_band}`)} · {p.role}</span>
              {p.banned && <b className="ml-2 text-danger">{t('admin.suspended')}</b>}</span>
            {p.id !== me.id && (
              <form action={setPlayerBanned}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="banned" value={String(!p.banned)} />
                <button className="btn btn-outline btn-sm">{p.banned ? t('admin.unban') : t('admin.ban')}</button>
              </form>)}
          </li>))}
      </ul>
    </>
  );
}
