'use client';
import { useState, type ReactNode } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

/**
 * Convex for anonymous game rooms (UNO, Salone-Poly). No sign-in, so no auth token on the page,
 * which keeps these game pages safe to save offline. The client (and its connection) is only
 * created when someone opens online play, so local games never touch the network.
 */
export function ConvexRoomProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!));
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
