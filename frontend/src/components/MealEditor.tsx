import { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { memberLabel, type Member } from "@/src/use-members";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

export const SLOT_LABEL: Record<string, string> = { colazione: "Colazione", pranzo: "Pranzo", cena: "Cena", spuntino: "Spuntino" };
export const SLOT_ICON: Record<string, string> = { colazione: "cafe-outline", pranzo: "sunny-outline", cena: "moon-outline", spuntino: "nutrition-outline" };
export const ALL_SLOTS = ["colazione", "pranzo", "cena", "spuntino"];

/** What the editor hands back: either an existing cookbook recipe or a freshly generated one (to be created). */
export type MealPick = { title: string; recipe_id?: string; recipe?: any; member_id: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  date: string;
  slot: string;
  currentTitle?: string | null;
  /** Family members: when > 1, shows the "Per chi?" selector (Tutti / each member). */
  members?: Member[];
  /** Preselected member (null = tutti). */
  memberId?: string | null;
  onPick: (p: MealPick) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
};

const useStyles = makeStyles((c) => ({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: "90%" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  headIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  sub: { color: c.muted, fontSize: 12, marginTop: 2 },
  tabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  tabActive: { backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandPrimary },
  tabTxt: { color: c.onSurface, fontWeight: "700", fontSize: 13 },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, color: c.onSurface, minHeight: 48 },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  btnAccent: { backgroundColor: c.brandSecondary },
  preview: { backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, gap: 4 },
  pTitle: { color: c.onBrandTertiary, fontWeight: "700", fontSize: 16 },
  pLine: { color: c.onBrandTertiary, fontSize: 13, lineHeight: 19 },
  recipeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
  rTitle: { color: c.onSurface, fontWeight: "600", flex: 1 },
  rMeta: { color: c.muted, fontSize: 12 },
  remove: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, marginTop: spacing.sm },
  removeTxt: { color: c.error, fontWeight: "700" },
  err: { color: c.error, marginTop: spacing.sm, fontSize: 13 },
  whoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.md, alignItems: "center" },
  whoLbl: { color: c.muted, fontSize: 12, fontWeight: "700", marginRight: 4 },
  who: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: 4 },
  whoOn: { backgroundColor: c.brandPrimary },
  whoTxt: { color: c.onSurface, fontSize: 12, fontWeight: "600" },
  dietHint: { color: c.brandPrimary, fontSize: 12, marginBottom: spacing.sm, fontStyle: "italic" },
}));

const CHIPS = ["Leggero", "Veloce (15 min)", "Vegetariano", "Pesce", "Comfort food", "Con ciò che ho"];

