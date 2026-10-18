import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { View, ActivityIndicator, Image as RNImage } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme";
import { loadOnboarding, useOnboardingDone } from "@/src/storage-keys";
import { initializePurchases, PurchaseProvider } from "@/src/purchases";

initializePurchases();

// Prewarm icons for Expo Go Android — do not remove
try {
  const IonicFont = require("@react-native-vector-icons/ionicons/fonts/Ionicons.ttf");
  const MaterialFont = require("@react-native-vector-icons/material-icons/fonts/MaterialIcons.ttf");
  RNImage.prefetch?.(IonicFont);
  RNImage.prefetch?.(MaterialFont);
} catch {}

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();
  const onboarded = useOnboardingDone();

  useEffect(() => { loadOnboarding(); }, []);

  useEffect(() => {
    if (loading || onboarded === null) return;
    const inAuth = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";
    if (!user && !inAuth) router.replace("/(auth)/login");
    else if (user && !onboarded && !inOnboarding) router.replace("/onboarding");
    else if (user && inAuth) router.replace(onboarded ? "/(tabs)/oggi" : "/onboarding");
  }, [user, loading, segments, router, onboarded]);

  if (loading || onboarded === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <AuthProvider>
                <PurchaseProvider>
                <StatusBar style="dark" />
                <Gate />
                </PurchaseProvider>
              </AuthProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
