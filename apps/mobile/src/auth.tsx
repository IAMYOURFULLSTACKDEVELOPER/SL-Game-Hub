import React from 'react';
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
export function authErrorKey(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  const key = m.match(/errors\.\w+/)?.[0];
  if (key) return key;
  if (/InvalidSecret|InvalidAccountId|Invalid credentials/i.test(m)) return 'errors.invalidCredentials'; // same for both: no account enumeration
  if (/Could not verify code|Invalid code/i.test(m)) return 'errors.codeInvalid';
  return /fetch|network/i.test(m) ? 'common.offline' : 'errors.generic';
}
