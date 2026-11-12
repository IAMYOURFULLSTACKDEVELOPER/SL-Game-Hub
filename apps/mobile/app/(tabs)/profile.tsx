import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AVATARS, USERNAME_RE, avatarEmoji, t } from '@slgh/shared';
import { api } from '@/convex';
import { authErrorKey, useAuth } from '@/auth';
import { useColors } from '@/theme';
import { Banner, Button, Card, Chip, Field, Loading, Screen, Txt } from '@/ui';


export default function Profile() {
  const router = useRouter();
  const c = useColors();
  const { me, loading } = useAuth();
  const { signOut } = useAuthActions();
  const updateProfile = useMutation(api.users.updateProfile);
  const districts = useQuery(api.games.districts) ?? [];
  const stats = useQuery(api.games.myStats, me ? {} : 'skip') ?? [];
  const [f, setF] = useState({ fullName: '', username: '', avatar: 'av_lion', districtId: null as string | null, isPublic: true });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    setF({ fullName: me.full_name, username: me.username, avatar: me.avatar, districtId: me.district_id, isPublic: me.is_public });
  }, [me]);

  if (loading) return <Screen><Loading /></Screen>;
  if (!me) return (
    <Screen><Card><Txt>{t('profile.signInPrompt')}</Txt>
      <Button title={t('nav.signIn')} onPress={() => router.push('/login')} />
      <Button variant="outline" title={t('nav.signUp')} onPress={() => router.push('/signup')} /></Card></Screen>);

  const under13 = me.age_band === 'under_13';
  async function save() {
    setOk(''); setErr('');
    if (f.fullName.trim().length < 2) { setErr(t('errors.fullNameRequired')); return; }
    if (!USERNAME_RE.test(f.username.trim())) { setErr(t('errors.usernameInvalid')); return; }
    setBusy(true);
    try {
      await updateProfile({
        full_name: f.fullName.trim(), username: f.username.trim(), avatar: f.avatar, district_id: f.districtId,
        is_public: under13 ? false : f.isPublic,
      });
      setOk(t('notice.profileSaved'));
    } catch (e) {
      setErr(t(authErrorKey(e)));
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontSize: 56 }}>{avatarEmoji(me.avatar)}</Text><Txt size={26} bold>{me.username}</Txt>
      </View>
      <Banner text={err} /><Banner kind="ok" text={ok} />
      <Card>
        <Txt size={20} bold>{t('profile.edit')}</Txt>
        <Field label={t('auth.fullName')} value={f.fullName} onChangeText={(v) => setF({ ...f, fullName: v })} maxLength={80} />
        <Field label={t('auth.username')} value={f.username} onChangeText={(v) => setF({ ...f, username: v })} autoCapitalize="none" maxLength={20} />
        <Txt bold>{t('profile.avatar')}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {AVATARS.map((a) => (
            <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={a.id} onPress={() => setF({ ...f, avatar: a.id })}
              style={{ width: 52, height: 52, borderRadius: 10, borderWidth: f.avatar === a.id ? 4 : 2, alignItems: 'center', justifyContent: 'center',
                borderColor: f.avatar === a.id ? c.primary : c.border, backgroundColor: c.surface }}>
              <Text style={{ fontSize: 26 }}>{a.emoji}</Text></Pressable>))}
        </View>
        <Txt bold>{t('profile.district')}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={t('profile.noDistrict')} selected={f.districtId === null} onPress={() => setF({ ...f, districtId: null })} />
          {districts.map((d) => <Chip key={d.id} label={d.name} selected={f.districtId === d.id} onPress={() => setF({ ...f, districtId: d.id })} />)}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch value={under13 ? false : f.isPublic} disabled={under13} onValueChange={(v) => setF({ ...f, isPublic: v })} />
          <View style={{ flex: 1 }}><Txt>{t('profile.publicProfile')}</Txt>{under13 && <Txt size={14} muted>{t('profile.publicLocked')}</Txt>}</View>
        </View>
        <Button title={t('profile.save')} onPress={save} loading={busy} />
      </Card>
      <Card>
        <Txt size={20} bold>{t('profile.stats')}</Txt>
        {stats.length === 0 ? <Txt muted>{t('profile.noStats')}</Txt> : stats.map((s, i) => (
          <Txt key={i}>{s.games?.icon} {s.games?.name}: {t('game.played')} {s.played}, {t('game.wins')} {s.wins}, {t('game.bestScore')} {s.best_score}</Txt>))}
      </Card>
      <Button variant="outline" title={t('nav.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}
