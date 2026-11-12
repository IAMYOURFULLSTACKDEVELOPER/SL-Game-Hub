import Link from 'next/link';
import { t } from '@slgh/shared';
import { api, query } from '@/lib/convex';
import { GameCard } from '@/components/GameCard';
import { LostArt } from '@/components/Art';
import { Icon } from '@/components/Icon';

export const metadata = { title: t('library.title') };

export default async function Library({ searchParams }: { searchParams: { q?: string; category?: string; mode?: string } }) {
  const q = (searchParams.q ?? '').trim().slice(0, 40);
  const mode = searchParams.mode === 'single' || searchParams.mode === 'multi' ? searchParams.mode : '';
  const cat = (searchParams.category ?? '').replace(/[^a-z0-9-]/g, '').slice(0, 30);

  const [list, cats] = await Promise.all([
    query(api.games.list, { q: q || undefined, category: cat || undefined, mode: mode || undefined }),
    query(api.games.categories, {}),
  ]);
  const filtered = !!(q || cat || mode);

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 pb-4 pt-5 sm:space-y-6 sm:pt-10">
      <div className="reveal">
        <span className="eyebrow"><Icon name="gamepad" size={16} />{list.length} {list.length === 1 ? 'game' : 'games'}</span>
        <h1 className="mt-3">{t('library.title')}</h1>
      </div>

      <form className="card reveal grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4 lg:grid-cols-[2fr_1fr_1.2fr_auto] lg:items-end" role="search" style={{ ['--i' as string]: 1 }}>
        <div className="col-span-2 lg:col-span-1"><label className="label max-sm:sr-only" htmlFor="q">{t('library.searchLabel')}</label>
          <div className="input-icon"><Icon name="search" />
            <input id="q" name="q" type="search" defaultValue={q} placeholder={t('library.searchPlaceholder')} className="input" /></div></div>
        <div><label className="label max-sm:sr-only" htmlFor="category">{t('library.category')}</label>
          <select id="category" name="category" defaultValue={cat} className="input">
            <option value="">{t('library.all')}</option>
            {(cats ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select></div>
        <fieldset><legend className="label max-sm:sr-only">{t('library.mode')}</legend>
          <div className="grid grid-cols-3 gap-1 rounded-xl border-2 border-border bg-bg/60 p-1">
            {([['', t('library.all'), 'globe'], ['single', 'Solo', 'user'], ['multi', 'Multi', 'users']] as const).map(([v, label, icon]) => (
              <label key={v} className="cursor-pointer" title={v ? t(`library.${v}`) : undefined}>
                <input type="radio" name="mode" value={v} defaultChecked={mode === v} className="peer sr-only" />
                <span className="flex min-h-[36px] items-center justify-center gap-1 rounded-lg text-sm font-semibold text-muted transition-all peer-checked:bg-surface peer-checked:text-primary peer-checked:shadow-soft peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                  <Icon name={icon} size={15} className="max-sm:hidden" />{label}</span>
              </label>
            ))}
          </div></fieldset>
        <button className="btn btn-primary col-span-2 lg:col-span-1"><Icon name="filter" size={18} />{t('library.apply')}</button>
      </form>

      {list.length === 0 ? (
        <div className="card reveal p-10 text-center">
          <LostArt />
          <p className="mx-auto mt-4 max-w-sm text-muted">{t('library.empty')}</p>
          {filtered && <Link href="/games" className="btn btn-outline mt-4"><Icon name="close" size={18} />Clear filters</Link>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">{list.map((g, i) => <GameCard key={g.id} g={g} i={i} variant="list" />)}</div>
      )}
    </main>
  );
}
