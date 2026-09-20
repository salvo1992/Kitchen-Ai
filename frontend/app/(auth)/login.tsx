import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 260, width: "100%" },
  heroOverlay: { position: "absolute", inset: 0 as any, justifyContent: "flex-end", padding: spacing.xl },
  brand: { color: "#FFFFFF", fontSize: 32, fontWeight: "700", letterSpacing: -0.5 },
  brandSub: { color: "#FDFBF7", opacity: 0.9, marginTop: 4, fontSize: 15 },
  form: { padding: spacing.xl, gap: spacing.md, marginTop: -24, backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  title: { fontSize: 24, fontWeight: "700", color: c.onSurface, marginBottom: spacing.xs },
  sub: { color: c.muted, marginBottom: spacing.md },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, color: c.onSurface, fontSize: 15 },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm },
  btnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  google: { backgroundColor: c.surface, borderColor: c.borderStrong, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  googleText: { color: c.onSurface, fontWeight: "600", fontSize: 15 },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.md },
  hr: { flex: 1, height: 1, backgroundColor: c.border },
  dividerText: { color: c.muted, fontSize: 12 },
  toggle: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg, gap: 6 },
  toggleText: { color: c.muted },
  toggleLink: { color: c.brandPrimary, fontWeight: "700" },
  error: { color: c.error, textAlign: "center", marginTop: spacing.xs },
}));

export default function Login() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInGoogle } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(""); setLoading(true);
    try {
      if (mode === "signup") await signUp(email.trim(), password, name.trim() || "Chef");
      else await signIn(email.trim(), password);
    } catch (e: any) {
      setErr(e.message || "Errore");
    } finally { setLoading(false); }
  };

  const google = async () => {
    setErr(""); setLoading(true);
    try { await signInGoogle(); } catch (e: any) { setErr(e.message || "Errore Google"); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Image source="https://images.unsplash.com/photo-1556911220-bff31c812dba?w=800" style={{ width: "100%", height: "100%" }} contentFit="cover" />
        <LinearGradient colors={["transparent", "rgba(44,48,46,0.85)"]} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
        <View style={styles.heroOverlay}>
          <Text style={styles.brand}>CucinaSmart</Text>
          <Text style={styles.brandSub}>Il tuo assistente cucina intelligente</Text>
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <Text style={styles.title}>{mode === "signin" ? "Bentornato" : "Crea il tuo account"}</Text>
            <Text style={styles.sub}>{mode === "signin" ? "Accedi per continuare" : "Inizia a pianificare i tuoi pasti"}</Text>

            {mode === "signup" && (
              <TextInput testID="signup-name-input" placeholder="Nome" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={styles.input} autoCapitalize="words" />
            )}
            <TextInput testID="auth-email-input" placeholder="Email" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} style={styles.input} autoCapitalize="none" keyboardType="email-address" />
            <TextInput testID="auth-password-input" placeholder="Password" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} style={styles.input} secureTextEntry />

            {err ? <Text style={styles.error}>{err}</Text> : null}

            <Pressable testID="auth-submit-btn" onPress={submit} style={styles.btn} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>{mode === "signin" ? "Accedi" : "Registrati"}</Text>}
            </Pressable>

            <View style={styles.divider}><View style={styles.hr} /><Text style={styles.dividerText}>OPPURE</Text><View style={styles.hr} /></View>

            <Pressable testID="auth-google-btn" onPress={google} style={styles.google}>
              <Ionicons name="logo-google" size={18} color={colors.onSurface} />
              <Text style={styles.googleText}>Continua con Google</Text>
            </Pressable>

            <View style={styles.toggle}>
              <Text style={styles.toggleText}>{mode === "signin" ? "Non hai un account?" : "Hai già un account?"}</Text>
              <Pressable testID="auth-toggle-btn" onPress={() => setMode(mode === "signin" ? "signup" : "signin")}>
                <Text style={styles.toggleLink}>{mode === "signin" ? "Registrati" : "Accedi"}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
