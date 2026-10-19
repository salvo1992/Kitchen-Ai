import { useState } from 'react';
import { View, Text } from 'react-native';
import { Action, Field, Notice, useShopStyles } from '@/src/shop-ui';
import { City, useDeliveryAction, useDeliveryStyles } from './shared';

export function CityPicker({ id, value, onSelect }: { id: string; value: City | null; onSelect: (c: City) => void }) {
  const s = useShopStyles(); const d = useDeliveryStyles(); const [text, setText] = useState(''); const [items, setItems] = useState<City[]>([]); const [searched, setSearched] = useState(false); const action = useDeliveryAction();
  const search = async () => { setItems([]); setSearched(false); try { const res = await action.mutateAsync({ path: '/cities', body: { query: text.trim() } }); setItems(res.items); setSearched(true); } catch {} };
  return <View style={d.form}>
    {value && <Text testID={`${id}-selected`} style={s.badge}>{value.label}</Text>}
    <Field testID={`${id}-input`} label={value ? 'Cambia comune' : 'In quale comune?'} placeholder="Es. Roma, Milano, Palermo" value={text} onChangeText={setText} maxLength={100} />
    <Action id={`${id}-search`} label="Cerca comune" secondary busy={action.isPending} disabled={text.trim().length < 3} onPress={search} />
    <Notice id={`${id}-error`} error text={action.error?.message} />
    {searched && !items.length && <Notice id={`${id}-empty`} text="Nessun comune trovato. Prova il nome completo, senza indirizzo." />}
    {items.map((c, i) => <Action key={c.id} id={`${id}-result-${i}`} secondary label={c.label} onPress={() => { onSelect(c); setItems([]); setSearched(false); setText(''); }} />)}
    <Text testID={`${id}-attribution`} style={s.muted}>Dati © OpenStreetMap contributors · ODbL. Copertura indicativa dal centro del comune.</Text>
  </View>;
}