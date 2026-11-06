import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, TextInputProps, View } from 'react-native';
import { t } from '@slgh/shared';
import { useColors } from './theme';

export function Screen({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}
export function Txt({ children, size = 17, bold, muted, color, lines }: { children: React.ReactNode; size?: number; bold?: boolean; muted?: boolean; color?: string; lines?: number }) {
  const c = useColors();
  return <Text numberOfLines={lines} style={{ fontSize: size, fontWeight: bold ? '700' : '400', color: color ?? (muted ? c.muted : c.text) }}>{children}</Text>;
}
export function Button({ title, onPress, variant = 'primary', loading, disabled }: { title: string; onPress: () => void; variant?: 'primary' | 'outline'; loading?: boolean; disabled?: boolean }) {
  const c = useColors();
  const primary = variant === 'primary';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading}
      style={{ minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
        backgroundColor: primary ? c.primary : c.surface, borderWidth: primary ? 0 : 2, borderColor: c.border, opacity: disabled ? 0.5 : 1 }}>
      {loading ? <ActivityIndicator color={primary ? c.onPrimary : c.text} />
        : <Text style={{ fontSize: 17, fontWeight: '700', color: primary ? c.onPrimary : c.text }}>{title}</Text>}
    </Pressable>
  );
}
export function Field({ label, hint, ...p }: { label: string; hint?: string } & TextInputProps) {
  const c = useColors();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontWeight: '600', fontSize: 16, color: c.text }}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={c.muted} {...p}
        style={{ minHeight: 48, borderWidth: 2, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 17, color: c.text, backgroundColor: c.surface }} />
      {hint ? <Text style={{ fontSize: 14, color: c.muted }}>{hint}</Text> : null}
    </View>
  );
}
export function Banner({ text, kind = 'error' }: { text?: string | null; kind?: 'error' | 'ok' }) {
  const c = useColors();
  if (!text) return null;
  const col = kind === 'error' ? c.danger : c.primary;
  return <Text accessibilityRole="alert" style={{ borderWidth: 2, borderColor: col, color: col, borderRadius: 10, padding: 12, fontWeight: '600', fontSize: 16 }}>{text}</Text>;
}
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, borderWidth: 2,
        borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primary : c.surface }}>
      <Text style={{ fontWeight: '600', color: selected ? c.onPrimary : c.text }}>{label}</Text>
    </Pressable>
  );
}
export const Card = ({ children }: { children: React.ReactNode }) => {
  const c = useColors();
  return <View style={{ borderWidth: 2, borderColor: c.border, backgroundColor: c.surface, borderRadius: 12, padding: 14, gap: 8 }}>{children}</View>;
};
export const Loading = () => <Txt muted>{t('common.loading')}</Txt>;
