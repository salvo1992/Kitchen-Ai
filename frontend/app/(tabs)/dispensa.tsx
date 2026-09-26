import { View, Text, Pressable, ScrollView, RefreshControl, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { categorize } from "@/src/categories";
import { usePullRefresh } from "@/src/use-pull-refresh";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  sub: { color: c.muted, marginTop: 2 },
  tabsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, backgroundColor: c.surfaceSecondary, padding: 4, borderRadius: radius.pill },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: "center" },
  tabActive: { backgroundColor: c.surface, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabTxt: { color: c.muted, fontWeight: "600", fontSize: 13 },
  tabTxtActive: { color: c.onSurface },
  sectionHead: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  sectionCount: { color: c.muted, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.divider },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  rowName: { fontWeight: "700", color: c.onSurface, fontSize: 15 },
  rowMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 11, fontWeight: "700" },
  fab: { position: "absolute", right: spacing.lg, backgroundColor: c.brandPrimary, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  scanFab: { position: "absolute", right: spacing.lg, backgroundColor: c.brandSecondary, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  empty: { alignItems: "center", padding: spacing.xl, marginTop: spacing.xl },
  emptyTxt: { color: c.muted, marginTop: spacing.md, textAlign: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, color: c.onSurface },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  locChips: { flexDirection: "row", gap: spacing.sm },
  locChip: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: "center", backgroundColor: c.surfaceSecondary },
  locChipActive: { backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandPrimary },
}));

const LOCATIONS = [
  { key: "pantry", label: "Dispensa", icon: "cube-outline" },
  { key: "fridge", label: "Frigo", icon: "snow-outline" },
  { key: "freezer", label: "Freezer", icon: "ice-cream-outline" },
];

