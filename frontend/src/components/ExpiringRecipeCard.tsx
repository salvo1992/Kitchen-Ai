import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl, gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "700", color: c.onBrandTertiary, fontSize: 15 },
  sub: { color: c.onBrandTertiary, fontSize: 12, marginTop: 2, opacity: 0.85 },
  btn: { backgroundColor: c.brandSecondary, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  btnTxt: { color: c.onBrandSecondary, fontWeight: "700" },
  preview: { backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  pTitle: { color: c.onSurface, fontWeight: "700", fontSize: 16 },
  pLine: { color: c.onSurface, fontSize: 13, lineHeight: 19 },
  used: { color: c.brandPrimary, fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
  act: { flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.brandPrimary },
  actGhost: { backgroundColor: c.surfaceSecondary },
  actTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  actGhostTxt: { color: c.onSurface },
  slotRow: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: spacing.sm },
  slotChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary },
  slotChipOn: { backgroundColor: c.brandPrimary },
  slotTxt: { fontSize: 12, fontWeight: "700", color: c.onSurface },
  err: { color: c.error, fontSize: 13 },
  ok: { color: c.brandPrimary, fontWeight: "700", fontSize: 13, textAlign: "center" },
}));

type Expiring = { name: string; days_left: number };
type Result = { recipe: any; expiring: Expiring[]; used: string[] };

function today() { return new Date().toISOString().slice(0, 10); }

/** "Stanno per scadere → Chiedi al Chef una ricetta": generates one anti-waste recipe, saves it and/or plans it for today. */
export function ExpiringRecipeCard({ items }: { items: any[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [slot, setSlot] = useState<"pranzo" | "cena">(new Date().getHours() < 14 ? "pranzo" : "cena");
  const [done, setDone] = useState<string | null>(null);

  const genM = useMutation({
    mutationFn: () => api<Result>("/api/ai/expiring-recipe", { method: "POST" }),
    onSuccess: () => setDone(null),
  });

  const saveRecipe = async () => {
    const created = await api<any>("/api/recipes", { method: "POST", body: JSON.stringify(genM.data!.recipe) });
    qc.invalidateQueries({ queryKey: ["recipes"] });
    return created;
  };
  const saveM = useMutation({
    mutationFn: saveRecipe,
    onSuccess: (r) => router.push({ pathname: "/recipe/[id]", params: { id: r.id } }),
  });
  const planM = useMutation({
    mutationFn: async () => {
      const r = await saveRecipe();
      await api("/api/meals", { method: "POST", body: JSON.stringify({ date: today(), slot, title: r.title, recipe_id: r.id, notes: "Anti-spreco" }) });
      qc.invalidateQueries({ queryKey: ["meals"] });
      return r;
    },
    onSuccess: () => setDone(`Messa a ${slot} di oggi. La trovi nel menu qui sopra.`),
  });

  const names = Array.from(new Set(items.map((i) => i.name))).slice(0, 4).join(", ");
  const rec = genM.data?.recipe;
  const busy = saveM.isPending || planM.isPending;

  return (
    <View style={styles.card} testID="expiring-recipe-card">
      <View style={styles.head}>
        <View style={styles.icon}><Ionicons name="sparkles" size={20} color={colors.onBrandSecondary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Salva ciò che sta per scadere</Text>
          <Text style={styles.sub} numberOfLines={2}>Stanno per scadere: {names}{items.length > 4 ? ` +${items.length - 4}` : ""}</Text>
        </View>
      </View>

      {!rec && (
        <Pressable testID="expiring-ask-chef" style={styles.btn} onPress={() => genM.mutate()} disabled={genM.isPending}>
          {genM.isPending ? <ActivityIndicator color={colors.onBrandSecondary} /> : <Ionicons name="restaurant" size={18} color={colors.onBrandSecondary} />}
          <Text style={styles.btnTxt}>{genM.isPending ? "Chef AI sta pensando…" : "Chiedi al Chef una ricetta"}</Text>
        </Pressable>
      )}
      {genM.isError && <Text style={styles.err}>{(genM.error as any)?.message || "Errore, riprova"}</Text>}

      {rec && (
        <View style={styles.preview} testID="expiring-recipe-preview">
          <Text style={styles.pTitle}>{rec.title}</Text>
          <Text style={styles.pLine}>⏱ {rec.time_min} min · 👥 {rec.servings} porz. · {rec.ingredients?.length || 0} ingredienti</Text>
          {!!rec.description && <Text style={styles.pLine} numberOfLines={3}>{rec.description}</Text>}
          {genM.data!.used.length > 0 && <Text style={styles.used}>♻️ Usa: {genM.data!.used.join(", ")}</Text>}

          {done ? (
            <Text style={styles.ok} testID="expiring-done">{done}</Text>
          ) : (
            <>
              <View style={styles.slotRow}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Oggi a:</Text>
                {(["pranzo", "cena"] as const).map((s) => (
                  <Pressable key={s} testID={`expiring-slot-${s}`} onPress={() => setSlot(s)} style={[styles.slotChip, slot === s && styles.slotChipOn]}>
                    <Text style={[styles.slotTxt, slot === s && { color: colors.onBrandPrimary }]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.actions}>
                <Pressable testID="expiring-plan-today" style={styles.act} onPress={() => planM.mutate()} disabled={busy}>
                  {planM.isPending ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Ionicons name="calendar" size={16} color={colors.onBrandPrimary} />}
                  <Text style={styles.actTxt}>Metti nel menu di oggi</Text>
                </Pressable>
                <Pressable testID="expiring-save" style={[styles.act, styles.actGhost]} onPress={() => saveM.mutate()} disabled={busy}>
                  {saveM.isPending ? <ActivityIndicator size="small" color={colors.onSurface} /> : <Ionicons name="book-outline" size={16} color={colors.onSurface} />}
                  <Text style={[styles.actTxt, styles.actGhostTxt]}>Salva ricetta</Text>
                </Pressable>
                <Pressable testID="expiring-regenerate" style={[styles.act, styles.actGhost, { flexGrow: 0 }]} onPress={() => genM.mutate()} disabled={busy || genM.isPending}>
                  {genM.isPending ? <ActivityIndicator size="small" color={colors.onSurface} /> : <Ionicons name="refresh" size={16} color={colors.onSurface} />}
                </Pressable>
              </View>
              {(saveM.isError || planM.isError) && <Text style={styles.err}>Errore nel salvataggio, riprova</Text>}
            </>
          )}
        </View>
      )}
    </View>
  );
}
