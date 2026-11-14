import React from 'react';
import { errorKeyFor } from '@slgh/shared/src/errors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api, convex } from './convex';

export type Me = NonNullable<FunctionReturnType<typeof api.users.me>>;

/** Keeps the session in AsyncStorage and refreshes it automatically. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <ConvexAuthProvider client={convex} storage={AsyncStorage}>{children}</ConvexAuthProvider>;
}

/** The signed-in player's profile; live, so it updates as soon as it is saved. */
export function useAuth() {
  const me = useQuery(api.users.me);
  return { me: me ?? null, loading: me === undefined };
}

/** Turns an auth error into an i18n key: our backend throws keys such as errors.usernameTaken. */
/** The i18n key to show for an auth or Convex error (see @slgh/shared errors.ts). */
export function authErrorKey(e: unknown) {
  const data = (e as { data?: unknown } | null)?.data;
  return errorKeyFor(typeof data === 'string' ? data : e instanceof Error ? e.message : String(e));
}
