import { t } from '@slgh/shared';
import { createClient } from '@/lib/supabase/server';
import { GAME_COLS, type GameRow } from '@/lib/games';
import { GameCard } from '@/components/GameCard';

export const metadata = { title: t('library.title') };

export default async function Library({ searchParams }: { searchParams: { q?: string; category?: string; mode?: string } }) {
  const supabase = createClient();
  const q = (searchParams.q ?? '').replace(/[%,()*_\\]/g, ' ').trim().slice(0, 40);
  const mode = searchParams.mode === 'single' || searchParams.mode === 'multi' ? searchParams.mode : '';
  const cat = (searchParams.category ?? '').replace(/[^a-z0-9-]/g, '').slice(0, 30);

  let query = supabase.from('games').select(`${GAME_COLS}, categories!inner(slug,name)`)
    .eq('status', 'published').order('sort_order');
  if (q) query = query.ilike('name', `%${q}%`);
  if (cat) query = query.eq('categories.slug', cat);
  if (mode) query = query.contains('modes', [mode]);

  const [{ data: games }, { data: cats }] = await Promise.all([
    query, supabase.from('categories').select('slug,name').order('sort_order'),
  ]);
  const list = (games ?? []) as unknown as GameRow[];

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <h1>{t('library.title')}</h1>
      <form className="card grid gap-3 p-4 sm:grid-cols-4" role="search">
        <div className="sm:col-span-2"><label className="label" htmlFor="q">{t('library.searchLabel')}</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder={t('library.searchPlaceholder')} className="input" /></div>
        <div><label className="label" htmlFor="category">{t('library.category')}</label>
          <select id="category" name="category" defaultValue={cat} className="input">
            <option value="">{t('library.all')}</option>
            {(cats ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="mode">{t('library.mode')}</label>
          <select id="mode" name="mode" defaultValue={mode} className="input">
            <option value="">{t('library.all')}</option>
            <option value="single">{t('library.single')}</option>
            <option value="multi">{t('library.multi')}</option>
          </select></div>
        <button className="btn btn-primary sm:col-span-4">{t('library.apply')}</button>
      </form>

      {list.length === 0
        ? <p className="card p-6 text-muted">{t('library.empty')}</p>
        : <div className="grid gap-3 sm:grid-cols-2">{list.map((g) => <GameCard key={g.id} g={g} />)}</div>}
    </main>
  );
}
