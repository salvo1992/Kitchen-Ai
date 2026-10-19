import {Text} from 'react-native';
import {useLocalSearchParams} from 'expo-router';
import {Loading,Notice,ShopPage,useShopStyles} from '@/src/shop-ui';
import {Booking,useDelivery,QueryError} from '@/src/delivery/shared';
import {BookingCard} from '@/src/delivery/BookingCard';
export default function Orders(){
  const {provider}=useLocalSearchParams<{provider?:string}>();const pro=provider==='true';const s=useShopStyles();const q=useDelivery<{items:Booking[]}>(`orders-${pro}`,`/bookings?provider=${pro}`);
  return <ShopPage id="delivery-orders" title={pro?'Ordini dei clienti':'Le mie prenotazioni'}><Text testID="delivery-orders-title" style={s.title}>{pro?'Le occasioni da preparare.':'Le tue prossime occasioni.'}</Text>{q.isLoading&&<Loading/>}<QueryError query={q} id="delivery-orders"/>{q.data?.items.map(b=><BookingCard key={b.id} booking={b} provider={pro}/>)}{q.data?.items.length===0&&<Notice id="delivery-orders-empty" text="Nessuna prenotazione per il momento. Le richieste e i loro aggiornamenti compariranno qui."/>}</ShopPage>;
}