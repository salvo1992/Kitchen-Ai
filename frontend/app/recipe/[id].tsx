import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { width: "100%", height: 300 },
  headerBtns: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", padding: spacing.lg },
  circleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.xl, gap: spacing.md, marginTop: -30, backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  title: { fontSize: 26, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  meta: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.xs },
  metaItem: { flexDirection: "row", gap: 6, alignItems: "center" },
  metaTxt: { color: c.muted },
  section: { marginTop: spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginBottom: spacing.sm },
  ingRow: { flexDirection: "row", padding: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, marginBottom: 8, alignItems: "center", gap: spacing.sm },
  step: { padding: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, marginBottom: 8, flexDirection: "row", gap: spacing.md },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  stepNumTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  cookBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm, backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 16, marginTop: spacing.lg },
  cookTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  shopBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandTertiary, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: spacing.md, alignSelf: "flex-start" },
  shopBtnTxt: { color: c.brandPrimary, fontWeight: "700", fontSize: 13 },
  resultBox: { backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, gap: 4 },
  resultLine: { color: c.onBrandTertiary, fontSize: 13 },
}));

const FALLBACK = "https://images.pexels.com/photos/1640775/pexels-photo-1640775.jpeg?w=800";

export default function RecipeDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => api<any>(`/api/recipes/${id}`),
  });

  const favM = useMutation({
    mutationFn: (fav: boolean) => api(`/api/recipes/${id}`, { method: "PATCH", body: JSON.stringify({ favorite: fav }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipe", id] }); qc.invalidateQueries({ queryKey: ["recipes"] }); },
  });

  const delM = useMutation({
    mutationFn: () => api(`/api/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); router.back(); },
  });

  const shopM = useMutation({
    mutationFn: () => api<{ added: any[]; in_pantry: string[]; already_listed: string[] }>(`/api/recipes/${id}/to-shopping`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });

  if (q.isLoading || !q.data) return <View style={styles.root}><ActivityIndicator style={{ marginTop: 80 }} color={colors.brandPrimary} /></View>;
  const r = q.data;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.hero}>
          <Image source={r.image_url || FALLBACK} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.4)", "transparent"]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 100 }} />
          <View style={[styles.headerBtns, { top: insets.top }]}>
            <Pressable style={styles.circleBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable testID="fav-btn" style={styles.circleBtn} onPress={() => favM.mutate(!r.favorite)}>
                <Ionicons name={r.favorite ? "heart" : "heart-outline"} size={20} color={r.favorite ? colors.brandSecondary : colors.onSurface} />
              </Pressable>
              <Pressable style={styles.circleBtn} onPress={() => delM.mutate()}><Ionicons name="trash" size={18} color={colors.error} /></Pressable>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{r.title}</Text>
          {!!r.description && <Text style={{ color: colors.muted, lineHeight: 21 }}>{r.description}</Text>}
          <View style={styles.meta}>
            <View style={styles.metaItem}><Ionicons name="time-outline" size={16} color={colors.brandPrimary} /><Text style={styles.metaTxt}>{r.time_min || 30} min</Text></View>
            <View style={styles.metaItem}><Ionicons name="people-outline" size={16} color={colors.brandPrimary} /><Text style={styles.metaTxt}>{r.servings || 2} porzioni</Text></View>
          </View>

          {(r.ingredients || []).length > 0 && (
            <View style={styles.section}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Ingredienti</Text>
                <Pressable testID="to-shopping" style={styles.shopBtn} onPress={() => shopM.mutate()} disabled={shopM.isPending}>
                  {shopM.isPending ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Ionicons name="cart-outline" size={16} color={colors.brandPrimary} />}
                  <Text style={styles.shopBtnTxt}>Mancanti → Spesa</Text>
                </Pressable>
              </View>
              {shopM.data && (
                <View style={styles.resultBox} testID="to-shopping-result">
                  <Text style={[styles.resultLine, { fontWeight: "700" }]}>
                    {shopM.data.added.length > 0 ? `${shopM.data.added.length} ingredienti aggiunti alla spesa` : "Nessun ingrediente da aggiungere"}
                  </Text>
                  {shopM.data.in_pantry.length > 0 && <Text style={styles.resultLine}>✓ Già in dispensa: {shopM.data.in_pantry.join(", ")}</Text>}
                  {shopM.data.already_listed.length > 0 && <Text style={styles.resultLine}>• Già in lista: {shopM.data.already_listed.join(", ")}</Text>}
                  {shopM.data.added.length > 0 && (
                    <Pressable onPress={() => router.push("/(tabs)/spesa")} style={{ marginTop: 4 }}><Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 13 }}>Vai alla lista →</Text></Pressable>
                  )}
                </View>
              )}
              {shopM.isError && <Text style={{ color: colors.error, marginBottom: spacing.sm }}>Errore, riprova</Text>}
              {r.ingredients.map((i: any, idx: number) => (
                <View key={idx} style={styles.ingRow}>
                  <Ionicons name="leaf" size={14} color={colors.brandPrimary} />
                  <Text style={{ color: colors.onSurface, flex: 1 }}>{i.name}</Text>
                  <Text style={{ color: colors.muted }}>{i.unit === "q.b." ? "q.b." : `${i.qty} ${i.unit}`}</Text>
                </View>
              ))}
            </View>
          )}
          {(r.steps || []).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Procedimento</Text>
              {r.steps.map((s: string, idx: number) => (
                <View key={idx} style={styles.step}>
                  <View style={styles.stepNum}><Text style={styles.stepNumTxt}>{idx + 1}</Text></View>
                  <Text style={{ color: colors.onSurface, flex: 1, lineHeight: 21 }}>{s}</Text>
                </View>
              ))}
            </View>
          )}
          {(r.steps || []).length > 0 && (
            <Pressable testID="cook-mode" onPress={() => router.push({ pathname: "/cook/[id]", params: { id: r.id } })} style={styles.cookBtn}>
              <Ionicons name="restaurant" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.cookTxt}>Cucina passo-passo</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
