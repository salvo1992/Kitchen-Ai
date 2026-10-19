import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { Action, money, useShopStyles } from '@/src/shop-ui';
import { useTheme } from '@/src/theme';
import { resolveUrl } from '@/src/media';
import { Provider, useDeliveryStyles } from './shared';

export function ProviderCard({ provider: p }: { provider: Provider }) {
  const s = useShopStyles(); const d = useDeliveryStyles(); const { colors } = useTheme(); const router = useRouter();
  return <View style={s.card} testID={`delivery-card-${p.id}`}>
    {p.photo_url ? <Image testID={`delivery-card-photo-${p.id}`} source={{ uri: resolveUrl(p.photo_url)! }} style={d.photo} contentFit="cover" /> : <View style={d.placeholder}><Ionicons name={p.kind === 'company' ? 'business-outline' : 'restaurant-outline'} size={42} color={colors.brandPrimary} /></View>}
    <View style={s.row}><Text testID={`delivery-card-name-${p.id}`} style={[s.h2, s.grow]}>{p.display_name}</Text><Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} /></View>
    <Text testID={`delivery-card-location-${p.id}`} style={s.muted}>{p.kind === 'company' ? 'Azienda catering' : 'Chef a domicilio'} · {p.city.name} · raggio {p.radius_km} km</Text>
    <Text testID={`delivery-card-rating-${p.id}`} style={d.stars}>{p.review_count ? `${p.rating}/5 · ${p.review_count} recensioni verificate` : 'Nuovo su Delivery Chef · nessuna recensione'}</Text>
    <Text testID={`delivery-card-specialty-${p.id}`} style={s.body} numberOfLines={2}>{p.specialties.join(' · ')}</Text>
    <Text testID={`delivery-card-price-${p.id}`} style={s.h3}>Da {money(p.from_cents || 0)}{p.pricing === 'person' ? ' / persona' : ' / servizio'}</Text>
    <Action id={`delivery-card-open-${p.id}`} label="Scopri servizi e disponibilità" onPress={() => router.push({ pathname: '/delivery/chef/[id]', params: { id: p.id } })} />
  </View>;
}