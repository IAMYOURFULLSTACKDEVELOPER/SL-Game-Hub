import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { t } from '@slgh/shared';
import { AuthProvider } from '@/auth';
import { useColors } from '@/theme';

export default function RootLayout() {
  const c = useColors();
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: t('auth.signInTitle') }} />
        <Stack.Screen name="signup" options={{ title: t('auth.signUpTitle') }} />
        <Stack.Screen name="forgot-password" options={{ title: t('auth.resetTitle') }} />
        <Stack.Screen name="game/[slug]" options={{ title: '' }} />
      </Stack>
    </AuthProvider>
  );
}
