import Link from 'next/link';
import { t } from '@slgh/shared';
import { gameImage, type GameRow } from '@/lib/games';

export const playersLabel = (g: Pick<GameRow, 'min_players' | 'max_players'>) =>
  g.max_players === 1 ? t('library.onePlayer') : t('library.players', { min: g.min_players, max: g.max_players });

export function GameCard({ g }: { g: GameRow }) {
  const img = gameImage(g);
  return (
    <Link href={`/games/${g.slug}`} className="card block p-4 no-underline hover:border-primary">
      <div className="flex items-center gap-3">
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" width={84} height={56} loading="lazy" decoding="async" className="h-14 w-[84px] shrink-0 rounded-lg object-cover" />
          : <span aria-hidden className="text-5xl leading-none">{g.icon}</span>}
        <div>
          <h3 className="text-lg font-bold">{g.name}</h3>
          <p className="text-sm text-muted">{g.categories?.name} · {playersLabel(g)}</p>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-sm">{g.description}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
        {g.modes.includes('single') && <span className="rounded border-2 border-border px-2 py-0.5">{t('library.single')}</span>}
        {g.modes.includes('multi') && <span className="rounded border-2 border-secondary px-2 py-0.5 text-secondary">{t('library.multi')}</span>}
        {g.coming_soon && <span className="rounded border-2 border-accent px-2 py-0.5">{t('library.comingSoon')}</span>}
      </div>
    </Link>
  );
}
