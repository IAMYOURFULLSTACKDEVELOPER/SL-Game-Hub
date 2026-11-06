import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { t } from '@slgh/shared';
import { useColors } from '@/theme';

const icon = (e: string) => () => <Text style={{ fontSize: 22 }}>{e}</Text>;

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 60 },
      tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted, tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: t('nav.home'), tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="games" options={{ title: t('nav.games'), tabBarIcon: icon('🎮') }} />
      <Tabs.Screen name="profile" options={{ title: t('nav.profile'), tabBarIcon: icon('🙂') }} />
    </Tabs>
  );
}
