import { AGE_BANDS } from './types';
import type { AgeBand } from './types';

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (s: string) => s.length <= 254 && EMAIL_RE.test(s);
export const isAgeBand = (s: string): s is AgeBand => AGE_BANDS.includes(s as AgeBand);

/** Values are i18n keys, so every client shows the same translated message. */
export type FieldErrors = Partial<Record<
  'fullName' | 'username' | 'email' | 'password' | 'confirmPassword' | 'ageBand', string>>;

export function validatePasswords(password: string, confirm: string): FieldErrors {
  const e: FieldErrors = {};
  if (password.length < 8 || password.length > 72) e.password = 'errors.passwordShort';
  else if (password !== confirm) e.confirmPassword = 'errors.passwordMismatch';
  return e;
}

export interface SignUpInput {
  fullName: string; username: string; email: string;
  password: string; confirmPassword: string; ageBand: string;
}

export function validateSignUp(i: SignUpInput): FieldErrors {
  const e: FieldErrors = {};
  const name = i.fullName.trim();
  if (name.length < 2 || name.length > 80) e.fullName = 'errors.fullNameRequired';
  if (!USERNAME_RE.test(i.username.trim())) e.username = 'errors.usernameInvalid';
  if (!isEmail(i.email.trim())) e.email = 'errors.emailInvalid';
  if (!isAgeBand(i.ageBand)) e.ageBand = 'errors.ageRequired';
  return { ...e, ...validatePasswords(i.password, i.confirmPassword) };
}
