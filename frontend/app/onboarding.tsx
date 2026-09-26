import { useState, useRef } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";
import { CATEGORIES } from "@/src/categories";
import { completeOnboarding } from "@/src/storage-keys";

const SLIDES = [
  {
    key: "dispensa",
    icon: "basket" as const,
    accent: CATEGORIES.verdura.color,
    bg: CATEGORIES.verdura.bg,
    emojis: ["🥦", "🧀", "🥩", "🍞", "🥛", "🍎"],
    title: "La tua dispensa, sempre sotto controllo",
    text: "Aggiungi prodotti a mano o scansionando il codice a barre. Ti avvisiamo prima che scadano e teniamo il conto di quanto risparmi.",
  },
  {
    key: "chef",
    icon: "sparkles" as const,
    accent: CATEGORIES.pasta.color,
    bg: CATEGORIES.pasta.bg,
    emojis: ["👨‍🍳", "🍝", "✨", "📅", "🥘", "🍲"],
    title: "Chef AI cucina con te",
    text: "Chiedi cosa preparare con ciò che hai, genera il piano settimanale, importa menu da una foto e segui le ricette passo-passo con i timer.",
  },
  {
    key: "famiglia",
    icon: "people" as const,
    accent: CATEGORIES.pesce.color,
    bg: CATEGORIES.pesce.bg,
    emojis: ["👩‍👩‍👧", "🛒", "📲", "🧃", "🐟", "🍪"],
    title: "Tutta la famiglia, una sola lista",
    text: "Crea la tua famiglia con un codice invito: dispensa, spesa, ricette e calendario si sincronizzano sui telefoni di tutti in tempo reale.",
  },
];

const useStyles = makeStyles((c) => ({
  root: { flex: 1 },
  slide: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "center" },
  art: { alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
  ring: { width: 200, height: 200, borderRadius: 100, alignItems: "center", justifyContent: "center" },
  iconBubble: { width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center" },
  emoji: { position: "absolute", fontSize: 30 },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, textAlign: "center", lineHeight: 34 },
  text: { fontSize: 16, color: c.onSurfaceTertiary, textAlign: "center", lineHeight: 24, marginTop: spacing.md },
  footer: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  btn: { borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  skip: { position: "absolute", right: spacing.xl, zIndex: 2, paddingVertical: 8, paddingHorizontal: spacing.md },
  skipTxt: { color: c.muted, fontWeight: "600" },
}));

const EMOJI_POS = [
  { top: 0, left: 80 }, { top: 40, right: 0 }, { bottom: 40, right: 0 },
  { bottom: 0, left: 80 }, { bottom: 40, left: 0 }, { top: 40, left: 0 },
];

export default function Onboarding() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [idx, setIdx] = useState(0);
  const ref = useRef<ScrollView>(null);
  const slide = SLIDES[idx];

  const finish = async () => {
    await completeOnboarding();
    router.replace("/(tabs)/oggi");
  };
  const next = () => {
    if (idx >= SLIDES.length - 1) { finish(); return; }
    ref.current?.scrollTo({ x: width * (idx + 1), animated: true });
    setIdx(idx + 1);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== idx && i >= 0 && i < SLIDES.length) setIdx(i);
  };

  return (
    <View style={[styles.root, { backgroundColor: slide.bg, paddingTop: insets.top }]} testID="onboarding">
      <Pressable testID="onboarding-skip" style={[styles.skip, { top: insets.top + spacing.sm }]} onPress={finish}><Text style={styles.skipTxt}>Salta</Text></Pressable>
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={{ flex: 1 }}>
        {SLIDES.map((s) => (
          <View key={s.key} style={[styles.slide, { width }]} testID={`onboarding-slide-${s.key}`}>
            <View style={styles.art}>
              <View style={[styles.ring, { backgroundColor: colors.surface }]}>
                <View style={[styles.iconBubble, { backgroundColor: s.accent }]}>
                  <Ionicons name={s.icon} size={52} color={colors.onBrandPrimary} />
                </View>
                {s.emojis.map((e, k) => <Text key={k} style={[styles.emoji, EMOJI_POS[k]]}>{e}</Text>)}
              </View>
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.text}>{s.text}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.dots}>
          {SLIDES.map((s, k) => <View key={s.key} style={[styles.dot, { backgroundColor: k === idx ? slide.accent : colors.borderStrong, width: k === idx ? 24 : 8 }]} />)}
        </View>
        <Pressable testID="onboarding-next" style={[styles.btn, { backgroundColor: slide.accent }]} onPress={next}>
          <Text style={styles.btnTxt}>{idx === SLIDES.length - 1 ? "Inizia a cucinare" : "Avanti"}</Text>
          <Ionicons name={idx === SLIDES.length - 1 ? "checkmark" : "arrow-forward"} size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
    </View>
  );
}
