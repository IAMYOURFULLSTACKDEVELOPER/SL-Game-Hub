import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { t } from '@slgh/shared';
import { supabase } from '@/supabase';
import { useAuth } from '@/auth';
import { GAME_COLS, type GameRow } from '@/games';
import { playersLabel } from '@/GameCard';
import { Banner, Button, Card, Loading, Screen, Txt } from '@/ui';

type Stats = { played: number; wins: number; losses: number; draws: number; best_score: number };

export default function GameDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me } = useAuth();
  const [g, setG] = useState<GameRow | null | undefined>(undefined);
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    supabase.from('games').select(`${GAME_COLS}, categories(slug,name)`).eq('slug', slug).eq('status', 'published').maybeSingle()
      .then((r) => setG((r.data as unknown as GameRow | null) ?? null));
  }, [slug]);
  useEffect(() => {
    if (!me || !g) return;
    supabase.from('game_stats').select('played,wins,losses,draws,best_score').eq('user_id', me.id).eq('game_id', g.id).maybeSingle()
      .then((r) => setS(r.data as Stats | null));
  }, [me, g]);

  if (g === undefined) return <Screen><Loading /></Screen>;
  if (g === null) return <Screen><Banner text={t('library.empty')} /></Screen>;
  const rows: [string, number][] = [['played', s?.played ?? 0], ['wins', s?.wins ?? 0], ['losses', s?.losses ?? 0], ['draws', s?.draws ?? 0], ['bestScore', s?.best_score ?? 0]];

  return (
    <Screen>
      <Stack.Screen options={{ title: g.name }} />
      <Card>
        <Txt size={56}>{g.icon}</Txt>
        <Txt size={26} bold>{g.name}</Txt>
        <Txt muted>{g.categories?.name} · {playersLabel(g)} · {t('game.version')} {g.version}</Txt>
        <Txt>{g.description}</Txt>
        {g.coming_soon ? <Banner kind="ok" text={t('game.comingSoonNote')} /> : <Button title={t('game.play')} onPress={() => {}} />}
      </Card>
      <Card>
        <Txt size={20} bold>{t('game.yourStats')}</Txt>
        {!me ? <Txt muted>{t('game.signInToTrack')}</Txt> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {rows.map(([k, v]) => <View key={k} style={{ minWidth: 70 }}><Txt size={24} bold>{String(v)}</Txt><Txt size={14} muted>{t(`game.${k}`)}</Txt></View>)}
          </View>)}
      </Card>
    </Screen>
  );
}
