import { useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Alert, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { MealEditor, SLOT_ICON, ALL_SLOTS } from "@/src/components/MealEditor";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  hero: { padding: spacing.xl, alignItems: "center" },
  heroIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 22, fontWeight: "700", color: c.onSurface, textAlign: "center", marginTop: spacing.md },
  heroSub: { color: c.muted, textAlign: "center", marginTop: spacing.sm, lineHeight: 21 },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, color: c.onSurface, width: "100%", marginTop: spacing.lg },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: spacing.xl, alignItems: "center", marginTop: spacing.md, flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  btnAccent: { backgroundColor: c.brandSecondary },
  day: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginHorizontal: spacing.lg, marginBottom: spacing.md },
  dayLabel: { fontWeight: "700", color: c.onSurface, fontSize: 15, marginBottom: spacing.sm },
  meal: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.divider },
  slotIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  slot: { color: c.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700" },
  mealTitle: { color: c.onSurface, fontWeight: "600", fontSize: 14 },
  mealMeta: { color: c.muted, fontSize: 12 },
  saveBar: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.surface, gap: spacing.sm },
  note: { color: c.muted, fontSize: 12, textAlign: "center" },
  errorTxt: { color: c.error, textAlign: "center", marginTop: spacing.md, paddingHorizontal: spacing.lg },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sectionSub: { color: c.muted, fontSize: 12 },
}));

const DAY_NAMES = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

type PlanDay = { date: string; meals: { slot: string; recipe: any }[] };
type MemberPlan = { member_id: string; name: string; diet: string; days: PlanDay[]; error?: string };
type Plan = { start_date: string; end_date: string; days: PlanDay[]; member_plans?: MemberPlan[] };

