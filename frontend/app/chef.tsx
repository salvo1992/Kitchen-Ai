import { View, Text, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "700", color: c.onSurface, flex: 1 },
  avatarChef: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  chat: { padding: spacing.lg, gap: spacing.md },
  bubble: { padding: spacing.md, borderRadius: radius.lg, maxWidth: "85%" },
  user: { backgroundColor: c.surfaceSecondary, alignSelf: "flex-end", borderBottomRightRadius: 6 },
  ai: { backgroundColor: c.brandTertiary, alignSelf: "flex-start", borderBottomLeftRadius: 6 },
  bubbleText: { color: c.onSurface, lineHeight: 21 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.lg },
  chip: { backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  chipText: { color: c.onSurface, fontSize: 13, fontWeight: "600" },
  inputBar: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.surface },
  input: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10, color: c.onSurface },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));

const SUGGESTIONS = [
  "Cosa cucino con quello che ho?",
  "Idee veloci per stasera",
  "Pianifica la mia settimana",
  "Ricetta senza glutine",
];

export default function ChefAI() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const [sessionId] = useState(`chef_${Date.now()}`);

  const historyQ = useQuery({
    queryKey: ["ai-history", sessionId],
    queryFn: async () => (await api<{ items: any[] }>(`/api/ai/history?session_id=${sessionId}`)).items,
  });

  const sendM = useMutation({
    mutationFn: async (msg: string) => api<{ reply: string }>("/api/ai/chat", { method: "POST", body: JSON.stringify({ message: msg, session_id: sessionId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-history", sessionId] }),
  });

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200); }, [historyQ.data, sendM.isPending]);

  const send = (text?: string) => {
    const t = (text ?? input).trim();
    if (!t) return;
    setInput("");
    sendM.mutate(t);
  };

  const msgs = historyQ.data || [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="chef-close" style={styles.close} onPress={() => router.back()}>
          <Ionicons name="close" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Chef AI</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Il tuo assistente cucina</Text>
        </View>
        <View style={styles.avatarChef}><Ionicons name="sparkles" size={20} color={colors.onBrandSecondary} /></View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.chat}>
          {msgs.length === 0 && (
            <View style={[styles.bubble, styles.ai]}>
              <Text style={styles.bubbleText}>Ciao! Sono Chef AI 👋 Come posso aiutarti in cucina oggi?</Text>
            </View>
          )}
          {msgs.map((m: any) => (
            <View key={m.id} style={[styles.bubble, m.role === "user" ? styles.user : styles.ai]}>
              <Text style={styles.bubbleText}>{m.content}</Text>
            </View>
          ))}
          {sendM.isPending && (
            <View style={[styles.bubble, styles.ai]}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          )}
        </ScrollView>

        {msgs.length === 0 && (
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} testID={`suggest-${s}`} onPress={() => send(s)} style={styles.chip}>
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <TextInput testID="chef-input" placeholder="Scrivi al tuo Chef..." placeholderTextColor={colors.muted} value={input} onChangeText={setInput} style={styles.input} onSubmitEditing={() => send()} returnKeyType="send" />
          <Pressable testID="chef-send" onPress={() => send()} style={styles.send}>
            <Ionicons name="send" size={18} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
