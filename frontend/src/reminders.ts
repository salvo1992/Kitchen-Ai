import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

const KEY = "cucinasmart_reminder";
const REMINDER_ID = "expiry-daily";

export type ReminderSettings = { enabled: boolean; hour: number; minute: number };
export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, hour: 9, minute: 0 };

export type ExpiringItem = { name: string; days_left: number };

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_REMINDER, ...JSON.parse(raw) } : DEFAULT_REMINDER;
  } catch { return DEFAULT_REMINDER; }
}

export async function saveReminderSettings(s: ReminderSettings) {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

/** Returns granted, and whether we can still ask. */
export async function getNotificationPermission() {
  if (Platform.OS === "web") return { granted: false, canAskAgain: false };
  const p = await Notifications.getPermissionsAsync();
  return { granted: p.granted, canAskAgain: p.canAskAgain };
}

export async function requestNotificationPermission() {
  if (Platform.OS === "web") return { granted: false, canAskAgain: false };
  const p = await Notifications.requestPermissionsAsync();
  return { granted: p.granted, canAskAgain: p.canAskAgain };
}

export function reminderBody(items: ExpiringItem[]) {
  if (items.length === 0) return "Dai un'occhiata alla dispensa: tutto in ordine!";
  const names = items.slice(0, 4).map((i) => i.name).join(", ");
  const more = items.length > 4 ? ` e altri ${items.length - 4}` : "";
  return `${items.length === 1 ? "1 prodotto scade" : `${items.length} prodotti scadono`} entro 3 giorni: ${names}${more}. Usali prima che sia tardi!`;
}

/**
 * (Re)schedule the daily local notification with the current expiring items.
 * Safe to call often: cancels the previous schedule first. No-op on web.
 */
export async function syncExpiryReminder(items: ExpiringItem[], settings?: ReminderSettings) {
  if (Platform.OS === "web") return;
  const s = settings || (await getReminderSettings());
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {}
  if (!s.enabled) return;
  const { granted } = await getNotificationPermission();
  if (!granted) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("expiry", { name: "Scadenze dispensa", importance: Notifications.AndroidImportance.DEFAULT });
  }
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { title: "Scadenze in dispensa 🥕", body: reminderBody(items), data: { route: "/(tabs)/dispensa" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: s.hour, minute: s.minute, ...(Platform.OS === "android" ? { channelId: "expiry" } : {}) },
  });
}
