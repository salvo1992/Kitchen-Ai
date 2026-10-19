import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { backendUrl, getToken } from '@/src/api';

/** One multipart implementation for native file:// URIs and browser blob URIs. */
export async function uploadForm(uri: string, name = 'image.jpg', field = 'file') {
  const read = Platform.OS === 'web' ? fetch : expoFetch;
  const blob = await (await read(uri)).blob();
  const body = new FormData();
  body.append(field, blob, name);
  const token = await getToken();
  const response = await read(`${backendUrl}/api/upload`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || 'Caricamento immagine non riuscito');
  return result as { url: string };
}