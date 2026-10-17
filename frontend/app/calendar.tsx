import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useMembers, memberLabel } from "@/src/use-members";
import { MealEditor, ALL_SLOTS, SLOT_ICON, SLOT_LABEL } from "@/src/components/MealEditor";
import { Appear, Enter } from "@/src/components/ui";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  day: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, marginBottom: spacing.md, marginHorizontal: spacing.lg },
  dayLabel: { fontWeight: "700", color: c.onSurface, fontSize: 15, marginBottom: spacing.sm, textTransform: "capitalize" },
  slotBlock: { paddingVertical: 4 },
  slotHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  slotLabel: { color: c.muted, textTransform: "capitalize", width: 72 },
  slotTitle: { color: c.onSurface, fontWeight: "600", flex: 1, textAlign: "right", marginLeft: spacing.md },
  mealLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: 22, paddingVertical: 3 },
  whoTag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: c.surface },
  whoTagPersonal: { backgroundColor: c.brandPrimary },
  whoTagTxt: { color: c.muted, fontSize: 10, fontWeight: "700" },
  shopBar: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: c.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  shopBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 12 },
  shopBtnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  shopRes: { color: c.onBrandTertiary, fontSize: 13, textAlign: "center" },
  memberRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.md },
  memberChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary },
  memberChipOn: { backgroundColor: c.brandPrimary },
  memberTxt: { color: c.onSurface, fontWeight: "700", fontSize: 13 },
  avatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: c.onBrandSecondary, fontSize: 11, fontWeight: "800" },
  memberBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: spacing.md },
  memberBannerTxt: { color: c.onBrandTertiary, fontSize: 13, lineHeight: 18 },
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

  const weekEnd = ymd(days[6]);
  const weekRecipeMeals = (q.data || []).filter((m: any) => m.recipe_id && m.date <= weekEnd).length;
  const qc = useQueryClient();
  const { user } = useAuth();
  const { members, hasFamily } = useMembers();
  const params = useLocalSearchParams<{ member?: string }>();
  // Member filter: "Tutti" shows everything; a member shows their personal meals + the shared family meals.
  const [viewMember, setViewMember] = useState<string | null>(params.member || null);
  const grouped: Record<string, any[]> = {};
  for (const m of q.data || []) {
    if (viewMember && m.member_id && m.member_id !== viewMember) continue;
    (grouped[m.date] = grouped[m.date] || []).push(m);
  }
  const viewMemberObj = members.find((m) => m.user_id === viewMember);
  const [editing, setEditing] = useState<{ date: string; slot: string; meal?: any; memberId: string | null } | null>(null);
  const shopM = useMutation({
    mutationFn: () => api<{ added: any[]; in_pantry: string[]; already_listed: string[] }>("/api/meals/to-shopping", { method: "POST", body: JSON.stringify({ start: startStr, end: weekEnd }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Calendario pasti</Text>
        <Pressable testID="ai-plan-cal" onPress={() => router.push("/weekly-plan")} style={{ marginRight: spacing.sm }}><Ionicons name="sparkles" size={24} color={colors.brandSecondary} /></Pressable>
        <Pressable testID="add-meal-cal" onPress={() => router.push("/add-meal")}><Ionicons name="add-circle" size={28} color={colors.brandPrimary} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {hasFamily && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow} testID="calendar-members">
            <Pressable testID="cal-member-all" onPress={() => setViewMember(null)} style={[styles.memberChip, !viewMember && styles.memberChipOn]}>
              <Ionicons name="people" size={14} color={!viewMember ? colors.onBrandPrimary : colors.muted} />
              <Text style={[styles.memberTxt, !viewMember && { color: colors.onBrandPrimary }]}>Tutti</Text>
            </Pressable>
            {members.map((m) => {
              const on = viewMember === m.user_id;
              return (
                <Pressable key={m.user_id} testID={`cal-member-${m.user_id}`} onPress={() => setViewMember(on ? null : m.user_id)} style={[styles.memberChip, on && styles.memberChipOn]}>
                  <View style={[styles.avatar, on && { backgroundColor: colors.onBrandPrimary }]}><Text style={[styles.avatarTxt, on && { color: colors.brandPrimary }]}>{(m.name || m.email)[0].toUpperCase()}</Text></View>
                  <Text style={[styles.memberTxt, on && { color: colors.onBrandPrimary }]}>{memberLabel(m, user?.user_id)}</Text>
                  {!!(m.diet || "").trim() && <Ionicons name="leaf" size={12} color={on ? colors.onBrandPrimary : colors.brandPrimary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {viewMemberObj && (
          <Appear style={styles.memberBanner}>
            <Text style={styles.memberBannerTxt}>I pasti di <Text style={{ fontWeight: "800" }}>{memberLabel(viewMemberObj, user?.user_id)}</Text>: i suoi piatti personali più quelli di famiglia.{(viewMemberObj.diet || "").trim() ? `\n🌿 Dieta: ${viewMemberObj.diet}` : ""}</Text>
          </Appear>
        )}
        {weekRecipeMeals > 0 && (
          <View style={styles.shopBar} testID="week-shop-bar">
            <Text style={{ color: colors.onBrandTertiary, fontWeight: "700" }}>Spesa della settimana</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{weekRecipeMeals} pasti con ricetta nei prossimi 7 giorni. Unisco gli ingredienti, tolgo ciò che hai già in dispensa.</Text>
            <Pressable testID="week-to-shopping" style={styles.shopBtn} onPress={() => shopM.mutate()} disabled={shopM.isPending}>
              {shopM.isPending ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Ionicons name="cart" size={18} color={colors.onBrandPrimary} />}
              <Text style={styles.shopBtnTxt}>Crea lista della spesa</Text>
            </Pressable>
            {shopM.data && (
              <Pressable onPress={() => router.push("/(tabs)/spesa")} testID="week-shop-result">
                <Text style={styles.shopRes}>
                  {shopM.data.added.length > 0 ? `${shopM.data.added.length} articoli aggiunti` : "Nulla da aggiungere"}
                  {shopM.data.in_pantry.length > 0 ? ` · ${shopM.data.in_pantry.length} già in dispensa` : ""}
                  {shopM.data.already_listed.length > 0 ? ` · ${shopM.data.already_listed.length} già in lista` : ""}
                  {shopM.data.added.length > 0 ? "  →  Vai alla spesa" : ""}
                </Text>
              </Pressable>
            )}
            {shopM.isError && <Text style={[styles.shopRes, { color: colors.error }]}>Errore, riprova</Text>}
          </View>
        )}
        {days.map((d, di) => {
          const key = ymd(d);
          const meals = grouped[key] || [];
          return (
            <Enter key={`${key}-${viewMember || "all"}`} index={di}>
            <View testID={`day-${key}`} style={styles.day}>
              <Text style={styles.dayLabel}>{DAY_NAMES[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}</Text>
              {ALL_SLOTS.map((slot) => {
                const inSlot = meals.filter((x: any) => x.slot === slot).sort((a: any, b: any) => (a.member_id ? 1 : 0) - (b.member_id ? 1 : 0));
                return (
                  <View key={slot} style={styles.slotBlock}>
                    <View style={styles.slotHead}>
                      <Ionicons name={SLOT_ICON[slot] as any} size={14} color={inSlot.length ? colors.brandPrimary : colors.muted} />
                      <Text style={styles.slotLabel}>{SLOT_LABEL[slot]}</Text>
                      {inSlot.length === 0 && (
                        <Pressable testID={`empty-${key}-${slot}`} style={{ flex: 1 }} onPress={() => setEditing({ date: key, slot, memberId: viewMember })}>
                          <Text style={[styles.slotTitle, { color: colors.muted, fontStyle: "italic", fontWeight: "400" }]}>aggiungi…</Text>
                        </Pressable>
                      )}
                      <Pressable testID={`edit-${key}-${slot}`} onPress={() => setEditing({ date: key, slot, memberId: viewMember })} style={{ padding: 4 }} hitSlop={6}>
                        <Ionicons name="add-circle-outline" size={18} color={colors.brandSecondary} />
                      </Pressable>
                    </View>
                    {inSlot.map((m: any) => {
                      const mem = members.find((x) => x.user_id === m.member_id);
                      return (
                        <View key={m.id} style={styles.mealLine}>
                          {hasFamily && (
                            <View style={[styles.whoTag, m.member_id && styles.whoTagPersonal]}>
                              <Ionicons name={m.member_id ? "person" : "people"} size={10} color={m.member_id ? colors.onBrandPrimary : colors.muted} />
                              <Text style={[styles.whoTagTxt, m.member_id && { color: colors.onBrandPrimary }]}>{m.member_id ? memberLabel(mem, user?.user_id) : "Tutti"}</Text>
                            </View>
                          )}
                          <Pressable testID={`meal-${m.id}`} style={{ flex: 1 }} onPress={() => m.recipe_id ? router.push({ pathname: "/recipe/[id]", params: { id: m.recipe_id } }) : setEditing({ date: key, slot, meal: m, memberId: m.member_id || null })}>
                            <Text style={[styles.slotTitle, m.recipe_id && { color: colors.brandPrimary }]} numberOfLines={1}>{m.title}{m.recipe_id ? " ›" : ""}</Text>
                          </Pressable>
                          <Pressable testID={`edit-meal-${m.id}`} onPress={() => setEditing({ date: key, slot, meal: m, memberId: m.member_id || null })} style={{ padding: 4 }} hitSlop={6}>
                            <Ionicons name="create-outline" size={16} color={colors.brandSecondary} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
            </Enter>
          );
        })}
      </ScrollView>
      {editing && (
        <MealEditor
          visible
          date={editing.date}
          slot={editing.slot}
          currentTitle={editing.meal?.title}
          members={members}
          memberId={editing.memberId}
          onClose={() => setEditing(null)}
          onPick={async (p) => {
            let recipe_id = p.recipe_id;
            if (!recipe_id && p.recipe) {
              const created = await api<any>("/api/recipes", { method: "POST", body: JSON.stringify(p.recipe) });
              recipe_id = created.id;
              qc.invalidateQueries({ queryKey: ["recipes"] });
            }
            if (editing.meal) await api(`/api/meals/${editing.meal.id}`, { method: "PATCH", body: JSON.stringify({ title: p.title, recipe_id: recipe_id || null, member_id: p.member_id }) });
            else await api("/api/meals", { method: "POST", body: JSON.stringify({ date: editing.date, slot: editing.slot, title: p.title, recipe_id: recipe_id || null, notes: "", member_id: p.member_id }) });
            qc.invalidateQueries({ queryKey: ["meals"] });
          }}
          onRemove={editing.meal ? async () => { await api(`/api/meals/${editing.meal.id}`, { method: "DELETE" }); qc.invalidateQueries({ queryKey: ["meals"] }); } : undefined}
        />
      )}
    </View>
  );
}
