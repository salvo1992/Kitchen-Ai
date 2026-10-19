import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Action, Loading, money, ShopPage, useShopStyles } from '@/src/shop-ui';
import { Provider, useDelivery, useDeliveryStyles, QueryError, when } from '@/src/delivery/shared';
import { resolveUrl } from '@/src/media';

export default function ChefProfile() {
  const { id } = useLocalSearchParams<{id:string}>(); const q = useDelivery<Provider>(`profile-${id}`, `/providers/${id}`, !!id); const p = q.data; const s = useShopStyles(); const d = useDeliveryStyles(); const router = useRouter();
  return <ShopPage title="Il tuo professionista" id="delivery-profile">
    {q.isLoading && <Loading />}<QueryError query={q} id="delivery-profile" />
    {p && <>
      {p.photo_url && <Image testID="delivery-profile-photo" source={{uri:resolveUrl(p.photo_url)!}} style={d.photo} contentFit="cover" />}
      <Text testID="delivery-profile-kind" style={s.badge}>{p.kind === 'company' ? 'Azienda catering' : 'Chef a domicilio'} · scheda {p.status === 'approved' ? 'approvata' : 'in revisione'}</Text>
      <Text testID="delivery-profile-name" style={d.title}>{p.display_name}</Text><Text testID="delivery-profile-area" style={s.muted}>{p.city.label} · raggio {p.radius_km} km dal comune</Text>
      <Text testID="delivery-profile-rating" style={d.stars}>{p.review_count ? `${p.rating}/5 · ${p.review_count} recensioni da prenotazioni completate` : 'Ancora nessuna recensione'}</Text>
      <Text testID="delivery-profile-bio" style={s.body}>{p.bio}</Text>
      <View style={s.card}><Text testID="delivery-profile-specialties-title" style={s.h2}>I miei piatti forti</Text>{p.specialties.map((x,i) => <Text testID={`delivery-specialty-${i}`} key={i} style={s.body}>{x}</Text>)}</View>
      <Text testID="delivery-profile-services-title" style={s.h2}>Scegli la tua esperienza</Text>
      {p.services?.map(service => <View key={service.id} style={s.outline}><Text testID={`delivery-service-title-${service.id}`} style={s.h2}>{service.title}</Text><Text testID={`delivery-service-description-${service.id}`} style={s.body}>{service.description}</Text><Text testID={`delivery-service-price-${service.id}`} style={s.h3}>{money(service.price_cents)}{service.pricing === 'person' ? ' / persona' : ' / servizio'}</Text><Text testID={`delivery-service-guests-${service.id}`} style={s.muted}>{service.min_guests}–{service.max_guests} ospiti · {service.duration_hours} ore</Text><Text testID={`delivery-service-included-${service.id}`} style={s.body}>Include: {service.included}</Text>
        {service.booking_mode !== 'instant' && <Action id={`delivery-quote-${service.id}`} label="Richiedi un preventivo" onPress={() => router.push({ pathname:'/delivery/book', params:{ provider:id, service:service.id, mode:'quote' } })} />}
        {service.booking_mode !== 'quote' && <Action id={`delivery-instant-${service.id}`} label={p.payments_ready ? 'Scegli un orario e prenota' : 'Prenotazione immediata in attivazione'} secondary disabled={!p.payments_ready} onPress={() => router.push({ pathname:'/delivery/book', params:{provider:id,service:service.id,mode:'instant'} })} />}
      </View>)}
      <Text testID="delivery-profile-reviews-title" style={s.h2}>Le parole di chi c’era</Text>
      {!p.reviews?.length && <Text testID="delivery-reviews-empty" style={s.muted}>Le recensioni appariranno dopo i primi servizi completati.</Text>}
      {p.reviews?.map(r => <View key={r.id} style={s.card}><Text testID={`delivery-review-author-${r.id}`} style={s.h3}>{r.customer_name} · {r.rating}/5</Text><Text testID={`delivery-review-date-${r.id}`} style={s.muted}>{r.service_title} · {when(r.created_at)}</Text><Text testID={`delivery-review-text-${r.id}`} style={s.body}>{r.text}</Text>{!!r.reply && <Text testID={`delivery-review-reply-${r.id}`} style={s.message}>Risposta del professionista: {r.reply}</Text>}</View>)}
    </>}
  </ShopPage>;
}