import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const TOKEN_KEY = "cucinasmart_token";

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    if (Platform.OS === "web") {
      cachedToken = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    } else {
      cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
    }
  } catch { cachedToken = null; }
  return cachedToken;
}

export async function setToken(token: string | null) {
  cachedToken = token;
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
      }
    } else {
      if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
      else await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {}
}

export async function api<T = any>(path: string, opts: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as any) };
  const token = await getToken();
  if (token && opts.auth !== false) headers["Authorization"] = `Bearer ${token}`;
  const url = `${BASE}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err: any = new Error((data && data.detail) || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const backendUrl = BASE;
