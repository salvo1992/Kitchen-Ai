import { View, Text, Pressable, ScrollView, RefreshControl, TextInput, Modal, KeyboardAvoidingView, Platform, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { categorize, LOCATIONS, isFoodLocation, locationLabel } from "@/src/categories";
import { usePullRefresh } from "@/src/use-pull-refresh";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";
import { Enter, Bounce, GradientHeader } from "@/src/components/ui";
import { ExpiryReader } from "@/src/components/ExpiryReader";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  tabsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, paddingVertical: 4 },
  tab: { paddingVertical: 9, paddingHorizontal: spacing.md, borderRadius: radius.pill, alignItems: "center", flexDirection: "row", gap: 6, backgroundColor: "rgba(255,255,255,0.18)" },
  tabActive: { backgroundColor: c.surface },
  tabTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  tabTxtActive: { color: c.brandPrimary },
  sectionHead: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  sectionCount: { color: c.muted, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: c.surface, borderRadius: radius.lg, marginHorizontal: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: c.border },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  rowName: { fontWeight: "700", color: c.onSurface, fontSize: 15 },
  rowMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 11, fontWeight: "700" },
  finishBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.brandTertiary, marginLeft: 6 },
  finishTxt: { color: c.brandPrimary, fontWeight: "700", fontSize: 11 },
  fab: { position: "absolute", right: spacing.lg, backgroundColor: c.brandSecondary, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  scanFab: { position: "absolute", right: spacing.lg, backgroundColor: c.brandPrimary, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  empty: { alignItems: "center", padding: spacing.xl, marginTop: spacing.xl },
  emptyTxt: { color: c.muted, marginTop: spacing.md, textAlign: "center", lineHeight: 20 },
  infoCard: { marginHorizontal: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.brandTertiary, flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  infoTxt: { color: c.onBrandTertiary, fontSize: 12, flex: 1, lineHeight: 17 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md, maxHeight: "90%" },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, color: c.onSurface },
  label: { color: c.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700" },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  hint: { color: c.muted, fontSize: 12, lineHeight: 17 },
}));

