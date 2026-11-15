import { avatarInfo } from '@slgh/shared/src/avatars';

// A player's preset avatar: a coloured round tile with a simple white vector mark (no emoji, no uploads).

const MARKS: Record<string, JSX.Element> = {
  av_lion: <><circle cx="12" cy="12" r="4" fill="#fff" stroke="none" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  av_elephant: <path d="M3 19 9.5 7l3.5 6 2-3 6 9z" fill="#fff" stroke="none" />,
  av_parrot: <><path d="M5 19C5 10 11 5 20 4c-1 9-6 15-15 15z" fill="#fff" stroke="none" /><path d="M5 19 13 11" /></>,
  av_leopard: <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="#fff" stroke="none" />,
  av_eagle: <><path d="M12 2.5c3 2.5 4.5 6 4.5 10.5l-2 3h-5l-2-3c0-4.5 1.5-8 4.5-10.5z" fill="#fff" stroke="none" /><path d="M9.5 16 7 20M14.5 16l2.5 4M12 17v4" /></>,
  av_turtle: <path d="M12 3 19.8 7.5v9L12 21l-7.8-4.5v-9z" fill="#fff" stroke="none" />,
  av_fish: <path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0" />,
  av_lizard: <path d="M12 2.5 20 12l-8 9.5L4 12z" fill="#fff" stroke="none" />,
  av_butterfly: <><circle cx="12" cy="7" r="3.6" fill="#fff" stroke="none" /><circle cx="12" cy="17" r="3.6" fill="#fff" stroke="none" /><circle cx="7" cy="12" r="3.6" fill="#fff" stroke="none" /><circle cx="17" cy="12" r="3.6" fill="#fff" stroke="none" /></>,
  av_monkey: <path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z" fill="#fff" stroke="none" />,
  av_buffalo: <path d="m12 2.5 2.9 5.9 6.6 1-4.8 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.5 9.4l6.6-1z" fill="#fff" stroke="none" />,
  av_zebra: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></>,
};
const FALLBACK = <><circle cx="12" cy="8.5" r="3.8" fill="#fff" stroke="none" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0z" fill="#fff" stroke="none" /></>;

export function Avatar({ id, size = 40, className = '', label }: { id: string | null | undefined; size?: number; className?: string; label?: string }) {
  const a = avatarInfo(id);
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-full ${className}`} style={{ width: size, height: size, background: a.color }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {MARKS[a.id] ?? FALLBACK}
      </svg>
    </span>
  );
}
