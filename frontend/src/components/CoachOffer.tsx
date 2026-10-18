import { useState } from 'react';
import { View, Text, Modal, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePurchases, simulatedPurchases } from '@/src/purchases';
import { Action, Notice, Loading, useShopStyles } from '@/src/shop-ui';
import { makeStyles, useTheme } from '@/src/theme';

const useStyles = makeStyles(c => ({
  container: { gap: 16 },
  hero: { backgroundColor: c.surfaceInverse, borderRadius: 28, padding: 24, gap: 20, overflow: 'hidden' },
  icon: { width: 60, height: 60, borderRadius: 22, backgroundColor: c.brandPrimary, justifyContent: 'center', alignItems: 'center' },
  title: { color: c.onSurfaceInverse, fontSize: 30, fontWeight: '800', lineHeight: 35, letterSpacing: -0.8 },
  sub: { color: c.onSurfaceInverse, fontSize: 15, lineHeight: 23, opacity: 0.85 },
  price: { color: c.onSurfaceInverse, fontSize: 30, fontWeight: '800' },
  note: { color: c.onSurfaceInverse, opacity: 0.75, fontSize: 12, lineHeight: 18 },
  modal: { flex: 1, backgroundColor: c.surfaceInverse, justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: c.surface, borderRadius: 28, padding: 24, gap: 20 },
}));

export function CoachOffer() {
  const p = usePurchases(); const s = useShopStyles(); const st = useStyles(); const { colors } = useTheme(); const router = useRouter(); const insets = useSafeAreaInsets();
  const [confirm, setConfirm] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const pkg = p.packages.find(x => x.identifier === '$rc_monthly');
  const execute = async (restore = false) => {
    setConfirm(false); setError(''); setMessage('');
    try {
      if (!restore && !pkg) return;
      const active = restore ? await p.restore() : await p.purchase(pkg!);
      setMessage(active ? (restore ? 'Abbonamento ripristinato. Il Coach ti aspetta.' : 'Abbonamento attivo. Inizia con il tuo Coach!') : 'Nessun abbonamento attivo trovato per questo account.');
    } catch (e: any) { if (!e.userCancelled) setError(e?.message || 'Acquisto non riuscito. Riprova.'); }
  };
  return <View testID="coach-offer" style={st.container}>
    <View style={st.hero}>
      <View style={s.row}><View style={st.icon}><Ionicons name="sparkles" size={28} color={colors.onBrandPrimary} /></View><Text testID="coach-offer-tag" style={[s.caption, { color: colors.brandSecondary }]}>UN ALLEATO OGNI GIORNO</Text></View>
      <Text testID="coach-offer-title" style={st.title}>AI Food Coach</Text>
      <Text testID="coach-offer-description" style={st.sub}>Mangia con più consapevolezza. Un piccolo passo alla volta, a partire dalla tua cucina.</Text>
      {['Consigli su misura per le tue preferenze', 'Idee con ciò che hai già in dispensa', 'Una conversazione che ricorda il tuo percorso'].map((text, i) => <View key={text} style={s.row}><Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} /><Text testID={`coach-benefit-${i}`} style={[st.sub, s.grow]}>{text}</Text></View>)}
      {p.loading ? <Loading id="offer-loading" /> : p.isSubscribed ? <><Text testID="coach-active" style={s.badge}>Il tuo abbonamento è attivo</Text><Action id="open-coach" label="Parla con il tuo Coach" onPress={() => router.push('/food-coach')} /></> : pkg ? <>
        <View><Text testID="coach-price" style={st.price}>{pkg.product.priceString}<Text style={st.sub}> / mese</Text></Text><Text testID="coach-store-title" style={st.note}>{pkg.product.title}</Text></View>
        <Action id="subscribe-coach" label="Attiva il mio Coach" disabled={!p.identityReady} busy={p.busy} onPress={() => simulatedPurchases ? setConfirm(true) : execute()} />
        <Text testID="coach-renewal" style={st.note}>Rinnovo automatico mensile. Puoi annullare dalle impostazioni abbonamenti dello store. L&apos;accesso resta attivo fino alla scadenza del periodo pagato.</Text>
      </> : <Text testID="offer-unavailable" style={st.sub}>Gli abbonamenti non sono disponibili al momento. Riprova tra poco.</Text>}
      <Text testID="coach-medical-note" style={st.note}>Supporto al benessere quotidiano, non una dieta clinica. Non sostituisce un medico o un dietista.</Text>
    </View>
    {simulatedPurchases && <Notice id="purchase-simulation" text="AMBIENTE DI TEST · Gli acquisti qui sono simulati tramite RevenueCat Test Store. Nessun addebito reale." />}
    <Notice id="purchase-identity-error" text={p.identityError} error />
    <Notice id="purchase-store-error" text={p.storeError} error />
    <Notice id="purchase-error" text={error} error />
    <Notice id="purchase-success" text={message} />
    {(!pkg || !!p.identityError || !!p.storeError) && !p.loading && <Action id="retry-purchases" label="Riprova collegamento acquisti" secondary onPress={p.retry} />}
    <Action id="restore-purchases" label="Ripristina acquisti" secondary busy={p.busy} disabled={!p.identityReady} onPress={() => execute(true)} />
    {p.isSubscribed && <Action id="manage-subscription" label="Gestisci abbonamento" secondary onPress={async () => {
      if (p.managementURL) { try { await Linking.openURL(p.managementURL); } catch { setError('Apri la sezione Abbonamenti nello store del tuo dispositivo.'); } }
      else setMessage(simulatedPurchases ? 'Questo è un abbonamento di test. In una build store potrai gestirlo dalle impostazioni abbonamenti Apple o Google.' : 'Gestisci o annulla dalle impostazioni Abbonamenti di App Store o Google Play.');
    }} />}
    <Modal testID="purchase-confirm-modal" visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
      <View style={[st.modal, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}><View style={st.sheet}>
        <Text testID="purchase-confirm-title" style={s.h2}>Conferma acquisto simulato</Text><Text testID="purchase-confirm-description" style={s.body}>Proverai il rinnovo mensile {pkg?.product.priceString} nel Test Store. Non ti verrà addebitato nulla.</Text>
        <Action id="confirm-test-purchase" label="Continua nel Test Store" onPress={() => execute()} /><Action id="cancel-test-purchase" secondary label="Non ora" onPress={() => setConfirm(false)} />
      </View></View>
    </Modal>
  </View>;
}