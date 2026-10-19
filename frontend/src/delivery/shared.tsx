import { View, Text, Pressable, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/src/auth';
import { api } from '@/src/api';
import { makeStyles, fonts } from '@/src/theme';
import { Action, Notice, useShopStyles } from '@/src/shop-ui';
import * as WebBrowser from 'expo-web-browser';

export const categories = [
  { id: 'romantic', label: 'Cena romantica', icon: 'heart-outline' }, { id: 'anniversary', label: 'Anniversario', icon: 'wine-outline' },
  { id: 'party', label: 'Feste private', icon: 'balloon-outline' }, { id: 'catering', label: 'Catering', icon: 'restaurant-outline' },
  { id: 'weekly', label: 'Chef settimanale', icon: 'calendar-outline' }, { id: 'showcooking', label: 'Showcooking', icon: 'flame-outline' },
];
export const deliveryStatus: Record<string, string> = {
  pending: 'Scheda in revisione', approved: 'Scheda approvata', rejected: 'Modifiche richieste', suspended: 'Sospeso',
  requested: 'Richiesta inviata', quoted: 'Preventivo da confermare', awaiting_payment: 'Pagamento da completare',
  paid: 'Prenotazione confermata', served: 'Servizio svolto · da confermare', completed: 'Completato · accredito in attesa',
  transferred: 'Accreditato al saldo Stripe', cancelled: 'Annullata', expired: 'Pagamento scaduto', refunded: 'Rimborsata',
  refund_pending: 'Rimborso in elaborazione', disputed: 'Segnalazione aperta', resolved_release: 'Segnalazione risolta', resolved_refund: 'Rimborso disposto',
};
export type City = { id: string; name: string; label: string; region: string; lat: number; lon: number };
export type Provider = { id: string; display_name: string; kind: 'chef' | 'company'; bio: string; city: City; radius_km: number; specialties: string[]; photo_url?: string; rating: number | null; review_count: number; payments_ready: boolean; from_cents?: number; pricing?: string; distance_km?: number; status?: string; services?: Service[]; slots?: Slot[]; reviews?: Review[] };
export type Service = { id: string; provider_id: string; title: string; description: string; category: string; price_cents: number; pricing: 'person' | 'fixed'; booking_mode: 'instant' | 'quote' | 'both'; min_guests: number; max_guests: number; duration_hours: number; included: string; enabled: boolean };
export type Slot = { id: string; start_at: string; end_at: string; duration_hours: number; booking_id?: string | null };
export type Review = { id: string; rating: number; text: string; reply?: string; customer_name: string; service_title: string; created_at: string };
export type Booking = { id: string; status: string; service_title: string; provider_name: string; customer_name: string; provider_id: string; customer_id: string; provider_user_id: string; start_at: string; end_at: string; guests: number; amount_cents: number; provider_cents?: number; commission_cents?: number; city: City; address: string; phone: string; notes: string; included: string; mode: string; dispute_open?: boolean; dispute_reason?: string; quote_expires_at?: string; timeline: {status: string; at: string}[]; is_customer?: boolean; is_provider?: boolean; is_admin?: boolean; review?: Review; payments?: any; resolution_note?: string; transfer_error?: string; checkout_session_id?: string };

export function useDelivery<T = any>(key: string, path: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({ queryKey: ['delivery', key, user?.user_id], queryFn: () => api<T>(`/api/delivery${path}`), enabled: !!user && enabled });
}
export function useDeliveryAction() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ path, body, method = 'POST', headers }: { path: string; body?: unknown; method?: string; headers?: Record<string,string> }) => api<any>(`/api/delivery${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers }), onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery'] }) });
}
export const when = (iso: string) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(new Date(iso));
export const italianDay = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
export const italianTime = (iso: string) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
export async function openHosted(url: string) {
  if (!url.startsWith('https://')) throw new Error('Collegamento di pagamento non valido');
  await WebBrowser.openBrowserAsync(url);
}

export const useDeliveryStyles = makeStyles(c => ({
  hero: { backgroundColor: c.brandTertiary, borderRadius: 28, padding: 24, gap: 18, overflow: 'hidden' },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 41, color: c.onSurface, letterSpacing: -0.8 },
  eyebrow: { color: c.brandSecondary, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.5 },
  photo: { width: '100%', height: 190, borderRadius: 20, backgroundColor: c.surfaceTertiary },
  placeholder: { height: 120, borderRadius: 20, backgroundColor: c.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  categories: { gap: 10, paddingVertical: 6 },
  chip: { minHeight: 46, paddingVertical: 12, paddingHorizontal: 17, borderRadius: 24, borderWidth: 1, borderColor: c.borderStrong, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface },
  activeChip: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { color: c.onSurface, fontSize: 14, fontWeight: '600' },
  activeText: { color: c.onBrandPrimary },
  stars: { color: c.brandSecondary, fontSize: 15, fontWeight: '700' },
  form: { gap: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: '44%', padding: 16, backgroundColor: c.brandTertiary, borderRadius: 18, gap: 6 },
  barTrack: { height: 12, borderRadius: 6, backgroundColor: c.border, overflow: 'hidden', flex: 1 },
  bar: { height: 12, borderRadius: 6, backgroundColor: c.brandPrimary },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: c.brandTertiary, gap: 12 },
}));

export function Choices({ id, values, selected, onSelect }: { id: string; values: { id: string; label: string }[]; selected: string; onSelect: (v: string) => void }) {
  const s = useDeliveryStyles();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categories} testID={`${id}-choices`}>{values.map(v => <Pressable key={v.id} testID={`${id}-${v.id}`} accessibilityRole="button" accessibilityState={{ selected: selected === v.id }} onPress={() => onSelect(v.id)} style={[s.chip, selected === v.id && s.activeChip]}><Text testID={`${id}-${v.id}-label`} style={[s.chipText, selected === v.id && s.activeText]}>{v.label}</Text></Pressable>)}</ScrollView>;
}
export function PaymentNotice({ config, id = 'delivery-payment-notice' }: { config?: any; id?: string }) {
  return <Notice id={id} text={config?.configured ? (config.mode === 'test' ? 'AMBIENTE STRIPE DI TEST · nessun addebito o accredito reale.' : null) : config?.message} />;
}
export function QueryError({ query, id }: { query: any; id: string }) {
  return <><Notice id={`${id}-error`} error text={query.error?.message} />{query.isError && <Action id={`${id}-retry`} label="Riprova" secondary onPress={() => query.refetch()} />}</>;
}
export function Terms({ id }: { id: string }) {
  const s = useShopStyles(); return <View style={s.card}><Text testID={`${id}-title`} style={s.h3}>Pagamento in piattaforma, senza sorprese</Text><Text testID={`${id}-body`} style={s.muted}>Il prezzo comprende il servizio descritto. Commissione piattaforma 10%, compenso professionista 90%. Rimborso integrale prima dell’inizio; dopo puoi segnalare un problema. Accredito dopo il servizio e almeno 24 ore per segnalazioni; senza conferma cliente, 48 ore dalla dichiarazione di servizio svolto. Bonifico secondo i tempi Stripe. Le contestazioni bloccano gli accrediti non ancora eseguiti.</Text></View>;
}