function daysUntil(dateStr?: string) {
  if (!dateStr) return null;
  const d = new Date(dateStr).getTime();
  return Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function Dispensa() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<string>("pantry");
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pz");
  const [expires, setExpires] = useState("");
  const [price, setPrice] = useState("");
  const food = isFoodLocation(tab);

  const listQ = useQuery({
    queryKey: ["pantry", tab],
    queryFn: async () => (await api<{ items: any[] }>(`/api/pantry?location=${tab}`)).items,
  });
  const pull = usePullRefresh(listQ.refetch);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["pantry-all"] }); qc.invalidateQueries({ queryKey: ["pantry-expiring"] }); qc.invalidateQueries({ queryKey: ["shopping"] }); };

  const addM = useMutation({
    mutationFn: (body: any) => api("/api/pantry", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); setShowAdd(false); setName(""); setQty("1"); setExpires(""); setPrice(""); },
  });
  const delM = useMutation({ mutationFn: (id: string) => api(`/api/pantry/${id}`, { method: "DELETE" }), onSuccess: invalidate });
  const finishM = useMutation({
    mutationFn: (id: string) => api<{ lasted_days: number; new_estimate_days: number; added_to_shopping: any }>(`/api/pantry/${id}/finished`, { method: "POST", body: JSON.stringify({ reorder: true }) }),
    onSuccess: (r) => {
      invalidate();
      const msg = `È durato ${r.lasted_days} giorni: la prossima volta stimerò ${r.new_estimate_days} giorni.${r.added_to_shopping ? "\nL'ho rimesso nella lista della spesa." : ""}`;
      if (Platform.OS === "web") console.log(msg); else Alert.alert("Segnato come finito", msg);
    },
  });

  const items = useMemo(() => listQ.data || [], [listQ.data]);
  const { useFirst, allGood } = useMemo(() => {
    const uf: any[] = []; const ag: any[] = [];
    for (const i of items) {
      const d = daysUntil(i.expires_at);
      if (d !== null && d <= (food ? 3 : 5)) uf.push({ ...i, _d: d }); else ag.push({ ...i, _d: d });
    }
    uf.sort((a, b) => (a._d ?? 0) - (b._d ?? 0));
    return { useFirst: uf, allGood: ag };
  }, [items, food]);

  const renderRow = (item: any, idx: number) => {
    const d = item._d;
    const urgent = d !== null && d <= (food ? 3 : 5);
    const expired = d !== null && d < 0;
    const cat = categorize(item.name);
    const finished = Number(item.qty) === 0;
    const dateTxt = item.expires_at ? new Date(item.expires_at).toLocaleDateString("it-IT") : "";
    return (
      <Enter key={item.id} index={idx}>
        <View style={[styles.row, finished && { opacity: 0.55 }]} testID={`pantry-row-${item.id}`}>
          <View style={[styles.rowIcon, { backgroundColor: cat.bg }]}>
            <Text style={{ fontSize: 22 }}>{cat.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.rowMeta} numberOfLines={2}>
              {item.qty} {item.unit} · <Text style={{ color: cat.color, fontWeight: "600" }}>{cat.label}</Text>
              {item.price ? `  ·  ${Number(item.price).toFixed(2).replace(".", ",")} €` : ""}
              {dateTxt ? (food || !item.is_estimate ? `  ·  scade ${dateTxt}` : `  ·  finisce circa il ${dateTxt}`) : ""}
            </Text>
          </View>
          {d !== null && !finished && (
            <View style={[styles.badge, { backgroundColor: expired ? colors.error : urgent ? colors.warning : colors.brandTertiary }]}>
              <Text style={[styles.badgeText, { color: expired || urgent ? "#FFF" : colors.onBrandTertiary }]}>
                {food || !item.is_estimate ? (expired ? "SCADUTO" : d === 0 ? "OGGI" : `${d}g`) : (expired ? "FINITO?" : d === 0 ? "OGGI" : `~${d}g`)}
              </Text>
            </View>
          )}
          {!food && !finished && (
            <Pressable testID={`finish-${item.id}`} onPress={() => finishM.mutate(item.id)} style={styles.finishBtn} disabled={finishM.isPending}>
              <Ionicons name="checkmark-done" size={14} color={colors.brandPrimary} />
              <Text style={styles.finishTxt}>Finito</Text>
            </Pressable>
          )}
          <Pressable testID={`del-${item.id}`} onPress={() => delM.mutate(item.id)} style={{ padding: spacing.sm, marginLeft: 2 }} hitSlop={6}>
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
          </Pressable>
        </View>
      </Enter>
    );
  };

  return (
    <View style={styles.root}>
      <GradientHeader title="Dispensa" subtitle={food ? "Cosa hai e cosa consumare prima" : "Prodotti per la casa: ti avviso quando stanno per finire"} paddingTop={insets.top}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {LOCATIONS.map((l) => (
            <Pressable key={l.key} testID={`loc-tab-${l.key}`} onPress={() => setTab(l.key)} style={[styles.tab, tab === l.key && styles.tabActive]}>
              <Text style={{ fontSize: 13 }}>{l.emoji}</Text>
              <Text style={[styles.tabTxt, tab === l.key && styles.tabTxtActive]}>{l.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </GradientHeader>

      <ScrollView refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />} contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        {!food && (
          <View style={styles.infoCard} testID="nonfood-info">
            <Ionicons name="hourglass-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.infoTxt}>Per questi prodotti stimo quando finiranno. Tocca <Text style={{ fontWeight: "700" }}>Finito</Text> quando li esaurisci: imparo quanto durano in casa tua e li rimetto in lista.</Text>
          </View>
        )}
        {useFirst.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Ionicons name="alert-circle" size={16} color={colors.brandSecondary} />
              <Text style={styles.sectionTitle}>{food ? "Da usare prima" : "Stanno per finire"}</Text>
              <Text style={styles.sectionCount}>({useFirst.length})</Text>
            </View>
            {useFirst.map(renderRow)}
          </>
        )}
        {allGood.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Ionicons name="checkmark-circle" size={16} color={colors.brandPrimary} />
              <Text style={styles.sectionTitle}>Tutto ok</Text>
              <Text style={styles.sectionCount}>({allGood.length})</Text>
            </View>
            {allGood.map((it, i) => renderRow(it, i + useFirst.length))}
          </>
        )}
        {items.length === 0 && !listQ.isLoading && (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>{LOCATIONS.find((l) => l.key === tab)?.emoji}</Text>
            <Text style={styles.emptyTxt}>Nessun articolo in {locationLabel(tab)}.{"\n"}Aggiungi il primo con + o scansiona un codice a barre{food ? "" : ": funziona anche con dentifricio, detersivi e carta casa"}</Text>
          </View>
        )}
      </ScrollView>

      <Bounce testID="scan-barcode-fab" onPress={() => router.push({ pathname: "/scan-barcode", params: { location: tab } })} style={[styles.scanFab, { bottom: insets.bottom + 172 }]}>
        <Ionicons name="barcode-outline" size={24} color={colors.onBrandPrimary} />
      </Bounce>
      <Bounce testID="add-pantry-fab" onPress={() => setShowAdd(true)} style={[styles.fab, { bottom: insets.bottom + 100 }]}>
        <Ionicons name="add" size={30} color={colors.onBrandSecondary} />
      </Bounce>

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.modalBg} onPress={() => setShowAdd(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.onSurface }}>Aggiungi in {locationLabel(tab)}</Text>
                <TextInput testID="pantry-name" placeholder={food ? "Nome (es. Pomodori)" : "Nome (es. Detersivo piatti, Tovaglioli)"} placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={styles.input} />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <TextInput testID="pantry-qty" placeholder="Quantità" placeholderTextColor={colors.muted} value={qty} onChangeText={setQty} style={[styles.input, { flex: 1 }]} keyboardType="numeric" />
                  <TextInput testID="pantry-unit" placeholder="Unità" placeholderTextColor={colors.muted} value={unit} onChangeText={setUnit} style={[styles.input, { flex: 1 }]} />
                </View>
                <Text style={styles.label}>{food ? "Scadenza" : "Finisce il (se ha una scadenza stampata)"}</Text>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <TextInput testID="pantry-expires" placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} value={expires} onChangeText={setExpires} style={[styles.input, { flex: 2 }]} />
                  <TextInput testID="pantry-price" placeholder="Prezzo €" placeholderTextColor={colors.muted} value={price} onChangeText={setPrice} style={[styles.input, { flex: 1 }]} keyboardType="decimal-pad" />
                </View>
                <ExpiryReader onResult={(r) => { if (r.expires_at) setExpires(r.expires_at); if (r.name && !name.trim()) setName(r.name); }} />
                {!food && <Text style={styles.hint}>Senza data stimo io quando finirà (es. tovaglioli ≈ 3 settimane) e ti avviso prima che manchi. Quando lo esaurisci tocca “Finito”.</Text>}
                <Pressable testID="pantry-save" onPress={() => name.trim() && addM.mutate({ name: name.trim(), qty: parseFloat(qty) || 1, unit, location: tab, expires_at: expires || null, price: price ? parseFloat(price.replace(",", ".")) || null : null })} style={styles.btn}>
                  <Text style={styles.btnTxt}>{addM.isPending ? "Salvo..." : "Aggiungi"}</Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
