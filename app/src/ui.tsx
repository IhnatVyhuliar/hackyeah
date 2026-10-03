// Minimalne wspólne elementy UI (bez design systemu).
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export const colors = { bg: '#F7F7F5', card: '#FFFFFF', text: '#1B1B1B', muted: '#6B6B6B', accent: '#1F6FEB', danger: '#C62828', ok: '#2E7D32' };

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function Button({ title, onPress, disabled, kind = 'primary' }:
  { title: string; onPress: () => void; disabled?: boolean; kind?: 'primary' | 'secondary' }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [s.btn, kind === 'secondary' && s.btnSecondary, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text style={[s.btnText, kind === 'secondary' && { color: colors.accent }]}>{title}</Text>
    </Pressable>
  );
}

export const Loading = () => <View style={s.center}><ActivityIndicator /></View>;

export function ErrorText({ message }: { message: string | null }) {
  return message ? <Text style={s.error}>{message}</Text> : null;
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, gap: 6 },
  h1: { fontSize: 24, fontWeight: '700', color: colors.text },
  h2: { fontSize: 17, fontWeight: '600', color: colors.text },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  big: { fontSize: 32, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  input: { backgroundColor: colors.card, borderRadius: 10, padding: 12, fontSize: 16, borderWidth: 1, borderColor: '#E0E0E0' },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.accent },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14 },
});
