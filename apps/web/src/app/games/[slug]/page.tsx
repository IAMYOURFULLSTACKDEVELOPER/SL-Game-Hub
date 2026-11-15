import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  t, SNAKE_RULES, DICE_RULES, CHECKERS_RULES, CHESS_RULES, WORD_SEARCH_RULES, SCRABBLE_RULES, UNO_RULES, SALONE_POLY_RULES,
  UNO_VARIANTS, SNAKE_AND_LADDER_VARIANTS, type RuleSection, type GameVariant,
} from '@slgh/shared';
import { api, query } from '@/lib/convex';
import { getMe } from '@/lib/session';
import { gameAccent, gameImage } from '@/lib/games';
import { playersLabel } from '@/components/GameCard';
import { Icon, type IconName } from '@/components/Icon';
import { GameGlyph } from '@/components/GameGlyph';
import SnakeAndLadderRulebook from '@/components/SnakeAndLadderRulebook';
import Rulebook from '@/components/Rulebook';
import { SaveOffline } from '@/components/SaveOffline';

// A game's profile page: an immersive hero in the game's own colour, ways to start playing,
// the game's variants, your record and the rulebook.

// Built-in games run entirely in the browser, so they can be saved for offline play.
const OFFLINE_EXTRAS: Record<string, string[]> = {
  // Not Dice: its play page carries the player's auth token (for money rooms), so it is never stored offline.
  snake: [], 'snake-and-ladder': [], chess: [], checkers: [], 'word-search': [], uno: [], 'salone-poly': [],
  scrabble: ['/games/scrabble/words.txt'],
};
/** Games with online rooms (convex/roomGames.ts) */
const ONLINE = new Set(['uno', 'salone-poly', 'chess', 'checkers', 'snake-and-ladder', 'scrabble', 'word-search', 'snake']);
/** Games you can play against bots or pass the phone on one device */
const LOCAL_MODES: Record<string, string> = {
  uno: 'Play bots or pass the phone around.', 'salone-poly': 'Play bots or pass the phone around.',
  chess: 'Play a bot on Easy, Medium or Hard, or a friend beside you.', checkers: 'Play a bot on Easy, Medium or Hard, or a friend beside you.',
  'snake-and-ladder': 'Race bots or friends on one phone.', scrabble: 'Play bots or friends on one device.',
  'word-search': 'Find every word against the clock.', snake: 'Beat your own high score.', dice: 'Roll against bots or friends.',
};
const VARIANTS: Record<string, readonly GameVariant[]> = { uno: UNO_VARIANTS, 'snake-and-ladder': SNAKE_AND_LADDER_VARIANTS };

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

