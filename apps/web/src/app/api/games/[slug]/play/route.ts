import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = createClient();

    // Get game
    const { data: game } = await supabase
      .from('games')
      .select('id,slug,name,is_builtin')
      .eq('slug', params.slug)
      .eq('status', 'published')
      .single();

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // If it's a built-in game, return a different response
    if (game.is_builtin) {
      return NextResponse.json({
        error: 'Built-in games use a different play route',
        builtin: true,
      });
    }

    // Get current version for HTML5 games
    const { data: version } = await supabase
      .from('game_versions')
      .select('*')
      .eq('game_id', game.id)
      .eq('is_current', true)
      .single();

    if (!version) {
      return NextResponse.json({ error: 'No version available' }, { status: 404 });
    }

    return NextResponse.json({
      bundleUrl: version.bundle_path,
      manifest: version.manifest,
      version: version.version,
    });
  } catch (error) {
    console.error('Game load error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load game' },
      { status: 500 }
    );
  }
}
