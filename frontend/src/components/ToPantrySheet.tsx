import { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { categorize } from "@/src/categories";
import { DatePicker } from "@/src/components/DatePicker";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const LOCATIONS = [
  { key: "pantry", label: "Dispensa", icon: "cube-outline" },
  { key: "fridge", label: "Frigo", icon: "snow-outline" },
  { key: "freezer", label: "Freezer", icon: "ice-cream-outline" },
  { key: "home", label: "Casa", icon: "home-outline" },
  { key: "disposable", label: "Usa e getta", icon: "trash-bin-outline" },
];

type Draft = { id: string; name: string; qty: number; unit: string; expires_at: string | null; price: string; location: string };

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: "92%" },
  title: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  sub: { color: c.muted, fontSize: 12, marginTop: 2 },
  progress: { flexDirection: "row", gap: 4, marginVertical: spacing.md },
  pDot: { flex: 1, height: 4, borderRadius: 2 },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  name: { color: c.onSurface, fontWeight: "700", fontSize: 16 },
  meta: { color: c.muted, fontSize: 12 },
  label: { color: c.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700", marginTop: spacing.md, marginBottom: 6 },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, color: c.onSurface },
  locs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  loc: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary },
  locActive: { backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandPrimary },
  locTxt: { color: c.onSurface, fontSize: 12, fontWeight: "600" },
  footer: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  btn: { flex: 1, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  primary: { backgroundColor: c.brandPrimary },
  ghost: { backgroundColor: c.surfaceSecondary },
  btnTxt: { fontWeight: "700" },
  skipAll: { alignSelf: "center", marginTop: spacing.md, padding: spacing.sm },
}));

/**
 * After shopping: for each checked item ask expiry (calendar) + price + location, then move to pantry.
 * Skipping an item just deletes it from the list.
 */
export function ToPantrySheet({ items, onClose }: { items: any[]; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>(() => items.map((i) => ({
    id: i.id, name: i.name, qty: Number(i.qty) || 1, unit: i.unit || "pz", expires_at: null, price: "",
    location: ["Latticini", "Carne e pesce"].includes(i.aisle) ? "fridge" : i.aisle === "Surgelati" ? "freezer" : categorize(i.name, i.aisle).key === "casa" ? "home" : "pantry",
  })));
  const [decisions, setDecisions] = useState<Record<string, "keep" | "skip">>({});

  const finishM = useMutation({
    mutationFn: async (final: Record<string, "keep" | "skip">) => {
      const keep = drafts.filter((d) => final[d.id] === "keep").map((d) => ({ id: d.id, expires_at: d.expires_at, price: d.price ? parseFloat(d.price.replace(",", ".")) || null : null, location: d.location }));
      const skip = drafts.filter((d) => final[d.id] !== "keep");
      const res = keep.length ? await api<{ added: any[]; removed: number }>("/api/shopping/to-pantry", { method: "POST", body: JSON.stringify({ items: keep }) }) : { added: [], removed: 0 };
      await Promise.all(skip.map((d) => api(`/api/shopping/${d.id}`, { method: "DELETE" })));
      return res;
    },
    onSuccess: () => {
      ["shopping", "pantry", "pantry-all", "pantry-expiring", "recipes"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
  });

  const cur = drafts[idx];
  const upd = (patch: Partial<Draft>) => setDrafts((ds) => ds.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  const decide = (v: "keep" | "skip") => {
    const next = { ...decisions, [cur.id]: v };
    setDecisions(next);
    if (idx + 1 < drafts.length) setIdx(idx + 1);
    else finishM.mutate(next);
  };
  const skipAll = () => {
    const next: Record<string, "keep" | "skip"> = {};
    drafts.forEach((d) => { next[d.id] = decisions[d.id] || "skip"; });
    finishM.mutate(next);
  };
  const cat = categorize(cur?.name);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.bg}>
          <View style={styles.sheet} testID="to-pantry-sheet">
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Metti in dispensa</Text>
                <Text style={styles.sub}>Prodotto {idx + 1} di {drafts.length} · scadenza, prezzo e dove lo riponi</Text>
              </View>
              <Pressable onPress={onClose} testID="to-pantry-close"><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
            </View>
            <View style={styles.progress}>{drafts.map((d, i) => <View key={d.id} style={[styles.pDot, { backgroundColor: i < idx ? colors.brandPrimary : i === idx ? colors.brandSecondary : colors.borderStrong }]} />)}</View>

            {finishM.isPending ? <ActivityIndicator style={{ marginVertical: 40 }} color={colors.brandPrimary} /> : cur && (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
                <View style={styles.item}>
                  <View style={[styles.badge, { backgroundColor: cat.bg }]}><Text style={{ fontSize: 22 }}>{cat.emoji}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} testID="to-pantry-name">{cur.name}</Text>
                    <Text style={styles.meta}>{cur.qty} {cur.unit} · {cat.label}</Text>
                  </View>
                </View>
                <Text style={styles.label}>Scadenza</Text>
                <DatePicker testID="to-pantry-date" value={cur.expires_at} onChange={(v) => upd({ expires_at: v })} />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Prezzo €</Text>
                    <TextInput testID="to-pantry-price" placeholder="es. 2,50" placeholderTextColor={colors.muted} value={cur.price} onChangeText={(v) => upd({ price: v })} keyboardType="decimal-pad" style={styles.input} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Quantità</Text>
                    <TextInput testID="to-pantry-qty" value={String(cur.qty)} onChangeText={(v) => upd({ qty: parseFloat(v.replace(",", ".")) || 1 })} keyboardType="decimal-pad" style={styles.input} />
                  </View>
                </View>
                <Text style={styles.label}>Dove lo riponi?</Text>
                <View style={styles.locs}>
                  {LOCATIONS.map((l) => (
                    <Pressable key={l.key} testID={`to-pantry-loc-${l.key}`} style={[styles.loc, cur.location === l.key && styles.locActive]} onPress={() => upd({ location: l.key })}>
                      <Ionicons name={l.icon as any} size={14} color={cur.location === l.key ? colors.brandPrimary : colors.muted} /><Text style={styles.locTxt}>{l.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.footer}>
                  <Pressable testID="to-pantry-skip" style={[styles.btn, styles.ghost]} onPress={() => decide("skip")}><Text style={[styles.btnTxt, { color: colors.onSurface }]}>Non in dispensa</Text></Pressable>
                  <Pressable testID="to-pantry-keep" style={[styles.btn, styles.primary]} onPress={() => decide("keep")}><Ionicons name="checkmark" size={18} color={colors.onBrandPrimary} /><Text style={[styles.btnTxt, { color: colors.onBrandPrimary }]}>{idx + 1 < drafts.length ? "Salva e avanti" : "Salva e concludi"}</Text></Pressable>
                </View>
                <Pressable testID="to-pantry-skip-all" style={styles.skipAll} onPress={skipAll}><Text style={{ color: colors.muted, fontSize: 12 }}>Rimuovi tutti i restanti senza salvarli</Text></Pressable>
              </ScrollView>
            )}
            {finishM.isError && <Text style={{ color: colors.error, marginTop: spacing.sm }}>Errore, riprova</Text>}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
