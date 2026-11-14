import { t } from '@slgh/shared';
import { HeroArt, LogoMark } from './Art';

/** Sign in / sign up / password pages: a centred card on an illustrated brand backdrop. */
export function AuthShell({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="auth-stage">
      <div aria-hidden className="banner-pattern" />
      <HeroArt className="auth-art auth-art-l" />
      <HeroArt className="auth-art auth-art-r" />
      <div className={`auth-card pop-in ${wide ? 'max-w-2xl' : 'max-w-[30rem]'}`}>
        <div className="mb-5 flex flex-col items-center text-center">
          <LogoMark size={48} />
          <h1 className="mt-3 text-2xl">{title}</h1>
          <p className="mt-1 text-[15px] text-muted">{subtitle ?? t('home.heroText')}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
