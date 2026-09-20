import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  hero: { padding: spacing.xl, alignItems: "center" },
  heroTitle: { fontSize: 22, fontWeight: "700", color: c.onSurface, textAlign: "center", marginTop: spacing.md },
  heroSub: { color: c.muted, textAlign: "center", marginTop: spacing.sm, lineHeight: 21 },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: spacing.xl, alignItems: "center", marginTop: spacing.lg, flexDirection: "row", gap: spacing.sm },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  cardTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface, marginBottom: spacing.xs },
  cardMeta: { color: c.muted, fontSize: 12, marginBottom: spacing.sm },
  ingline: { color: c.onSurface, fontSize: 13, lineHeight: 20 },
  step: { color: c.onSurface, fontSize: 13, lineHeight: 20, marginTop: 4 },
  saveBtn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", alignSelf: "flex-start", backgroundColor: c.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, marginTop: spacing.md },
}));

export default function WhatCanICook() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const m = useMutation({
    mutationFn: async () => (await api<{ suggestions: any[] }>("/api/ai/what-can-i-cook", { method: "POST", body: JSON.stringify({}) })).suggestions,
    onSuccess: (data) => setSuggestions(data),
  });

  const saveM = useMutation({
    mutationFn: (r: any) => api("/api/recipes", { method: "POST", body: JSON.stringify(r) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Cosa cucino?</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.hero}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="sparkles" size={36} color={colors.brandPrimary} />
          </View>
          <Text style={styles.heroTitle}>3 idee dalla tua dispensa</Text>
          <Text style={styles.heroSub}>Chef AI analizza cosa hai a disposizione e ti suggerisce ricette gustose in pochi secondi.</Text>
          <Pressable testID="generate-cook" onPress={() => m.mutate()} style={styles.btn} disabled={m.isPending}>
            {m.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Ionicons name="flash" size={18} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>Genera idee</Text></>}
          </Pressable>
        </View>

        {suggestions.map((s: any, idx: number) => (
          <View key={idx} style={styles.card}>
            <Text style={styles.cardTitle}>{s.title}</Text>
            <Text style={styles.cardMeta}>⏱ {s.time_min || 20}m · 👥 {s.servings || 2}</Text>
            {(s.ingredients || []).map((i: any, k: number) => (
              <Text key={k} style={styles.ingline}>• {i.name}{i.qty ? ` — ${i.qty} ${i.unit || ""}` : ""}</Text>
            ))}
            {(s.steps || []).map((st: string, k: number) => (
              <Text key={k} style={styles.step}>{k + 1}. {st}</Text>
            ))}
            <Pressable testID={`save-suggested-${idx}`} onPress={() => saveM.mutate(s)} style={styles.saveBtn}>
              <Ionicons name="bookmark" size={14} color={colors.brandPrimary} />
              <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Salva nel ricettario</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
