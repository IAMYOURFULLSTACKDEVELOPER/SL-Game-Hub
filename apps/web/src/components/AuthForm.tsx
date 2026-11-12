'use client';

import { useRef, type FormEvent, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isEmail, validatePasswords, validateSignUp } from '@slgh/shared/src/validation';
import { signInWithPassword } from '@/lib/auth-client';

type Kind = 'signIn' | 'signUp' | 'requestReset' | 'resetPassword';
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').slice(0, 300);
// Only same-site relative paths are allowed as post-login destinations (prevents open redirects).
const safeNext = (n: string) => (n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : '/');
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();
const fail = (key: string | undefined) => { if (key) throw new Error(key); };

/** Where to go once the form succeeds. Throws an i18n error key when it fails. */
async function submit(kind: Kind, fd: FormData): Promise<string> {
  const email = str(fd, 'email').trim().toLowerCase();
  switch (kind) {
    case 'signIn': {
      const password = str(fd, 'password');
      if (!isEmail(email) || !password) fail('errors.invalidCredentials');
      await signInWithPassword({ flow: 'signIn', email, password });
      return safeNext(str(fd, 'next'));
    }
    case 'signUp': {
      const input = {
        fullName: str(fd, 'fullName'), username: str(fd, 'username'), email,
        password: str(fd, 'password'), confirmPassword: str(fd, 'confirmPassword'), ageBand: str(fd, 'ageBand'),
      };
      fail(Object.values(validateSignUp(input))[0]);
      await signInWithPassword({
        flow: 'signUp', email, password: input.password,
        fullName: input.fullName.trim(), username: input.username.trim(), ageBand: input.ageBand,
      });
      return '/';
    }
    case 'requestReset':
      // Same answer whether or not the email has an account (no account enumeration).
      if (isEmail(email)) await signInWithPassword({ flow: 'reset', email }).catch(() => {});
      return `/reset-password?${qs({ email, notice: 'notice.resetSent' })}`;
    case 'resetPassword': {
      const password = str(fd, 'password');
      fail(Object.values(validatePasswords(password, str(fd, 'confirmPassword')))[0]);
      await signInWithPassword({ flow: 'reset-verification', email, code: str(fd, 'code').trim(), newPassword: password });
      return '/'; // a successful reset also signs the player in
    }
  }
}

/**
 * Auth forms sign in from the browser (Convex Auth sets the session cookie via /api/auth).
 * Errors go into the URL as ?error=key, so the page's server-rendered <Flash> shows them.
 */
export function AuthForm({ kind, className, children }: { kind: Kind; className?: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const busy = useRef(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const fd = new FormData(e.currentTarget);
    try {
      router.push(await submit(kind, fd));
      router.refresh(); // re-render the header with the signed-in player
    } catch (err) {
      // Re-fill non-secret fields on error (saves retyping on slow phones). Never includes passwords.
      const keep = Object.fromEntries(['fullName', 'username', 'email', 'ageBand', 'next']
        .filter((k) => fd.get(k)).map((k) => [k, str(fd, k)]));
      router.replace(`${pathname}?${qs({ ...keep, error: (err as Error).message })}`);
    } finally {
      busy.current = false;
    }
  }
  return <form onSubmit={onSubmit} className={className} aria-live="polite">{children}</form>;
}
