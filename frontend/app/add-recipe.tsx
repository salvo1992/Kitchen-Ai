import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 20, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  form: { padding: spacing.lg, gap: spacing.md },
  label: { color: c.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: "700" },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, color: c.onSurface, fontSize: 15 },
  row: { flexDirection: "row", gap: spacing.sm },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: spacing.md },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  addRow: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: spacing.sm },
  ing: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, gap: spacing.sm },
}));

export default function AddRecipe() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [time, setTime] = useState("30");
  const [serv, setServ] = useState("2");
  const [ingName, setIngName] = useState("");
  const [ingQty, setIngQty] = useState("");
  const [ings, setIngs] = useState<{ name: string; qty: string; unit: string }[]>([]);
  const [stepTxt, setStepTxt] = useState("");
  const [steps, setSteps] = useState<string[]>([]);

  const saveM = useMutation({
    mutationFn: (b: any) => api("/api/recipes", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); router.back(); },
  });

  const save = () => {
    if (!title.trim()) return;
    saveM.mutate({
      title: title.trim(), description: desc, time_min: parseInt(time) || 30, servings: parseInt(serv) || 2,
      ingredients: ings.map((i) => ({ name: i.name, qty: parseFloat(i.qty) || 1, unit: i.unit || "pz" })),
      steps,
    });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
          <Text style={styles.title}>Nuova ricetta</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          <View style={styles.form}>
            <Text style={styles.label}>Titolo</Text>
            <TextInput testID="rec-title" placeholder="Es. Pasta al pomodoro" placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} style={styles.input} />
            <Text style={styles.label}>Descrizione</Text>
            <TextInput placeholder="Breve descrizione (opzionale)" placeholderTextColor={colors.muted} value={desc} onChangeText={setDesc} style={[styles.input, { minHeight: 60 }]} multiline />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Tempo (min)</Text>
                <TextInput value={time} onChangeText={setTime} style={styles.input} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Porzioni</Text>
                <TextInput value={serv} onChangeText={setServ} style={styles.input} keyboardType="numeric" />
              </View>
            </View>

            <Text style={styles.label}>Ingredienti</Text>
            {ings.map((i, idx) => (
              <View key={idx} style={styles.ing}>
                <Ionicons name="ellipse" size={8} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurface, flex: 1 }}>{i.qty} {i.unit} · {i.name}</Text>
                <Pressable onPress={() => setIngs(ings.filter((_, k) => k !== idx))}><Ionicons name="close" size={16} color={colors.muted} /></Pressable>
              </View>
            ))}
            <View style={styles.row}>
              <TextInput placeholder="Q.tà" placeholderTextColor={colors.muted} value={ingQty} onChangeText={setIngQty} style={[styles.input, { flex: 1 }]} />
              <TextInput placeholder="Ingrediente" placeholderTextColor={colors.muted} value={ingName} onChangeText={setIngName} style={[styles.input, { flex: 2 }]} />
              <Pressable onPress={() => { if (ingName.trim()) { setIngs([...ings, { name: ingName.trim(), qty: ingQty || "1", unit: "pz" }]); setIngName(""); setIngQty(""); } }} style={[styles.input, { alignItems: "center", justifyContent: "center", paddingVertical: 12, backgroundColor: colors.brandTertiary }]}>
                <Ionicons name="add" size={20} color={colors.brandPrimary} />
              </Pressable>
            </View>

            <Text style={styles.label}>Passaggi</Text>
            {steps.map((s, idx) => (
              <View key={idx} style={styles.ing}>
                <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>{idx + 1}.</Text>
                <Text style={{ color: colors.onSurface, flex: 1 }}>{s}</Text>
                <Pressable onPress={() => setSteps(steps.filter((_, k) => k !== idx))}><Ionicons name="close" size={16} color={colors.muted} /></Pressable>
              </View>
            ))}
            <View style={styles.row}>
              <TextInput placeholder="Aggiungi un passaggio" placeholderTextColor={colors.muted} value={stepTxt} onChangeText={setStepTxt} style={[styles.input, { flex: 1 }]} multiline />
              <Pressable onPress={() => { if (stepTxt.trim()) { setSteps([...steps, stepTxt.trim()]); setStepTxt(""); } }} style={[styles.input, { alignItems: "center", justifyContent: "center", paddingVertical: 12, backgroundColor: colors.brandTertiary }]}>
                <Ionicons name="add" size={20} color={colors.brandPrimary} />
              </Pressable>
            </View>

            <Pressable testID="save-recipe" onPress={save} style={styles.btn}><Text style={styles.btnTxt}>{saveM.isPending ? "Salvo..." : "Salva ricetta"}</Text></Pressable>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
