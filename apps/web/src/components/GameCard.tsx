import Link from 'next/link';
import { t } from '@slgh/shared';
import { gameImage, type GameRow } from '@/lib/games';
import { Icon } from './Icon';

export const playersLabel = (g: Pick<GameRow, 'min_players' | 'max_players'>) =>
  g.max_players === 1 ? t('library.onePlayer')
    : g.min_players === g.max_players ? t('library.playersExact', { n: g.max_players })
      : t('library.players', { min: g.min_players, max: g.max_players });

export function ModeChips({ g }: { g: GameRow }) {
  return (
    <>
      {g.modes.includes('single') && <span className="chip chip-muted"><Icon name="user" size={13} strokeWidth={2.5} />{t('library.single')}</span>}
      {g.modes.includes('multi') && <span className="chip chip-secondary"><Icon name="users" size={13} strokeWidth={2.5} />{t('library.multi')}</span>}
      {g.coming_soon && <span className="chip chip-accent"><Icon name="sparkles" size={13} strokeWidth={2.5} />{t('library.comingSoon')}</span>}
    </>
  );
}

/**
 * Layouts differ only on phones (< 640px):
 *  grid: the vertical card everywhere
 *  rail: a swipeable carousel item (pair with <GameRail>)
 *  list: a compact row with the thumbnail on the left
 */
type Variant = 'grid' | 'rail' | 'list';
const V: Record<Variant, { card: string; thumb: string; body: string; desc: string; overlay: string }> = {
  grid: { card: '', thumb: '', body: '', desc: '', overlay: '' },
  rail: { card: 'max-sm:w-[78%] max-sm:shrink-0 max-sm:snap-start', thumb: '', body: '', desc: '', overlay: '' },
  list: {
    card: 'max-sm:flex-row', thumb: 'max-sm:aspect-auto max-sm:w-[7.5rem] max-sm:shrink-0',
    body: 'max-sm:p-3', desc: 'max-sm:line-clamp-1', overlay: 'max-sm:hidden',
  },
};

export function GameCard({ g, i = 0, variant = 'grid' }: { g: GameRow; i?: number; variant?: Variant }) {
  const img = gameImage(g);
  const v = V[variant];
  return (
    <Link href={`/games/${g.slug}`} className={`card card-hover spotlight game-card reveal ${v.card}`} style={{ ['--i' as string]: i }}>
      <div className={`game-thumb ${v.thumb}`}>
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" width={480} height={270} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : <span aria-hidden className="grid h-full place-items-center bg-gradient-to-br from-primary/20 to-secondary/20 text-7xl">{g.icon}</span>}
        {g.categories?.name && <span className={`chip absolute left-3 top-3 z-10 border-white/30 bg-black/45 text-white backdrop-blur-md ${v.overlay}`}>{g.categories.name}</span>}
        {!g.coming_soon && <span className={`game-play ${v.overlay}`} aria-hidden><Icon name="play" size={20} /></span>}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col p-4 ${v.body}`}>
        <h3 className="text-lg font-semibold leading-tight text-text">{g.name}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted"><Icon name="users" size={15} />{playersLabel(g)}</p>
        <p className={`mt-1.5 line-clamp-2 text-sm text-muted ${v.desc}`}>{g.description}</p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3"><ModeChips g={g} /></div>
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
