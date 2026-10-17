import { View, Text, FlatList, Pressable, TextInput, ScrollView, RefreshControl, Modal, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState, useMemo, useEffect } from "react";
import { api } from "@/src/api";
import { resolveUrl } from "@/src/media";
import { usePullRefresh } from "@/src/use-pull-refresh";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";
import { GradientHeader, Enter, Bounce } from "@/src/components/ui";

const FALLBACK_IMG = "https://images.pexels.com/photos/1640775/pexels-photo-1640775.jpeg?w=600";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  sub: { color: c.muted, marginTop: 2 },
  search: { flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  searchInput: { flex: 1, paddingVertical: 12, color: c.onSurface },
  chipsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, flexDirection: "row" },
  chip: { paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { color: c.onSurface, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: c.onBrandPrimary },
  card: { flex: 1, height: 200, margin: spacing.xs, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceSecondary },
  cardOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, top: 0, justifyContent: "flex-end", padding: spacing.md },
  cardTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  cardMeta: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },
  fab: { position: "absolute", right: spacing.lg, backgroundColor: c.brandPrimary, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  empty: { alignItems: "center", padding: spacing.xl, marginTop: spacing.xl },
  emptyTxt: { color: c.muted, marginTop: spacing.md, textAlign: "center" },
  badge: { position: "absolute", top: 10, left: 10, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 },
  badgeTxt: { fontSize: 10, fontWeight: "700" },
  aiCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: c.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md },
  aiTitle: { color: c.onBrandTertiary, fontWeight: "700" },
  aiSub: { color: c.muted, fontSize: 12, marginTop: 2 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: "85%" },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  sheetMeta: { color: c.muted, fontSize: 12, marginTop: 4, marginBottom: spacing.md },
  sheetSection: { fontWeight: "700", color: c.onSurface, marginTop: spacing.md, marginBottom: 4 },
  sheetLine: { color: c.onSurface, fontSize: 13, lineHeight: 20 },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  btnGhost: { backgroundColor: c.surfaceSecondary, marginTop: spacing.sm },
}));

const CHIPS = ["Tutte", "Con ciò che ho", "Preferite", "Veloci", "Pasta", "Dolci"];

