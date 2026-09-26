import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Platform, Vibration } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", gap: spacing.md, marginTop: spacing.xl },
  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  chipTxt: { color: c.onSurfaceInverse, fontWeight: "700" },
  clock: { fontSize: 56, fontWeight: "800", color: c.onSurfaceInverse, letterSpacing: 2, fontVariant: ["tabular-nums"] },
  clockDone: { color: c.brandSecondary },
  ctrl: { flexDirection: "row", gap: spacing.md },
  ctrlBtn: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  ctrlMain: { backgroundColor: c.brandPrimary },
  ring: { width: 6, borderRadius: 3, backgroundColor: c.brandPrimary, height: 6 },
  track: { width: 220, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  fill: { height: 6, backgroundColor: c.brandPrimary },
  done: { color: c.brandSecondary, fontWeight: "700" },
}));

/** Extract minute durations from a step ("15 minuti", "1-2 min", "mezz'ora", "un'ora"). */
export function extractMinutes(text: string): number[] {
  const t = text.toLowerCase();
  const out: number[] = [];
  const re = /(\d+(?:[.,]\d+)?)(?:\s*[-–a]\s*(\d+(?:[.,]\d+)?))?\s*(minuti|minuto|min\b|min\.|ore|ora|h\b)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const hi = parseFloat((m[2] || m[1]).replace(",", "."));
    const isHour = /^(ore|ora|h)/.test(m[3]);
    const mins = Math.round(isHour ? hi * 60 : hi);
    if (mins > 0 && mins <= 720 && !out.includes(mins)) out.push(mins);
  }
  if (/mezz['’]?\s?ora/.test(t) && !out.includes(30)) out.push(30);
  if (/un['’]\s?ora/.test(t) && !out.includes(60)) out.push(60);
  if (/quarto d['’]ora/.test(t) && !out.includes(15)) out.push(15);
  return out.slice(0, 3);
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function StepTimer({ stepText }: { stepText: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const minutes = extractMinutes(stepText);
  const [total, setTotal] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const iv = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    iv.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          setRunning(false);
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            Vibration.vibrate([0, 500, 300, 500, 300, 800]);
          }
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => { if (iv.current) clearInterval(iv.current); iv.current = null; };
  }, [running]);

  if (minutes.length === 0) return null;

  const start = (m: number) => { setTotal(m * 60); setLeft(m * 60); setRunning(true); };
  const isDone = total !== null && left === 0;
  const pct = total ? ((total - left) / total) * 100 : 0;

  return (
    <View style={styles.wrap} testID="step-timer">
      {total === null ? (
        <View style={styles.chipRow}>
          {minutes.map((m) => (
            <Pressable key={m} testID={`timer-start-${m}`} style={styles.chip} onPress={() => start(m)}>
              <Ionicons name="timer-outline" size={18} color={colors.brandSecondary} />
              <Text style={styles.chipTxt}>Timer {m} min</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          <Text style={[styles.clock, isDone && styles.clockDone]} testID="timer-clock">{fmt(left)}</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }, isDone && { backgroundColor: colors.brandSecondary }]} /></View>
          {isDone ? <Text style={styles.done} testID="timer-done">⏰ Tempo scaduto!</Text> : null}
          <View style={styles.ctrl}>
            <Pressable testID="timer-reset" style={styles.ctrlBtn} onPress={() => { setRunning(false); setTotal(null); setLeft(0); }}>
              <Ionicons name="close" size={22} color={colors.onSurfaceInverse} />
            </Pressable>
            {!isDone && (
              <Pressable testID="timer-toggle" style={[styles.ctrlBtn, styles.ctrlMain]} onPress={() => setRunning(!running)}>
                <Ionicons name={running ? "pause" : "play"} size={22} color={colors.onBrandPrimary} />
              </Pressable>
            )}
            {!isDone && (
              <Pressable testID="timer-plus" style={styles.ctrlBtn} onPress={() => { setLeft((l) => l + 60); setTotal((t) => (t || 0) + 60); }}>
                <Text style={{ color: colors.onSurfaceInverse, fontWeight: "700", fontSize: 12 }}>+1m</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}
