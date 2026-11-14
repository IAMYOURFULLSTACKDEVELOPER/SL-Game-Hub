'use client';

// Sign-in and sign-out post to the Convex Auth route that our middleware serves (/api/auth),
// which sets the httpOnly auth cookies. This is the same call ConvexAuthNextjsProvider makes,
// done directly so ordinary pages don't have to ship the Convex client.

import { errorKeyFor } from '@slgh/shared/src/errors';

type Params = Record<string, string>;

async function call(action: 'auth:signIn' | 'auth:signOut', args: Record<string, unknown>) {
  const res = await fetch('/api/auth', { method: 'POST', body: JSON.stringify({ action, args }) })
    .catch(() => { throw new Error('errors.offline'); });
  if (res.status >= 400) {
    const message = String((await res.json().catch(() => null))?.error ?? '');
    throw new Error(errorKeyFor(message)); // an errors.* key the form shows in plain words
  }
  return res.json();
}

export const signInWithPassword = (params: Params) => call('auth:signIn', { provider: 'password', params });
export const signOut = () => call('auth:signOut', {});
