import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  t, SNAKE_RULES, DICE_RULES, CHECKERS_RULES, CHESS_RULES, WORD_SEARCH_RULES, SCRABBLE_RULES,
  type RuleSection,
} from '@slgh/shared';
import { createClient } from '@/lib/supabase/server';
import { getMe } from '@/lib/session';
import { GAME_COLS, gameImage, type GameRow } from '@/lib/games';
import { playersLabel } from '@/components/GameCard';
import SnakeAndLadderRulebook from '@/components/SnakeAndLadderRulebook';
import Rulebook from '@/components/Rulebook';

const RULEBOOKS: Record<string, { title: string; sections: RuleSection[] }> = {
  snake: { title: 'Snake Rulebook', sections: SNAKE_RULES },
  checkers: { title: 'Checkers Rulebook', sections: CHECKERS_RULES },
  chess: { title: 'Chess Rulebook', sections: CHESS_RULES },
  'word-search': { title: 'Word Search Rulebook', sections: WORD_SEARCH_RULES },
  scrabble: { title: 'Scrabble Official Game Rulebook', sections: SCRABBLE_RULES },
  dice: { title: 'Dice Rulebook', sections: DICE_RULES },
};

export default async function GameDetail({ params }: { params: { slug: string } }) {
  if (!/^[a-z0-9-]{2,40}$/.test(params.slug)) notFound();
  const supabase = createClient();
  const me = await getMe();
  const { data } = await supabase.from('games').select(`${GAME_COLS}, categories(slug,name)`)
    .eq('slug', params.slug).eq('status', 'published').maybeSingle();
  const g = data as unknown as GameRow | null;
  if (!g) notFound();
  const { data: s } = me
    ? await supabase.from('game_stats').select('played,wins,losses,draws,best_score').eq('user_id', me.id).eq('game_id', g.id).maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/games" className="text-secondary">{t('game.back')}</Link>
      <div className="card space-y-3 p-5">
        <div className="flex items-center gap-4">{gameImage(g)
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={gameImage(g)!} alt="" width={120} height={80} decoding="async" className="h-20 w-[120px] shrink-0 rounded-lg object-cover" />
          : <span aria-hidden className="text-6xl leading-none">{g.icon}</span>}
          <div><h1>{g.name}</h1><p className="text-muted">{g.categories?.name} · {playersLabel(g)} · {t('game.version')} {g.version}</p></div></div>
        <p>{g.description}</p>
        <div className="flex flex-wrap gap-2 text-sm font-bold">
          {g.modes.includes('single') && <span className="rounded border-2 border-border px-2 py-0.5">{t('library.single')}</span>}
          {g.modes.includes('multi') && <span className="rounded border-2 border-secondary px-2 py-0.5 text-secondary">{t('library.multi')}</span>}
        </div>
        {g.coming_soon
          ? <p className="rounded-lg border-2 border-accent p-3 font-semibold">{t('game.comingSoonNote')}</p>
          : <Link href={`/games/${g.slug}/play`} className="btn btn-primary w-full">{t('game.play')}</Link>}
      </div>

      {g.slug === 'snake-and-ladder'
        ? <div className="card p-5"><SnakeAndLadderRulebook open /></div>
        : RULEBOOKS[g.slug] && (
          <div className="card p-5"><Rulebook title={RULEBOOKS[g.slug].title} sections={RULEBOOKS[g.slug].sections} open /></div>
        )}

      <section className="card p-5"><h2 className="mb-2">{t('game.yourStats')}</h2>
        {!me ? <p className="text-muted">{t('game.signInToTrack')}</p> : (
          <dl className="grid grid-cols-3 gap-3 text-center">
            {([['played', s?.played], ['wins', s?.wins], ['losses', s?.losses], ['draws', s?.draws], ['bestScore', s?.best_score]] as const)
              .map(([k, v]) => <div key={k}><dd className="text-2xl font-extrabold">{v ?? 0}</dd><dt className="text-sm text-muted">{t(`game.${k}`)}</dt></div>)}
          </dl>)}
      </section>
    </main>
  );
}
