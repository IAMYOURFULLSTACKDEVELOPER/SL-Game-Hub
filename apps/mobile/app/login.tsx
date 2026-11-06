import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { isEmail, t } from '@slgh/shared';
import { supabase } from '@/supabase';
import { Banner, Button, Field, Screen } from '@/ui';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!isEmail(email.trim()) || !password) { setErr(t('errors.invalidCredentials')); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message.toLowerCase().includes('fetch') ? t('common.offline') : t('errors.invalidCredentials'));
    else router.replace('/');
  }
  return (
    <Screen>
      <Banner text={err} />
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Field label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      <Button title={t('auth.submitSignIn')} onPress={submit} loading={busy} />
      <Button variant="outline" title={t('auth.forgot')} onPress={() => router.push('/forgot-password')} />
      <Button variant="outline" title={t('auth.noAccount')} onPress={() => router.push('/signup')} />
    </Screen>
  );
}
