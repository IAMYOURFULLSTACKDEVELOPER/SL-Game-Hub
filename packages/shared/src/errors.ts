import { t } from './i18n';

// Turns whatever a Convex call threw into words a player understands. Players never see raw
// server text such as "Uncaught Error: Account x@y.com already exists" or "Server Error".
// Our own functions throw ConvexError with an i18n key (errors.*) or a sentence written for players;
// Convex Auth and the network throw plain errors, which are recognised below.

const KNOWN: [RegExp, string][] = [
  [/Account .+ already exists/i, 'errors.emailTaken'],
  [/InvalidSecret|InvalidAccountId|Invalid credentials/i, 'errors.invalidCredentials'], // same for both: no account enumeration
  [/Could not verify code|Invalid code|Invalid verification code/i, 'errors.codeInvalid'],
  [/TooManyFailedAttempts|Too many/i, 'errors.tooManyAttempts'],
  [/Invalid password/i, 'errors.passwordShort'],
  [/auth required|not signed in|unauthenticated|not authenticated/i, 'errors.signInRequired'],
  [/^forbidden$/i, 'errors.forbidden'],
  [/account banned|suspended/i, 'errors.suspended'],
  [/Failed to fetch|NetworkError|fetch failed|network|connection lost|WebSocket/i, 'errors.offline'],
];

/** The i18n key for an error message (an errors.* key passes straight through). */
export function errorKeyFor(raw: string): string {
  const key = raw.match(/errors\.\w+/)?.[0];
  if (key) return key;
  return KNOWN.find(([re]) => re.test(raw))?.[1] ?? 'errors.generic';
}

/** What to show a player for an error thrown by a Convex query, mutation or action. */
export function playerMessage(e: unknown): string {
  const data = e && typeof e === 'object' && 'data' in e ? (e as { data: unknown }).data : undefined; // ConvexError
  if (typeof data === 'string') {
    const key = errorKeyFor(data);
    if (key !== 'errors.generic') return t(key);
    // Sentences our functions write for players ("Room ABC123 is full (4 players).") are shown as they are.
    if (/^[A-Z0-9][^\n]{3,200}[.!?)]$/.test(data.trim())) return data.trim();
    return t('errors.generic');
  }
  return t(errorKeyFor(e instanceof Error ? e.message : String(e ?? '')));
}
