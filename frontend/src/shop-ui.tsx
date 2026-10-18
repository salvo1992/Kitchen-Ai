import React, { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput, TextInputProps, KeyboardAvoidingView, Platform } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { makeStyles, useTheme } from './theme';
import { api } from './api';
import { useAuth } from './auth';

export const useShopStyles = makeStyles(c => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  back: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceSecondary, borderRadius: 22 },
  content: { padding: 24, paddingTop: 12, gap: 24, width: '100%', maxWidth: 700, alignSelf: 'center' },
  title: { color: c.onSurface, fontWeight: '800', fontSize: 30, letterSpacing: -0.8, lineHeight: 36 },
  h2: { color: c.onSurface, fontWeight: '700', fontSize: 22, lineHeight: 28 },
  h3: { color: c.onSurface, fontWeight: '700', fontSize: 17, lineHeight: 23 },
  body: { color: c.onSurface, fontSize: 16, lineHeight: 24 },
  muted: { color: c.muted, fontSize: 14, lineHeight: 21 },
  caption: { color: c.brandPrimary, fontWeight: '700', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 24, padding: 20, gap: 14 },
  outline: { borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 18, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  badge: { color: c.brandPrimary, backgroundColor: c.brandTertiary, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, fontWeight: '700', fontSize: 12 },
  button: { minHeight: 50, borderRadius: 25, backgroundColor: c.brandPrimary, paddingHorizontal: 20, paddingVertical: 13, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  buttonText: { color: c.onBrandPrimary, fontSize: 15, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  secondary: { backgroundColor: c.brandTertiary },
  secondaryText: { color: c.onBrandTertiary },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  input: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 16, padding: 14, fontSize: 16, color: c.onSurface, minHeight: 50 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  error: { color: c.error, fontSize: 14, lineHeight: 20, borderColor: c.error, borderWidth: 1, padding: 14, borderRadius: 14 },
  message: { color: c.onBrandTertiary, backgroundColor: c.brandTertiary, padding: 16, borderRadius: 16, fontSize: 14, lineHeight: 21 },
  line: { height: 1, backgroundColor: c.divider },
}));

export function ShopPage({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  const s = useShopStyles(); const { colors } = useTheme(); const inset = useSafeAreaInsets(); const router = useRouter();
  return <KeyboardAvoidingView testID={`${id}-screen`} style={[s.root, { paddingTop: inset.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><Pressable testID={`${id}-back`} accessibilityLabel="Indietro" accessibilityRole="button" style={s.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/oggi')}><Ionicons name="arrow-back" size={22} color={colors.onSurface} /></Pressable><Text testID={`${id}-heading`} style={s.h3}>{title}</Text></View>
    <ScrollView testID={`${id}-scroll`} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingBottom: inset.bottom + 40 }]}>{children}</ScrollView>
  </KeyboardAvoidingView>;
}

export function Action({ id, label, onPress, secondary, busy, disabled }: { id: string; label: string; onPress: () => void; secondary?: boolean; busy?: boolean; disabled?: boolean }) {
  const s = useShopStyles(); const { colors } = useTheme();
  return <Pressable testID={id} accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || busy) }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, (disabled || busy) && s.disabled, pressed && s.pressed]}>
    {busy && <ActivityIndicator color={secondary ? colors.brandPrimary : colors.onBrandPrimary} />}<Text testID={`${id}-label`} style={[s.buttonText, secondary && s.secondaryText]}>{label}</Text>
  </Pressable>;
}

export function Field({ label, testID, ...props }: TextInputProps & { label: string; testID: string }) {
  const s = useShopStyles(); const { colors } = useTheme();
  return <View><Text testID={`${testID}-label`} style={s.muted}>{label}</Text><TextInput {...props} testID={testID} accessibilityLabel={label} placeholderTextColor={colors.muted} style={[s.input, props.multiline && s.multiline, props.style]} /></View>;
}

export function Notice({ id, text, error = false }: { id: string; text?: string | null; error?: boolean }) {
  const s = useShopStyles();
  return text ? <Text testID={id} accessibilityRole={error ? 'alert' : undefined} style={error ? s.error : s.message}>{text}</Text> : null;
}

export function Loading({ id = 'shop-loading' }: { id?: string }) {
  const { colors } = useTheme(); return <ActivityIndicator testID={id} color={colors.brandPrimary} size="large" />;
}

export type Access = { is_admin: boolean; is_creator: boolean; application: null | { status: string; review_note?: string }; commission_percent: number };
export function useShopAccess() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['shop-access', user?.user_id], queryFn: () => api<Access>('/api/shop/access'), enabled: !!user });
}
export const money = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
export const statusLabel: Record<string, string> = { draft: 'Bozza', pending: 'In revisione', published: 'Pubblicato', rejected: 'Da rivedere', approved: 'Approvato' };
export type Course = { id: string; title: string; description: string; category: string; price_cents: number; creator_name: string; status: string; lesson_count: number; review_note?: string; completed?: string[]; saved?: boolean; lessons?: { id: string; title: string; content: string | null; preview: boolean; locked: boolean }[] };