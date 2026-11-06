import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/session';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    await requireAdmin();
    const supabase = createClient();

    // Get game
    const { data: game } = await supabase
      .from('games')
      .select('id')
      .eq('slug', params.slug)
      .single();

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Get current version
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
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load preview' },
      { status: 500 }
    );
  }
}
