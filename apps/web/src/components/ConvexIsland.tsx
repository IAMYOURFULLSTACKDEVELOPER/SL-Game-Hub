import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import { ConvexClientProvider } from './ConvexClientProvider';

/**
 * Gives live Convex queries (signed in as the current player) to the parts of a page that need them.
 * Only wrapped around live features, so ordinary pages stay server-rendered and ship no Convex client.
 */
export function ConvexIsland({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthNextjsServerProvider>
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ConvexAuthNextjsServerProvider>
  );
}
