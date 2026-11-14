import Link from 'next/link';
import { t } from '@slgh/shared';
import { api, query } from '@/lib/convex';
import { getMe } from '@/lib/session';
import { GameCard, GameRail } from '@/components/GameCard';
import { HeroArt } from '@/components/Art';
import { Icon, type IconName } from '@/components/Icon';

const FEATURES: { icon: IconName; tone: string; title: string; text: string }[] = [
  { icon: 'bolt', tone: 'icon-badge-blue', title: 'home.fastTitle', text: 'home.fastText' },
  { icon: 'heart', tone: 'icon-badge-gold', title: 'home.freeTitle', text: 'home.freeText' },
  { icon: 'users', tone: '', title: 'home.friendsTitle', text: 'home.friendsText' },
];

export default async function Home() {
  const me = await getMe();
  const [list, cats, recentGames] = await Promise.all([
    query(api.games.list, { limit: 8 }),
    query(api.games.categories, {}),
    me ? query(api.games.recent, { limit: 4 }) : [],
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 pb-6 pt-4 sm:px-6 sm:pt-6">
      {/* Discover banner */}
      <section className="banner reveal grid items-center gap-2 px-5 pb-0 pt-6 sm:px-8 md:grid-cols-[1.2fr_1fr] md:py-8">
        <div aria-hidden className="banner-pattern" />
        <div className="relative">
          <h1 className="text-[1.75rem] leading-tight sm:text-4xl">{t('home.heroLead')} {t('home.heroHighlight')}</h1>
          <p className="mt-2 max-w-md text-white/85 sm:text-lg">{t('home.heroText')}</p>
          <form action="/games" role="search" className="mt-5 flex max-w-md gap-2">
            <label htmlFor="q" className="sr-only">{t('library.searchLabel')}</label>
            <div className="input-icon flex-1">
              <Icon name="search" />
              <input id="q" name="q" type="search" placeholder={t('library.searchPlaceholder')}
                className="input border-0 bg-white text-[#313338] placeholder:text-[#5c5e66]" />
            </div>
            <button className="btn bg-[#1e1f22] text-white hover:bg-black">{t('library.apply')}</button>
          </form>
          {!!cats?.length && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {cats.map((c) => (
                <Link key={c.slug} href={`/games?category=${c.slug}`}
                  className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold text-white no-underline transition-colors hover:bg-white/25">{c.name}</Link>
              ))}
            </div>
          )}
        </div>
        <div className="relative mx-auto w-full max-w-[15rem] sm:max-w-xs md:max-w-sm">
          <HeroArt className="w-full" />
        </div>
      </section>

      {recentGames.length > 0 && (
        <section>
          <div className="section-head"><h2 className="flex items-center gap-2 text-base uppercase tracking-wide text-muted"><Icon name="play" size={16} />{t('home.recent')}</h2></div>
          <GameRail className="lg:grid-cols-4">{recentGames.map((g, i) => <GameCard key={g.id} g={g} i={i} variant="rail" />)}</GameRail>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2 className="flex items-center gap-2"><Icon name="gamepad" size={22} className="text-primary" />{t('home.featured')}</h2>
          <Link href="/games" className="link-arrow">{t('home.browseAll')}<Icon name="arrowRight" size={16} /></Link>
        </div>
        <GameRail className="lg:grid-cols-3 xl:grid-cols-4">
          {list.map((g, i) => <GameCard key={g.id} g={g} i={i} variant="rail" />)}
        </GameRail>
      </section>

      <section>
        <h2 className="mb-3">{t('home.whyTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card reveal-scroll flex gap-3 p-4" style={{ ['--i' as string]: i }}>
              <span className={`icon-badge ${f.tone}`}><Icon name={f.icon} size={20} /></span>
              <div><h3 className="text-heading">{t(f.title)}</h3>
              <p className="mt-0.5 text-sm text-muted">{t(f.text)}</p></div>
            </div>
          ))}
        </div>
      </section>

      {!me && (
        <section className="card reveal-scroll flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:p-8 sm:text-left">
          <div className="flex-1">
            <h2>{t('home.ctaTitle')}</h2>
            <p className="mt-1 text-muted">{t('home.ctaText')}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link href="/signup" className="btn btn-primary btn-lg">{t('nav.signUp')}</Link>
            <Link href="/games" className="btn btn-secondary btn-lg"><Icon name="gamepad" size={18} />{t('home.browseCta')}</Link>
          </div>
        </section>
      )}
    </main>
  );
}
