import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/session';
import { validateGameUpload, validateManifest } from '@slgh/shared';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const formData = await request.formData();

    const bundle = formData.get('bundle') as File;
    const thumbnail = formData.get('thumbnail') as File | null;
    const gameId = formData.get('gameId') as string;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const version = formData.get('version') as string;
    const minPlayers = Number(formData.get('minPlayers'));
    const maxPlayers = Number(formData.get('maxPlayers'));
    const modes = formData.getAll('modes') as string[];
    const entryPoint = formData.get('entryPoint') as string;
    const author = formData.get('author') as string | null;
    const changelog = formData.get('changelog') as string | null;

    // Validate required fields
    if (!bundle) {
      return NextResponse.json({ message: 'Game bundle is required' }, { status: 400 });
    }

    if (!gameId || !name || !description || !version || !entryPoint) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // Build manifest
    const manifest = {
      id: gameId,
      name,
      description,
      version,
      minPlayers,
      maxPlayers,
      modes: modes as ('single' | 'multi')[],
      entryPoint,
      author,
    };

    // Validate manifest
    const manifestValidation = validateManifest(manifest);
    if (!manifestValidation.valid) {
      return NextResponse.json(
        { message: 'Invalid manifest', errors: manifestValidation.errors },
        { status: 400 }
      );
    }

    // Validate file
    const fileValidation = await validateGameUpload(bundle, JSON.stringify(manifest));
    if (!fileValidation.valid) {
      return NextResponse.json(
        { message: 'Invalid file', errors: fileValidation.errors },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Check if game already exists
    const { data: existingGame } = await supabase
      .from('games')
      .select('id')
      .eq('slug', gameId)
      .single();

    let gameRecordId: string;

    if (existingGame) {
      gameRecordId = existingGame.id;
    } else {
      // Create new game record
      const { data: newGame, error: gameError } = await supabase
        .from('games')
        .insert({
          slug: gameId,
          name,
          description,
          icon: '🎮',
          min_players: minPlayers,
          max_players: maxPlayers,
          modes: modes as ('single' | 'multi')[],
          version,
          status: 'draft',
          is_builtin: false,
        })
        .select('id')
        .single();

      if (gameError) {
        return NextResponse.json({ message: 'Failed to create game' }, { status: 500 });
      }

      gameRecordId = newGame.id;
    }

    // Upload bundle to storage
    const bundlePath = `${gameId}/${version}/bundle.zip`;
    const { error: bundleError } = await supabase.storage
      .from('game-bundles')
      .upload(bundlePath, bundle, { upsert: true });

    if (bundleError) {
      return NextResponse.json({ message: 'Failed to upload bundle' }, { status: 500 });
    }

    // Upload thumbnail if provided
    let thumbnailPath: string | null = null;
    if (thumbnail) {
      const ext = thumbnail.name.split('.').pop();
      const thumbPath = `${gameId}/${version}/thumbnail.${ext}`;
      const { error: thumbError } = await supabase.storage
        .from('game-thumbnails')
        .upload(thumbPath, thumbnail, { upsert: true });

      if (!thumbError) {
        // Get public URL
        const { data: thumbUrl } = supabase.storage
          .from('game-thumbnails')
          .getPublicUrl(thumbPath);
        thumbnailPath = thumbUrl.publicUrl;
      }
    }

    // Get public URL for bundle (will be signed in production)
    const { data: bundleUrl } = supabase.storage.from('game-bundles').getPublicUrl(bundlePath);

    // Create game version record
    const { error: versionError } = await supabase.from('game_versions').insert({
      game_id: gameRecordId,
      version,
      bundle_path: bundleUrl.publicUrl,
      thumbnail_path: thumbnailPath,
      manifest: manifest as any,
      changelog,
      status: 'draft',
      is_current: true,
      created_by: admin.id,
    });

    if (versionError) {
      return NextResponse.json({ message: 'Failed to create version' }, { status: 500 });
    }

    return NextResponse.json({ success: true, gameId: gameRecordId });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
