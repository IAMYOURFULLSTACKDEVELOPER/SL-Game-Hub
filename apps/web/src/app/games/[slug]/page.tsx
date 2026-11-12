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
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-4 pt-4 sm:pt-8">
      <Link href="/games" className="back-link"><Icon name="arrowLeft" size={18} />{t('game.back')}</Link>

      <section className="card reveal overflow-hidden">
        <div className="relative aspect-[21/9] min-h-[180px] overflow-hidden bg-gradient-to-br from-primary/30 to-secondary/30">
          {img
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={img} alt="" width={960} height={410} decoding="async" className="kenburns h-full w-full object-cover" />
            : <span aria-hidden className="grid h-full place-items-center text-8xl">{g.icon}</span>}
          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(6_13_27/.85)] via-[rgb(6_13_27/.25)] to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            {g.categories?.name && <span className="chip border-white/30 bg-white/15 text-white backdrop-blur-md">{g.categories.name}</span>}
            <h1 className="mt-2 text-4xl drop-shadow sm:text-5xl">{g.name}</h1>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <span className="flex items-center gap-1.5"><Icon name="users" size={16} />{playersLabel(g)}</span>
            <span className="flex items-center gap-1.5"><Icon name="sparkles" size={16} />{t('game.version')} {g.version}</span>
            <span className="flex flex-wrap gap-1.5"><ModeChips g={g} /></span>
          </div>
          <p className="text-lg">{g.description}</p>
          {g.coming_soon
            ? <p className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 font-semibold"><Icon name="sparkles" className="text-accent" />{t('game.comingSoonNote')}</p>
            : <div className="space-y-2">
                <Link href={`/games/${g.slug}/play`} className="btn btn-primary btn-lg pulse-ring w-full"><Icon name="play" size={22} />{t('game.play')}</Link>
                {OFFLINE_EXTRAS[g.slug] && <SaveOffline slug={g.slug} extra={OFFLINE_EXTRAS[g.slug]} />}
              </div>}
        </div>
      </section>

      <section className="card reveal p-5" style={{ ['--i' as string]: 1 }}>
        <h2 className="mb-4 flex items-center gap-2"><span className="icon-badge icon-badge-blue h-9 w-9"><Icon name="chart" size={18} /></span>{t('game.yourStats')}</h2>
        {!me ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bg/60 p-4">
            <p className="text-muted">{t('game.signInToTrack')}</p>
            <Link href={`/login?next=/games/${g.slug}`} className="btn btn-outline btn-sm"><Icon name="login" size={16} />{t('nav.signIn')}</Link>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map(([k, v, icon], i) => (
              <div key={k} className="stat-tile pop-in flex flex-col-reverse" style={{ ['--i' as string]: i }}>
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
