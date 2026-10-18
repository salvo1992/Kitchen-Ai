import { Text } from 'react-native';
import { ShopPage, useShopStyles } from '@/src/shop-ui';
export default function ShopInfo() {
  const s = useShopStyles();
  const sections = [
    ['Abbonamento AI Food Coach', 'Il prezzo effettivo è quello mostrato dallo store prima della conferma. Il piano è mensile e si rinnova automaticamente. Gestisci o annulla l’abbonamento dalle impostazioni App Store o Google Play; eliminare l’account non annulla un abbonamento.'],
    ['Ripristino e account', 'Accedi sempre allo stesso account Smart Kitchen AI e usa Ripristina acquisti nello Shop. Gli abbonamenti sono personali, non condivisi con gli altri membri della famiglia.'],
    ['Anteprima e pagamenti reali', 'Nell’ambiente di test gli acquisti sono simulati, senza addebiti. Gli acquisti reali richiedono la configurazione dei prodotti e delle credenziali negli store Apple e Google, oltre a una build store.'],
    ['Corsi dei creatori', 'Le candidature e i corsi vengono approvati dall’amministratore. Puoi seguire un corso e leggere le lezioni indicate come anteprima. Le lezioni complete e gli acquisti singoli non sono ancora disponibili. Il Coach non include i corsi a pagamento.'],
    ['Compensi dei creatori', 'La ripartizione prevista è 90% al creatore e 10% all’app. I saldi saranno alimentati solo da vendite verificate. I pagamenti ai creatori avvengono fuori dall’app e l’admin ne registra il riferimento: non viene inviato alcun bonifico dall’app. La base contabile, le commissioni store e gli aspetti fiscali vanno definiti prima di attivare le vendite.'],
    ['Privacy del Coach', 'Le conversazioni sono salvate nel tuo account e inviate al servizio AI insieme alle preferenze alimentari e ai nomi degli ingredienti disponibili, per personalizzare i suggerimenti. Evita di inserire dati medici sensibili. Puoi eliminare i dati con la cancellazione dell’account.'],
  ];
  return <ShopPage title="Come funziona" id="shop-info">{sections.map(([title, text], i) => <Text key={title} testID={`shop-info-${i}`} style={s.body}><Text style={s.h2}>{title}{'\n\n'}</Text>{text}</Text>)}</ShopPage>;
}