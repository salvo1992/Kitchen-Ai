import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const AISLES = ["Frutta e verdura", "Carne e pesce", "Latticini", "Pane e cereali", "Dispensa", "Surgelati", "Bevande", "Altro"];
const KEY = "smartkitchen_aisle_order_v1";

export async function loadAisleOrder(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved: string[] = raw ? JSON.parse(raw) : [];
    // keep saved order, append any new aisles at the end
    return [...saved.filter((a) => AISLES.includes(a)), ...AISLES.filter((a) => !saved.includes(a))];
  } catch { return AISLES; }
}

export async function saveAisleOrder(order: string[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(order));
}

export function useAisleOrder() {
  const [order, setOrder] = useState<string[]>(AISLES);
  const reload = useCallback(() => { loadAisleOrder().then(setOrder); }, []);
  useEffect(() => { reload(); }, [reload]);
  const save = useCallback(async (next: string[]) => { setOrder(next); await saveAisleOrder(next); }, []);
  return { order, save, reload };
}
