import { useState } from "react";
import { Pressable, Text, ActivityIndicator, Platform } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { api } from "@/src/api";
import { pickImage, chooseImageSource } from "@/src/media";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandPrimary },
  txt: { color: c.brandPrimary, fontWeight: "700", fontSize: 13 },
  hint: { fontSize: 12, marginTop: 4 },
}));

type Result = { expires_at: string | null; raw?: string | null; name?: string | null; confidence?: number | null };

/** "Leggi la scadenza con la fotocamera": photo of the package → Chef AI OCR → ISO date. */
export function ExpiryReader({ onResult }: { onResult: (r: Result) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const run = () => chooseImageSource(async (src) => {
    const img = await pickImage(src);
    if (!img) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<Result>("/api/ai/read-expiry", { method: "POST", body: JSON.stringify({ image_base64: img.base64 }) });
      if (r.expires_at) {
        setMsg({ text: `Letto: ${new Date(r.expires_at + "T12:00:00").toLocaleDateString("it-IT")}${r.raw ? ` (“${r.raw}”)` : ""}`, ok: true });
        onResult(r);
      } else {
        setMsg({ text: "Data non trovata: prova una foto più vicina e nitida", ok: false });
      }
    } catch (e: any) {
      setMsg({ text: e?.message || "Lettura non riuscita", ok: false });
    } finally { setBusy(false); }
  });

  return (
    <>
      <Pressable testID="read-expiry" style={styles.btn} onPress={run} disabled={busy}>
        {busy ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Ionicons name={Platform.OS === "web" ? "image-outline" : "camera-outline"} size={16} color={colors.brandPrimary} />}
        <Text style={styles.txt}>{busy ? "Leggo la data…" : "Leggi scadenza con la fotocamera"}</Text>
      </Pressable>
      {msg && <Text testID="read-expiry-msg" style={[styles.hint, { color: msg.ok ? colors.brandPrimary : colors.warning }]}>{msg.text}</Text>}
    </>
  );
}
