import { GameShell } from '@/components/GameShell';

// Every game (built-in and uploaded HTML5) is played inside the game shell: full screen by default, and leaving asks first.
export default function PlayLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  return <GameShell exitHref={`/games/${params.slug}`}>{children}</GameShell>;
}
