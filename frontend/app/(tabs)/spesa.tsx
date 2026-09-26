import { View, Text, FlatList, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform, RefreshControl } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/src/api";
import { usePullRefresh } from "@/src/use-pull-refresh";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const AISLES = ["Frutta e verdura", "Carne e pesce", "Latticini", "Pane e cereali", "Dispensa", "Surgelati", "Bevande", "Altro"];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  sub: { color: c.muted, marginTop: 2 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  actionTxt: { color: c.onSurface, fontSize: 13, fontWeight: "600" },
  aisleHead: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 4 },
  aisleTitle: { color: c.brandPrimary, fontWeight: "700", fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  checkActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  rowText: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  rowTextChecked: { color: c.muted, textDecorationLine: "line-through", fontWeight: "500" },
  rowMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  fab: { position: "absolute", right: spacing.lg, backgroundColor: c.brandPrimary, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  empty: { alignItems: "center", padding: spacing.xl, marginTop: spacing.xl },
  emptyTxt: { color: c.muted, marginTop: spacing.md, textAlign: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, color: c.onSurface },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  aisleChip: { paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  aisleChipActive: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary, borderWidth: 1 },
  aisleChipTxt: { color: c.onSurface, fontSize: 12, fontWeight: "600" },
}));

export default function Spesa() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pz");
  const [aisle, setAisle] = useState(AISLES[0]);

  const listQ = useQuery({
    queryKey: ["shopping"],
    queryFn: async () => (await api<{ items: any[] }>("/api/shopping")).items,
  });
  const pull = usePullRefresh(listQ.refetch);

  const addM = useMutation({
    mutationFn: (b: any) => api("/api/shopping", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shopping"] }); setShowAdd(false); setName(""); setQty("1"); },
  });
  const toggle = useMutation({
    mutationFn: (i: any) => api(`/api/shopping/${i.id}`, { method: "PATCH", body: JSON.stringify({ checked: !i.checked }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/api/shopping/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });
  const clearChecked = useMutation({
    mutationFn: () => api("/api/shopping/clear-checked", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const it of listQ.data || []) {
      const k = it.aisle || "Altro";
      (g[k] = g[k] || []).push(it);
    }
    for (const k of Object.keys(g)) g[k].sort((a, b) => Number(a.checked) - Number(b.checked));
    return g;
  }, [listQ.data]);

  const flat = useMemo(() => {
    const arr: any[] = [];
    for (const key of Object.keys(grouped)) {
      arr.push({ _header: key, id: `h_${key}` });
      arr.push(...grouped[key]);
    }
    return arr;
  }, [grouped]);

  const totalChecked = (listQ.data || []).filter((x: any) => x.checked).length;

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + spacing.sm }}>
        <View style={styles.header}>
          <Text style={styles.title}>Lista spesa</Text>
          <Text style={styles.sub}>{(listQ.data || []).length} articoli · {totalChecked} presi</Text>
          <View style={styles.actions}>
            {totalChecked > 0 && (
              <Pressable testID="clear-checked" style={styles.actionBtn} onPress={() => clearChecked.mutate()}>
                <Ionicons name="checkmark-done" size={16} color={colors.brandPrimary} />
                <Text style={styles.actionTxt}>Rimuovi presi</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <FlatList
        data={flat}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
        renderItem={({ item }) => {
          if (item._header) {
            return <View style={styles.aisleHead}><Text style={styles.aisleTitle}>{item._header}</Text></View>;
          }
          return (
            <Pressable testID={`shop-row-${item.id}`} style={styles.row} onPress={() => toggle.mutate(item)}>
              <View style={[styles.check, item.checked && styles.checkActive]}>
                {item.checked && <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, item.checked && styles.rowTextChecked]}>{item.name}</Text>
                <Text style={styles.rowMeta}>{item.unit === "q.b." ? "q.b." : `${item.qty} ${item.unit}`}{item.note ? `  ·  ${item.note}` : ""}</Text>
              </View>
              <Pressable onPress={() => del.mutate(item.id)} style={{ padding: spacing.sm }}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cart-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTxt}>Lista vuota.{"\n"}Aggiungi articoli con +</Text>
          </View>
        }
      />

      <Pressable testID="add-shop-fab" onPress={() => setShowAdd(true)} style={[styles.fab, { bottom: insets.bottom + 100 }]}>
        <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
      </Pressable>

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.modalBg} onPress={() => setShowAdd(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.onSurface }}>Aggiungi alla spesa</Text>
              <TextInput testID="shop-name" placeholder="Articolo" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={styles.input} />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput testID="shop-qty" placeholder="Q.tà" placeholderTextColor={colors.muted} value={qty} onChangeText={setQty} style={[styles.input, { flex: 1 }]} keyboardType="numeric" />
                <TextInput testID="shop-unit" placeholder="Unità" placeholderTextColor={colors.muted} value={unit} onChangeText={setUnit} style={[styles.input, { flex: 1 }]} />
              </View>
              <FlatList
                data={AISLES}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(x) => x}
                contentContainerStyle={{ gap: spacing.sm }}
                renderItem={({ item }) => (
                  <Pressable testID={`aisle-${item}`} onPress={() => setAisle(item)} style={[styles.aisleChip, aisle === item && styles.aisleChipActive]}>
                    <Text style={styles.aisleChipTxt}>{item}</Text>
                  </Pressable>
                )}
              />
              <Pressable testID="shop-save" onPress={() => name.trim() && addM.mutate({ name: name.trim(), qty: parseFloat(qty) || 1, unit, aisle })} style={styles.btn}>
                <Text style={styles.btnTxt}>{addM.isPending ? "Salvo..." : "Aggiungi"}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
