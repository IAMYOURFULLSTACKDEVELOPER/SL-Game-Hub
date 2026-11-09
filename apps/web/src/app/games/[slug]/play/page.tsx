import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import BuiltInGamePlay from '@/components/BuiltInGamePlay';

export default async function GamePlayPage({ params }: { params: { slug: string } }) {
  const supabase = createClient();

  // Check if game exists and get its type
  const { data: game } = await supabase
    .from('games')
    .select('id,slug,is_builtin')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single();

  if (!game) {
    redirect('/games');
  }

  // If it's a built-in game, use the client-side implementation
  if (game.is_builtin) {
    return <BuiltInGamePlay slug={params.slug} />;
  }

  // If it's an HTML5 game, redirect to the HTML5 player
  redirect(`/games/${params.slug}/play/html5`);
}
