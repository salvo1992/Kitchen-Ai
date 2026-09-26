import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  box: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.xl, gap: spacing.md },
  title: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  stars: { flexDirection: "row", gap: 6 },
  star: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  label: { color: c.muted, fontSize: 12 },
  input: { backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md, color: c.onSurface, minHeight: 80, textAlignVertical: "top" },
  save: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 12 },
  saveTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  saved: { color: c.brandPrimary, fontWeight: "600", fontSize: 12, textAlign: "center" },
}));

const RATING_LABEL = ["", "Da rivedere", "Così così", "Buona", "Ottima", "Da rifare subito!"];

export function RecipeNotes({ recipeId, rating, notes, highlight }: { recipeId: string; rating?: number | null; notes?: string | null; highlight?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [stars, setStars] = useState(rating || 0);
  const [text, setText] = useState(notes || "");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => { setStars(rating || 0); setText(notes || ""); }, [rating, notes]);

  const saveM = useMutation({
    mutationFn: (b: { rating: number | null; notes: string }) => api(`/api/recipes/${recipeId}`, { method: "PATCH", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipe", recipeId] }); qc.invalidateQueries({ queryKey: ["recipes"] }); setSavedAt(Date.now()); },
  });

  const rate = (n: number) => { const v = n === stars ? 0 : n; setStars(v); saveM.mutate({ rating: v || null, notes: text }); };
  const dirty = text !== (notes || "");

  return (
    <View style={[styles.box, highlight && { borderWidth: 1, borderColor: colors.brandSecondary }]} testID="recipe-notes">
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Ionicons name="create-outline" size={18} color={colors.brandSecondary} />
        <Text style={styles.title}>{highlight ? "Com'è andata?" : "Le tue note"}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} testID={`star-${n}`} style={styles.star} onPress={() => rate(n)}>
              <Ionicons name={n <= stars ? "star" : "star-outline"} size={28} color={n <= stars ? colors.brandSecondary : colors.borderStrong} />
            </Pressable>
          ))}
        </View>
        <Text style={styles.label} testID="rating-label">{stars ? RATING_LABEL[stars] : "Valuta"}</Text>
      </View>
      <TextInput
        testID="notes-input"
        placeholder="Es. meno sale, aggiungere 5 minuti di forno, piaciuta ai bambini…"
        placeholderTextColor={colors.muted}
        value={text}
        onChangeText={setText}
        multiline
        style={styles.input}
      />
      {dirty ? (
        <Pressable testID="notes-save" style={styles.save} onPress={() => saveM.mutate({ rating: stars || null, notes: text })} disabled={saveM.isPending}>
          {saveM.isPending ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Ionicons name="save-outline" size={16} color={colors.onBrandPrimary} />}
          <Text style={styles.saveTxt}>Salva note</Text>
        </Pressable>
      ) : savedAt ? <Text style={styles.saved} testID="notes-saved">✓ Salvato</Text> : null}
    </View>
  );
}
