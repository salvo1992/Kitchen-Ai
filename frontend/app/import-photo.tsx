import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.lg, gap: spacing.md },
  drop: { borderStyle: "dashed", borderWidth: 2, borderColor: c.borderStrong, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", backgroundColor: c.surfaceSecondary },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  preview: { width: "100%", height: 220, borderRadius: radius.lg, marginTop: spacing.md },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, marginBottom: 8 },
  rowText: { color: c.onSurface, flex: 1 },
  meta: { color: c.muted, fontSize: 12 },
}));

export default function ImportPhoto() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [image, setImage] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [meals, setMeals] = useState<any[]>([]);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.7 });
    if (!r.canceled) {
      setImage(r.assets[0].uri);
      setBase64(r.assets[0].base64 || null);
    }
  };
  const shoot = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (!r.canceled) {
      setImage(r.assets[0].uri);
      setBase64(r.assets[0].base64 || null);
    }
  };

  const parseM = useMutation({
    mutationFn: async () => {
      if (!base64) throw new Error("no image");
      return await api<{ meals: any[] }>("/api/ai/import-photo", { method: "POST", body: JSON.stringify({ image_base64: base64 }) });
    },
    onSuccess: (data) => setMeals(data.meals || []),
  });

  const DAYS: Record<string, number> = { lunedì: 1, martedì: 2, mercoledì: 3, giovedì: 4, venerdì: 5, sabato: 6, domenica: 0 };
  function nextDate(dayName: string) {
    const target = DAYS[dayName.toLowerCase()];
    if (target === undefined) return new Date().toISOString().slice(0, 10);
    const today = new Date();
    const cur = today.getDay();
    const diff = ((target - cur) + 7) % 7;
    const d = new Date(today); d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  const importAllM = useMutation({
    mutationFn: async () => {
      for (const m of meals) {
        await api("/api/meals", { method: "POST", body: JSON.stringify({
          date: nextDate(m.day || "lunedì"), slot: m.slot || "pranzo", title: m.title,
        })});
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meals"] }); router.push("/calendar"); },
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Importa da foto</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        {image ? (
          <Image source={image} style={styles.preview} contentFit="cover" />
        ) : (
          <View style={styles.drop}>
            <Ionicons name="camera-outline" size={48} color={colors.muted} />
            <Text style={{ color: colors.muted, marginTop: spacing.sm, textAlign: "center" }}>
              Scatta una foto del tuo piano alimentare o carica uno screenshot.{"\n"}Chef AI estrarrà i pasti automaticamente.
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Pressable testID="pick-photo" onPress={pick} style={[styles.btn, { flex: 1, backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="images" size={18} color={colors.onSurface} />
            <Text style={[styles.btnTxt, { color: colors.onSurface }]}>Galleria</Text>
          </Pressable>
          <Pressable testID="shoot-photo" onPress={shoot} style={[styles.btn, { flex: 1 }]}>
            <Ionicons name="camera" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.btnTxt}>Fotocamera</Text>
          </Pressable>
        </View>

        {image && (
          <Pressable testID="analyze-photo" onPress={() => parseM.mutate()} style={styles.btn} disabled={parseM.isPending}>
            {parseM.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>Analizza con AI</Text></>}
          </Pressable>
        )}

        {meals.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={{ fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm, fontSize: 16 }}>Pasti trovati ({meals.length})</Text>
            {meals.map((m, i) => (
              <View key={i} style={styles.row}>
                <Ionicons name="calendar-outline" size={18} color={colors.brandPrimary} style={{ marginRight: spacing.sm }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowText}>{m.title}</Text>
                  <Text style={styles.meta}>{m.day} · {m.slot}</Text>
                </View>
              </View>
            ))}
            <Pressable testID="import-all" onPress={() => importAllM.mutate()} style={styles.btn}>
              <Ionicons name="checkmark-done" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.btnTxt}>{importAllM.isPending ? "Importo..." : "Importa nel calendario"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
