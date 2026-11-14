'use client';
import { useState, type ReactNode } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

/** The signed-in player's token, or null (then the room client is anonymous). */
async function roomToken() {
  try {
    const res = await fetch('/api/convex-token', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as { token: string | null }).token : null;
  } catch {
    return null;
  }
}

/**
 * Convex for online game rooms. The page itself carries no auth token, which keeps game pages safe to
 * save offline. The client (and its connection) is only created when someone opens online play, so
 * local games never touch the network. If the player is signed in, the client fetches their token from
 * /api/convex-token so money rooms know whose wallet is playing; free rooms work either way.
 */
export function ConvexRoomProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const c = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    c.setAuth(roomToken);
    return c;
  });
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
