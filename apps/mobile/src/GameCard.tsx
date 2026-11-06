import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '@slgh/shared';
import type { GameRow } from './games';
import { useColors } from './theme';
import { Card, Txt } from './ui';

export const playersLabel = (g: Pick<GameRow, 'min_players' | 'max_players'>) =>
  g.max_players === 1 ? t('library.onePlayer') : t('library.players', { min: g.min_players, max: g.max_players });

export function GameCard({ g }: { g: GameRow }) {
  const router = useRouter();
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={g.name} onPress={() => router.push(`/game/${g.slug}`)}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 44 }}>{g.icon}</Text>
          <View style={{ flex: 1 }}>
            <Txt size={19} bold>{g.name}</Txt>
            <Txt size={14} muted>{g.categories?.name} · {playersLabel(g)}</Txt>
          </View>
        </View>
        <Txt size={15} lines={2}>{g.description}</Txt>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {g.modes.includes('single') && <Txt size={12} bold>{t('library.single')}</Txt>}
          {g.modes.includes('multi') && <Txt size={12} bold color={c.secondary}>{t('library.multi')}</Txt>}
          {g.coming_soon && <Txt size={12} bold>{t('library.comingSoon')}</Txt>}
        </View>
      </Card>
    </Pressable>
  );
}
