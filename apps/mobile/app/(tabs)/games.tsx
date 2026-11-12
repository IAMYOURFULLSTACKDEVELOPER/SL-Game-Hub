import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from 'convex/react';
import { t } from '@slgh/shared';
import { api } from '@/convex';
import { GameCard } from '@/GameCard';
import { Card, Chip, Field, Loading, Screen, Txt } from '@/ui';

export default function Library() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [cat, setCat] = useState('');
  const [mode, setMode] = useState<'' | 'single' | 'multi'>('');
  const cats = useQuery(api.games.categories) ?? [];

  useEffect(() => {                              // debounce: fewer requests on slow data
    const h = setTimeout(() => setTerm(q.trim().slice(0, 40)), 300);
    return () => clearTimeout(h);
  }, [q]);
  const games = useQuery(api.games.list, { q: term || undefined, category: cat || undefined, mode: mode || undefined });

  return (
    <Screen>
      <Field label={t('library.searchLabel')} placeholder={t('library.searchPlaceholder')} value={q} onChangeText={setQ} returnKeyType="search" autoCapitalize="none" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={t('library.all')} selected={!cat} onPress={() => setCat('')} />
        {cats.map((c) => <Chip key={c.slug} label={c.name} selected={cat === c.slug} onPress={() => setCat(c.slug)} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={t('library.all')} selected={!mode} onPress={() => setMode('')} />
        <Chip label={t('library.single')} selected={mode === 'single'} onPress={() => setMode('single')} />
        <Chip label={t('library.multi')} selected={mode === 'multi'} onPress={() => setMode('multi')} />
      </View>
      {games === undefined ? <Loading />
        : games.length === 0 ? <Card><Txt muted>{t('library.empty')}</Txt></Card>
        : games.map((g) => <GameCard key={g.id} g={g} />)}
    </Screen>
  );
}
