import { NextRequest, NextResponse } from 'next/server';
import { api, query } from '@/lib/convex';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // Current build of a published HTML5 game (built-in games use a different play route)
    const result = await query(api.gameVersions.current, { slug: params.slug });
    if ('error' in result) {
      return NextResponse.json(result, { status: result.error === 'Game not found' || result.error === 'No version available' ? 404 : 200 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Game load error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load game' },
      { status: 500 }
    );
  }
}
