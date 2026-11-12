import { t } from '@slgh/shared';
import { HeroArt } from './Art';
import { Icon } from './Icon';

/** Split layout for sign in / sign up / password pages: animated art on wide screens, form on the right. */
export function AuthShell({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto px-4 pb-4 pt-6 sm:pt-10 ${wide ? 'max-w-5xl' : 'max-w-4xl'}`}>
      <div className="card reveal grid overflow-hidden md:grid-cols-[1fr_1.1fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden p-8 text-white md:flex"
          style={{ background: 'linear-gradient(160deg, #048750, #0a6f8a 55%, #0b3d7a)' }}>
          <div aria-hidden className="absolute inset-0 opacity-15" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1.2px)', backgroundSize: '20px 20px' }} />
          <div className="relative">
            <p className="font-display text-2xl font-semibold">{t('app.name')}</p>
            <p className="mt-1 text-white/80">{t('home.heroText')}</p>
          </div>
          <HeroArt className="relative -mx-4 my-4 w-[calc(100%+2rem)] [--c-border:255_255_255]" />
          <ul className="relative space-y-2 text-sm text-white/90">
            {(['home.fastTitle', 'home.freeTitle', 'home.friendsTitle'] as const).map((k) => (
              <li key={k} className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-white/20"><Icon name="check" size={14} strokeWidth={3} /></span>{t(k)}</li>
            ))}
          </ul>
        </aside>
        <div className="p-6 sm:p-8">
          <h1>{title}</h1>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
