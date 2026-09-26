import { useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Share, Platform, Alert } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  hero: { padding: spacing.xl, alignItems: "center" },
  heroIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 22, fontWeight: "700", color: c.onSurface, textAlign: "center", marginTop: spacing.md },
  heroSub: { color: c.muted, textAlign: "center", marginTop: spacing.sm, lineHeight: 21 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.md },
  cardTitle: { fontWeight: "700", color: c.onSurface, fontSize: 16 },
  input: { backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, color: c.onSurface, fontSize: 15 },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  btnGhost: { backgroundColor: c.brandTertiary },
  btnGhostTxt: { color: c.brandPrimary, fontWeight: "700" },
  codeBox: { alignItems: "center", padding: spacing.lg, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderStyle: "dashed", borderColor: c.brandPrimary },
  code: { fontSize: 32, fontWeight: "800", letterSpacing: 6, color: c.onSurface },
  codeHint: { color: c.muted, fontSize: 12, marginTop: 4 },
  member: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  memberName: { color: c.onSurface, fontWeight: "600" },
  memberMail: { color: c.muted, fontSize: 12 },
  you: { backgroundColor: c.brandSecondary, color: c.onBrandSecondary, fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  leave: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", padding: spacing.lg, marginHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: c.error },
  leaveTxt: { color: c.error, fontWeight: "700" },
  err: { color: c.error, fontSize: 13 },
  live: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginBottom: spacing.md },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.success },
}));

type HouseholdView = { household: { id: string; name: string; invite_code: string; owner_id: string; members: string[] } | null; members: { user_id: string; name?: string; email: string }[] };

export default function Family() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, refresh } = useAuth();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const hQ = useQuery({ queryKey: ["household"], queryFn: () => api<HouseholdView>("/api/household") });

  const afterChange = async () => {
    await refresh();
    qc.invalidateQueries();
  };
  const createM = useMutation({ mutationFn: () => api("/api/household", { method: "POST", body: JSON.stringify({ name: name.trim() || "La mia famiglia" }) }), onSuccess: afterChange });
  const joinM = useMutation({ mutationFn: () => api("/api/household/join", { method: "POST", body: JSON.stringify({ invite_code: code.trim() }) }), onSuccess: afterChange });
  const leaveM = useMutation({ mutationFn: () => api("/api/household/leave", { method: "POST" }), onSuccess: afterChange });

  const confirmLeave = () => {
    if (Platform.OS === "web") { leaveM.mutate(); return; }
    Alert.alert("Uscire dalla famiglia?", "I tuoi articoli torneranno privati e non vedrai più quelli degli altri membri.", [
      { text: "Annulla", style: "cancel" }, { text: "Esci", style: "destructive", onPress: () => leaveM.mutate() },
    ]);
  };

  const share = async (c: string) => {
    try { await Share.share({ message: `Unisciti alla mia famiglia su CucinaSmart AI! Codice invito: ${c}` }); } catch {}
  };

  const h = hQ.data?.household;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Famiglia</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {hQ.isLoading && <ActivityIndicator style={{ marginTop: 60 }} color={colors.brandPrimary} />}

        {!hQ.isLoading && !h && (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}><Ionicons name="people" size={36} color={colors.brandPrimary} /></View>
              <Text style={styles.heroTitle}>Una cucina, tutta la famiglia</Text>
              <Text style={styles.heroSub}>Condividi dispensa, lista della spesa, ricette e calendario pasti. Ogni modifica si aggiorna sui dispositivi di tutti.</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Crea la tua famiglia</Text>
              <TextInput testID="family-name" placeholder="Nome (es. Casa Rossi)" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={styles.input} />
              <Pressable testID="family-create" onPress={() => createM.mutate()} style={styles.btn} disabled={createM.isPending}>
                {createM.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Ionicons name="add-circle-outline" size={18} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>Crea e ottieni il codice</Text></>}
              </Pressable>
              {createM.isError && <Text style={styles.err}>{(createM.error as any)?.message}</Text>}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Hai un codice invito?</Text>
              <TextInput testID="family-code" placeholder="Es. A1B2C3" placeholderTextColor={colors.muted} value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" maxLength={6} style={[styles.input, { letterSpacing: 4, fontWeight: "700" }]} />
              <Pressable testID="family-join" onPress={() => joinM.mutate()} style={[styles.btn, styles.btnGhost]} disabled={joinM.isPending || code.trim().length < 6}>
                {joinM.isPending ? <ActivityIndicator color={colors.brandPrimary} /> : <><Ionicons name="enter-outline" size={18} color={colors.brandPrimary} /><Text style={styles.btnGhostTxt}>Unisciti</Text></>}
              </Pressable>
              {joinM.isError && <Text style={styles.err} testID="join-error">{(joinM.error as any)?.message}</Text>}
            </View>
          </>
        )}

        {h && (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}><Ionicons name="home" size={36} color={colors.brandPrimary} /></View>
              <Text style={styles.heroTitle} testID="family-title">{h.name}</Text>
              <View style={[styles.live, { marginTop: spacing.sm }]}><View style={styles.liveDot} /><Text style={{ color: colors.muted, fontSize: 12 }}>Sincronizzazione attiva</Text></View>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Codice invito</Text>
              <View style={styles.codeBox}>
                <Text style={styles.code} testID="invite-code">{h.invite_code}</Text>
                <Text style={styles.codeHint}>Chi lo inserisce entra nella famiglia</Text>
              </View>
              <Pressable testID="share-code" onPress={() => share(h.invite_code)} style={[styles.btn, styles.btnGhost]}>
                <Ionicons name="share-social-outline" size={18} color={colors.brandPrimary} /><Text style={styles.btnGhostTxt}>Condividi codice</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Membri ({hQ.data?.members.length || 0})</Text>
              {hQ.data?.members.map((m) => (
                <View key={m.user_id} style={styles.member} testID={`member-${m.user_id}`}>
                  <View style={styles.avatar}><Ionicons name="person" size={18} color={colors.brandPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{m.name || m.email}</Text>
                    <Text style={styles.memberMail}>{m.email}</Text>
                  </View>
                  {m.user_id === user?.user_id && <Text style={styles.you}>TU</Text>}
                  {m.user_id === h.owner_id && <Ionicons name="star" size={14} color={colors.brandSecondary} />}
                </View>
              ))}
            </View>
            <Pressable testID="family-leave" onPress={confirmLeave} style={styles.leave} disabled={leaveM.isPending}>
              {leaveM.isPending ? <ActivityIndicator color={colors.error} /> : <><Ionicons name="exit-outline" size={18} color={colors.error} /><Text style={styles.leaveTxt}>Esci dalla famiglia</Text></>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}
