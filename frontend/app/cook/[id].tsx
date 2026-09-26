import { View, Text, Pressable } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { api } from "@/src/api";
import { StepTimer } from "@/src/components/StepTimer";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceInverse },
  content: { flex: 1, padding: spacing.xl, justifyContent: "center", alignItems: "center" },
  step: { color: c.onSurfaceInverse, fontSize: 30, lineHeight: 40, textAlign: "center", fontWeight: "500" },
  progress: { color: c.muted, fontSize: 14, marginBottom: spacing.xl },
  bar: { flexDirection: "row", padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderTopColor: "#333" },
  btn: { flex: 1, backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  btnSec: { flex: 1, backgroundColor: "transparent", borderColor: c.muted, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  close: { position: "absolute", right: spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
}));

export default function CookMode() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [idx, setIdx] = useState(0);

  const q = useQuery({ queryKey: ["recipe", id, "cook"], queryFn: () => api<any>(`/api/recipes/${id}`) });
  const steps: string[] = q.data?.steps || [];
  const cur = steps[idx] || "";

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + spacing.md, alignItems: "center" }}>
        <Text style={{ color: colors.onSurfaceInverse, fontWeight: "700", fontSize: 18 }}>{q.data?.title || "Cucina"}</Text>
        <Pressable testID="cook-close" style={[styles.close, { top: insets.top + spacing.md }]} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color="#FFF" />
        </Pressable>
      </View>
      <View style={styles.content}>
        <Text style={styles.progress}>Passo {idx + 1} di {steps.length}</Text>
        <Text style={styles.step}>{cur}</Text>
        <StepTimer key={idx} stepText={cur} />
      </View>
      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable testID="prev-step" style={styles.btnSec} onPress={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>
          <Ionicons name="arrow-back" size={18} color={colors.onSurfaceInverse} />
          <Text style={{ color: colors.onSurfaceInverse, fontWeight: "700" }}>Indietro</Text>
        </Pressable>
        <Pressable testID="next-step" style={styles.btn} onPress={() => idx < steps.length - 1 ? setIdx(idx + 1) : router.back()}>
          <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>{idx < steps.length - 1 ? "Avanti" : "Finito"}</Text>
          <Ionicons name={idx < steps.length - 1 ? "arrow-forward" : "checkmark"} size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
    </View>
  );
}
