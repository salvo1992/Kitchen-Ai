import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const ONBOARDING_KEY = "smartkitchen_onboarding_done_v1";

/** Tiny external store so the root Gate reacts immediately when the tour completes. */
let done: boolean | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function loadOnboarding() {
  AsyncStorage.getItem(ONBOARDING_KEY).then((v) => { done = !!v; emit(); }).catch(() => { done = true; emit(); });
}
export async function completeOnboarding() {
  done = true; emit();
  await AsyncStorage.setItem(ONBOARDING_KEY, "1");
}
export async function resetOnboarding() {
  done = false; emit();
  await AsyncStorage.removeItem(ONBOARDING_KEY);
}
export function useOnboardingDone() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => done, () => done);
}
