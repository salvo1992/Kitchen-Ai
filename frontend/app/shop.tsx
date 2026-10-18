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
    <Enter index={2}><View style={s.card}>
      <View style={s.row}><Ionicons name="school-outline" size={32} color={colors.brandSecondary} /><Text testID="academy-title" style={s.h2}>Impara, crea, condividi.</Text></View>
      <Text testID="academy-description" style={s.body}>Un posto per chi ama cucinare e per chi ha qualcosa da insegnare.</Text>
      <Action id="shop-courses" label="Esplora i corsi" onPress={() => router.push('/courses')} />
      <Action id="shop-learning" label="I miei percorsi" secondary onPress={() => router.push('/my-courses')} />
      <Action id="shop-creator" label={access.data?.is_creator ? 'Il mio studio creatore' : 'Diventa creatore'} secondary onPress={() => router.push('/creator')} />
      {access.data?.is_admin && <Action id="shop-admin" label="Amministra lo Shop" secondary onPress={() => router.push('/shop-admin')} />}
      <Notice id="shop-access-error" error text={access.error?.message} />
    </View></Enter>
    <View><Text testID="upcoming-title" style={s.h2}>Presto nella tua cucina</Text><Text testID="upcoming-subtitle" style={s.muted}>Strumenti singoli · non ancora acquistabili</Text></View>
    {upcoming.map((item, i) => <Enter key={item.id} index={i + 3}><View testID={`upcoming-${item.id}`} style={s.outline}>
      <View style={s.row}><Ionicons name={item.icon as any} size={26} color={colors.brandPrimary} /><Text testID={`upcoming-${item.id}-title`} style={[s.h3, s.grow]}>{item.title}</Text></View>
      <Text testID={`upcoming-${item.id}-description`} style={s.muted}>{item.text}</Text><Text testID={`upcoming-${item.id}-price`} style={s.h3}>{item.price}</Text><Text testID={`upcoming-${item.id}-status`} style={s.badge}>In arrivo · prezzo previsto</Text>
    </View></Enter>)}
    <Action id="shop-info" secondary label="Come funzionano acquisti e corsi" onPress={() => router.push('/shop-info')} />
  </ShopPage>;
}