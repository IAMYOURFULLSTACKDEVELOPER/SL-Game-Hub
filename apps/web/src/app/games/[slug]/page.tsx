import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  t, SNAKE_RULES, DICE_RULES, CHECKERS_RULES, CHESS_RULES, WORD_SEARCH_RULES, SCRABBLE_RULES, UNO_RULES, SALONE_POLY_RULES,
  type RuleSection,
} from '@slgh/shared';
import { api, query } from '@/lib/convex';
import { getMe } from '@/lib/session';
import { gameImage } from '@/lib/games';
import { playersLabel, ModeChips } from '@/components/GameCard';
import { Icon } from '@/components/Icon';
import { GameGlyph } from '@/components/GameGlyph';
import SnakeAndLadderRulebook from '@/components/SnakeAndLadderRulebook';
import Rulebook from '@/components/Rulebook';
import { SaveOffline } from '@/components/SaveOffline';

// Built-in games run entirely in the browser, so they can be saved for offline play.
const OFFLINE_EXTRAS: Record<string, string[]> = {
  // Not Dice: its play page carries the player's auth token (for money rooms), so it is never stored offline.
  snake: [], 'snake-and-ladder': [], chess: [], checkers: [], 'word-search': [], uno: [], 'salone-poly': [],
  scrabble: ['/games/scrabble/words.txt'],
};

const RULEBOOKS: Record<string, { title: string; sections: RuleSection[] }> = {
  snake: { title: 'Snake Rulebook', sections: SNAKE_RULES },
  checkers: { title: 'Checkers Rulebook', sections: CHECKERS_RULES },
  chess: { title: 'Chess Rulebook', sections: CHESS_RULES },
  'word-search': { title: 'Word Search Rulebook', sections: WORD_SEARCH_RULES },
  scrabble: { title: 'Scrabble Official Game Rulebook', sections: SCRABBLE_RULES },
  dice: { title: 'Dice Rulebook', sections: DICE_RULES },
  uno: { title: 'UNO Rulebook', sections: UNO_RULES },
  'salone-poly': { title: 'Salone-Poly Rulebook', sections: SALONE_POLY_RULES },
};

export default async function GameDetail({ params }: { params: { slug: string } }) {
  if (!/^[a-z0-9-]{2,40}$/.test(params.slug)) notFound();
  const me = await getMe();
  const g = await query(api.games.bySlug, { slug: params.slug });
  if (!g) notFound();
  const s = me ? (await query(api.games.myStats, { gameId: g.id }))[0] : undefined;

  const img = gameImage(g);
  const rulebook = g.slug === 'snake-and-ladder'
    ? <SnakeAndLadderRulebook open />
    : RULEBOOKS[g.slug] && <Rulebook title={RULEBOOKS[g.slug].title} sections={RULEBOOKS[g.slug].sections} open />;
  const stats = [['played', s?.played, 'gamepad'], ['wins', s?.wins, 'trophy'], ['losses', s?.losses, 'close'],
    ['draws', s?.draws, 'users'], ['bestScore', s?.best_score, 'star']] as const;

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 pb-6 pt-4 sm:pt-6">
      <Link href="/games" className="back-link"><Icon name="arrowLeft" size={18} />{t('game.back')}</Link>

      <section className="card reveal overflow-hidden">
        <div className="relative aspect-[21/9] max-h-[260px] min-h-[140px] w-full overflow-hidden bg-rail">
          {img
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={img} alt="" width={960} height={410} decoding="async" className="h-full w-full object-cover" />
            : <span aria-hidden className="grid h-full place-items-center"><GameGlyph slug={g.slug} name={g.name} size={120} /></span>}
        </div>
        <div className="relative px-5 pb-5">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-3">
            <span className="pop-in block rounded-[30%] leading-[0]" style={{ boxShadow: '0 0 0 6px rgb(var(--c-surface))' }}>
              <GameGlyph slug={g.slug} name={g.name} size={80} />
            </span>
            <span className="flex flex-wrap gap-1"><ModeChips g={g} /></span>
          </div>
          <h1 className="mt-3">{g.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1.5"><span className="online-dot" aria-hidden />{playersLabel(g)}</span>
            {g.categories?.name && <span>{g.categories.name}</span>}
            <span>{t('game.version')} {g.version}</span>
          </div>
          <div className="my-4 h-px bg-border/70" />
          <p className="text-[15px] leading-relaxed">{g.description}</p>
          {g.coming_soon
            ? <p className="mt-4 flex items-center gap-3 rounded-lg border-l-4 border-accent bg-accent/10 p-3 font-semibold"><Icon name="sparkles" className="text-accent" />{t('game.comingSoonNote')}</p>
            : <div className="mt-4 space-y-2">
                <Link href={`/games/${g.slug}/play`} className="btn btn-success btn-lg w-full"><Icon name="play" size={20} />{t('game.play')}</Link>
                {OFFLINE_EXTRAS[g.slug] && <SaveOffline slug={g.slug} extra={OFFLINE_EXTRAS[g.slug]} />}
              </div>}
        </div>
      </section>

      <section className="card reveal p-5" style={{ ['--i' as string]: 1 }}>
        <h2 className="mb-3 flex items-center gap-2 text-base"><Icon name="chart" size={18} className="text-primary" />{t('game.yourStats')}</h2>
        {!me ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-bg p-4">
            <p className="text-muted">{t('game.signInToTrack')}</p>
            <Link href={`/login?next=/games/${g.slug}`} className="btn btn-primary btn-sm"><Icon name="login" size={16} />{t('nav.signIn')}</Link>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map(([k, v, icon], i) => (
              <div key={k} className="stat-tile pop-in flex flex-col-reverse bg-bg" style={{ ['--i' as string]: i }}>
                <dt className="flex items-center justify-center gap-1 text-sm text-muted"><Icon name={icon} size={14} />{t(`game.${k}`)}</dt>
                <dd className="stat-num">{v ?? 0}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {rulebook && <div className="card reveal p-5" style={{ ['--i' as string]: 2 }}>{rulebook}</div>}
    </main>
  );
}
