import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Action, ShopPage, useShopStyles, useShopAccess, Notice } from '@/src/shop-ui';
import { CoachOffer } from '@/src/components/CoachOffer';
import { Enter } from '@/src/components/ui';
import { useTheme } from '@/src/theme';

const upcoming = [
  { id: 'cookbook', icon: 'book-outline', title: 'Ricettario di famiglia', price: '4,99 € / esportazione', text: 'Le ricette di casa, raccolte in un PDF da conservare e condividere.' },
  { id: 'freezer', icon: 'snow-outline', title: 'Freezer Manager Pro', price: '5,99 € una tantum', text: 'Lotti, porzioni e organizzazione avanzata del tuo congelatore.' },
  { id: 'lab', icon: 'flask-outline', title: 'Laboratorio cucina', price: '3,99–7,99 € / modulo', text: 'Tecniche e piccoli esperimenti per allargare i tuoi orizzonti.' },
];
export default function Shop() {
  const s = useShopStyles(); const { colors } = useTheme(); const router = useRouter(); const access = useShopAccess();
  return <ShopPage title="Shop & Accademia" id="shop">
    <Enter><Text testID="shop-eyebrow" style={s.caption}>LA TUA CUCINA, UN PASSO IN PIÙ</Text><Text testID="shop-title" style={s.title}>Piccole idee.{ '\n' }Grandi possibilità.</Text></Enter>
    <Enter index={1}><CoachOffer /></Enter>
    <View style={s.card}>
      <Text testID="shop-delivery-title" style={s.h2}>La tua cucina, a domicilio.</Text>
      <Text testID="shop-delivery-description" style={s.body}>Sei uno chef o un’azienda di catering? Crea la tua scheda, pubblica servizi e prezzi e gestisci richieste, agenda e compensi.</Text>
      <Action id="shop-delivery-provider" label="Il mio Delivery Chef" onPress={() => router.push('/delivery/provider')} />
      <Action id="shop-delivery-explore" label="Esplora Delivery Chef" secondary onPress={() => router.push('/delivery')} />
    </View>
    <Enter index={2}><View style={s.card}>
      <View style={s.row}><Ionicons name="school-outline" size={32} color={colors.brandSecondary} /><Text testID="academy-title" style={s.h2}>Impara, crea, condividi.</Text></View>
      <Text testID="academy-description" style={s.body}>Un posto per chi ama cucinare e per chi ha qualcosa da insegnare.</Text>
      <Action id="shop-courses" label="Esplora i corsi" onPress={() => router.push('/courses')} />
      <Action id="shop-learning" label="I miei percorsi" secondary onPress={() => router.push('/my-courses')} />
      <Action id="shop-creator" label={access.data?.is_creator ? 'Il mio studio creatore' : 'Diventa creatore'} secondary onPress={() => router.push('/creator')} />
      {access.data?.is_admin && <Action id="shop-admin" label="Amministra lo Shop" secondary onPress={() => router.push('/shop-admin')} />}
      <Notice id="shop-access-error" error text={access.error?.message} />
    </View></Enter>
    <View><Text testID="upcoming-title" style={s.h2}>Strumenti per la tua cucina</Text><Text testID="upcoming-subtitle" style={s.muted}>Esplora le funzioni · sblocco con acquisto singolo verificato</Text></View>
    {upcoming.map((item, i) => <Enter key={item.id} index={i + 3}><View testID={`upcoming-${item.id}`} style={s.outline}>
      <View style={s.row}><Ionicons name={item.icon as any} size={26} color={colors.brandPrimary} /><Text testID={`upcoming-${item.id}-title`} style={[s.h3, s.grow]}>{item.title}</Text></View>
      <Text testID={`upcoming-${item.id}-description`} style={s.muted}>{item.text}</Text><Text testID={`upcoming-${item.id}-price`} style={s.h3}>{item.price} · prezzo previsto</Text>
      <Action id={`shop-open-${item.id}`} label="Esplora la funzione" secondary onPress={() => router.push(item.id === 'cookbook' ? '/cookbook' : item.id === 'freezer' ? '/freezer-pro' : '/laboratory')} />
    </View></Enter>)}
    <Action id="shop-info" secondary label="Come funzionano acquisti e corsi" onPress={() => router.push('/shop-info')} />
  </ShopPage>;
}