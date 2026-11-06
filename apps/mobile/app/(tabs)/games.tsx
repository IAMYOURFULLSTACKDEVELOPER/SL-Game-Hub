import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { t } from '@slgh/shared';
import { supabase } from '@/supabase';
import { GAME_COLS, type GameRow } from '@/games';
import { GameCard } from '@/GameCard';
import { Banner, Card, Chip, Field, Loading, Screen, Txt } from '@/ui';

type Cat = { slug: string; name: string };

export default function Library() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [mode, setMode] = useState<'' | 'single' | 'multi'>('');
  const [cats, setCats] = useState<Cat[]>([]);
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { supabase.from('categories').select('slug,name').order('sort_order').then((r) => setCats((r.data ?? []) as Cat[])); }, []);

  useEffect(() => {
    let live = true;
    const h = setTimeout(async () => {           // debounce: fewer requests on slow data
      const term = q.replace(/[%,()*_\\]/g, ' ').trim().slice(0, 40);
      let query = supabase.from('games').select(`${GAME_COLS}, categories!inner(slug,name)`).eq('status', 'published').order('sort_order');
      if (term) query = query.ilike('name', `%${term}%`);
      if (cat) query = query.eq('categories.slug', cat);
      if (mode) query = query.contains('modes', [mode]);
      const { data, error } = await query;
      if (!live) return;
      if (error) setErr(t('common.offline')); else { setErr(''); setGames(data as unknown as GameRow[]); }
    }, 300);
    return () => { live = false; clearTimeout(h); };
  }, [q, cat, mode]);

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
      <Banner text={err} />
      {games === null && !err ? <Loading />
        : games?.length === 0 ? <Card><Txt muted>{t('library.empty')}</Txt></Card>
        : games?.map((g) => <GameCard key={g.id} g={g} />)}
    </Screen>
  );
}