export default function Ricette() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [chip, setChip] = useState("Tutte");
  const qc = useQueryClient();
  const [aiRecipe, setAiRecipe] = useState<any | null>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const listQ = useQuery({
    queryKey: ["recipes", dq, chip],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dq) params.set("q", dq);
      if (chip === "Preferite") params.set("favorite", "true");
      if (chip === "Con ciò che ho") params.set("cookable", "true");
      const res = await api<{ items: any[] }>(`/api/recipes${params.toString() ? "?" + params.toString() : ""}`);
      return res.items;
    },
  });
  const pull = usePullRefresh(listQ.refetch);

  const aiM = useMutation({
    mutationFn: () => api<{ recipe: any }>("/api/ai/recipe", { method: "POST", body: JSON.stringify({ query: dq }) }),
    onSuccess: (r) => setAiRecipe(r.recipe),
  });
  const saveAiM = useMutation({
    mutationFn: (r: any) => api<any>("/api/recipes", { method: "POST", body: JSON.stringify(r) }),
    onSuccess: (saved) => { qc.invalidateQueries({ queryKey: ["recipes"] }); setAiRecipe(null); setQ(""); router.push({ pathname: "/recipe/[id]", params: { id: saved.id } }); },
  });

  const items = useMemo(() => {
    let arr = listQ.data || [];
    if (chip === "Veloci") arr = arr.filter((r) => (r.time_min || 999) <= 20);
    else if (chip === "Pasta" || chip === "Dolci") arr = arr.filter((r) => (r.tags || []).map((t: string) => t.toLowerCase()).includes(chip.toLowerCase()));
    return arr;
  }, [listQ.data, chip]);

  return (
    <View style={styles.root}>
      <GradientHeader title="Ricettario" subtitle="Le tue ricette + suggerimenti AI" paddingTop={insets.top}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput testID="recipe-search" placeholder="Cerca per titolo o ingrediente..." placeholderTextColor={colors.muted} value={q} onChangeText={setQ} style={styles.searchInput} />
          {q.length > 0 && <Pressable testID="clear-search" onPress={() => setQ("")}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable>}
        </View>
      </GradientHeader>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {CHIPS.map((label) => (
            <Pressable key={label} testID={`chip-${label}`} onPress={() => setChip(label)} style={[styles.chip, chip === label && styles.chipActive]}>
              <Text style={[styles.chipText, chip === label && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
        ListHeaderComponent={
          dq.length >= 3 ? (
            <Pressable testID="ai-recipe-card" style={styles.aiCard} onPress={() => aiM.mutate()} disabled={aiM.isPending}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" }}>
                {aiM.isPending ? <ActivityIndicator size="small" color={colors.onBrandSecondary} /> : <Ionicons name="sparkles" size={20} color={colors.onBrandSecondary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.aiTitle}>{aiM.isPending ? "Chef AI sta scrivendo…" : `Chiedi a Chef AI: "${dq}"`}</Text>
                <Text style={styles.aiSub}>{aiM.isError ? "Errore, tocca per riprovare" : "Genera una ricetta completa e salvala dopo il tuo ok"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ) : null
        }
        renderItem={({ item, index }) => (
          <Enter index={index} style={{ flex: 1 }}>
          <Bounce scale={0.97} testID={`recipe-${item.id}`} style={styles.card} onPress={() => router.push({ pathname: "/recipe/[id]", params: { id: item.id } })}>
            <Image source={resolveUrl(item.image_url) || FALLBACK_IMG} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
            <View style={styles.cardOverlay}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardMeta}>⏱ {item.time_min || 30}m · 👥 {item.servings || 2}{item.rating ? ` · ★ ${item.rating}` : ""}</Text>
            </View>
            {(item.ingredients || []).length > 0 && (
              <View style={[styles.badge, { backgroundColor: item.cookable ? colors.brandPrimary : "rgba(255,255,255,0.9)" }]} testID={`badge-${item.id}`}>
                <Ionicons name={item.cookable ? "checkmark-circle" : "basket-outline"} size={11} color={item.cookable ? colors.onBrandPrimary : colors.brandSecondary} />
                <Text style={[styles.badgeTxt, { color: item.cookable ? colors.onBrandPrimary : colors.onSurface }]}>{item.cookable ? "Fattibile" : `Mancano ${item.missing_count}`}</Text>
              </View>
            )}
            {item.favorite && (
              <View style={{ position: "absolute", top: 10, right: 10, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 20, padding: 6 }}>
                <Ionicons name="heart" size={14} color={colors.brandSecondary} />
              </View>
            )}
          </Bounce>
          </Enter>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTxt}>
              {chip === "Con ciò che ho" ? "Nessuna ricetta fattibile con la dispensa attuale.\nProva \"Cosa cucino?\" per idee AI." : `Nessuna ricetta${dq ? " per la tua ricerca" : ""}.\n${dq.length >= 3 ? "Chiedi a Chef AI qui sopra oppure tocca +." : "Tocca + per aggiungere la prima."}`}
            </Text>
          </View>
        }
      />

      <Modal visible={!!aiRecipe} animationType="slide" transparent onRequestClose={() => setAiRecipe(null)}>
        <Pressable style={styles.modalBg} onPress={() => setAiRecipe(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} testID="ai-recipe-sheet">
            {aiRecipe && (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Ionicons name="sparkles" size={18} color={colors.brandSecondary} />
                  <Text style={{ color: colors.brandSecondary, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Proposta di Chef AI</Text>
                </View>
                <Text style={styles.sheetTitle} testID="ai-recipe-title">{aiRecipe.title}</Text>
                <Text style={styles.sheetMeta}>⏱ {aiRecipe.time_min} min · 👥 {aiRecipe.servings} porzioni</Text>
                <ScrollView style={{ maxHeight: 360 }}>
                  {!!aiRecipe.description && <Text style={[styles.sheetLine, { color: colors.muted }]}>{aiRecipe.description}</Text>}
                  <Text style={styles.sheetSection}>Ingredienti ({aiRecipe.ingredients?.length || 0})</Text>
                  {(aiRecipe.ingredients || []).map((i: any, k: number) => <Text key={k} style={styles.sheetLine}>• {i.name} — {i.unit === "q.b." ? "q.b." : `${i.qty} ${i.unit}`}</Text>)}
                  <Text style={styles.sheetSection}>Procedimento</Text>
                  {(aiRecipe.steps || []).map((s: string, k: number) => <Text key={k} style={styles.sheetLine}>{k + 1}. {s}</Text>)}
                </ScrollView>
                <Pressable testID="ai-recipe-save" style={styles.btn} onPress={() => saveAiM.mutate(aiRecipe)} disabled={saveAiM.isPending}>
                  {saveAiM.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Ionicons name="bookmark" size={18} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>Ok, salva nel ricettario</Text></>}
                </Pressable>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Pressable testID="ai-recipe-retry" style={[styles.btn, styles.btnGhost, { flex: 1 }]} onPress={() => aiM.mutate()} disabled={aiM.isPending}>
                    {aiM.isPending ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Ionicons name="refresh" size={16} color={colors.brandPrimary} />}
                    <Text style={[styles.btnTxt, { color: colors.brandPrimary }]}>Un&apos;altra</Text>
                  </Pressable>
                  <Pressable testID="ai-recipe-cancel" style={[styles.btn, styles.btnGhost, { flex: 1 }]} onPress={() => setAiRecipe(null)}>
                    <Text style={[styles.btnTxt, { color: colors.onSurface }]}>No, grazie</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Bounce testID="add-recipe-fab" onPress={() => router.push("/add-recipe")} style={[styles.fab, { bottom: insets.bottom + 100 }]}>
        <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
      </Bounce>
    </View>
  );
}
