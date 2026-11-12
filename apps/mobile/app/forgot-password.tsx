import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { isEmail, t, validatePasswords } from '@slgh/shared';
import { authErrorKey } from '@/auth';
import { Banner, Button, Field, Screen } from '@/ui';

/** Step 1 emails a 6-digit code; step 2 sets the new password with it (and signs the player in). */
export default function Forgot() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true); setErr('');
    // Same answer whether or not the email has an account (no account enumeration).
    if (isEmail(email.trim())) await signIn('password', { flow: 'reset', email: email.trim() }).catch(() => {});
    setBusy(false); setSent(true);
  }
  async function reset() {
    const first = Object.values(validatePasswords(password, confirm))[0];
    if (first) { setErr(t(first)); return; }
    setBusy(true); setErr('');
    try {
      await signIn('password', { flow: 'reset-verification', email: email.trim(), code: code.trim(), newPassword: password });
      router.replace('/');
    } catch (e) {
      setErr(t(authErrorKey(e)));
    } finally { setBusy(false); }
  }
  return (
    <Screen>
      <Banner text={err} />
      <Banner kind="ok" text={sent ? t('notice.resetSent') : null} />
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Button variant={sent ? 'outline' : undefined} title={t('auth.resetSend')} onPress={send} loading={busy && !sent} />
      {sent && (<>
        <Field label={t('auth.resetCode')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
        <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" maxLength={72} />
        <Field label={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" maxLength={72} />
        <Button title={t('auth.savePassword')} onPress={reset} loading={busy} />
      </>)}
    </Screen>
  );
}
