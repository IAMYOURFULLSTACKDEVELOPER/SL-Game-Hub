'use client';

// Sign-in and sign-out post to the Convex Auth route that our middleware serves (/api/auth),
// which sets the httpOnly auth cookies. This is the same call ConvexAuthNextjsProvider makes,
// done directly so ordinary pages don't have to ship the Convex client.

type Params = Record<string, string>;

/** Maps Convex Auth's error text to an i18n key. Wrong password and unknown email get the same message. */
function authErrorKey(message: string) {
  const key = message.match(/errors\.\w+/)?.[0]; // our auth code throws i18n keys, e.g. errors.usernameTaken
  if (key) return key;
  if (/InvalidSecret|InvalidAccountId|Invalid credentials/i.test(message)) return 'errors.invalidCredentials';
  if (/Could not verify code|Invalid code/i.test(message)) return 'errors.codeInvalid';
  return 'errors.generic';
}

async function call(action: 'auth:signIn' | 'auth:signOut', args: Record<string, unknown>) {
  const res = await fetch('/api/auth', { method: 'POST', body: JSON.stringify({ action, args }) });
  if (res.status >= 400) {
    const message = String((await res.json().catch(() => null))?.error ?? '');
    throw new Error(authErrorKey(message));
  }
  return res.json();
}

export const signInWithPassword = (params: Params) => call('auth:signIn', { provider: 'password', params });
export const signOut = () => call('auth:signOut', {});
