import { useState, useEffect } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { AISLES, loadAisleOrder, saveAisleOrder } from "@/src/aisle-order";
import { aisleCategory } from "@/src/categories";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  hint: { color: c.muted, paddingHorizontal: spacing.lg, marginBottom: spacing.md, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  rowActive: { backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandPrimary },
  num: { width: 24, textAlign: "center", color: c.muted, fontWeight: "700" },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  name: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 15 },
  arrow: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  reset: { alignSelf: "center", marginTop: spacing.lg, paddingVertical: 10, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary },
  resetTxt: { color: c.onSurface, fontWeight: "600" },
}));

export default function AisleOrder() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [order, setOrder] = useState<string[]>(AISLES);
  const isWeb = Platform.OS === "web";

  useEffect(() => { loadAisleOrder().then(setOrder); }, []);

  const commit = (next: string[]) => { setOrder(next); saveAisleOrder(next); };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order]; [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  const renderRow = ({ item, drag, isActive, getIndex }: RenderItemParams<string>) => {
    const cat = aisleCategory(item);
    const i = getIndex() ?? order.indexOf(item);
    return (
      <ScaleDecorator>
        <Pressable testID={`aisle-row-${i}`} onLongPress={isWeb ? undefined : drag} delayLongPress={150} style={[styles.row, isActive && styles.rowActive]}>
          <Text style={styles.num}>{i + 1}</Text>
          <View style={[styles.badge, { backgroundColor: cat.bg }]}><Text style={{ fontSize: 20 }}>{cat.emoji}</Text></View>
          <Text style={styles.name}>{item}</Text>
          <Pressable testID={`aisle-up-${i}`} style={styles.arrow} onPress={() => move(i, -1)} disabled={i === 0}><Ionicons name="chevron-up" size={18} color={i === 0 ? colors.borderStrong : colors.onSurface} /></Pressable>
          <Pressable testID={`aisle-down-${i}`} style={styles.arrow} onPress={() => move(i, 1)} disabled={i === order.length - 1}><Ionicons name="chevron-down" size={18} color={i === order.length - 1 ? colors.borderStrong : colors.onSurface} /></Pressable>
          {!isWeb && <Pressable onPressIn={drag} style={{ paddingLeft: 4 }}><Ionicons name="reorder-three" size={24} color={colors.muted} /></Pressable>}
        </Pressable>
      </ScaleDecorator>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="aisle-back" style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Ordine corsie</Text>
      </View>
      <Text style={styles.hint}>{isWeb ? "Usa le frecce per mettere le corsie nell'ordine del tuo supermercato." : "Tieni premuto e trascina (o usa le frecce) per mettere le corsie nell'ordine del tuo supermercato. La lista seguirà il tuo percorso."}</Text>
      <DraggableFlatList
        data={order}
        keyExtractor={(a) => a}
        onDragEnd={({ data }) => commit(data)}
        renderItem={renderRow}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListFooterComponent={
          <Pressable testID="aisle-reset" style={styles.reset} onPress={() => commit([...AISLES])}><Text style={styles.resetTxt}>Ripristina ordine predefinito</Text></Pressable>
        }
      />
    </View>
  );
}
