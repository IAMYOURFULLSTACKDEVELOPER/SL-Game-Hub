import { ConvexIsland } from '@/components/ConvexIsland';
import { PlayerClient } from './PlayerClient';

export async function generateMetadata({ params }: { params: { username: string } }) {
  const name = decodeURIComponent(params.username);
  return { title: name, description: `${name} on Dodo: follow them and play together.` };
}

export default function PlayerPage({ params }: { params: { username: string } }) {
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <ConvexIsland><PlayerClient username={decodeURIComponent(params.username)} /></ConvexIsland>
    </main>
  );
}
