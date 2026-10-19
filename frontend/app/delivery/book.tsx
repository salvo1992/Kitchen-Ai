import { useRef, useState } from 'react';
import { Text, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Action, Field, Loading, money, Notice, ShopPage, useShopStyles } from '@/src/shop-ui';
import { CityPicker } from '@/src/delivery/CityPicker';
import { City, Provider, useDelivery, useDeliveryAction, useDeliveryStyles, QueryError, italianDay, italianTime, when, Terms } from '@/src/delivery/shared';
import { useTheme } from '@/src/theme';

export default function BookChef() {
  const { provider, service, mode } = useLocalSearchParams<{provider:string;service:string;mode:string}>();
  const q = useDelivery<Provider>(`profile-${provider}`, `/providers/${provider}`, !!provider); const selected = q.data?.services?.find(x=>x.id===service); const action = useDeliveryAction(); const router=useRouter(); const s=useShopStyles(); const d=useDeliveryStyles(); const {colors}=useTheme();
  const [city,setCity]=useState<City|null>(null); const [day,setDay]=useState(''); const [time,setTime]=useState('20:00'); const [slot,setSlot]=useState(''); const [guests,setGuests]=useState('2'); const [address,setAddress]=useState(''); const [phone,setPhone]=useState(''); const [notes,setNotes]=useState(''); const [agreed,setAgreed]=useState(false);
  const requestKey=useRef(`req_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const count=Number(guests); const valid=!!selected && !!city && /^\d{4}-\d{2}-\d{2}$/.test(day) && /^([01]\d|2[0-3]):(00|30)$/.test(time) && Number.isInteger(count) && count>=selected.min_guests && count<=selected.max_guests && address.trim().length>=8 && phone.trim().length>=7 && agreed && (mode!=='instant'||!!slot);
  const submit=async()=>{ try { const b=await action.mutateAsync({path:'/bookings',headers:{'Idempotency-Key':requestKey.current},body:{service_id:service,mode,city_id:city!.id,date:day,time,slot_id:slot||null,guests:count,address,phone,notes,accepts_terms:agreed}}); router.replace({pathname:'/delivery/order/[id]',params:{id:b.id}}); }catch{} };
  return <ShopPage title={mode==='instant'?'Prenota il tuo chef':'Richiedi un preventivo'} id="delivery-book">
    {q.isLoading&&<Loading/>}<QueryError query={q} id="delivery-book-profile"/>
    {selected&&<><Text testID="delivery-book-title" style={d.title}>{selected.title}</Text><Text testID="delivery-book-provider" style={s.muted}>Con {q.data?.display_name}</Text>
      <CityPicker id="booking-city" value={city} onSelect={setCity}/>
      {mode==='instant'?<View style={d.form}><Text testID="booking-slots-title" style={s.h3}>Orari disponibili · ora italiana</Text>{q.data?.slots?.filter(x=>x.duration_hours>=selected.duration_hours).map(x=><Action key={x.id} id={`booking-slot-${x.id}`} label={`${slot===x.id?'Selezionato · ':''}${when(x.start_at)}`} secondary={slot!==x.id} onPress={()=>{setSlot(x.id);setDay(italianDay(x.start_at));setTime(italianTime(x.start_at));}}/>)}{!q.data?.slots?.length&&<Notice id="booking-no-slots" text="Non ci sono orari prenotabili. Scegli un altro servizio o richiedi un preventivo, se disponibile."/>}</View>:<><Field testID="booking-date" label="Data desiderata (AAAA-MM-GG)" placeholder="2026-12-20" value={day} onChangeText={setDay} maxLength={10}/><Field testID="booking-time" label="Ora italiana (HH:00 oppure HH:30)" value={time} onChangeText={setTime} maxLength={5}/></>}
      <Field testID="booking-guests" label={`Numero ospiti (${selected.min_guests}–${selected.max_guests})`} keyboardType="number-pad" value={guests} onChangeText={setGuests}/>
      <Field testID="booking-address" label="Indirizzo del servizio, civico e dettagli" value={address} onChangeText={setAddress} maxLength={300}/><Field testID="booking-phone" label="Telefono di contatto" keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={30}/>
      <Field testID="booking-notes" label="Occasione, preferenze, allergie da concordare" multiline value={notes} onChangeText={setNotes} maxLength={2000}/>
      <View style={s.card}><Text testID="booking-estimate-label" style={s.caption}>{mode==='instant'?'TOTALE SERVIZIO':'STIMA INIZIALE · IL PREVENTIVO PUÒ VARIARE'}</Text><Text testID="booking-estimate" style={s.h2}>{money(selected.price_cents*(selected.pricing==='person'&&Number.isFinite(count)?count:1))}</Text><Text testID="booking-included" style={s.body}>{selected.included}</Text><Text testID="booking-privacy" style={s.muted}>Indirizzo e telefono sono visibili solo a te, al professionista e all’amministratore per gestire la prenotazione.</Text></View>
      <Terms id="booking-terms"/>
      <Pressable testID="booking-accept-terms" accessibilityRole="checkbox" accessibilityState={{checked:agreed}} style={d.toggle} onPress={()=>setAgreed(!agreed)}><Ionicons name={agreed?'checkbox':'square-outline'} size={24} color={colors.brandPrimary}/><Text testID="booking-terms-label" style={[s.body,s.grow]}>Accetto le condizioni e autorizzo la condivisione dei recapiti per questo servizio.</Text></Pressable>
      <Action id="booking-submit" label={mode==='instant'?'Continua al riepilogo e pagamento':'Invia richiesta · nessun addebito'} disabled={!valid} busy={action.isPending} onPress={submit}/><Notice id="booking-error" error text={action.error?.message}/>
    </>}
  </ShopPage>;
}