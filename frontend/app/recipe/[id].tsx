import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { api } from "@/src/api";
import { resolveUrl, pickImage, uploadImage, chooseImageSource } from "@/src/media";
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
  cookedBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm, backgroundColor: c.brandSecondary, borderRadius: radius.pill, paddingVertical: 14, marginTop: spacing.sm },
  cookedTxt: { color: c.onBrandSecondary, fontWeight: "700", fontSize: 15 },
  cookedBox: { backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md, gap: 6 },
  cookedLine: { color: c.onBrandTertiary, fontSize: 13, lineHeight: 19 },
  shopBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandTertiary, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: spacing.md, alignSelf: "flex-start" },
  shopBtnTxt: { color: c.brandPrimary, fontWeight: "700", fontSize: 13 },
  resultBox: { backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, gap: 4 },
  resultLine: { color: c.onBrandTertiary, fontSize: 13 },
  servings: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, padding: 4, gap: spacing.sm },
  servBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  servTxt: { color: c.onSurface, fontWeight: "700", minWidth: 70, textAlign: "center" },
  photoBtn: { position: "absolute", right: spacing.lg, bottom: 44, flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: "rgba(255,255,255,0.9)", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
}));

function fmtQty(q: number) {
  if (!Number.isFinite(q)) return "";
  const r = q >= 10 ? Math.round(q) : Math.round(q * 4) / 4;
  return String(r).replace(".", ",");
}

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

  const [servings, setServings] = useState<number | null>(null);
  const cookedM = useMutation({
    mutationFn: (serv: number) => api<{ updated: any[]; finished: string[]; added_to_shopping: string[]; not_found: string[]; items_saved: number }>(`/api/recipes/${id}/cooked`, { method: "POST", body: JSON.stringify({ servings: serv }) }),
    onSuccess: () => { ["pantry", "pantry-all", "pantry-expiring", "shopping", "recipes", "waste-stats"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
  });
  const confirmCooked = (serv: number) => {
    if (Platform.OS === "web") { cookedM.mutate(serv); return; }
    Alert.alert("Hai cucinato questa ricetta?", `Scalo gli ingredienti per ${serv} ${serv === 1 ? "porzione" : "porzioni"} dalla dispensa. Ciò che finisce va in lista della spesa.`, [
      { text: "Annulla", style: "cancel" }, { text: "Sì, cucinato!", onPress: () => cookedM.mutate(serv) },
    ]);
  };
  const photoM = useMutation({
    mutationFn: async (source: "camera" | "library") => {
      const img = await pickImage(source);
      if (!img) return null;
      const url = await uploadImage(img.base64);
      return api(`/api/recipes/${id}`, { method: "PATCH", body: JSON.stringify({ image_url: url }) });
    },
    onSuccess: (res) => { if (res) { qc.invalidateQueries({ queryKey: ["recipe", id] }); qc.invalidateQueries({ queryKey: ["recipes"] }); } },
  });

  if (q.isLoading || !q.data) return <View style={styles.root}><ActivityIndicator style={{ marginTop: 80 }} color={colors.brandPrimary} /></View>;
  const r = q.data;
  const baseServ = Number(r.servings) || 2;
  const curServ = servings ?? baseServ;
  const factor = curServ / baseServ;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.hero}>
          <Image source={resolveUrl(r.image_url) || FALLBACK} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.4)", "transparent"]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 100 }} />
          <Pressable testID="recipe-photo" style={styles.photoBtn} onPress={() => chooseImageSource((s) => photoM.mutate(s))} disabled={photoM.isPending}>
            {photoM.isPending ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Ionicons name="camera" size={16} color={colors.brandPrimary} />}
            <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 12 }}>{photoM.isPending ? "Carico…" : r.image_url ? "Cambia foto" : "Aggiungi foto"}</Text>
          </Pressable>
          <View style={[styles.headerBtns, { top: insets.top }]}>
            <Pressable style={styles.circleBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable testID="edit-recipe" style={styles.circleBtn} onPress={() => router.push({ pathname: "/add-recipe", params: { id: r.id } })}>
                <Ionicons name="pencil" size={18} color={colors.onSurface} />
              </Pressable>
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
          <View style={[styles.meta, { alignItems: "center", justifyContent: "space-between" }]}>
            <View style={styles.metaItem}><Ionicons name="time-outline" size={16} color={colors.brandPrimary} /><Text style={styles.metaTxt}>{r.time_min || 30} min</Text></View>
            <View style={styles.servings} testID="servings-stepper">
              <Pressable testID="serv-minus" style={styles.servBtn} onPress={() => setServings(Math.max(1, curServ - 1))}><Ionicons name="remove" size={18} color={colors.onSurface} /></Pressable>
              <Text style={styles.servTxt} testID="serv-value">{curServ} {curServ === 1 ? "porzione" : "porzioni"}</Text>
              <Pressable testID="serv-plus" style={styles.servBtn} onPress={() => setServings(Math.min(50, curServ + 1))}><Ionicons name="add" size={18} color={colors.onSurface} /></Pressable>
            </View>
          </View>
          {curServ !== baseServ && (
            <Pressable testID="serv-reset" onPress={() => setServings(null)} style={{ alignSelf: "flex-end" }}>
              <Text style={{ color: colors.brandSecondary, fontSize: 12, fontWeight: "600" }}>Quantità ×{fmtQty(factor)} · torna a {baseServ}</Text>
            </Pressable>
          )}

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
                  <Text style={{ color: colors.muted }} testID={`ing-qty-${idx}`}>{i.unit === "q.b." || typeof i.qty !== "number" ? (i.unit === "q.b." ? "q.b." : `${i.qty} ${i.unit}`) : `${fmtQty(i.qty * factor)} ${i.unit}`}</Text>
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
          {(r.ingredients || []).length > 0 && (
            <Pressable testID="cooked-btn" onPress={() => confirmCooked(curServ)} style={[styles.cookedBtn, cookedM.isPending && { opacity: 0.6 }]} disabled={cookedM.isPending}>
              {cookedM.isPending ? <ActivityIndicator size="small" color={colors.onBrandSecondary} /> : <Ionicons name="checkmark-done" size={20} color={colors.onBrandSecondary} />}
              <Text style={styles.cookedTxt}>Cucinato! Scala dalla dispensa ({curServ} porz.)</Text>
            </Pressable>
          )}
          {cookedM.data && (
            <View style={styles.cookedBox} testID="cooked-result">
              <Text style={[styles.cookedLine, { fontWeight: "700", fontSize: 14 }]}>Dispensa aggiornata 🍽️</Text>
              {cookedM.data.updated.length > 0 && <Text style={styles.cookedLine}>Usati: {cookedM.data.updated.map((u) => `${u.name} −${u.used} ${u.unit}`).join(", ")}</Text>}
              {cookedM.data.finished.length > 0 && <Text style={styles.cookedLine}>Finiti (a 0): {cookedM.data.finished.join(", ")}</Text>}
              {cookedM.data.added_to_shopping.length > 0 && <Text style={styles.cookedLine}>🛒 Aggiunti alla spesa: {cookedM.data.added_to_shopping.join(", ")}</Text>}
              {cookedM.data.not_found.length > 0 && <Text style={styles.cookedLine}>Non in dispensa: {cookedM.data.not_found.join(", ")}</Text>}
              {cookedM.data.items_saved > 0 && <Text style={[styles.cookedLine, { color: colors.brandSecondary, fontWeight: "700" }]}>🎉 {cookedM.data.items_saved} {cookedM.data.items_saved === 1 ? "prodotto salvato" : "prodotti salvati"} dalla scadenza!</Text>}
            </View>
          )}
          {cookedM.isError && <Text style={{ color: colors.error, marginTop: spacing.sm }}>Errore, riprova</Text>}
        </View>
      </ScrollView>
    </View>
  );
}