/** Win rate ring: wins in the game colour, draws muted, on a track */
function RecordRing({ wins, draws, played }: { wins: number; draws: number; played: number }) {
  const r = 42, c = 2 * Math.PI * r;
  const w = played ? wins / played : 0, d = played ? draws / played : 0;
  return (
    <div className="gp-ring" role="img" aria-label={played ? `You win ${Math.round(w * 100)}% of your games` : 'No games played yet'}>
      <svg viewBox="0 0 100 100" width="132" height="132" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(var(--c-input))" strokeWidth="10" />
        {d > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(var(--c-muted))" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${c * d} ${c}`} strokeDashoffset={-c * w} transform="rotate(-90 50 50)" />}
        {w > 0 && <circle className="gp-ring-win" cx="50" cy="50" r={r} fill="none" stroke="var(--game)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${c * w} ${c}`} transform="rotate(-90 50 50)" />}
      </svg>
      <span className="gp-ring-label"><b>{played ? `${Math.round(w * 100)}%` : '–'}</b><small>win rate</small></span>
    </div>
  );
}

export default async function GameDetail({ params }: { params: { slug: string } }) {
  if (!/^[a-z0-9-]{2,40}$/.test(params.slug)) notFound();
  const me = await getMe();
  const g = await query(api.games.bySlug, { slug: params.slug });
  if (!g) notFound();
  const s = me ? (await query(api.games.myStats, { gameId: g.id }))[0] : undefined;

  const img = gameImage(g);
  const accent = gameAccent(g.slug);
  const online = ONLINE.has(g.slug) && g.modes.includes('multi');
  const offline = !!OFFLINE_EXTRAS[g.slug];
  const variants = VARIANTS[g.slug];
  const play = `/games/${g.slug}/play`;
  const rulebook = g.slug === 'snake-and-ladder'
    ? <SnakeAndLadderRulebook open />
    : RULEBOOKS[g.slug] && <Rulebook title={RULEBOOKS[g.slug].title} sections={RULEBOOKS[g.slug].sections} open />;

  const facts: [IconName, string][] = [
    ['users', playersLabel(g)],
    ...(g.categories?.name ? [['gamepad', g.categories.name] as [IconName, string]] : []),
    ...(online ? [['globe', 'Online rooms'] as [IconName, string]] : []),
    ...(offline ? [['wifi', 'Works offline'] as [IconName, string]] : []),
  ];
  const tiles = [
    { href: play, icon: g.modes.includes('multi') && g.slug !== 'snake' && g.slug !== 'word-search' ? 'robot' : 'gamepad', title: 'On this device', blurb: LOCAL_MODES[g.slug] ?? 'Play right here, even offline.' },
    ...(online ? [{ href: `${play}?online=1`, icon: 'globe', title: 'Online with friends', blurb: 'Make a room, share the code, and play together from anywhere.' }] : []),
  ] as { href: string; icon: IconName; title: string; blurb: string }[];
  const played = s?.played ?? 0;

  return (
    <main className="gp mx-auto max-w-4xl space-y-5 px-4 pb-8 pt-4 sm:pt-6" style={{ ['--game' as string]: accent }}>
      <Link href="/games" className="back-link"><Icon name="arrowLeft" size={18} />{t('game.back')}</Link>

      {/* Hero */}
      <section className="gp-hero reveal">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img && <img src={img} alt="" aria-hidden="true" className="gp-hero-bg" width={480} height={270} decoding="async" />}
        <span className="gp-hero-tint" aria-hidden="true" />
        <span className="gp-float" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>

        <div className="gp-hero-inner">
          <div className="gp-cover">
            {img
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={img} alt={`${g.name} cover art`} width={640} height={400} decoding="async" />
              : <span className="grid h-full place-items-center"><GameGlyph slug={g.slug} name={g.name} size={110} /></span>}
            <span className="gp-cover-shine" aria-hidden="true" />
          </div>

          <div className="gp-info">
            <p className="gp-eyebrow"><GameGlyph slug={g.slug} name={g.name} size={22} className="rounded-md" />{g.categories?.name ?? 'Game'}</p>
            <h1 className="gp-title">{g.name}</h1>
            <p className="gp-tagline">{g.description}</p>
            <ul className="gp-facts" aria-label="About this game">
              {facts.map(([icon, label]) => <li key={label}><Icon name={icon} size={14} strokeWidth={2.4} />{label}</li>)}
            </ul>
            {g.coming_soon ? (
              <p className="gp-soon"><Icon name="sparkles" size={18} />{t('game.comingSoonNote')}</p>
            ) : (
              <div className="gp-actions">
                <Link href={play} className="btn btn-success btn-lg gp-play"><Icon name="play" size={20} />{t('game.play')}</Link>
                {online && <Link href={`${play}?online=1`} className="btn btn-lg gp-online"><Icon name="globe" size={18} />Play online</Link>}
              </div>
            )}
            {offline && !g.coming_soon && <div className="mt-2 sm:text-left [&_p]:sm:justify-start"><SaveOffline slug={g.slug} extra={OFFLINE_EXTRAS[g.slug]} /></div>}
          </div>
        </div>
      </section>

      {!g.coming_soon && (
        <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          {/* Ways to start */}
          <section className="card reveal p-4 sm:p-5" style={{ ['--i' as string]: 1 }} aria-labelledby="gp-start">
            <h2 id="gp-start" className="gp-h2"><Icon name="play" size={16} />How do you want to play?</h2>
            <div className="grid gap-2">
              {tiles.map((x, i) => (
                <Link key={x.href} href={x.href} className="gp-mode pop-in" style={{ ['--i' as string]: i }}>
                  <span className="gp-mode-icon"><Icon name={x.icon} size={22} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-heading">{x.title}</span>
                    <span className="block text-sm text-muted">{x.blurb}</span>
                  </span>
                  <Icon name="arrowRight" size={18} className="gp-mode-go" />
                </Link>
              ))}
            </div>
          </section>

          {/* Your record */}
          <section className="card reveal p-4 sm:p-5" style={{ ['--i' as string]: 2 }} aria-labelledby="gp-record">
            <h2 id="gp-record" className="gp-h2"><Icon name="chart" size={16} />{t('game.yourStats')}</h2>
            {!me ? (
              <div className="gp-teaser">
                <div className="gp-teaser-fake" aria-hidden="true">
                  <RecordRing wins={7} draws={1} played={12} />
                  <div className="grid flex-1 grid-cols-2 gap-2">{['12', '7', '4', '1'].map((n, i) => <span key={i} className="stat-tile bg-bg"><b className="stat-num">{n}</b></span>)}</div>
                </div>
                <div className="gp-teaser-cta">
                  <p className="font-semibold text-heading">Track every win</p>
                  <p className="text-sm text-muted">{t('game.signInToTrack')}</p>
                  <Link href={`/login?next=/games/${g.slug}`} className="btn btn-primary btn-sm mt-1"><Icon name="login" size={16} />{t('nav.signIn')}</Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <RecordRing wins={s?.wins ?? 0} draws={s?.draws ?? 0} played={played} />
                <dl className="grid min-w-[180px] flex-1 grid-cols-2 gap-2">
                  {([['played', played, 'gamepad'], ['wins', s?.wins, 'trophy'], ['losses', s?.losses, 'close'], ['bestScore', s?.best_score, 'star']] as const).map(([k, v, icon], i) => (
                    <div key={k} className="stat-tile pop-in flex flex-col-reverse bg-bg !p-3" style={{ ['--i' as string]: i }}>
                      <dt className="flex items-center justify-center gap-1 text-xs text-muted"><Icon name={icon} size={13} />{t(`game.${k}`)}</dt>
                      <dd className="stat-num !text-xl">{v ?? 0}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Ways to play: variants */}
      {variants && variants.length > 1 && (
        <section className="reveal" style={{ ['--i' as string]: 3 }} aria-labelledby="gp-variants">
          <h2 id="gp-variants" className="gp-h2 px-1"><Icon name="shuffle" size={16} />Ways to play {g.name}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {variants.map((v, i) => (
              <li key={v.id} className="gp-variant pop-in" style={{ ['--i' as string]: i }}>
                <span className="gp-variant-n">{String(i + 1).padStart(2, '0')}</span>
                <p className="font-bold text-heading">{v.name}{i === 0 && <span className="chip ml-2 align-middle">Default</span>}</p>
                <p className="mt-1 text-sm text-muted">{v.blurb}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-xs text-muted">Pick one when you start a game. Online, the room's host chooses.</p>
        </section>
      )}

      {rulebook && <div className="reveal" style={{ ['--i' as string]: 4 }}>{rulebook}</div>}
    </main>
  );
}
