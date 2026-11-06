import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { t } from '@slgh/shared';
import { supabase } from '@/supabase';
import { useAuth } from '@/auth';
import { GAME_COLS, type GameRow } from '@/games';
import { GameCard } from '@/GameCard';
import { Banner, Button, Card, Loading, Screen, Txt } from '@/ui';

export default function Home() {
  const router = useRouter();
  const { me } = useAuth();
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [recent, setRecent] = useState<GameRow[]>([]);
  const [err, setErr] = useState('');

  useFocusEffect(useCallback(() => {
    let live = true;
    (async () => {
      const g = await supabase.from('games').select(`${GAME_COLS}, categories(slug,name)`).eq('status', 'published').order('sort_order').limit(8);
      if (!live) return;
      if (g.error) { setErr(t('common.offline')); return; }
      setErr(''); setGames(g.data as unknown as GameRow[]);
      if (me) {
        const r = await supabase.from('game_stats').select(`last_played_at, games!inner(${GAME_COLS}, status, categories(slug,name))`)
          .eq('user_id', me.id).eq('games.status', 'published').order('last_played_at', { ascending: false }).limit(4);
        if (live) setRecent(((r.data ?? []) as unknown as { games: GameRow }[]).map((x) => x.games));
      } else setRecent([]);
    })();
    return () => { live = false; };
  }, [me]));

  return (
    <Screen>
      <Card>
        <Txt size={26} bold>{t('home.heroTitle')}</Txt>
        <Txt muted>{t('home.heroText')}</Txt>
        <Button title={t('home.browseAll')} onPress={() => router.push('/games')} />
      </Card>
      <Banner text={err} />
      {recent.length > 0 && (<><Txt size={20} bold>{t('home.recent')}</Txt>{recent.map((g) => <GameCard key={g.id} g={g} />)}</>)}
      <Txt size={20} bold>{t('home.featured')}</Txt>
      {games === null && !err ? <Loading /> : games?.map((g) => <GameCard key={g.id} g={g} />)}
    </Screen>
  );
}