function daysUntil(dateStr?: string) {
  if (!dateStr) return null;
  const d = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

export default function Dispensa() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<"pantry" | "fridge" | "freezer">("pantry");
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pz");
  const [expires, setExpires] = useState("");
  const [price, setPrice] = useState("");

  const listQ = useQuery({
    queryKey: ["pantry", tab],
    queryFn: async () => (await api<{ items: any[] }>(`/api/pantry?location=${tab}`)).items,
  });
  const pull = usePullRefresh(listQ.refetch);

  const addM = useMutation({
    mutationFn: (body: any) => api("/api/pantry", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["pantry-all"] }); qc.invalidateQueries({ queryKey: ["pantry-expiring"] }); setShowAdd(false); setName(""); setQty("1"); setExpires(""); setPrice(""); },
  });
  const delM = useMutation({
    mutationFn: (id: string) => api(`/api/pantry/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["pantry-all"] }); qc.invalidateQueries({ queryKey: ["pantry-expiring"] }); },
  });

  const items = useMemo(() => listQ.data || [], [listQ.data]);
  const { useFirst, allGood } = useMemo(() => {
    const uf: any[] = []; const ag: any[] = [];
    for (const i of items) {
      const d = daysUntil(i.expires_at);
      if (d !== null && d <= 3) uf.push({ ...i, _d: d }); else ag.push({ ...i, _d: d });
    }
    uf.sort((a, b) => (a._d ?? 0) - (b._d ?? 0));
    return { useFirst: uf, allGood: ag };
  }, [items]);

  const renderRow = (item: any) => {
    const d = item._d;
    const urgent = d !== null && d <= 3;
    const expired = d !== null && d < 0;
    const cat = categorize(item.name);
    return (
      <View key={item.id} style={styles.row} testID={`pantry-row-${item.id}`}>
        <View style={[styles.rowIcon, { backgroundColor: cat.bg }]}>
          <Text style={{ fontSize: 20 }}>{cat.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowMeta}>{item.qty} {item.unit} · <Text style={{ color: cat.color, fontWeight: "600" }}>{cat.label}</Text>{item.price ? `  ·  ${Number(item.price).toFixed(2).replace(".", ",")} €` : ""}{item.expires_at ? `  ·  scade ${new Date(item.expires_at).toLocaleDateString("it-IT")}` : ""}</Text>
        </View>
        {d !== null && (
          <View style={[styles.badge, { backgroundColor: expired ? colors.error : urgent ? colors.warning : colors.brandTertiary }]}>
            <Text style={[styles.badgeText, { color: expired || urgent ? "#FFF" : colors.onBrandTertiary }]}>
              {expired ? "SCADUTO" : d === 0 ? "OGGI" : `${d}g`}
            </Text>
          </View>
        )}
        <Pressable testID={`del-${item.id}`} onPress={() => delM.mutate(item.id)} style={{ padding: spacing.sm, marginLeft: 4 }}>
          <Ionicons name="trash-outline" size={18} color={colors.muted} />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + spacing.sm }}>
        <View style={styles.header}>
          <Text style={styles.title}>Dispensa</Text>
          <Text style={styles.sub}>Cosa hai e cosa consumare prima</Text>
          <View style={styles.tabsRow}>
            {LOCATIONS.map((l) => (
              <Pressable key={l.key} testID={`loc-tab-${l.key}`} onPress={() => setTab(l.key as any)} style={[styles.tab, tab === l.key && styles.tabActive]}>
                <Text style={[styles.tabTxt, tab === l.key && styles.tabTxtActive]}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {useFirst.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Ionicons name="alert-circle" size={16} color={colors.brandSecondary} />
              <Text style={styles.sectionTitle}>Da usare prima</Text>
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
            {allGood.map(renderRow)}
          </>
        )}
        {items.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="basket-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTxt}>Nessun articolo in {LOCATIONS.find(l => l.key === tab)?.label}.{"\n"}Aggiungi il primo con + o scansiona un codice a barre</Text>
          </View>
        )}
      </ScrollView>

      <Pressable testID="scan-barcode-fab" onPress={() => router.push({ pathname: "/scan-barcode", params: { location: tab } })} style={[styles.scanFab, { bottom: insets.bottom + 168 }]}>
        <Ionicons name="barcode-outline" size={24} color={colors.onBrandSecondary} />
      </Pressable>

      <Pressable testID="add-pantry-fab" onPress={() => setShowAdd(true)} style={[styles.fab, { bottom: insets.bottom + 100 }]}>
        <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
      </Pressable>

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.modalBg} onPress={() => setShowAdd(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.onSurface }}>Aggiungi in {LOCATIONS.find(l => l.key === tab)?.label}</Text>
              <TextInput testID="pantry-name" placeholder="Nome (es. Pomodori)" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={styles.input} />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput testID="pantry-qty" placeholder="Quantità" placeholderTextColor={colors.muted} value={qty} onChangeText={setQty} style={[styles.input, { flex: 1 }]} keyboardType="numeric" />
                <TextInput testID="pantry-unit" placeholder="Unità" placeholderTextColor={colors.muted} value={unit} onChangeText={setUnit} style={[styles.input, { flex: 1 }]} />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput testID="pantry-expires" placeholder="Scadenza (YYYY-MM-DD)" placeholderTextColor={colors.muted} value={expires} onChangeText={setExpires} style={[styles.input, { flex: 2 }]} />
                <TextInput testID="pantry-price" placeholder="Prezzo €" placeholderTextColor={colors.muted} value={price} onChangeText={setPrice} style={[styles.input, { flex: 1 }]} keyboardType="decimal-pad" />
              </View>
              <Pressable testID="pantry-save" onPress={() => name.trim() && addM.mutate({ name: name.trim(), qty: parseFloat(qty) || 1, unit, location: tab, expires_at: expires || null, price: price ? parseFloat(price.replace(",", ".")) || null : null })} style={styles.btn}>
                <Text style={styles.btnTxt}>{addM.isPending ? "Salvo..." : "Aggiungi"}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
