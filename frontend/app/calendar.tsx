import { View, Text, ScrollView, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  day: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, marginBottom: spacing.md, marginHorizontal: spacing.lg },
  dayLabel: { fontWeight: "700", color: c.onSurface, fontSize: 15, marginBottom: spacing.sm, textTransform: "capitalize" },
  slotRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  slotLabel: { color: c.muted, textTransform: "capitalize" },
  slotTitle: { color: c.onSurface, fontWeight: "600", flex: 1, textAlign: "right", marginLeft: spacing.md },
}));

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const DAY_NAMES = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

export default function Calendar() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const start = useMemo(() => new Date(), []);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(start, i)), [start]);
  const startStr = ymd(days[0]); const endStr = ymd(days[days.length - 1]);

  const q = useQuery({
    queryKey: ["meals", startStr, endStr],
    queryFn: async () => (await api<{ items: any[] }>(`/api/meals?start=${startStr}&end=${endStr}`)).items,
  });

  const grouped: Record<string, any[]> = {};
  for (const m of q.data || []) (grouped[m.date] = grouped[m.date] || []).push(m);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Calendario pasti</Text>
        <Pressable testID="ai-plan-cal" onPress={() => router.push("/weekly-plan")} style={{ marginRight: spacing.sm }}><Ionicons name="sparkles" size={24} color={colors.brandSecondary} /></Pressable>
        <Pressable testID="add-meal-cal" onPress={() => router.push("/add-meal")}><Ionicons name="add-circle" size={28} color={colors.brandPrimary} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {days.map((d) => {
          const key = ymd(d);
          const meals = grouped[key] || [];
          return (
            <Pressable key={key} testID={`day-${key}`} onPress={() => router.push({ pathname: "/add-meal", params: { date: key } })}>
              <View style={styles.day}>
                <Text style={styles.dayLabel}>{DAY_NAMES[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}</Text>
                {meals.length === 0 && <Text style={{ color: colors.muted, fontStyle: "italic" }}>Tocca per aggiungere un pasto</Text>}
                {meals.map((m) => (
                  <Pressable key={m.id} testID={`meal-${m.id}`} style={styles.slotRow} onPress={() => m.recipe_id ? router.push({ pathname: "/recipe/[id]", params: { id: m.recipe_id } }) : router.push({ pathname: "/add-meal", params: { date: key } })}>
                    <Text style={styles.slotLabel}>{m.slot}</Text>
                    <Text style={[styles.slotTitle, m.recipe_id && { color: colors.brandPrimary }]} numberOfLines={1}>{m.title}{m.recipe_id ? " ›" : ""}</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
