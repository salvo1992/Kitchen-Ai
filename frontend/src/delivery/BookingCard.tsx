import {View,Text} from 'react-native';
import {useRouter} from 'expo-router';
import {Action,money,useShopStyles} from '@/src/shop-ui';
import {Booking,deliveryStatus,when} from './shared';
export function BookingCard({booking:b,provider=false}:{booking:Booking;provider?:boolean}){
  const s=useShopStyles();const router=useRouter();
  return <View testID={`delivery-booking-${b.id}`} style={s.outline}><Text testID={`booking-card-status-${b.id}`} style={s.badge}>{b.dispute_open?'Segnalazione aperta':deliveryStatus[b.status]||b.status}</Text><Text testID={`booking-card-title-${b.id}`} style={s.h3}>{b.service_title}</Text><Text testID={`booking-card-date-${b.id}`} style={s.body}>{when(b.start_at)}</Text><Text testID={`booking-card-parties-${b.id}`} style={s.muted}>{provider?b.customer_name:b.provider_name} · {b.guests} ospiti · {b.city.name}</Text><Text testID={`booking-card-price-${b.id}`} style={s.h3}>{money(b.amount_cents)}{b.status==='requested'?' · stima':''}</Text><Action id={`booking-card-open-${b.id}`} secondary label="Apri prenotazione" onPress={()=>router.push({pathname:'/delivery/order/[id]',params:{id:b.id}})}/></View>;
}