import Link from 'next/link';
import { t } from '@slgh/shared';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/session';
import { GAME_COLS, type GameRow } from '@/lib/games';
import { GameCard } from '@/components/GameCard';

export default async function Home() {
  const supabase = createClient();
  const me = await getMe();
  const [{ data: games }, recent] = await Promise.all([
    supabase.from('games').select(`${GAME_COLS}, categories(slug,name)`)
      .eq('status', 'published').order('sort_order').limit(8),
    me
      ? supabase.from('game_stats').select(`last_played_at, games!inner(${GAME_COLS}, status, categories(slug,name))`)
          .eq('user_id', me.id).eq('games.status', 'published').order('last_played_at', { ascending: false }).limit(4)
      : Promise.resolve({ data: null }),
  ]);
  const recentGames = ((recent.data ?? []) as unknown as { games: GameRow }[]).map((r) => r.games);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4">
      <section className="rounded-lg border-2 border-primary bg-surface p-6">
        <h1 className="max-w-xl">{t('home.heroTitle')}</h1>
        <p className="mt-2 max-w-md text-muted">{t('home.heroText')}</p>
        <form action="/games" className="mt-4 flex max-w-md gap-2">
          <label htmlFor="q" className="sr-only">{t('library.searchLabel')}</label>
          <input id="q" name="q" type="search" placeholder={t('library.searchPlaceholder')} className="input" />
          <button className="btn btn-primary">{t('library.apply')}</button>
        </form>
      </section>

      {recentGames.length > 0 && (
        <section><h2 className="mb-3">{t('home.recent')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">{recentGames.map((g) => <GameCard key={g.id} g={g} />)}</div></section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between"><h2>{t('home.featured')}</h2>
          <Link href="/games" className="font-semibold text-secondary">{t('home.browseAll')}</Link></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {((games ?? []) as unknown as GameRow[]).map((g) => <GameCard key={g.id} g={g} />)}
        </div>
      </section>
    </main>
  );
}
