import { NextResponse } from 'next/server';
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';

// The signed-in player's Convex token, for the online-room client (components/ConvexRoomProvider.tsx).
// Money rooms need to know whose wallet is playing; fetching the token here instead of putting it in
// the page keeps game pages free of tokens, so they can still be saved for offline play.
// Same-origin only (no CORS headers), never cached.
export const dynamic = 'force-dynamic';

export async function GET() {
  const token = (await convexAuthNextjsToken()) ?? null;
  return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
