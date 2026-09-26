import { useState, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform, Linking, KeyboardAvoidingView } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "@/src/api";
import { makeStyles, useTheme, spacing, radius } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 20, fontWeight: "700", color: c.onSurface, flex: 1 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  camWrap: { marginHorizontal: spacing.lg, height: 260, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceInverse },
  frame: { position: "absolute", left: "15%", right: "15%", top: "28%", bottom: "28%", borderWidth: 2, borderColor: c.brandSecondary, borderRadius: radius.md },
  camHint: { position: "absolute", bottom: spacing.md, left: 0, right: 0, textAlign: "center", color: c.onSurfaceInverse, fontSize: 12 },
  permBox: { margin: spacing.lg, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, alignItems: "center", gap: spacing.sm },
  permTitle: { fontWeight: "700", color: c.onSurface, fontSize: 16, textAlign: "center" },
  permTxt: { color: c.muted, textAlign: "center", lineHeight: 20 },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: spacing.xl, alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  btnTxt: { color: c.onBrandPrimary, fontWeight: "700" },
  btnGhost: { backgroundColor: c.brandTertiary },
  btnGhostTxt: { color: c.brandPrimary, fontWeight: "700" },
  form: { padding: spacing.lg, gap: spacing.md },
  label: { color: c.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700" },
  input: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, color: c.onSurface, fontSize: 15 },
  row: { flexDirection: "row", gap: spacing.sm },
  product: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: spacing.md },
  productImg: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: c.surface },
  productName: { fontWeight: "700", color: c.onBrandTertiary, fontSize: 15 },
  productMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  locChip: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: "center", backgroundColor: c.surfaceSecondary },
  locChipActive: { backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandPrimary },
  locTxt: { color: c.onSurface, fontWeight: "600", fontSize: 13 },
  notFound: { color: c.warning, fontWeight: "600" },
}));

const LOCATIONS = [
  { key: "pantry", label: "Dispensa" },
  { key: "fridge", label: "Frigo" },
  { key: "freezer", label: "Freezer" },
];

type Product = { found: boolean; barcode: string; name?: string; brand?: string; image_url?: string | null; qty?: number; unit?: string; location?: string };

