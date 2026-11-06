import React, { useState } from 'react';
import { isEmail, t } from '@slgh/shared';
import { supabase } from '@/supabase';
import { Banner, Button, Field, Screen } from '@/ui';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    if (isEmail(email.trim())) {
      // The link opens the website's reset page, where the new password is set.
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${process.env.EXPO_PUBLIC_SITE_URL}/auth/callback?next=/reset-password` });
    }
    setBusy(false); setSent(true);                       // same message whether or not the email exists
  }
  return (
    <Screen>
      <Banner kind="ok" text={sent ? t('notice.resetSent') : null} />
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Button title={t('auth.resetSend')} onPress={submit} loading={busy} />
    </Screen>
  );
}
