import { View, Text, FlatList, Pressable, TextInput, ScrollView, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState, useMemo } from "react";
import { api } from "@/src/api";
import { usePullRefresh } from "@/src/use-pull-refresh";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const FALLBACK_IMG = "https://images.pexels.com/photos/1640775/pexels-photo-1640775.jpeg?w=600";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  sub: { color: c.muted, marginTop: 2 },
  search: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
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
}));

const CHIPS = ["Tutte", "Preferite", "Veloci", "Pasta", "Dolci"];

export default function Ricette() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("Tutte");

  const listQ = useQuery({
    queryKey: ["recipes", q, chip],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (chip === "Preferite") params.set("favorite", "true");
      const res = await api<{ items: any[] }>(`/api/recipes${params.toString() ? "?" + params.toString() : ""}`);
      return res.items;
    },
  });
  const pull = usePullRefresh(listQ.refetch);

  const items = useMemo(() => {
    let arr = listQ.data || [];
    if (chip === "Veloci") arr = arr.filter((r) => (r.time_min || 999) <= 20);
    else if (chip === "Pasta" || chip === "Dolci") arr = arr.filter((r) => (r.tags || []).map((t: string) => t.toLowerCase()).includes(chip.toLowerCase()));
    return arr;
  }, [listQ.data, chip]);

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + spacing.sm }}>
        <View style={styles.header}>
          <Text style={styles.title}>Ricettario</Text>
          <Text style={styles.sub}>Le tue ricette + suggerimenti AI</Text>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput testID="recipe-search" placeholder="Cerca ricette..." placeholderTextColor={colors.muted} value={q} onChangeText={setQ} style={styles.searchInput} />
          </View>
        </View>
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
        renderItem={({ item }) => (
          <Pressable testID={`recipe-${item.id}`} style={styles.card} onPress={() => router.push({ pathname: "/recipe/[id]", params: { id: item.id } })}>
            <Image source={item.image_url || FALLBACK_IMG} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
            <View style={styles.cardOverlay}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardMeta}>⏱ {item.time_min || 30}m · 👥 {item.servings || 2}</Text>
            </View>
            {item.favorite && (
              <View style={{ position: "absolute", top: 10, right: 10, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 20, padding: 6 }}>
                <Ionicons name="heart" size={14} color={colors.brandSecondary} />
              </View>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTxt}>Nessuna ricetta{q ? " per la tua ricerca" : ""}.{"\n"}Tocca + per aggiungere la prima.</Text>
          </View>
        }
      />

      <Pressable testID="add-recipe-fab" onPress={() => router.push("/add-recipe")} style={[styles.fab, { bottom: insets.bottom + 100 }]}>
        <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
      </Pressable>
    </View>
  );
}
