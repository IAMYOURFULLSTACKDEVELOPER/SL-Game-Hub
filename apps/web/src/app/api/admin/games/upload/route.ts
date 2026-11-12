import { NextRequest, NextResponse } from 'next/server';
import type { Id } from '@slgh/backend/convex/_generated/dataModel';
import { api, errorMessage, mutate } from '@/lib/convex';
import { requireAdmin } from '@/lib/session';
import { validateGameUpload, validateManifest } from '@slgh/shared';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
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

    // Upload the files straight to Convex storage, then record the version (and create the game if new)
    const store = async (file: File) => {
      const uploadUrl = await mutate(api.gameVersions.generateUploadUrl, {});
      const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
      if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
      return (await res.json()).storageId as Id<'_storage'>;
    };
    const bundleStorageId = await store(bundle).catch(() => null);
    if (!bundleStorageId) {
      return NextResponse.json({ message: 'Failed to upload bundle' }, { status: 500 });
    }
    const thumbnailStorageId = thumbnail ? await store(thumbnail).catch(() => undefined) : undefined;

    let gameRecordId: string;
    try {
      gameRecordId = await mutate(api.gameVersions.create, {
        slug: gameId, name, description, version,
        min_players: minPlayers, max_players: maxPlayers, modes: manifest.modes,
        manifest, changelog: changelog ?? undefined,
        bundle_storage_id: bundleStorageId, thumbnail_storage_id: thumbnailStorageId,
      });
    } catch (e) {
      return NextResponse.json({ message: `Failed to create version: ${errorMessage(e)}` }, { status: 500 });
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
