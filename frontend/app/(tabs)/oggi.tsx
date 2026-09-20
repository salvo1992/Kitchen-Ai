import { useMemo } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const HERO_IMAGES: Record<string, string> = {
  colazione: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800",
  pranzo: "https://images.pexels.com/photos/546945/pexels-photo-546945.jpeg?w=800",
  cena: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800",
};

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  greetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  greet: { fontSize: 26, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  greetSub: { color: c.muted, fontSize: 14, marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  kpi: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xl },
  kpiIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  kpiTitle: { fontWeight: "700", color: c.onSurface, fontSize: 15 },
  kpiSub: { color: c.muted, fontSize: 12, marginTop: 2 },
  section: { marginBottom: spacing.xl },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  sectionLink: { color: c.brandPrimary, fontWeight: "600", fontSize: 13 },
  slot: { width: 260, height: 180, borderRadius: radius.lg, marginRight: spacing.md, overflow: "hidden" },
  slotOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, top: 0, justifyContent: "flex-end", padding: spacing.lg },
  slotLabel: { color: "#FDFBF7", opacity: 0.85, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, fontWeight: "600" },
  slotTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginTop: 4 },
  emptySlot: { justifyContent: "center", alignItems: "center", backgroundColor: c.surfaceSecondary, borderStyle: "dashed", borderWidth: 1, borderColor: c.borderStrong },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  quick: { flexGrow: 1, minWidth: "47%", backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg },
  quickIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  quickTitle: { fontWeight: "700", color: c.onSurface },
  quickSub: { color: c.muted, fontSize: 12, marginTop: 2 },
}));

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Oggi() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const bottomChrome = insets.bottom;

  const mealsQ = useQuery({
    queryKey: ["meals", "today"],
    queryFn: async () => {
      const d = todayStr();
      const res = await api<{ items: any[] }>(`/api/meals?start=${d}&end=${d}`);
      return res.items;
    },
  });
  const pantryQ = useQuery({
    queryKey: ["pantry-all"],
    queryFn: async () => (await api<{ items: any[] }>("/api/pantry")).items,
  });
  const shopQ = useQuery({
    queryKey: ["shopping"],
    queryFn: async () => (await api<{ items: any[] }>("/api/shopping")).items,
  });

  const expiringCount = useMemo(() => {
    const items = pantryQ.data || [];
    const soon = new Date(); soon.setDate(soon.getDate() + 3);
    return items.filter((i) => i.expires_at && new Date(i.expires_at) <= soon).length;
  }, [pantryQ.data]);

  const slotsData = ["colazione", "pranzo", "cena"].map((slot) => {
    const m = (mealsQ.data || []).find((x: any) => x.slot === slot);
    return { slot, meal: m };
  });

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ ...styles.scroll, paddingTop: insets.top + spacing.sm, paddingBottom: bottomChrome + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={mealsQ.isFetching || pantryQ.isFetching} onRefresh={() => { mealsQ.refetch(); pantryQ.refetch(); shopQ.refetch(); }} />}
      >
        <View style={styles.greetRow}>
          <View>
            <Text style={styles.greet}>{greetingText()}{user?.name ? "," : ""}</Text>
            {user?.name ? <Text style={[styles.greet, { color: colors.brandSecondary }]}>{user.name} 👋</Text> : null}
            <Text style={styles.greetSub}>Cosa cuciniamo oggi?</Text>
          </View>
          <Pressable testID="settings-btn" onPress={() => router.push("/settings")} style={styles.avatar}>
            <Ionicons name="settings-outline" size={20} color={colors.brandPrimary} />
          </Pressable>
        </View>

        <Pressable testID="kpi-expiring" style={styles.kpi} onPress={() => router.push("/(tabs)/dispensa")}>
          <View style={styles.kpiIcon}>
            <Ionicons name="time-outline" size={22} color={colors.brandSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.kpiTitle}>{expiringCount === 0 ? "Nessuna scadenza urgente" : `${expiringCount} in scadenza`}</Text>
            <Text style={styles.kpiSub}>{expiringCount === 0 ? "La dispensa è in ordine" : "Tocca per vedere cosa consumare prima"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Il menu di oggi</Text>
            <Pressable onPress={() => router.push("/calendar")}><Text style={styles.sectionLink}>Calendario →</Text></Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: spacing.md }}>
            {slotsData.map(({ slot, meal }) => (
              <Pressable
                key={slot}
                testID={`slot-${slot}`}
                style={[styles.slot, !meal && styles.emptySlot]}
                onPress={() => router.push({ pathname: "/add-meal", params: { date: todayStr(), slot } as any })}
              >
                {meal ? (
                  <>
                    <Image source={HERO_IMAGES[slot]} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                    <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
                    <View style={styles.slotOverlay}>
                      <Text style={styles.slotLabel}>{slot}</Text>
                      <Text style={styles.slotTitle} numberOfLines={2}>{meal.title}</Text>
                    </View>
                  </>
                ) : (
                  <View style={{ alignItems: "center" }}>
                    <Ionicons name="add-circle-outline" size={32} color={colors.muted} />
                    <Text style={{ color: colors.muted, marginTop: 6, textTransform: "capitalize", fontWeight: "600" }}>{slot}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Pianifica</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Scorciatoie</Text></View>
          <View style={styles.quickRow}>
            <Pressable testID="quick-cook" style={styles.quick} onPress={() => router.push("/what-can-i-cook")}>
              <View style={styles.quickIcon}><Ionicons name="restaurant" size={20} color={colors.brandPrimary} /></View>
              <Text style={styles.quickTitle}>Cosa cucino?</Text>
              <Text style={styles.quickSub}>Idee dalla dispensa</Text>
            </Pressable>
            <Pressable testID="quick-list" style={styles.quick} onPress={() => router.push("/(tabs)/spesa")}>
              <View style={styles.quickIcon}><Ionicons name="cart" size={20} color={colors.brandPrimary} /></View>
              <Text style={styles.quickTitle}>Lista spesa</Text>
              <Text style={styles.quickSub}>{(shopQ.data || []).filter((x: any) => !x.checked).length} da comprare</Text>
            </Pressable>
            <Pressable testID="quick-import" style={styles.quick} onPress={() => router.push("/import-photo")}>
              <View style={styles.quickIcon}><Ionicons name="camera" size={20} color={colors.brandPrimary} /></View>
              <Text style={styles.quickTitle}>Importa piano</Text>
              <Text style={styles.quickSub}>Da foto con AI</Text>
            </Pressable>
            <Pressable testID="quick-recipe" style={styles.quick} onPress={() => router.push("/add-recipe")}>
              <View style={styles.quickIcon}><Ionicons name="book" size={20} color={colors.brandPrimary} /></View>
              <Text style={styles.quickTitle}>Nuova ricetta</Text>
              <Text style={styles.quickSub}>Salva nel ricettario</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
