import { NextRequest, NextResponse } from 'next/server';
import { api, query } from '@/lib/convex';
import { requireAdmin } from '@/lib/session';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    await requireAdmin();
    // Current build of any game, whatever its status
    const result = await query(api.gameVersions.current, { slug: params.slug, preview: true });
    if ('error' in result) return NextResponse.json(result, { status: result.error === 'forbidden' ? 403 : 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load preview' },
      { status: 500 }
    );
  }
}
