import { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, padding: 4 },
  monthBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  monthTxt: { color: c.onSurface, fontWeight: "700", textTransform: "capitalize" },
  summary: { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  sumBox: { flex: 1, backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  sumVal: { color: c.onBrandTertiary, fontWeight: "800", fontSize: 20 },
  sumLbl: { color: c.muted, fontSize: 11, marginTop: 2, textAlign: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  date: { width: 48, alignItems: "center", backgroundColor: c.surface, borderRadius: radius.md, paddingVertical: 6 },
  dateDay: { color: c.onSurface, fontWeight: "800", fontSize: 18 },
  dateMon: { color: c.muted, fontSize: 10, textTransform: "uppercase" },
  cardTitle: { color: c.onSurface, fontWeight: "700", fontSize: 15 },
  cardMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  repeat: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.brandSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  repeatTxt: { color: c.onBrandSecondary, fontWeight: "700", fontSize: 12 },
  empty: { alignItems: "center", padding: spacing.xl, marginTop: spacing.xl },
  emptyTxt: { color: c.muted, marginTop: spacing.md, textAlign: "center", lineHeight: 20 },
  toast: { position: "absolute", left: spacing.lg, right: spacing.lg, backgroundColor: c.surfaceInverse, borderRadius: radius.md, padding: spacing.lg, flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  toastTxt: { color: c.onSurfaceInverse, flex: 1, fontSize: 13 },
}));

type Entry = { id: string; recipe_id: string; title: string; servings: number; cooked_at: string; items_used: number; items_saved: number };

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const shift = (m: string, delta: number) => { const [y, mo] = m.split("-").map(Number); return ym(new Date(y, mo - 1 + delta, 1)); };
const monthLabel = (m: string) => new Date(m + "-01T12:00:00").toLocaleDateString("it-IT", { month: "long", year: "numeric" });

export default function History() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [month, setMonth] = useState(ym(new Date()));
  const [toast, setToast] = useState<string | null>(null);
  const isCurrent = month === ym(new Date());

  const q = useQuery({ queryKey: ["cook-history", month], queryFn: () => api<{ items: Entry[] }>(`/api/stats/history?month=${month}`) });

  const repeatM = useMutation({
    mutationFn: (e: Entry) => api<{ finished: string[]; items_saved: number; updated: any[] }>(`/api/recipes/${e.recipe_id}/cooked`, { method: "POST", body: JSON.stringify({ servings: e.servings }) }),
    onSuccess: (r, e) => {
      ["pantry", "pantry-all", "pantry-expiring", "shopping", "recipes", "waste-stats", "cook-history"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setToast(`${e.title} ricucinata: ${r.updated.length} ingredienti scalati${r.finished.length ? `, ${r.finished.length} finiti → spesa` : ""}`);
      setTimeout(() => setToast(null), 3500);
    },
    onError: () => { setToast("Ricetta non più disponibile"); setTimeout(() => setToast(null), 3000); },
  });

  const repeat = (e: Entry) => {
    if (Platform.OS === "web") { repeatM.mutate(e); return; }
    Alert.alert("Ricucinare?", `Scalo di nuovo gli ingredienti di "${e.title}" (${e.servings} porz.) dalla dispensa.`, [
      { text: "Annulla", style: "cancel" }, { text: "Sì, cucinato!", onPress: () => repeatM.mutate(e) },
    ]);
  };

  const items = q.data?.items || [];
  const saved = items.reduce((n, i) => n + i.items_saved, 0);
  const used = items.reduce((n, i) => n + i.items_used, 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Storico cucinato</Text>
      </View>
      <View style={styles.monthRow}>
        <Pressable testID="month-prev" style={styles.monthBtn} onPress={() => setMonth(shift(month, -1))}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable>
        <Text style={styles.monthTxt} testID="month-label">{monthLabel(month)}</Text>
        <Pressable testID="month-next" style={[styles.monthBtn, isCurrent && { opacity: 0.3 }]} disabled={isCurrent} onPress={() => setMonth(shift(month, 1))}><Ionicons name="chevron-forward" size={20} color={colors.onSurface} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {q.isLoading && <ActivityIndicator style={{ marginTop: 40 }} color={colors.brandPrimary} />}
        {!q.isLoading && items.length > 0 && (
          <View style={styles.summary}>
            <View style={styles.sumBox}><Text style={styles.sumVal} testID="sum-cooked">{items.length}</Text><Text style={styles.sumLbl}>ricette cucinate</Text></View>
            <View style={styles.sumBox}><Text style={styles.sumVal}>{used}</Text><Text style={styles.sumLbl}>ingredienti usati</Text></View>
            <View style={styles.sumBox}><Text style={[styles.sumVal, { color: colors.brandSecondary }]}>{saved}</Text><Text style={styles.sumLbl}>salvati dalla scadenza</Text></View>
          </View>
        )}
        {!q.isLoading && items.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTxt}>Nessuna ricetta cucinata a {monthLabel(month)}.{"\n"}Segna le ricette con &quot;Cucinato!&quot; per vederle qui.</Text>
          </View>
        )}
        {items.map((e) => {
          const d = new Date(e.cooked_at);
          return (
            <Pressable key={e.id} testID={`history-${e.id}`} style={styles.card} onPress={() => router.push({ pathname: "/recipe/[id]", params: { id: e.recipe_id } })}>
              <View style={styles.date}>
                <Text style={styles.dateDay}>{d.getDate()}</Text>
                <Text style={styles.dateMon}>{d.toLocaleDateString("it-IT", { month: "short" })}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{e.title}</Text>
                <Text style={styles.cardMeta}>{d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {e.servings} porz. · {e.items_used} ingr.{e.items_saved > 0 ? ` · 🎉 ${e.items_saved} salvati` : ""}</Text>
              </View>
              <Pressable testID={`repeat-${e.id}`} style={styles.repeat} onPress={() => repeat(e)} disabled={repeatM.isPending}>
                {repeatM.isPending && repeatM.variables?.id === e.id ? <ActivityIndicator size="small" color={colors.onBrandSecondary} /> : <Ionicons name="repeat" size={14} color={colors.onBrandSecondary} />}
                <Text style={styles.repeatTxt}>Ricucina</Text>
              </Pressable>
            </Pressable>
          );
        })}
      </ScrollView>
      {toast && (
        <View style={[styles.toast, { bottom: insets.bottom + spacing.lg }]} testID="history-toast">
          <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      )}
    </View>
  );
}
