import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { api, getToken, setToken } from "./api";

WebBrowser.maybeCompleteAuthSession();

type User = { user_id: string; email: string; name?: string | null; picture?: string | null };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const sentSessionIds = new Set<string>();

async function exchangeSessionId(sid: string) {
  if (sentSessionIds.has(sid)) return null;
  sentSessionIds.add(sid);
  const res = await api<{ session_token: string; user: User }>("/api/auth/session", {
    method: "POST", body: JSON.stringify({ session_id: sid }), auth: false,
  });
  await setToken(res.session_token);
  return res.user;
}

function extractSessionId(url: string): string | null {
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) { setUser(null); return; }
      const me = await api<{ user: User }>("/api/auth/me");
      setUser(me.user);
    } catch { await setToken(null); setUser(null); }
  }, []);

  useEffect(() => {
    (async () => {
      // Web: handle callback in URL first
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const url = window.location.href;
        const sid = extractSessionId(url);
        if (sid) {
          try {
            const u = await exchangeSessionId(sid);
            if (u) setUser(u);
            // clean url
            const clean = window.location.origin + window.location.pathname;
            window.history.replaceState(window.history.state, "", clean);
          } catch (e) { console.log("session exchange", e); }
        }
      }
      // Mobile: initial URL
      if (Platform.OS !== "web") {
        const init = await Linking.getInitialURL();
        if (init) {
          const sid = extractSessionId(init);
          if (sid) {
            try { const u = await exchangeSessionId(sid); if (u) setUser(u); } catch {}
          }
        }
      }
      await check();
      setLoading(false);
    })();

    const sub = Linking.addEventListener("url", async ({ url }) => {
      const sid = extractSessionId(url);
      if (sid) { try { const u = await exchangeSessionId(sid); if (u) setUser(u); } catch {} }
    });
    return () => sub.remove();
  }, [check]);

  const signIn = async (email: string, password: string) => {
    const res = await api<{ session_token: string; user: User }>("/api/auth/signin", {
      method: "POST", body: JSON.stringify({ email, password }), auth: false,
    });
    await setToken(res.session_token);
    setUser(res.user);
  };

  const signUp = async (email: string, password: string, name: string) => {
    const res = await api<{ session_token: string; user: User }>("/api/auth/signup", {
      method: "POST", body: JSON.stringify({ email, password, name }), auth: false,
    });
    await setToken(res.session_token);
    setUser(res.user);
  };

  const signInGoogle = async () => {
    let redirect: string;
    if (Platform.OS === "web") redirect = (window.location.origin || "") + "/";
    else redirect = Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
    let cbUrl: string | null = null;
    if (result.type === "success" && (result as any).url) cbUrl = (result as any).url;
    if (!cbUrl) cbUrl = await Linking.getInitialURL();
    if (cbUrl) {
      const sid = extractSessionId(cbUrl);
      if (sid) {
        const u = await exchangeSessionId(sid);
        if (u) setUser(u);
      }
    }
  };

  const signOut = async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    await setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signIn, signUp, signInGoogle, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