export default function ScanBarcode() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ location?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const isWeb = Platform.OS === "web";

  const [code, setCode] = useState("");
  const [manual, setManual] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [scanning, setScanning] = useState(true);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pz");
  const [location, setLocation] = useState<string>(params.location || "pantry");
  const [expires, setExpires] = useState("");
  const [price, setPrice] = useState("");

  const lookup = useMutation({
    mutationFn: (c: string) => api<Product>(`/api/products/barcode/${encodeURIComponent(c)}`),
    onSuccess: (p) => {
      setProduct(p);
      if (p.found) {
        setName(p.brand && p.name && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.name} ${p.brand}` : p.name || "");
        setQty(String(p.qty ?? 1)); setUnit(p.unit || "pz");
        if (!params.location && p.location) setLocation(p.location);
      }
    },
    onError: () => setProduct({ found: false, barcode: code }),
  });

  const saveM = useMutation({
    mutationFn: (body: any) => api("/api/pantry", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["pantry-all"] }); qc.invalidateQueries({ queryKey: ["pantry-expiring"] });
      if (router.canGoBack()) router.back(); else router.replace("/(tabs)/dispensa");
    },
  });

  const onCode = useCallback((c: string) => {
    const clean = c.replace(/\D/g, "");
    if (!clean || lookup.isPending) return;
    setScanning(false); setCode(clean); setProduct(null);
    lookup.mutate(clean);
  }, [lookup]);

  const reset = () => { setCode(""); setProduct(null); setName(""); setQty("1"); setUnit("pz"); setExpires(""); setScanning(true); };

  const renderCamera = () => {
    if (isWeb) return null;
    if (!permission) return <View style={styles.camWrap}><ActivityIndicator style={{ flex: 1 }} color={colors.brandPrimary} /></View>;
    if (!permission.granted) {
      const blocked = permission.status === "denied" && !permission.canAskAgain;
      return (
        <View style={styles.permBox} testID="camera-permission-box">
          <Ionicons name="barcode-outline" size={40} color={colors.brandPrimary} />
          <Text style={styles.permTitle}>Scansiona i codici a barre</Text>
          <Text style={styles.permTxt}>Con la fotocamera puoi aggiungere un prodotto in dispensa in un attimo: nome, formato e foto vengono compilati automaticamente.</Text>
          {blocked ? (
            <Pressable testID="open-settings" style={[styles.btn, { marginTop: spacing.sm }]} onPress={() => Linking.openSettings()}>
              <Ionicons name="settings-outline" size={18} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>Apri impostazioni</Text>
            </Pressable>
          ) : (
            <Pressable testID="request-camera" style={[styles.btn, { marginTop: spacing.sm }]} onPress={() => requestPermission()}>
              <Ionicons name="camera-outline" size={18} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>Attiva fotocamera</Text>
            </Pressable>
          )}
          <Text style={[styles.permTxt, { fontSize: 12 }]}>Oppure inserisci il codice a mano qui sotto.</Text>
        </View>
      );
    }
    if (!scanning) return null;
    return (
      <View style={styles.camWrap}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "qr"] }}
          onBarcodeScanned={(r) => onCode(r.data)}
        />
        <View style={styles.frame} pointerEvents="none" />
        <Text style={styles.camHint}>Inquadra il codice a barre del prodotto</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable testID="scan-back" style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={20} color={colors.onSurface} /></Pressable>
          <Text style={styles.title}>Scansiona prodotto</Text>
          {!scanning && !isWeb && (
            <Pressable testID="scan-again" onPress={reset} style={[styles.btn, styles.btnGhost, { paddingVertical: 8, paddingHorizontal: spacing.md }]}>
              <Ionicons name="scan-outline" size={16} color={colors.brandPrimary} /><Text style={styles.btnGhostTxt}>Nuovo</Text>
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          {renderCamera()}

          <View style={styles.form}>
            <Text style={styles.label}>{isWeb ? "Codice a barre" : "Oppure inserisci il codice"}</Text>
            <View style={styles.row}>
              <TextInput testID="barcode-input" placeholder="Es. 8001234567890" placeholderTextColor={colors.muted} value={manual} onChangeText={setManual} keyboardType="number-pad" style={[styles.input, { flex: 1 }]} onSubmitEditing={() => onCode(manual)} />
              <Pressable testID="barcode-lookup" onPress={() => onCode(manual)} style={[styles.btn, { paddingHorizontal: spacing.lg }]}>
                {lookup.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="search" size={18} color={colors.onBrandPrimary} />}
              </Pressable>
            </View>

            {lookup.isPending && <Text style={{ color: colors.muted }}>Cerco il prodotto…</Text>}

            {product && product.found && (
              <View style={styles.product} testID="product-card">
                {product.image_url ? <Image source={product.image_url} style={styles.productImg} contentFit="contain" /> : <View style={[styles.productImg, { alignItems: "center", justifyContent: "center" }]}><Ionicons name="cube-outline" size={24} color={colors.muted} /></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{product.name || "Prodotto"}</Text>
                  <Text style={styles.productMeta}>{product.brand ? `${product.brand} · ` : ""}{product.barcode}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />
              </View>
            )}
            {product && !product.found && (
              <Text style={styles.notFound} testID="product-not-found">Codice {product.barcode} non trovato: inserisci il nome a mano.</Text>
            )}

            {!!(product || code) && (
              <>
                <Text style={styles.label}>Nome</Text>
                <TextInput testID="scan-name" placeholder="Nome prodotto" placeholderTextColor={colors.muted} value={name} onChangeText={setName} style={styles.input} />
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Quantità</Text>
                    <TextInput testID="scan-qty" value={qty} onChangeText={setQty} style={styles.input} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Unità</Text>
                    <TextInput testID="scan-unit" value={unit} onChangeText={setUnit} style={styles.input} />
                  </View>
                </View>
                <Text style={styles.label}>Dove lo metti?</Text>
                <View style={styles.row}>
                  {LOCATIONS.map((l) => (
                    <Pressable key={l.key} testID={`scan-loc-${l.key}`} onPress={() => setLocation(l.key)} style={[styles.locChip, location === l.key && styles.locChipActive]}>
                      <Text style={styles.locTxt}>{l.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.row}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.label}>Scadenza (opzionale)</Text>
                    <TextInput testID="scan-expires" placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} value={expires} onChangeText={setExpires} style={styles.input} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Prezzo €</Text>
                    <TextInput testID="scan-price" placeholder="es. 2,50" placeholderTextColor={colors.muted} value={price} onChangeText={setPrice} style={styles.input} keyboardType="decimal-pad" />
                  </View>
                </View>
                <Pressable
                  testID="scan-save"
                  disabled={!name.trim() || saveM.isPending}
                  onPress={() => saveM.mutate({ name: name.trim(), qty: parseFloat(qty) || 1, unit: unit || "pz", location, expires_at: expires || null, barcode: code || null, image_url: product?.image_url || null, price: price ? parseFloat(price.replace(",", ".")) || null : null })}
                  style={[styles.btn, { marginTop: spacing.sm, opacity: name.trim() ? 1 : 0.5 }]}
                >
                  {saveM.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Ionicons name="add" size={18} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>Aggiungi in {LOCATIONS.find((l) => l.key === location)?.label}</Text></>}
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
