import { t, AVATARS, avatarEmoji } from '@slgh/shared';
import { requireUser } from '@/lib/session';
import { api, query } from '@/lib/convex';
import { updateProfile } from '../actions';
import { Flash } from '@/components/Flash';
import { Icon } from '@/components/Icon';

export const metadata = { title: t('profile.title') };

export default async function Profile({ searchParams }: { searchParams: { error?: string; notice?: string } }) {
  const me = await requireUser();
  const [districts, stats] = await Promise.all([
    query(api.games.districts, {}),
    query(api.games.myStats, {}),
  ]);
  const under13 = me.age_band === 'under_13';

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <section className="card reveal relative overflow-hidden">
        <div aria-hidden className="h-24" style={{ background: 'linear-gradient(120deg, #1EB53A, #0a8f8a 50%, #0072C6)' }} />
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <span aria-hidden className="avatar-ring -mt-12 h-24 w-24 bg-surface text-6xl shadow-lift">{avatarEmoji(me.avatar)}</span>
          <div><h1>{me.username}</h1><p className="flex items-center gap-1.5 text-muted"><Icon name="calendar" size={16} />{t('profile.joined')} {new Date(me.created_at).toLocaleDateString('en-GB')}</p></div>
        </div>
      </section>
      <Flash error={searchParams.error} notice={searchParams.notice} />

      <form action={updateProfile} className="card reveal space-y-4 p-5" style={{ ['--i' as string]: 1 }}>
        <h2 className="flex items-center gap-2"><span className="icon-badge h-9 w-9"><Icon name="user" size={18} /></span>{t('profile.edit')}</h2>
        <div><label className="label" htmlFor="fullName">{t('auth.fullName')}</label>
          <input id="fullName" name="fullName" required minLength={2} maxLength={80} defaultValue={me.full_name} className="input" /></div>
        <div><label className="label" htmlFor="username">{t('auth.username')}</label>
          <input id="username" name="username" required pattern="[A-Za-z0-9_]{3,20}" autoCapitalize="none" defaultValue={me.username} className="input" /></div>
        <div><label className="label" htmlFor="districtId">{t('profile.district')}</label>
          <select id="districtId" name="districtId" defaultValue={me.district_id ?? ''} className="input">
            <option value="">{t('profile.noDistrict')}</option>
            {(districts ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></div>
        <fieldset><legend className="label">{t('profile.avatar')}</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {AVATARS.map((a) => (
              <label key={a.id} className="cursor-pointer">
                <input type="radio" name="avatar" value={a.id} defaultChecked={a.id === me.avatar} className="peer sr-only" />
                <span className="flex h-14 items-center justify-center rounded-2xl border-2 border-border bg-surface text-3xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 peer-checked:scale-105 peer-checked:border-primary peer-checked:bg-primary/15 peer-checked:shadow-glow peer-focus-visible:outline peer-focus-visible:outline-4 peer-focus-visible:outline-accent">{a.emoji}</span>
              </label>))}
          </div></fieldset>
        <div><label className="flex items-center gap-3 font-semibold">
          <input type="checkbox" name="isPublic" defaultChecked={me.is_public && !under13} disabled={under13} className="h-6 w-6 rounded-md" />
          {t('profile.publicProfile')}</label>
          {under13 && <p className="hint">{t('profile.publicLocked')}</p>}</div>
        <button className="btn btn-primary btn-lg w-full"><Icon name="check" />{t('profile.save')}</button>
      </form>

      <section className="card reveal p-5" style={{ ['--i' as string]: 2 }}><h2 className="mb-3 flex items-center gap-2"><span className="icon-badge icon-badge-blue h-9 w-9"><Icon name="chart" size={18} /></span>{t('profile.stats')}</h2>
        {!stats?.length ? <p className="text-muted">{t('profile.noStats')}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left">
            <thead><tr className="text-muted"><th className="py-1">{t('nav.games')}</th><th>{t('game.played')}</th><th>{t('game.wins')}</th><th>{t('game.bestScore')}</th></tr></thead>
            <tbody>{stats.map((s, i) => { const g = s.games;
              return <tr key={i} className="border-t-2 border-border"><td className="py-2">{g?.icon} {g?.name}</td><td>{s.played}</td><td>{s.wins}</td><td>{s.best_score}</td></tr>; })}</tbody>
          </table></div>)}
      </section>
    </main>
  );
}
