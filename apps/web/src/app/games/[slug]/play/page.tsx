import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import { api, query } from '@/lib/convex';
import { redirect } from 'next/navigation';
import BuiltInGamePlay from '@/components/BuiltInGamePlay';

export default async function GamePlayPage({ params }: { params: { slug: string } }) {
  // Check if game exists and get its type
  const game = await query(api.games.bySlug, { slug: params.slug });

  if (!game) {
    redirect('/games');
  }

  // If it's a built-in game, use the client-side implementation
  if (game.is_builtin) {
    const play = <BuiltInGamePlay slug={params.slug} />;
    // Online Dice money rooms act as the signed-in player, so Dice gets the auth state.
    return params.slug === 'dice' ? <ConvexAuthNextjsServerProvider>{play}</ConvexAuthNextjsServerProvider> : play;
  }

  // If it's an HTML5 game, redirect to the HTML5 player
  redirect(`/games/${params.slug}/play/html5`);
}
