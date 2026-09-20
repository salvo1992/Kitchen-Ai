import { Tabs, useRouter } from "expo-router";
import { View, Pressable, Text, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme, radius, spacing } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row",
    borderTopWidth: 1, borderTopColor: c.border,
    backgroundColor: Platform.OS === "web" ? c.surface : "transparent",
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  tabLabel: { fontSize: 11, marginTop: 2, fontWeight: "600" },
  fabWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", justifyContent: "center" },
  fab: { width: 62, height: 62, borderRadius: 31, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabRing: { position: "absolute", width: 78, height: 78, borderRadius: 39, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 },
}));

function TabBar({ state, descriptors, navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const paddingBottom = insets.bottom;
  const barH = 62 + paddingBottom;
  const icons: Record<string, string> = {
    oggi: "sunny-outline",
    ricette: "restaurant-outline",
    dispensa: "leaf-outline",
    spesa: "cart-outline",
  };
  const iconsActive: Record<string, string> = {
    oggi: "sunny",
    ricette: "restaurant",
    dispensa: "leaf",
    spesa: "cart",
  };
  const labels: Record<string, string> = {
    oggi: "Oggi", ricette: "Ricette", dispensa: "Dispensa", spesa: "Spesa",
  };
  return (
    <View style={[styles.bar, { paddingBottom, height: barH }]} pointerEvents="box-none">
      {Platform.OS !== "web" && (
        <BlurView intensity={70} tint="light" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
      )}
      {state.routes.map((route: any, idx: number) => {
        const focused = state.index === idx;
        const routeName = route.name as string;
        const isPlaceholder = routeName === "chef-placeholder";
        if (isPlaceholder) {
          return <View key={route.key} style={styles.tabItem} />;
        }
        const color = focused ? colors.brandPrimary : colors.muted;
        return (
          <Pressable key={route.key} testID={`tab-${routeName}`} style={styles.tabItem} onPress={() => {
            const evt = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !evt.defaultPrevented) navigation.navigate(route.name);
          }}>
            <Ionicons name={(focused ? iconsActive[routeName] : icons[routeName]) as any} size={22} color={color} />
            <Text style={[styles.tabLabel, { color }]}>{labels[routeName]}</Text>
          </Pressable>
        );
      })}
      {/* Floating Chef AI FAB */}
      <View style={[styles.fabWrap, { top: -22 }]} pointerEvents="box-none">
        <View style={styles.fabRing} />
        <Pressable testID="chef-ai-fab" style={styles.fab} onPress={() => router.push("/chef")}>
          <Ionicons name="sparkles" size={26} color={colors.onBrandSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="oggi" />
      <Tabs.Screen name="ricette" />
      <Tabs.Screen name="dispensa" />
      <Tabs.Screen name="spesa" />
    </Tabs>
  );
}