function dayLabel(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** Replace/remove one slot inside a list of plan days. */
function patchDays(days: PlanDay[], date: string, slot: string, meal: { slot: string; recipe: any } | null): PlanDay[] {
  return days.map((d) => d.date !== date ? d : { ...d, meals: [...d.meals.filter((m) => m.slot !== slot), ...(meal ? [meal] : [])].sort((a, b) => ALL_SLOTS.indexOf(a.slot) - ALL_SLOTS.indexOf(b.slot)) });
}

export default function WeeklyPlan() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [saved, setSaved] = useState<{ recipes_created: number; meals_created: number } | null>(null);
  const [editing, setEditing] = useState<{ date: string; slot: string; memberId: string | null } | null>(null);

  const genM = useMutation({
    mutationFn: () => api<Plan>("/api/ai/weekly-plan", { method: "POST", body: JSON.stringify({ preferences: prefs }) }),
    onSuccess: (p) => { setPlan(p); setSaved(null); },
  });

  const saveM = useMutation({
    mutationFn: () => api<{ recipes_created: number; meals_created: number; start_date: string; end_date: string }>("/api/ai/weekly-plan/save", { method: "POST", body: JSON.stringify({ days: plan!.days, member_plans: (plan!.member_plans || []).map((mp) => ({ member_id: mp.member_id, days: mp.days })), replace: true }) }),
    onSuccess: (r) => {
      setSaved(r);
      qc.invalidateQueries({ queryKey: ["meals"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const shopM = useMutation({
    mutationFn: () => api<{ added: any[]; in_pantry: string[]; already_listed: string[] }>("/api/meals/to-shopping", { method: "POST", body: JSON.stringify({ start: plan!.start_date, end: plan!.end_date }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });

  const confirmSave = () => {
    if (!plan) return;
    if (Platform.OS === "web") { saveM.mutate(); return; }
    Alert.alert("Salvare il piano?", "I pasti già pianificati in questi 7 giorni verranno sostituiti. Le ricette saranno aggiunte al ricettario.", [
      { text: "Annulla", style: "cancel" },
      { text: "Salva", onPress: () => saveM.mutate() },
    ]);
  };

  const memberPlans = plan?.member_plans || [];
  const totalMeals = (plan?.days.reduce((n, d) => n + d.meals.length, 0) || 0) + memberPlans.reduce((n, mp) => n + mp.days.reduce((k, d) => k + d.meals.length, 0), 0);

  const renderDays = (days: PlanDay[], memberId: string | null, prefix: string) => days.map((d) => (
    <View key={`${prefix}-${d.date}`} style={styles.day} testID={`${prefix}-day-${d.date}`}>
      <Text style={styles.dayLabel}>{dayLabel(d.date)}</Text>
      {ALL_SLOTS.map((slot) => {
        const m = d.meals.find((x) => x.slot === slot);
        return (
          <Pressable key={slot} testID={`${prefix}-meal-${d.date}-${slot}`} style={styles.meal} onPress={() => !saved && setEditing({ date: d.date, slot, memberId })} disabled={!!saved}>
            <View style={styles.slotIcon}><Ionicons name={(SLOT_ICON[slot] || "restaurant-outline") as any} size={16} color={m ? colors.brandPrimary : colors.muted} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.slot}>{slot}</Text>
              {m ? (
                <>
                  <Text style={styles.mealTitle}>{m.recipe.title}</Text>
                  <Text style={styles.mealMeta}>⏱ {m.recipe.time_min} min · {m.recipe.ingredients?.length || 0} ingredienti</Text>
                </>
              ) : <Text style={[styles.mealMeta, { fontStyle: "italic" }]}>nessuno · tocca per aggiungere</Text>}
            </View>
            {!saved && <Ionicons name={m ? "create-outline" : "add-circle-outline"} size={18} color={colors.brandSecondary} />}
          </Pressable>
        );
      })}
    </View>
  ));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Piano settimanale AI</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {!plan && (
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Ionicons name="calendar" size={36} color={colors.brandPrimary} /></View>
            <Text style={styles.heroTitle}>7 giorni, 28 pasti, zero sprechi</Text>
            <Text style={styles.heroSub}>Chef AI legge la tua dispensa e crea colazione, pranzo, cena e spuntino per la settimana; poi puoi cambiare ogni pasto come vuoi. Chi in famiglia ha impostato una dieta riceve un menu separato, senza cambiare quello degli altri.</Text>
            <TextInput testID="plan-prefs" placeholder="Preferenze (es. vegetariano, veloce, senza glutine)" placeholderTextColor={colors.muted} value={prefs} onChangeText={setPrefs} style={styles.input} />
            <Pressable testID="generate-plan" onPress={() => genM.mutate()} style={styles.btn} disabled={genM.isPending}>
              {genM.isPending ? <><ActivityIndicator color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>Sto cucinando il piano… (~20s)</Text></> : <><Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>Genera il piano</Text></>}
            </Pressable>
            {genM.isError && <Text style={styles.errorTxt} testID="plan-error">{(genM.error as any)?.message || "Errore, riprova"}</Text>}
          </View>
        )}

        {plan && (
          <>
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ color: colors.muted, flex: 1 }}>{totalMeals} pasti · dal {dayLabel(plan.start_date)} al {dayLabel(plan.end_date)}</Text>
              <Pressable testID="regenerate-plan" onPress={() => genM.mutate()} disabled={genM.isPending} style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                {genM.isPending ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Ionicons name="refresh" size={16} color={colors.brandPrimary} />}
                <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 13 }}>Rigenera</Text>
              </Pressable>
            </View>
            {!saved && <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>Tocca un pasto per cambiarlo con Chef AI o dal ricettario.</Text>}
            {memberPlans.length > 0 && (
              <View style={styles.sectionHead} testID="plan-section-common">
                <Ionicons name="people" size={16} color={colors.brandPrimary} />
                <Text style={styles.sectionTitle}>Menu della famiglia</Text>
              </View>
            )}
            {renderDays(plan.days, null, "plan")}
            {memberPlans.map((mp) => (
              <View key={mp.member_id} testID={`plan-member-${mp.member_id}`}>
                <View style={styles.sectionHead}>
                  <Ionicons name="leaf" size={16} color={colors.brandPrimary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Menu di {mp.name}</Text>
                    <Text style={styles.sectionSub} numberOfLines={2}>Dieta: {mp.diet}</Text>
                  </View>
                </View>
                {mp.error && mp.days.length === 0 && <Text style={styles.errorTxt}>{mp.error}. Rigenera il piano per riprovare.</Text>}
                {renderDays(mp.days, mp.member_id, `plan-${mp.member_id}`)}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {editing && plan && (
        <MealEditor
          visible
          date={editing.date}
          slot={editing.slot}
          memberId={editing.memberId}
          currentTitle={(editing.memberId ? memberPlans.find((mp) => mp.member_id === editing.memberId)?.days : plan.days)?.find((d) => d.date === editing.date)?.meals.find((m) => m.slot === editing.slot)?.recipe.title}
          onClose={() => setEditing(null)}
          onPick={async (p) => {
            let recipe = p.recipe;
            if (!recipe && p.recipe_id) recipe = await api<any>(`/api/recipes/${p.recipe_id}`);
            const meal = { slot: editing.slot, recipe: { ...recipe, title: p.title } };
            setPlan((prev) => prev && (editing.memberId
              ? { ...prev, member_plans: (prev.member_plans || []).map((mp) => mp.member_id !== editing.memberId ? mp : { ...mp, days: patchDays(mp.days, editing.date, editing.slot, meal) }) }
              : { ...prev, days: patchDays(prev.days, editing.date, editing.slot, meal) }));
          }}
          onRemove={() => setPlan((prev) => prev && (editing.memberId
            ? { ...prev, member_plans: (prev.member_plans || []).map((mp) => mp.member_id !== editing.memberId ? mp : { ...mp, days: patchDays(mp.days, editing.date, editing.slot, null) }) }
            : { ...prev, days: patchDays(prev.days, editing.date, editing.slot, null) }))}
        />
      )}
      {plan && (
        <View style={[styles.saveBar, { paddingBottom: insets.bottom + spacing.md }]}>
          {saved ? (
            <>
              <Text style={[styles.note, { color: colors.brandPrimary, fontWeight: "700" }]} testID="plan-saved">Salvato: {saved.meals_created} pasti nel calendario, {saved.recipes_created} nuove ricette</Text>
              {shopM.data ? (
                <Pressable testID="plan-shop-result" onPress={() => router.replace("/(tabs)/spesa")} style={[styles.btn, { marginTop: 0 }]}>
                  <Ionicons name="cart" size={18} color={colors.onBrandPrimary} />
                  <Text style={styles.btnTxt}>{shopM.data.added.length} articoli in lista · Vai alla spesa</Text>
                </Pressable>
              ) : (
                <Pressable testID="plan-to-shopping" onPress={() => shopM.mutate()} style={[styles.btn, styles.btnAccent, { marginTop: 0 }]} disabled={shopM.isPending}>
                  {shopM.isPending ? <ActivityIndicator color={colors.onBrandSecondary} /> : <><Ionicons name="cart-outline" size={18} color={colors.onBrandSecondary} /><Text style={[styles.btnTxt, { color: colors.onBrandSecondary }]}>Crea lista della spesa</Text></>}
                </Pressable>
              )}
              {shopM.isError && <Text style={styles.errorTxt}>Errore nella lista, riprova</Text>}
              <Pressable testID="go-calendar" onPress={() => router.replace("/calendar")} style={[styles.btn, { marginTop: 0, backgroundColor: colors.brandTertiary }]}><Ionicons name="calendar-outline" size={18} color={colors.brandPrimary} /><Text style={[styles.btnTxt, { color: colors.brandPrimary }]}>Apri il calendario</Text></Pressable>
            </>
          ) : (
            <>
              <Pressable testID="save-plan" onPress={confirmSave} style={[styles.btn, styles.btnAccent, { marginTop: 0 }]} disabled={saveM.isPending}>
                {saveM.isPending ? <ActivityIndicator color={colors.onBrandSecondary} /> : <><Ionicons name="save-outline" size={18} color={colors.onBrandSecondary} /><Text style={[styles.btnTxt, { color: colors.onBrandSecondary }]}>Salva nel calendario</Text></>}
              </Pressable>
              <Text style={styles.note}>Sostituisce i pasti già pianificati in questi 7 giorni</Text>
              {saveM.isError && <Text style={styles.errorTxt}>{(saveM.error as any)?.message || "Errore nel salvataggio"}</Text>}
            </>
          )}
        </View>
      )}
    </View>
  );
}
