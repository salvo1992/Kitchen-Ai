import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, backendUrl } from "./api";

/** Backend returns relative /api/files/... urls; make them absolute for <Image>. */
export function resolveUrl(u?: string | null): string | null {
  if (!u) return null;
  return u.startsWith("/") ? `${backendUrl}${u}` : u;
}

type Source = "camera" | "library";

function explainBlocked(source: Source) {
  const what = source === "camera" ? "fotocamera" : "galleria";
  Alert.alert(
    `Accesso alla ${what} disattivato`,
    `Per aggiungere foto alle ricette abilita l'accesso alla ${what} nelle impostazioni del telefono.`,
    [{ text: "Annulla", style: "cancel" }, { text: "Apri impostazioni", onPress: () => Linking.openSettings() }],
  );
}

async function ensurePermission(source: Source): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const get = source === "camera" ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
  const req = source === "camera" ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
  let p = await get();
  if (p.granted) return true;
  if (!p.canAskAgain) { explainBlocked(source); return false; }
  p = await req();
  if (p.granted) return true;
  if (!p.canAskAgain) explainBlocked(source);
  return false;
}

/** Pick (or shoot) an image and return base64 data URI + local uri, or null if cancelled/denied. */
export async function pickImage(source: Source): Promise<{ uri: string; base64: string } | null> {
  if (!(await ensurePermission(source))) return null;
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], base64: true, quality: 0.6, allowsEditing: true, aspect: [4, 3] };
  const r = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]?.base64) return null;
  const a = r.assets[0];
  const mime = a.mimeType || "image/jpeg";
  return { uri: a.uri, base64: `data:${mime};base64,${a.base64}` };
}

/** Upload a base64 data URI to Emergent Object Storage; returns the (relative) file url. */
export async function uploadImage(dataUri: string): Promise<string> {
  const res = await api<{ url: string }>("/api/upload-base64", { method: "POST", body: JSON.stringify({ image_base64: dataUri }) });
  return res.url;
}

/** Ask the user where to take the photo from (camera not available on web). */
export function chooseImageSource(onPick: (s: Source) => void) {
  if (Platform.OS === "web") { onPick("library"); return; }
  Alert.alert("Foto ricetta", "Da dove vuoi prendere la foto?", [
    { text: "Fotocamera", onPress: () => onPick("camera") },
    { text: "Galleria", onPress: () => onPick("library") },
    { text: "Annulla", style: "cancel" },
  ]);
}
