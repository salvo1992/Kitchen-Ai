import {useEffect,useState} from 'react';
import {Text,Pressable} from 'react-native';
import {Image} from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@react-native-vector-icons/ionicons';
import {useRouter} from 'expo-router';
import {Action,Field,Loading,Notice,ShopPage,useShopStyles} from '@/src/shop-ui';
import {CityPicker} from '@/src/delivery/CityPicker';
import {City,Choices,QueryError,Terms,useDelivery,useDeliveryAction,useDeliveryStyles} from '@/src/delivery/shared';
import {uploadForm} from '@/src/utils/upload';
import {resolveUrl} from '@/src/media';
import {useTheme} from '@/src/theme';

export default function ProviderEdit(){
  const q=useDelivery<any>('provider','/provider');const action=useDeliveryAction();const s=useShopStyles();const d=useDeliveryStyles();const {colors}=useTheme();const router=useRouter();
  const [name,setName]=useState('');const [kind,setKind]=useState('chef');const [bio,setBio]=useState('');const [city,setCity]=useState<City|null>(null);const [radius,setRadius]=useState('25');const [specialties,setSpecialties]=useState('');const [photo,setPhoto]=useState<string|null>(null);const [terms,setTerms]=useState(false);const [uploading,setUploading]=useState(false);const [error,setError]=useState('');const [loaded,setLoaded]=useState(false);
  useEffect(()=>{if(q.data&&!loaded){const p=q.data.provider;if(p){setName(p.display_name);setKind(p.kind);setBio(p.bio);setCity(p.city);setRadius(String(p.radius_km));setSpecialties(p.specialties.join('\n'));setPhoto(p.photo_url||null);}setLoaded(true);}},[q.data,loaded]);
  const choosePhoto=async()=>{setError('');try{const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted)throw new Error('Consenti l’accesso alla galleria per scegliere una foto.');const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[4,3],quality:0.7});if(result.canceled)return;setUploading(true);const a=result.assets[0];const uploaded=await uploadForm(a.uri,a.fileName||'chef.jpg');setPhoto(uploaded.url);}catch(e:any){setError(e.message);}finally{setUploading(false);}};
  const dishes=specialties.split('\n').map(x=>x.trim()).filter(Boolean);const valid=name.trim().length>=3&&bio.trim().length>=30&&!!city&&Number.isInteger(Number(radius))&&Number(radius)>=1&&Number(radius)<=300&&dishes.length>0&&dishes.length<=8&&terms;
  const save=async()=>{try{await action.mutateAsync({path:'/provider',method:'PUT',body:{display_name:name,kind,bio,city_id:city!.id,radius_km:Number(radius),specialties:dishes,photo_url:photo,accepts_terms:terms}});router.replace('/delivery/provider');}catch{}};
  return <ShopPage id="delivery-provider-edit" title="La tua scheda professionista">
    {q.isLoading&&<Loading/>}<QueryError query={q} id="provider-edit-load"/>
    <Text testID="provider-edit-title" style={d.title}>Porta la tua cucina{ '\n' }nelle occasioni speciali.</Text>
    <Choices id="provider-kind" values={[{id:'chef',label:'Sono uno chef'},{id:'company',label:'Siamo un’azienda'}]} selected={kind} onSelect={setKind}/>
    {photo&&<Image testID="provider-photo-preview" source={{uri:resolveUrl(photo)!}} style={d.photo} contentFit="cover"/>}<Action id="provider-choose-photo" secondary label={photo?'Cambia foto di presentazione':'Aggiungi una foto (facoltativa)'} busy={uploading} onPress={choosePhoto}/>
    <Field testID="provider-name" label="Nome pubblico / ragione sociale" value={name} onChangeText={setName} maxLength={90}/><Field testID="provider-bio" label="La tua storia e la tua esperienza (minimo 30 caratteri)" multiline value={bio} onChangeText={setBio} maxLength={3000}/>
    <CityPicker id="provider-city" value={city} onSelect={setCity}/><Field testID="provider-radius" label="Raggio di servizio dal comune, in km (1–300)" keyboardType="number-pad" value={radius} onChangeText={setRadius}/>
    <Field testID="provider-specialties" label="Piatti forti e specialità · uno per riga, massimo 8" multiline value={specialties} onChangeText={setSpecialties} placeholder="Risotto allo zafferano\nMenu vegetale di stagione" maxLength={1120}/>
    <Notice id="provider-moderation-note" text="La scheda sarà esaminata dall’admin. Anche le modifiche successive richiedono una nuova approvazione. Prezzi, servizi e disponibilità si gestiscono dal tuo pannello. Documenti e coordinate bancarie si inseriscono solo nell’onboarding sicuro Stripe, non qui."/>
    <Terms id="provider-terms"/>
    <Pressable testID="provider-accept-terms" accessibilityRole="checkbox" accessibilityState={{checked:terms}} style={d.toggle} onPress={()=>setTerms(!terms)}><Ionicons name={terms?'checkbox':'square-outline'} size={24} color={colors.brandPrimary}/><Text testID="provider-accept-label" style={[s.body,s.grow]}>Accetto la commissione del 10% e dichiaro di essere autorizzato a offrire i servizi descritti, rispettando gli obblighi professionali, fiscali e alimentari applicabili.</Text></Pressable>
    <Action id="provider-submit" label="Invia scheda in revisione" disabled={!valid||q.isLoading||q.isError||uploading} busy={action.isPending} onPress={save}/><Notice id="provider-save-error" error text={action.error?.message||error}/>
  </ShopPage>;
}