import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  wrap: { backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  month: { color: c.onSurface, fontWeight: "700", textTransform: "capitalize" },
  nav: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayTxt: { color: c.onSurface, fontSize: 13 },
  dow: { color: c.muted, fontSize: 10, fontWeight: "700" },
  sel: { backgroundColor: c.brandPrimary, borderRadius: 999, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  today: { borderWidth: 1, borderColor: c.brandSecondary, borderRadius: 999, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary },
  chipTxt: { color: c.onSurface, fontSize: 12, fontWeight: "600" },
}));

const DOW = ["L", "M", "M", "G", "V", "S", "D"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const QUICK: [string, () => string | null][] = [["Nessuna", () => null], ["+3 giorni", () => plusDays(3)], ["+1 sett.", () => plusDays(7)], ["+2 sett.", () => plusDays(14)], ["+1 mese", () => plusDays(30)], ["+6 mesi", () => plusDays(180)]];

/** Compact inline month calendar with quick-pick chips. value is YYYY-MM-DD or null. */
export function DatePicker({ value, onChange, testID }: { value: string | null; onChange: (v: string | null) => void; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const base = value ? new Date(value + "T12:00:00") : new Date();
  const [view, setView] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const todayIso = iso(new Date());

  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.chips}>
        {QUICK.map(([l, f]) => {
          const v = f();
          const active = v === value;
          return (
            <Pressable key={l} testID={`${testID}-quick-${l}`} style={[styles.chip, active && { backgroundColor: colors.brandTertiary }]} onPress={() => { onChange(v); if (v) setView(new Date(v.slice(0, 7) + "-01T12:00:00")); }}>
              <Text style={[styles.chipTxt, active && { color: colors.brandPrimary }]}>{l}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.head}>
        <Pressable style={styles.nav} onPress={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={16} color={colors.onSurface} /></Pressable>
        <Text style={styles.month}>{view.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</Text>
        <Pressable style={styles.nav} onPress={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}><Ionicons name="chevron-forward" size={16} color={colors.onSurface} /></Pressable>
      </View>
      <View style={styles.grid}>
        {DOW.map((d, i) => <View key={`d${i}`} style={[styles.cell, { aspectRatio: 2 }]}><Text style={styles.dow}>{d}</Text></View>)}
        {cells.map((n, i) => {
          if (!n) return <View key={`e${i}`} style={styles.cell} />;
          const v = iso(new Date(view.getFullYear(), view.getMonth(), n));
          const sel = v === value;
          return (
            <Pressable key={v} testID={`${testID}-day-${v}`} style={styles.cell} onPress={() => onChange(v)}>
              <View style={sel ? styles.sel : v === todayIso ? styles.today : undefined}>
                <Text style={[styles.dayTxt, sel && { color: colors.onBrandPrimary, fontWeight: "700" }]}>{n}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {value && <Text style={{ color: colors.brandPrimary, fontWeight: "600", fontSize: 12, textAlign: "center" }}>Scade il {new Date(value + "T12:00:00").toLocaleDateString("it-IT")}</Text>}
    </View>
  );
}
