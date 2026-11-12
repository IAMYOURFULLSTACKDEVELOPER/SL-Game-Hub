import { LostArt } from '@/components/Art';
import { Icon } from '@/components/Icon';
import { OfflineGames } from '@/components/OfflineGames';

export const metadata = { title: 'Offline' };

// The service worker stores this page at install time and shows it for any page that isn't saved.
export default function Offline() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 pb-4 pt-8 text-center sm:pt-12">
      <LostArt />
      <div>
        <h1>You&apos;re offline</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">This page isn&apos;t saved on your phone yet. Games you&apos;ve already opened still work. Pick one below.</p>
      </div>
      <section className="card p-5 text-left">
        <h2 className="mb-3 flex items-center gap-2"><span className="icon-badge h-9 w-9"><Icon name="gamepad" size={18} /></span>Play offline</h2>
        <OfflineGames />
      </section>
      {/* A plain link: reloads the page so the network is tried again */}
      <a href="" className="btn btn-primary"><Icon name="wifi" size={18} />Try again</a>
    </main>
  );
}
