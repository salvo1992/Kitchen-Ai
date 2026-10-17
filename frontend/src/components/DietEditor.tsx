import { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.md },
  rowTxt: { flex: 1, color: c.onSurface, fontWeight: "600" },
  rowSub: { color: c.muted, fontSize: 12, marginTop: 2 },
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  sub: { color: c.muted, fontSize: 13, lineHeight: 18 },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, color: c.onSurface, minHeight: 110, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary },
  chipTxt: { color: c.onSurface, fontSize: 12, fontWeight: "600" },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  clear: { alignItems: "center", paddingVertical: 10 },
  clearTxt: { color: c.error, fontWeight: "600", fontSize: 13 },
}));

const CHIPS = ["Vegetariana", "Vegana", "Senza glutine", "Senza lattosio", "Ipocalorica (1500 kcal)", "Iperproteica", "Diabetica", "Mediterranea"];

/** Settings row + bottom sheet to edit "La mia dieta / preferenze" (used by Chef AI for this member's meals). */
export function DietEditor() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const saveM = useMutation({
    mutationFn: (diet: string) => api("/api/auth/profile", { method: "PATCH", body: JSON.stringify({ diet }) }),
    onSuccess: async () => { await refresh(); qc.invalidateQueries({ queryKey: ["household"] }); setOpen(false); },
  });

  const diet = (user as any)?.diet || "";

  return (
    <>
      <Pressable testID="settings-diet" style={styles.row} onPress={() => { setText(diet); setOpen(true); }}>
        <Ionicons name="leaf-outline" size={22} color={colors.brandPrimary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTxt}>La mia dieta / preferenze</Text>
          <Text style={styles.rowSub} numberOfLines={1}>{diet ? diet : "Nessuna: mangio come il resto della famiglia"}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.bg} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} testID="diet-sheet">
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={[styles.title, { flex: 1 }]}>La mia dieta / preferenze</Text>
                <Pressable onPress={() => setOpen(false)} testID="diet-close"><Ionicons name="close" size={24} color={colors.muted} /></Pressable>
              </View>
              <Text style={styles.sub}>Descrivi la tua dieta o cosa non mangi. Chef AI la userà solo per i tuoi pasti: nel piano settimanale avrai un menu separato, senza cambiare quello del resto della famiglia.</Text>
              <TextInput
                testID="diet-input"
                placeholder="Es. dieta ipocalorica 1400 kcal, niente fritti, pesce 2 volte a settimana, no latticini"
                placeholderTextColor={colors.muted}
                value={text}
                onChangeText={setText}
                multiline
                style={styles.input}
              />
              <View style={styles.chips}>
                {CHIPS.map((c) => (
                  <Pressable key={c} testID={`diet-chip-${c}`} onPress={() => setText((t) => (t.trim() ? `${t.trim()}, ${c}` : c))} style={styles.chip}><Text style={styles.chipTxt}>+ {c}</Text></Pressable>
                ))}
              </View>
              <Pressable testID="diet-save" style={styles.btn} onPress={() => saveM.mutate(text.trim())} disabled={saveM.isPending}>
                {saveM.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="checkmark" size={18} color={colors.onBrandPrimary} />}
                <Text style={styles.btnTxt}>Salva</Text>
              </Pressable>
              {!!diet && (
                <Pressable testID="diet-clear" style={styles.clear} onPress={() => saveM.mutate("")} disabled={saveM.isPending}>
                  <Text style={styles.clearTxt}>Rimuovi dieta: mangio come gli altri</Text>
                </Pressable>
              )}
              {saveM.isError && <Text style={{ color: colors.error, fontSize: 13 }}>{(saveM.error as any)?.message || "Errore, riprova"}</Text>}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
