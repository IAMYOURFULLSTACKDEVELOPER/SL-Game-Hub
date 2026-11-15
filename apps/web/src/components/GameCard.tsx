import Link from 'next/link';
import { t } from '@slgh/shared';
import { gameImage, type GameRow } from '@/lib/games';
import { GameGlyph } from './GameGlyph';
import { Icon } from './Icon';

export const playersLabel = (g: Pick<GameRow, 'min_players' | 'max_players'>) =>
  g.max_players === 1 ? t('library.onePlayer')
    : g.min_players === g.max_players ? t('library.playersExact', { n: g.max_players })
      : t('library.players', { min: g.min_players, max: g.max_players });

export function ModeChips({ g }: { g: GameRow }) {
  return (
    <>
      {g.modes.includes('single') && <span className="chip chip-muted"><Icon name="user" size={12} strokeWidth={2.5} />{t('library.single')}</span>}
      {g.modes.includes('multi') && <span className="chip chip-secondary"><Icon name="users" size={12} strokeWidth={2.5} />{t('library.multi')}</span>}
      {g.coming_soon && <span className="chip chip-accent">{t('library.comingSoon')}</span>}
    </>
  );
}

/**
 * A Discord-style discovery card: banner image, the game's icon overlapping its bottom edge, then text.
 * Layouts differ only on phones (< 640px):
 *  grid: the vertical card everywhere
 *  rail: a swipeable carousel item (pair with <GameRail>)
 *  list: a compact row with the icon on the left and no banner
 */
type Variant = 'grid' | 'rail' | 'list';
const V: Record<Variant, { card: string; thumb: string; body: string; desc: string }> = {
  grid: { card: '', thumb: '', body: '', desc: '' },
  rail: { card: 'max-sm:w-[78%] max-sm:shrink-0 max-sm:snap-start', thumb: '', body: '', desc: '' },
  list: { card: 'max-sm:flex-row max-sm:items-center', thumb: 'max-sm:hidden', body: 'max-sm:p-3 max-sm:pl-0', desc: 'max-sm:line-clamp-1' },
};

export function GameCard({ g, i = 0, variant = 'grid' }: { g: GameRow; i?: number; variant?: Variant }) {
  const img = gameImage(g);
  const v = V[variant];
  return (
    <Link href={`/games/${g.slug}`} className={`game-card reveal ${v.card}`} style={{ ['--i' as string]: i }}>
      <div className={`game-thumb ${v.thumb}`}>
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" width={480} height={270} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : <span aria-hidden className="grid h-full place-items-center"><GameGlyph slug={g.slug} name={g.name} size={72} /></span>}
        {!g.coming_soon && <span className="game-play" aria-hidden><Icon name="play" size={18} /></span>}
      </div>
      {variant === 'list' && <span className="m-3 hidden max-sm:block"><GameGlyph slug={g.slug} name={g.name} size={48} /></span>}
      <div className={`relative flex min-w-0 flex-1 flex-col px-4 pb-4 pt-7 ${v.body}`}>
        <span className={`game-card-icon ${variant === 'list' ? 'max-sm:hidden' : ''}`}><GameGlyph slug={g.slug} name={g.name} size={44} /></span>
        <h3 className="text-base font-bold leading-tight text-heading">{g.name}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <span className="online-dot" aria-hidden />{playersLabel(g)}
          {g.categories?.name && <><span aria-hidden>·</span>{g.categories.name}</>}
        </p>
        <p className={`mt-2 line-clamp-2 text-sm text-text/80 ${v.desc}`}>{g.description}</p>
        <div className="mt-auto flex flex-wrap gap-1 pt-3"><ModeChips g={g} /></div>
      </div>
    </Link>
  );
}

/** A grid on tablets and up; on phones a horizontal, snap-scrolling rail where the next card peeks in. */
export function GameRail({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 no-scrollbar max-sm:-mx-4 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:overflow-x-auto max-sm:scroll-px-4 max-sm:px-4 max-sm:pb-2 ${className}`}>
      {children}
    </div>
  );
}
