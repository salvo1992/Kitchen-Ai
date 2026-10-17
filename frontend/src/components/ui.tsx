import { ReactNode } from "react";
import { Pressable, PressableProps, StyleProp, ViewStyle, Text, View } from "react-native";
import Animated, { FadeInDown, FadeIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { makeStyles, useTheme, spacing } from "@/src/theme";

/** Staggered entrance for list rows / cards. */
export function Enter({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 45).duration(380).springify().damping(18)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Simple fade for sections that appear after loading. */
export function Appear({ children, style, delay = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number }) {
  return <Animated.View entering={FadeIn.delay(delay).duration(350)} style={style}>{children}</Animated.View>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that gently scales down while pressed (tactile feedback for buttons/FABs/cards). */
export function Bounce({ children, style, onPressIn, onPressOut, scale = 0.94, ...rest }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scale?: number }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      style={[style, anim]}
      onPressIn={(e) => { s.value = withSpring(scale, { damping: 14, stiffness: 260 }); onPressIn?.(e); }}
      onPressOut={(e) => { s.value = withSpring(1, { damping: 14, stiffness: 260 }); onPressOut?.(e); }}
    >
      {children}
    </AnimatedPressable>
  );
}

const useHeaderStyles = makeStyles((c) => ({
  wrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: "hidden" },
  title: { fontSize: 28, fontWeight: "800", color: c.onBrandPrimary, letterSpacing: -0.6 },
  sub: { color: c.onBrandPrimary, opacity: 0.85, marginTop: 2, fontSize: 13 },
  blob: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: c.onBrandPrimary, opacity: 0.08 },
  blob2: { position: "absolute", width: 110, height: 110, borderRadius: 55, backgroundColor: c.brandSecondary, opacity: 0.35 },
}));

/** Brand gradient header (sage → deep sage, terracotta accent) used by the main tabs. */
export function GradientHeader({ title, subtitle, paddingTop, right, children }: { title: string; subtitle?: string; paddingTop: number; right?: ReactNode; children?: ReactNode }) {
  const styles = useHeaderStyles();
  const { colors } = useTheme();
  return (
    <LinearGradient colors={[colors.brand, colors.brandPrimary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.wrap, { paddingTop: paddingTop + spacing.sm }]}>
      <View style={[styles.blob, { right: -60, top: -70 }]} pointerEvents="none" />
      <View style={[styles.blob2, { right: 40, top: paddingTop - 30 }]} pointerEvents="none" />
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Appear style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.sub}>{subtitle}</Text>}
        </Appear>
        {right}
      </View>
      {children}
    </LinearGradient>
  );
}
