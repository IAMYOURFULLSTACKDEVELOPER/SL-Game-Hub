import Link from 'next/link';
import { t } from '@slgh/shared';
import { api, query } from '@/lib/convex';
import { getMe } from '@/lib/session';
import { GameCard, GameRail } from '@/components/GameCard';
import { HeroArt } from '@/components/Art';
import { Icon, type IconName } from '@/components/Icon';

const FEATURES: { icon: IconName; tone: string; title: string; text: string }[] = [
  { icon: 'bolt', tone: '', title: 'home.fastTitle', text: 'home.fastText' },
  { icon: 'heart', tone: 'icon-badge-gold', title: 'home.freeTitle', text: 'home.freeText' },
  { icon: 'users', tone: 'icon-badge-blue', title: 'home.friendsTitle', text: 'home.friendsText' },
];

export default async function Home() {
  const me = await getMe();
  const [list, cats, recentGames] = await Promise.all([
    query(api.games.list, { limit: 8 }),
    query(api.games.categories, {}),
    me ? query(api.games.recent, { limit: 4 }) : [],
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-4 pb-4 pt-5 sm:space-y-16 sm:pt-10">
      {/* Hero */}
      <section className="grid items-center gap-6 md:grid-cols-[1.15fr_1fr] md:gap-8">
        <div>
          <span className="eyebrow reveal"><Icon name="sparkles" size={16} />{t('home.eyebrow')}</span>
          <h1 className="reveal mt-4 text-[2.1rem] sm:text-5xl md:text-[2.75rem] lg:text-6xl" style={{ ['--i' as string]: 1 }}>
            {t('home.heroLead')} <span className="text-gradient">{t('home.heroHighlight')}</span>
          </h1>
          <p className="reveal mt-3 max-w-lg text-muted sm:mt-4 sm:text-lg" style={{ ['--i' as string]: 2 }}>{t('home.heroText')}</p>
          <form action="/games" role="search" className="reveal mt-6 flex max-w-lg gap-2 rounded-2xl border border-border bg-surface/80 p-1.5 shadow-soft backdrop-blur-md transition-shadow focus-within:shadow-glow" style={{ ['--i' as string]: 3 }}>
            <label htmlFor="q" className="sr-only">{t('library.searchLabel')}</label>
            <div className="input-icon flex-1">
              <Icon name="search" />
              <input id="q" name="q" type="search" placeholder={t('library.searchPlaceholder')} className="input border-0 bg-transparent shadow-none focus:shadow-none" />
            </div>
            <button className="btn btn-primary">{t('library.apply')}</button>
          </form>
          {!!cats?.length && (
            <div className="reveal mt-5 flex flex-wrap gap-2" style={{ ['--i' as string]: 4 }}>
              {cats.map((c) => (
                <Link key={c.slug} href={`/games?category=${c.slug}`} className="chip chip-muted px-3.5 py-1.5 text-sm no-underline transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary">{c.name}</Link>
              ))}
            </div>
          )}
        </div>
        <div className="relative order-first mx-auto -mb-2 w-full max-w-[17rem] sm:max-w-sm md:order-none md:mb-0 md:max-w-none">
          <HeroArt className="w-full" />
          <div className="float-badge left-0 top-6 hidden lg:flex" style={{ animationDelay: '-2s' }}><span className="icon-badge icon-badge-gold h-8 w-8"><Icon name="trophy" size={16} /></span>{t('home.badgeTournaments')}</div>
          <div className="float-badge bottom-10 right-0 hidden lg:flex"><span className="icon-badge h-8 w-8"><Icon name="wifi" size={16} /></span>{t('home.badgeFast')}</div>
        </div>
      </section>

      {recentGames.length > 0 && (
        <section>
          <div className="section-head"><h2 className="flex items-center gap-2"><span className="icon-badge h-9 w-9"><Icon name="play" size={16} /></span>{t('home.recent')}</h2></div>
          <GameRail className="lg:grid-cols-4">{recentGames.map((g, i) => <GameCard key={g.id} g={g} i={i} variant="rail" />)}</GameRail>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2 className="flex items-center gap-2"><span className="icon-badge icon-badge-blue h-9 w-9"><Icon name="gamepad" size={18} /></span>{t('home.featured')}</h2>
          <Link href="/games" className="link-arrow">{t('home.browseAll')}<Icon name="arrowRight" size={18} /></Link>
        </div>
        <GameRail className="lg:grid-cols-3 xl:grid-cols-4">
          {list.map((g, i) => <GameCard key={g.id} g={g} i={i} variant="rail" />)}
        </GameRail>
      </section>

      <section>
        <h2 className="mb-5 text-center">{t('home.whyTitle')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card card-hover spotlight reveal-scroll flex gap-4 p-5 sm:block sm:p-6" style={{ ['--i' as string]: i }}>
              <span className={`icon-badge ${f.tone}`}><Icon name={f.icon} size={22} /></span>
              <div><h3 className="text-lg sm:mt-4">{t(f.title)}</h3>
              <p className="mt-1 text-muted">{t(f.text)}</p></div>
            </div>
          ))}
        </div>
      </section>

      {!me && (
        <section className="reveal-scroll relative overflow-hidden rounded-3xl px-5 py-8 text-center text-white shadow-lift sm:p-12"
          style={{ background: 'linear-gradient(135deg, #048750, #0a7f8a 50%, #0052a3)' }}>
          <div aria-hidden className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1.2px)', backgroundSize: '22px 22px' }} />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl">{t('home.ctaTitle')}</h2>
            <p className="mx-auto mt-2 max-w-md text-white/85">{t('home.ctaText')}</p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="btn btn-lg pulse-ring bg-white text-[#035c37] shadow-lift"><Icon name="sparkles" />{t('nav.signUp')}</Link>
              <Link href="/games" className="btn btn-lg border-2 border-white/40 text-white hover:bg-white/10"><Icon name="gamepad" />{t('home.browseCta')}</Link>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
