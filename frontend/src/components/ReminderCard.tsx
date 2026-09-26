import { useEffect, useState } from "react";
import { View, Text, Pressable, Switch, Platform, Linking } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { DEFAULT_REMINDER, ReminderSettings, getReminderSettings, saveReminderSettings, getNotificationPermission, requestNotificationPermission, syncExpiryReminder } from "@/src/reminders";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { flex: 1, color: c.onSurface, fontWeight: "600" },
  sub: { color: c.muted, fontSize: 12, marginTop: 2 },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  time: { fontSize: 32, fontWeight: "800", color: c.onSurface, minWidth: 60, textAlign: "center", letterSpacing: 1 },
  colon: { fontSize: 28, fontWeight: "800", color: c.muted },
  presets: { flexDirection: "row", gap: spacing.sm, justifyContent: "center", flexWrap: "wrap" },
  preset: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surface },
  presetActive: { backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandPrimary },
  presetTxt: { color: c.onSurface, fontSize: 12, fontWeight: "600" },
  warn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: c.surface, borderRadius: radius.sm, padding: spacing.md },
  warnTxt: { flex: 1, color: c.muted, fontSize: 12, lineHeight: 17 },
  link: { color: c.brandPrimary, fontWeight: "700", fontSize: 12 },
}));

const PRESETS = [[8, 0], [9, 0], [12, 30], [18, 0], [20, 0]];
const pad = (n: number) => String(n).padStart(2, "0");

export function ReminderCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [s, setS] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [perm, setPerm] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    getReminderSettings().then(setS);
    getNotificationPermission().then(setPerm);
  }, []);

  const apply = async (next: ReminderSettings) => {
    setS(next);
    await saveReminderSettings(next);
    const cached = qc.getQueryData<any[]>(["pantry-expiring"]);
    const items = cached ?? (await api<{ items: any[] }>("/api/pantry/expiring?days=3").then((r) => r.items).catch(() => []));
    await syncExpiryReminder(items, next);
  };

  const toggle = async (on: boolean) => {
    if (on && !isWeb) {
      let p = await getNotificationPermission();
      if (!p.granted && p.canAskAgain) p = await requestNotificationPermission();
      setPerm(p);
      if (!p.granted) { await apply({ ...s, enabled: false }); return; }
    }
    await apply({ ...s, enabled: on });
  };

  const blocked = !isWeb && perm && !perm.granted && !perm.canAskAgain;

  return (
    <View style={styles.card} testID="reminder-card">
      <View style={styles.head}>
        <Ionicons name="notifications-outline" size={22} color={colors.brandPrimary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Promemoria scadenze</Text>
          <Text style={styles.sub}>{isWeb ? "Disponibile sull'app per telefono" : `Ogni giorno alle ${pad(s.hour)}:${pad(s.minute)} con i prodotti da usare entro 3 giorni`}</Text>
        </View>
        <Switch testID="reminder-switch" value={s.enabled} onValueChange={toggle} disabled={isWeb} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor={colors.surface} />
      </View>

      {blocked && (
        <View style={styles.warn}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.warnTxt}>Le notifiche sono disattivate per l&apos;app. Abilitale dalle impostazioni del telefono per ricevere il promemoria.</Text>
          <Pressable testID="reminder-open-settings" onPress={() => Linking.openSettings()}><Text style={styles.link}>Apri</Text></Pressable>
        </View>
      )}

      {s.enabled && (
        <>
          <View style={styles.timeRow}>
            <Pressable testID="hour-minus" style={styles.stepBtn} onPress={() => apply({ ...s, hour: (s.hour + 23) % 24 })}><Ionicons name="remove" size={18} color={colors.onSurface} /></Pressable>
            <Text style={styles.time} testID="reminder-hour">{pad(s.hour)}</Text>
            <Pressable testID="hour-plus" style={styles.stepBtn} onPress={() => apply({ ...s, hour: (s.hour + 1) % 24 })}><Ionicons name="add" size={18} color={colors.onSurface} /></Pressable>
            <Text style={styles.colon}>:</Text>
            <Pressable testID="minute-toggle" style={[styles.stepBtn, { width: 64, borderRadius: radius.pill }]} onPress={() => apply({ ...s, minute: s.minute === 0 ? 30 : 0 })}>
              <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 18 }} testID="reminder-minute">{pad(s.minute)}</Text>
            </Pressable>
          </View>
          <View style={styles.presets}>
            {PRESETS.map(([h, m]) => (
              <Pressable key={`${h}${m}`} testID={`preset-${h}-${m}`} onPress={() => apply({ ...s, hour: h, minute: m })} style={[styles.preset, s.hour === h && s.minute === m && styles.presetActive]}>
                <Text style={styles.presetTxt}>{pad(h)}:{pad(m)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
