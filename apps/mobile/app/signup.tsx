import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AGE_BANDS, t, validateSignUp } from '@slgh/shared';
import { supabase } from '@/supabase';
import { Banner, Button, Chip, Field, Screen, Txt } from '@/ui';

export default function SignUp() {
  const router = useRouter();
  const [f, setF] = useState({ fullName: '', username: '', email: '', password: '', confirmPassword: '', ageBand: '' });
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    setNotice('');
    const errors = validateSignUp(f);
    const first = Object.values(errors)[0];
    if (first) { setErr(t(first)); return; }
    setBusy(true); setErr('');
    const { data: free } = await supabase.rpc('username_available', { u: f.username.trim() });
    if (free === false) { setBusy(false); setErr(t('errors.usernameTaken')); return; }
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(), password: f.password,
      options: { data: { full_name: f.fullName.trim(), username: f.username.trim(), age_band: f.ageBand } },
    });
    setBusy(false);
    if (error) { setErr(t('errors.generic')); return; }
    if (data.session) router.replace('/'); else { setNotice(t('notice.checkEmail')); }
  }
  return (
    <Screen>
      <Banner text={err} />
      <Banner kind="ok" text={notice} />
      <Field label={t('auth.fullName')} value={f.fullName} onChangeText={set('fullName')} autoComplete="name" maxLength={80} />
      <Field label={t('auth.username')} hint={t('auth.usernameHint')} value={f.username} onChangeText={set('username')} autoCapitalize="none" maxLength={20} />
      <Field label={t('auth.email')} value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <View style={{ gap: 6 }}>
        <Txt bold>{t('auth.ageBand')}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {AGE_BANDS.map((b) => <Chip key={b} label={t(`auth.${b}`)} selected={f.ageBand === b} onPress={() => set('ageBand')(b)} />)}
        </View>
        <Txt size={14} muted>{t('auth.ageNote')}</Txt>
      </View>
      <Field label={t('auth.password')} hint={t('auth.passwordHint')} value={f.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" maxLength={72} />
      <Field label={t('auth.confirmPassword')} value={f.confirmPassword} onChangeText={set('confirmPassword')} secureTextEntry autoComplete="new-password" maxLength={72} />
      <Button title={t('auth.submitSignUp')} onPress={submit} loading={busy} />
      <Button variant="outline" title={t('auth.haveAccount')} onPress={() => router.replace('/login')} />
    </Screen>
  );
}
