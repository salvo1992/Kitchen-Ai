import { View, Text, FlatList, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform, RefreshControl, Share, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useCallback } from "react";
import { api } from "@/src/api";
import { usePullRefresh } from "@/src/use-pull-refresh";
import { useAisleOrder, AISLES } from "@/src/aisle-order";
import { categorize, aisleCategory } from "@/src/categories";
import { ToPantrySheet } from "@/src/components/ToPantrySheet";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";
import { useRouter, useFocusEffect } from "expo-router";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "700", color: c.onSurface, letterSpacing: -0.5 },
  sub: { color: c.muted, marginTop: 2 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  actionTxt: { color: c.onSurface, fontSize: 13, fontWeight: "600" },
  aisleHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 6 },
  aisleBadge: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  aisleTitle: { fontWeight: "800", fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase" },
  aisleCount: { color: c.muted, fontSize: 12, marginLeft: "auto" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  rowCard: { flex: 1, flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, gap: spacing.md },
  catBadge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
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
  const router = useRouter();
  const { order: aisleOrder, reload: reloadOrder } = useAisleOrder();
  useFocusEffect(useCallback(() => { reloadOrder(); }, [reloadOrder]));

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
    const keys = Object.keys(grouped).sort((a, b) => {
      const ia = aisleOrder.indexOf(a), ib = aisleOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    for (const key of keys) {
      arr.push({ _header: key, id: `h_${key}`, _count: grouped[key].filter((i: any) => !i.checked).length });
      arr.push(...grouped[key]);
    }
    return arr;
  }, [grouped, aisleOrder]);

  const totalChecked = (listQ.data || []).filter((x: any) => x.checked).length;
  const [copied, setCopied] = useState(false);
  const [toPantry, setToPantry] = useState<any[] | null>(null);

  const buildText = () => {
    const lines: string[] = ["🛒 Lista della spesa – Smart Kitchen AI", ""];
    const keys = Object.keys(grouped).sort((a, b) => aisleOrder.indexOf(a) - aisleOrder.indexOf(b));
    for (const key of keys) {
      const open = grouped[key].filter((i: any) => !i.checked);
      if (open.length === 0) continue;
      lines.push(`${aisleCategory(key).emoji} ${key}`);
      for (const i of open) lines.push(`☐ ${i.name} — ${i.unit === "q.b." ? "q.b." : `${i.qty} ${i.unit}`}`);
      lines.push("");
    }
    return lines.join("\n").trim();
  };
  const copyList = async () => {
    await Clipboard.setStringAsync(buildText());
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const shareList = async () => {
    const text = buildText();
    if (Platform.OS === "web") { await copyList(); return; }
    try { await Share.share({ message: text }); } catch {}
  };
  const shareWhatsApp = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(buildText())}`;
    if (await Linking.canOpenURL(url)) Linking.openURL(url); else shareList();
  };
  const openCount = (listQ.data || []).length - totalChecked;

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + spacing.sm }}>
        <View style={styles.header}>
          <Text style={styles.title}>Lista spesa</Text>
          <Text style={styles.sub}>{(listQ.data || []).length} articoli · {totalChecked} presi</Text>
          <View style={styles.actions}>
            {openCount > 0 && (
              <>
                <Pressable testID="share-list" style={styles.actionBtn} onPress={shareList}>
                  <Ionicons name="share-social-outline" size={16} color={colors.brandPrimary} />
                  <Text style={styles.actionTxt}>Condividi</Text>
                </Pressable>
                {Platform.OS !== "web" && (
                  <Pressable testID="share-whatsapp" style={styles.actionBtn} onPress={shareWhatsApp}>
                    <Ionicons name="logo-whatsapp" size={16} color={colors.brandPrimary} />
                    <Text style={styles.actionTxt}>WhatsApp</Text>
                  </Pressable>
                )}
                <Pressable testID="copy-list" style={styles.actionBtn} onPress={copyList}>
                  <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={colors.brandPrimary} />
                  <Text style={styles.actionTxt}>{copied ? "Copiata!" : "Copia"}</Text>
                </Pressable>
              </>
            )}
            {totalChecked > 0 && (
              <Pressable testID="clear-checked" style={styles.actionBtn} onPress={() => setToPantry((listQ.data || []).filter((x: any) => x.checked))}>
                <Ionicons name="checkmark-done" size={16} color={colors.brandPrimary} />
                <Text style={styles.actionTxt}>Presi → Dispensa</Text>
              </Pressable>
            )}
            <Pressable testID="aisle-order-btn" style={styles.actionBtn} onPress={() => router.push("/aisle-order")}>
              <Ionicons name="swap-vertical" size={16} color={colors.brandSecondary} />
              <Text style={styles.actionTxt}>Ordine corsie</Text>
            </Pressable>
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
            const hc = aisleCategory(item._header);
            return (
              <View style={styles.aisleHead}>
                <View style={[styles.aisleBadge, { backgroundColor: hc.bg }]}><Text style={{ fontSize: 15 }}>{hc.emoji}</Text></View>
                <Text style={[styles.aisleTitle, { color: hc.color }]}>{item._header}</Text>
                <Text style={styles.aisleCount}>{item._count} da prendere</Text>
              </View>
            );
          }
          const cat = categorize(item.name, item.aisle);
          return (
            <Pressable testID={`shop-row-${item.id}`} style={styles.row} onPress={() => toggle.mutate(item)}>
              <View style={[styles.rowCard, { backgroundColor: item.checked ? colors.surfaceSecondary : cat.bg }]}>
                <View style={[styles.check, item.checked && styles.checkActive, !item.checked && { borderColor: cat.color }]}>
                  {item.checked && <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} />}
                </View>
                <View style={[styles.catBadge, { backgroundColor: colors.surface, opacity: item.checked ? 0.5 : 1 }]}><Text style={{ fontSize: 20 }}>{cat.emoji}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowText, item.checked && styles.rowTextChecked]}>{item.name}</Text>
                  <Text style={styles.rowMeta}>{item.unit === "q.b." ? "q.b." : `${item.qty} ${item.unit}`} · {cat.label}{item.note ? `  ·  ${item.note}` : ""}</Text>
                </View>
                <Pressable onPress={() => del.mutate(item.id)} style={{ padding: spacing.sm }}>
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>
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
                  <Pressable testID={`aisle-${item}`} onPress={() => setAisle(item)} style={[styles.aisleChip, { flexDirection: "row", gap: 4 }, aisle === item && styles.aisleChipActive]}>
                    <Text style={{ fontSize: 13 }}>{aisleCategory(item).emoji}</Text>
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
      {toPantry && <ToPantrySheet items={toPantry} onClose={() => setToPantry(null)} />}
    </View>
  );
}
