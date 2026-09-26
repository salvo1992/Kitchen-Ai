import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { pickImage, uploadImage, chooseImageSource } from "@/src/media";
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
  photo: { height: 160, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderStyle: "dashed", borderColor: c.borderStrong },
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
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);

  const saveM = useMutation({
    mutationFn: async (b: any) => {
      const image_url = photo ? await uploadImage(photo.base64) : null;
      return api("/api/recipes", { method: "POST", body: JSON.stringify({ ...b, image_url }) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); router.back(); },
  });

  const pickPhoto = () => chooseImageSource(async (s) => { const img = await pickImage(s); if (img) setPhoto(img); });

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
            <Pressable testID="rec-photo" style={styles.photo} onPress={pickPhoto}>
              {photo ? (
                <>
                  <Image source={photo.uri} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  <View style={{ position: "absolute", right: spacing.sm, bottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, flexDirection: "row", gap: 4, alignItems: "center" }}>
                    <Ionicons name="camera" size={14} color={colors.brandPrimary} /><Text style={{ color: colors.brandPrimary, fontSize: 12, fontWeight: "700" }}>Cambia</Text>
                  </View>
                </>
              ) : (
                <>
                  <Ionicons name="camera-outline" size={32} color={colors.muted} />
                  <Text style={{ color: colors.muted, marginTop: 6, fontWeight: "600" }}>Aggiungi una foto</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Fotocamera o galleria</Text>
                </>
              )}
            </Pressable>
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

            <Pressable testID="save-recipe" onPress={save} style={[styles.btn, { flexDirection: "row", gap: spacing.sm, justifyContent: "center" }]} disabled={saveM.isPending}>
              {saveM.isPending && <ActivityIndicator size="small" color={colors.onBrandPrimary} />}
              <Text style={styles.btnTxt}>{saveM.isPending ? (photo ? "Carico foto e salvo..." : "Salvo...") : "Salva ricetta"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
