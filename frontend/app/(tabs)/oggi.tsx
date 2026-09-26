import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { syncExpiryReminder } from "@/src/reminders";
import { usePullRefresh } from "@/src/use-pull-refresh";
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
  stats: { backgroundColor: c.surfaceInverse, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl },
  statsHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  statsTitle: { color: c.onSurfaceInverse, fontWeight: "700", fontSize: 15, flex: 1 },
  statsMonth: { color: c.onSurfaceInverse, opacity: 0.7, fontSize: 12, textTransform: "capitalize" },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.md, padding: spacing.md },
  statVal: { color: c.onSurfaceInverse, fontWeight: "800", fontSize: 22 },
  statLbl: { color: c.onSurfaceInverse, opacity: 0.75, fontSize: 11, marginTop: 2 },
  statsFoot: { color: c.onSurfaceInverse, opacity: 0.8, fontSize: 12, marginTop: spacing.md, lineHeight: 17 },
  dayChip: { width: 56, paddingVertical: 8, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, alignItems: "center", gap: 2 },
  dayChipActive: { backgroundColor: c.brandPrimary },
  dayName: { color: c.muted, fontSize: 11, fontWeight: "600" },
  dayNum: { color: c.onSurface, fontSize: 18, fontWeight: "800" },
  dots: { flexDirection: "row", gap: 3, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
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
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

export default function Oggi() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const bottomChrome = insets.bottom;
  const today = todayStr();
  const [selDay, setSelDay] = useState(today);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);

  const mealsQ = useQuery({
    queryKey: ["meals", "week", today],
    queryFn: async () => {
      const res = await api<{ items: any[] }>(`/api/meals?start=${today}&end=${addDays(today, 6)}`);
      return res.items;
    },
  });
  const expiringQ = useQuery({
    queryKey: ["pantry-expiring"],
    queryFn: async () => (await api<{ items: any[] }>("/api/pantry/expiring?days=3")).items,
  });
  const shopQ = useQuery({
    queryKey: ["shopping"],
    queryFn: async () => (await api<{ items: any[] }>("/api/shopping")).items,
  });
  const statsQ = useQuery({
    queryKey: ["waste-stats"],
    queryFn: () => api<{ month: string; recipes_cooked: number; items_used: number; items_saved: number; money_saved: number; expired_now: number }>("/api/stats/waste"),
  });
  const pull = usePullRefresh(() => Promise.all([mealsQ.refetch(), expiringQ.refetch(), shopQ.refetch(), statsQ.refetch()]));

  const expiring = useMemo(() => expiringQ.data || [], [expiringQ.data]);
  const expiringCount = expiring.length;
  useEffect(() => {
    if (expiringQ.data) syncExpiryReminder(expiringQ.data).catch(() => {});
  }, [expiringQ.data]);

  const slotsData = ["colazione", "pranzo", "cena"].map((slot) => {
    const m = (mealsQ.data || []).find((x: any) => x.slot === slot && x.date === selDay);
    return { slot, meal: m };
  });
  const mealCountByDay = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of mealsQ.data || []) c[m.date] = (c[m.date] || 0) + 1;
    return c;
  }, [mealsQ.data]);
  const selLabel = selDay === today ? "Il menu di oggi" : selDay === addDays(today, 1) ? "Il menu di domani" : `Menu di ${DAY_SHORT[new Date(selDay + "T12:00:00").getDay()]} ${new Date(selDay + "T12:00:00").getDate()}`;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ ...styles.scroll, paddingTop: insets.top + spacing.sm, paddingBottom: bottomChrome + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
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

        <Pressable testID="kpi-expiring" style={[styles.kpi, expiringCount > 0 && { backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary }]} onPress={() => router.push("/(tabs)/dispensa")}>
          <View style={[styles.kpiIcon, expiringCount > 0 && { backgroundColor: colors.brandSecondary }]}>
            <Ionicons name={expiringCount > 0 ? "alert" : "time-outline"} size={22} color={expiringCount > 0 ? colors.onBrandSecondary : colors.brandSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.kpiTitle}>{expiringCount === 0 ? "Nessuna scadenza urgente" : `${expiringCount} da usare entro 3 giorni`}</Text>
            <Text style={styles.kpiSub} numberOfLines={2}>
              {expiringCount === 0
                ? "La dispensa è in ordine"
                : Array.from(new Map(expiring.map((i: any) => [i.name, i])).values()).slice(0, 3).map((i: any) => `${i.name}${i.days_left < 0 ? " (scaduto)" : i.days_left === 0 ? " (oggi)" : ` (${i.days_left}g)`}`).join(" · ") + (expiringCount > 3 ? ` +${expiringCount - 3}` : "")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{selLabel}</Text>
            <Pressable onPress={() => router.push("/calendar")}><Text style={styles.sectionLink}>Calendario →</Text></Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md, marginBottom: spacing.md }} testID="week-strip">
            {weekDays.map((d) => {
              const dt = new Date(d + "T12:00:00");
              const active = d === selDay;
              const n = mealCountByDay[d] || 0;
              return (
                <Pressable key={d} testID={`day-${d}`} onPress={() => setSelDay(d)} style={[styles.dayChip, active && styles.dayChipActive]}>
                  <Text style={[styles.dayName, active && { color: colors.onBrandPrimary }]}>{d === today ? "Oggi" : DAY_SHORT[dt.getDay()]}</Text>
                  <Text style={[styles.dayNum, active && { color: colors.onBrandPrimary }]}>{dt.getDate()}</Text>
                  <View style={styles.dots}>
                    {[0, 1, 2].map((k) => <View key={k} style={[styles.dot, k < n ? { backgroundColor: active ? colors.onBrandPrimary : colors.brandSecondary } : { backgroundColor: active ? "rgba(255,255,255,0.3)" : colors.borderStrong }]} />)}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: spacing.md }}>
            {slotsData.map(({ slot, meal }) => (
              <Pressable
                key={slot}
                testID={`slot-${slot}`}
                style={[styles.slot, !meal && styles.emptySlot]}
                onPress={() => meal?.recipe_id ? router.push({ pathname: "/recipe/[id]", params: { id: meal.recipe_id } }) : router.push({ pathname: "/add-meal", params: { date: selDay, slot } as any })}
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

        {statsQ.data && (
          <Pressable style={styles.stats} testID="waste-stats" onPress={() => router.push("/history")}>
            <View style={styles.statsHead}>
              <Ionicons name="leaf" size={18} color={colors.brandPrimary} />
              <Text style={styles.statsTitle}>Anti-spreco</Text>
              <Text style={styles.statsMonth}>{new Date(statsQ.data.month + "-01T12:00:00").toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceInverse} style={{ opacity: 0.6 }} />
            </View>
            <View style={styles.statsRow}>
              <View style={styles.stat}><Text style={styles.statVal} testID="stat-cooked">{statsQ.data.recipes_cooked}</Text><Text style={styles.statLbl}>ricette cucinate</Text></View>
              <View style={styles.stat}><Text style={styles.statVal} testID="stat-saved">{statsQ.data.items_saved}</Text><Text style={styles.statLbl}>salvati dalla scadenza</Text></View>
              <View style={styles.stat}><Text style={[styles.statVal, { color: colors.brandSecondary }]} testID="stat-money">{statsQ.data.money_saved.toFixed(2).replace(".", ",")} €</Text><Text style={styles.statLbl}>non sprecati</Text></View>
            </View>
            <Text style={styles.statsFoot}>
              {statsQ.data.recipes_cooked === 0
                ? "Segna le ricette con \"Cucinato!\" per scalare la dispensa e vedere qui i tuoi risparmi."
                : statsQ.data.expired_now > 0
                  ? `Ottimo lavoro! Occhio però: ${statsQ.data.expired_now} ${statsQ.data.expired_now === 1 ? "prodotto è già scaduto" : "prodotti sono già scaduti"} in dispensa.`
                  : "Ottimo lavoro: nessun prodotto scaduto in dispensa!"}
            </Text>
          </Pressable>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Scorciatoie</Text></View>
          <View style={styles.quickRow}>
            <Pressable testID="quick-plan" style={styles.quick} onPress={() => router.push("/weekly-plan")}>
              <View style={[styles.quickIcon, { backgroundColor: colors.brandSecondary }]}><Ionicons name="calendar" size={20} color={colors.onBrandSecondary} /></View>
              <Text style={styles.quickTitle}>Piano settimanale</Text>
              <Text style={styles.quickSub}>7 giorni con Chef AI</Text>
            </Pressable>
            <Pressable testID="quick-scan" style={styles.quick} onPress={() => router.push("/scan-barcode")}>
              <View style={styles.quickIcon}><Ionicons name="barcode" size={20} color={colors.brandPrimary} /></View>
              <Text style={styles.quickTitle}>Scansiona</Text>
              <Text style={styles.quickSub}>Aggiungi in dispensa</Text>
            </Pressable>
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