export function MealEditor({ visible, onClose, date, slot, currentTitle, members = [], memberId = null, onPick, onRemove }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<"ai" | "book">("ai");
  const [pref, setPref] = useState("");
  const [q, setQ] = useState("");
  const [aiRecipe, setAiRecipe] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<string | null>(memberId);
  const hasFamily = members.length > 1;
  const whoMember = members.find((m) => m.user_id === who);
  const whoDiet = (whoMember?.diet || "").trim();

  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  const aiM = useMutation({
    mutationFn: () => api<{ recipe: any }>("/api/ai/recipe", { method: "POST", body: JSON.stringify({ query: `${SLOT_LABEL[slot] || slot} per ${dateLabel}${pref.trim() ? `: ${pref.trim()}` : ""}${currentTitle ? ` (in alternativa a "${currentTitle}")` : ""}`, member_id: who }) }),
    onSuccess: (r) => setAiRecipe(r.recipe),
  });
  const bookQ = useQuery({
    queryKey: ["recipes", "picker", q],
    queryFn: async () => (await api<{ items: any[] }>(`/api/recipes${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)).items,
    enabled: visible && tab === "book",
    refetchInterval: false,
  });

  const pick = async (p: Omit<MealPick, "member_id">) => {
    setBusy(true);
    try { await onPick({ ...p, member_id: who }); setAiRecipe(null); setPref(""); onClose(); } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.bg} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} testID="meal-editor">
            <View style={styles.head}>
              <View style={styles.headIcon}><Ionicons name={(SLOT_ICON[slot] || "restaurant-outline") as any} size={22} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{currentTitle ? "Modifica" : "Aggiungi"} {SLOT_LABEL[slot] || slot}</Text>
                <Text style={styles.sub}>{dateLabel}{currentTitle ? ` · ora: ${currentTitle}` : ""}</Text>
              </View>
              <Pressable onPress={onClose} testID="meal-editor-close"><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
            </View>

            <View style={styles.tabs}>
              <Pressable testID="meal-tab-ai" style={[styles.tab, tab === "ai" && styles.tabActive]} onPress={() => setTab("ai")}><Ionicons name="sparkles" size={14} color={colors.brandSecondary} /><Text style={styles.tabTxt}>Chef AI</Text></Pressable>
              <Pressable testID="meal-tab-book" style={[styles.tab, tab === "book" && styles.tabActive]} onPress={() => setTab("book")}><Ionicons name="book" size={14} color={colors.brandPrimary} /><Text style={styles.tabTxt}>Dal ricettario</Text></Pressable>
            </View>

            {hasFamily && (
              <View style={styles.whoRow} testID="meal-who">
                <Text style={styles.whoLbl}>Per chi?</Text>
                <Pressable testID="meal-who-all" onPress={() => setWho(null)} style={[styles.who, who === null && styles.whoOn]}>
                  <Ionicons name="people" size={12} color={who === null ? colors.onBrandPrimary : colors.muted} />
                  <Text style={[styles.whoTxt, who === null && { color: colors.onBrandPrimary }]}>Tutti</Text>
                </Pressable>
                {members.map((m) => (
                  <Pressable key={m.user_id} testID={`meal-who-${m.user_id}`} onPress={() => setWho(m.user_id)} style={[styles.who, who === m.user_id && styles.whoOn]}>
                    {!!(m.diet || "").trim() && <Ionicons name="leaf" size={12} color={who === m.user_id ? colors.onBrandPrimary : colors.brandPrimary} />}
                    <Text style={[styles.whoTxt, who === m.user_id && { color: colors.onBrandPrimary }]}>{memberLabel(m, user?.user_id)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {hasFamily && whoDiet && tab === "ai" && <Text style={styles.dietHint} numberOfLines={2}>🌿 Chef AI rispetterà la dieta di {memberLabel(whoMember, user?.user_id)}: {whoDiet}</Text>}

            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {tab === "ai" && (
                <>
                  <TextInput testID="meal-pref" placeholder="Cosa ti va? Es. qualcosa di leggero con il pesce, oppure 'pizza fatta in casa'" placeholderTextColor={colors.muted} value={pref} onChangeText={setPref} multiline style={styles.input} />
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm }}>
                    {CHIPS.map((c) => <Pressable key={c} onPress={() => setPref(c)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary }}><Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "600" }}>{c}</Text></Pressable>)}
                  </View>
                  <Pressable testID="meal-ai-generate" style={[styles.btn, styles.btnAccent]} onPress={() => aiM.mutate()} disabled={aiM.isPending}>
                    {aiM.isPending ? <ActivityIndicator color={colors.onBrandSecondary} /> : <Ionicons name="sparkles" size={18} color={colors.onBrandSecondary} />}
                    <Text style={[styles.btnTxt, { color: colors.onBrandSecondary }]}>{aiM.isPending ? "Chef AI sta pensando…" : aiRecipe ? "Proponi un'altra" : "Chiedi a Chef AI"}</Text>
                  </Pressable>
                  {aiM.isError && <Text style={styles.err}>{(aiM.error as any)?.message || "Errore, riprova"}</Text>}
                  {aiRecipe && (
                    <View style={styles.preview} testID="meal-ai-preview">
                      <Text style={styles.pTitle}>{aiRecipe.title}</Text>
                      <Text style={styles.pLine}>⏱ {aiRecipe.time_min} min · 👥 {aiRecipe.servings} porz. · {aiRecipe.ingredients?.length || 0} ingredienti</Text>
                      {!!aiRecipe.description && <Text style={styles.pLine}>{aiRecipe.description}</Text>}
                      <Text style={[styles.pLine, { color: colors.muted }]} numberOfLines={2}>{(aiRecipe.ingredients || []).map((i: any) => i.name).join(", ")}</Text>
                      <Pressable testID="meal-ai-use" style={[styles.btn, { marginTop: spacing.sm }]} onPress={() => pick({ title: aiRecipe.title, recipe: aiRecipe })} disabled={busy}>
                        {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="checkmark" size={18} color={colors.onBrandPrimary} />}
                        <Text style={styles.btnTxt}>Usa questa ricetta</Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}
              {tab === "book" && (
                <>
                  <TextInput testID="meal-book-search" placeholder="Cerca nel ricettario…" placeholderTextColor={colors.muted} value={q} onChangeText={setQ} style={styles.input} />
                  {bookQ.isLoading && <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.brandPrimary} />}
                  {(bookQ.data || []).slice(0, 40).map((r: any) => (
                    <Pressable key={r.id} testID={`meal-book-${r.id}`} style={styles.recipeRow} onPress={() => pick({ title: r.title, recipe_id: r.id })} disabled={busy}>
                      <Ionicons name={r.cookable ? "checkmark-circle" : "book-outline"} size={18} color={r.cookable ? colors.brandPrimary : colors.muted} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rTitle} numberOfLines={1}>{r.title}</Text>
                        <Text style={styles.rMeta}>⏱ {r.time_min || 30} min{r.rating ? ` · ★ ${r.rating}` : ""}{r.cookable ? " · fattibile ora" : r.missing_count ? ` · mancano ${r.missing_count}` : ""}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </Pressable>
                  ))}
                  {bookQ.data && bookQ.data.length === 0 && <Text style={{ color: colors.muted, marginTop: spacing.md, textAlign: "center" }}>Nessuna ricetta trovata.</Text>}
                </>
              )}
            </ScrollView>

            {currentTitle && onRemove && (
              <Pressable testID="meal-remove" style={styles.remove} onPress={async () => { setBusy(true); try { await onRemove(); onClose(); } finally { setBusy(false); } }} disabled={busy}>
                <Ionicons name="trash-outline" size={16} color={colors.error} /><Text style={styles.removeTxt}>Rimuovi questo pasto</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
