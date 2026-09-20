import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const SLOTS = [{ k: "colazione", i: "cafe-outline" }, { k: "pranzo", i: "restaurant-outline" }, { k: "cena", i: "moon-outline" }, { k: "spuntino", i: "nutrition-outline" }];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 20, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  form: { padding: spacing.lg, gap: spacing.md },
  label: { color: c.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700" },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, color: c.onSurface, fontSize: 15 },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  slot: { flexGrow: 1, minWidth: "45%", padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  slotActive: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary, borderWidth: 1 },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: spacing.md },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
}));

export default function AddMeal() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; slot?: string }>();
  const qc = useQueryClient();
  const [date, setDate] = useState(params.date || new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState(params.slot || "pranzo");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const m = useMutation({
    mutationFn: (b: any) => api("/api/meals", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meals"] }); router.back(); },
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
          <Text style={styles.title}>Pianifica pasto</Text>
        </View>
        <ScrollView contentContainerStyle={styles.form}>
          <Text style={styles.label}>Data</Text>
          <TextInput testID="meal-date" placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} value={date} onChangeText={setDate} style={styles.input} />
          <Text style={styles.label}>Momento</Text>
          <View style={styles.slots}>
            {SLOTS.map((s) => (
              <Pressable key={s.k} testID={`slot-pick-${s.k}`} onPress={() => setSlot(s.k)} style={[styles.slot, slot === s.k && styles.slotActive]}>
                <Ionicons name={s.i as any} size={18} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurface, fontWeight: "600", textTransform: "capitalize" }}>{s.k}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Titolo pasto</Text>
          <TextInput testID="meal-title" placeholder="Es. Insalata di quinoa" placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} style={styles.input} />
          <Text style={styles.label}>Note</Text>
          <TextInput placeholder="Note opzionali" placeholderTextColor={colors.muted} value={notes} onChangeText={setNotes} style={[styles.input, { minHeight: 60 }]} multiline />

          <Pressable testID="save-meal" onPress={() => title.trim() && m.mutate({ date, slot, title: title.trim(), notes })} style={styles.btn}>
            <Text style={styles.btnTxt}>{m.isPending ? "Salvo..." : "Salva"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
