import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, Platform, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { ReminderCard } from "@/src/components/ReminderCard";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  profile: { alignItems: "center", padding: spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  name: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  email: { color: c.muted, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.md },
  rowTxt: { flex: 1, color: c.onSurface, fontWeight: "600" },
  logout: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: c.error, borderRadius: radius.pill, marginHorizontal: spacing.lg, marginTop: spacing.lg, justifyContent: "center", gap: spacing.sm },
  logoutTxt: { color: c.onError, fontWeight: "700" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.md, marginTop: spacing.md, marginHorizontal: spacing.lg },
  deleteTxt: { color: c.error, fontWeight: "600", fontSize: 13 },
  confirmBox: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.lg, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.error },
}));

export default function Settings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [confirmWeb, setConfirmWeb] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const doDelete = async () => {
    setDeleting(true); setDeleteError(null);
    try { await deleteAccount(); } catch (e: any) { setDeleteError(e?.message || "Errore, riprova"); } finally { setDeleting(false); setConfirmWeb(false); }
  };
  const confirmDelete = () => {
    if (Platform.OS === "web") { setConfirmWeb(true); return; }
    Alert.alert("Eliminare l'account?", "Verranno eliminati definitivamente account, ricette, dispensa, spesa, pasti e storico. L'operazione è irreversibile.", [
      { text: "Annulla", style: "cancel" }, { text: "Elimina", style: "destructive", onPress: doDelete },
    ]);
  };
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Profilo</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.profile}>
          <View style={styles.avatar}><Ionicons name="person" size={40} color={colors.brandPrimary} /></View>
          <Text style={styles.name}>{user?.name || "Chef"}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
        <ReminderCard />
        <Pressable testID="settings-family" style={styles.row} onPress={() => router.push("/family")}><Ionicons name="people-outline" size={22} color={colors.brandPrimary} /><Text style={styles.rowTxt}>Famiglia</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{user?.household_id ? "Attiva" : "Condividi la cucina"}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
        <Pressable testID="settings-plan" style={styles.row} onPress={() => router.push("/weekly-plan")}><Ionicons name="sparkles-outline" size={22} color={colors.brandPrimary} /><Text style={styles.rowTxt}>Piano settimanale AI</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
        <Pressable testID="settings-history" style={styles.row} onPress={() => router.push("/history")}><Ionicons name="time-outline" size={22} color={colors.brandPrimary} /><Text style={styles.rowTxt}>Storico cucinato</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/calendar")}><Ionicons name="calendar-outline" size={22} color={colors.brandPrimary} /><Text style={styles.rowTxt}>Calendario pasti</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/import-photo")}><Ionicons name="camera-outline" size={22} color={colors.brandPrimary} /><Text style={styles.rowTxt}>Importa piano da foto</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/what-can-i-cook")}><Ionicons name="restaurant-outline" size={22} color={colors.brandPrimary} /><Text style={styles.rowTxt}>Cosa cucino?</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>
        <Pressable testID="logout" style={styles.logout} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.onError} />
          <Text style={styles.logoutTxt}>Esci</Text>
        </Pressable>
        <Pressable testID="delete-account" style={styles.deleteBtn} onPress={confirmDelete} disabled={deleting}>
          {deleting ? <ActivityIndicator size="small" color={colors.error} /> : <Ionicons name="trash-outline" size={18} color={colors.error} />}
          <Text style={styles.deleteTxt}>Elimina account e dati</Text>
        </Pressable>
        {Platform.OS === "web" && confirmWeb && (
          <View style={styles.confirmBox} testID="delete-confirm">
            <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Sei sicuro? L&apos;operazione è irreversibile.</Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Verranno eliminati account, ricette, dispensa, spesa, pasti e storico.</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable testID="delete-cancel" style={[styles.row, { flex: 1, margin: 0, justifyContent: "center" }]} onPress={() => setConfirmWeb(false)}><Text style={{ color: colors.onSurface, fontWeight: "700" }}>Annulla</Text></Pressable>
              <Pressable testID="delete-confirm-btn" style={[styles.logout, { flex: 1, margin: 0 }]} onPress={doDelete}><Text style={styles.logoutTxt}>Elimina</Text></Pressable>
            </View>
          </View>
        )}
        {deleteError && <Text style={{ color: colors.error, textAlign: "center", marginTop: spacing.sm }}>{deleteError}</Text>}
      </ScrollView>
    </View>
  );
}
