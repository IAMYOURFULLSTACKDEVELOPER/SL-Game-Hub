import { t, AVATARS, avatarEmoji } from '@slgh/shared';
import { requireUser } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { updateProfile } from '../actions';
import { Flash } from '@/components/Flash';

export const metadata = { title: t('profile.title') };

export default async function Profile({ searchParams }: { searchParams: { error?: string; notice?: string } }) {
  const me = await requireUser();
  const supabase = createClient();
  const [{ data: districts }, { data: stats }] = await Promise.all([
    supabase.from('districts').select('id,name').order('name'),
    supabase.from('game_stats').select('played,wins,losses,draws,best_score,games(name,icon)').eq('user_id', me.id).order('last_played_at', { ascending: false }),
  ]);
  const under13 = me.age_band === 'under_13';

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center gap-4"><span aria-hidden className="text-6xl">{avatarEmoji(me.avatar)}</span>
        <div><h1>{me.username}</h1><p className="text-muted">{t('profile.joined')} {new Date(me.created_at).toLocaleDateString('en-GB')}</p></div></div>
      <Flash error={searchParams.error} notice={searchParams.notice} />

      <form action={updateProfile} className="card space-y-4 p-4">
        <h2>{t('profile.edit')}</h2>
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
          <div className="grid grid-cols-6 gap-2">
            {AVATARS.map((a) => (
              <label key={a.id} className="cursor-pointer">
                <input type="radio" name="avatar" value={a.id} defaultChecked={a.id === me.avatar} className="peer sr-only" />
                <span className="flex h-12 items-center justify-center rounded-lg border-2 border-border text-2xl peer-checked:border-primary peer-checked:bg-primary/20 peer-focus-visible:outline peer-focus-visible:outline-4 peer-focus-visible:outline-accent">{a.emoji}</span>
              </label>))}
          </div></fieldset>
        <div><label className="flex items-center gap-3 font-semibold">
          <input type="checkbox" name="isPublic" defaultChecked={me.is_public && !under13} disabled={under13} className="h-6 w-6" />
          {t('profile.publicProfile')}</label>
          {under13 && <p className="hint">{t('profile.publicLocked')}</p>}</div>
        <button className="btn btn-primary w-full">{t('profile.save')}</button>
      </form>

      <section className="card p-4"><h2 className="mb-2">{t('profile.stats')}</h2>
        {!stats?.length ? <p className="text-muted">{t('profile.noStats')}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left">
            <thead><tr className="text-muted"><th className="py-1">{t('nav.games')}</th><th>{t('game.played')}</th><th>{t('game.wins')}</th><th>{t('game.bestScore')}</th></tr></thead>
            <tbody>{stats.map((s, i) => { const g = s.games as unknown as { name: string; icon: string } | null;
              return <tr key={i} className="border-t-2 border-border"><td className="py-2">{g?.icon} {g?.name}</td><td>{s.played}</td><td>{s.wins}</td><td>{s.best_score}</td></tr>; })}</tbody>
          </table></div>)}
      </section>
    </main>
  );
}
