import React from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { t } from '@slgh/shared';
import { api } from '@/convex';
import { GameCard } from '@/GameCard';
import { Button, Card, Loading, Screen, Txt } from '@/ui';

export default function Home() {
  const router = useRouter();
  const games = useQuery(api.games.list, { limit: 8 });
  const recent = useQuery(api.games.recent, {}) ?? [];   // empty when signed out

  return (
    <Screen>
      <Card>
        <Txt size={26} bold>{t('home.heroTitle')}</Txt>
        <Txt muted>{t('home.heroText')}</Txt>
        <Button title={t('home.browseAll')} onPress={() => router.push('/games')} />
      </Card>
      {recent.length > 0 && (<><Txt size={20} bold>{t('home.recent')}</Txt>{recent.map((g) => <GameCard key={g.id} g={g} />)}</>)}
      <Txt size={20} bold>{t('home.featured')}</Txt>
      {games === undefined ? <Loading /> : games.map((g) => <GameCard key={g.id} g={g} />)}
    </Screen>
  );
}
