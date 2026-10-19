import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Action, Field, Loading, Notice, ShopPage, useShopStyles } from '@/src/shop-ui';
import { Enter } from '@/src/components/ui';
import { CityPicker } from '@/src/delivery/CityPicker';
import { ProviderCard } from '@/src/delivery/ProviderCard';
import { categories, Choices, City, Provider, useDelivery, useDeliveryStyles, QueryError, PaymentNotice } from '@/src/delivery/shared';
import { useTheme } from '@/src/theme';

export default function Delivery() {
  const s = useShopStyles(); const d = useDeliveryStyles(); const { colors } = useTheme(); const router = useRouter();
  const [city, setCity] = useState<City | null>(null); const [category, setCategory] = useState('all'); const [text, setText] = useState(''); const [search, setSearch] = useState(''); const [mode, setMode] = useState('all');
  const params = new URLSearchParams(); if (city) params.set('city_id', city.id); if (category !== 'all') params.set('category', category); if (search) params.set('q', search); if (mode === 'instant') params.set('instant', 'true');
  const q = useDelivery<{items: Provider[]; payments: any}>(`catalogue-${params}`, `/providers?${params}`);
  return <ShopPage id="delivery" title="Delivery Chef">
    <Enter><View style={d.hero}><Ionicons name="restaurant-outline" size={36} color={colors.brandSecondary} /><Text testID="delivery-eyebrow" style={d.eyebrow}>TU PENSA ALL’OCCASIONE</Text><Text testID="delivery-title" style={d.title}>Alla cucina,{ '\n' }ci pensa lo chef.</Text><Text testID="delivery-subtitle" style={s.body}>Una cena per due, una festa da ricordare o un grande evento. Trova chi lo rende speciale.</Text></View></Enter>
    <Action id="delivery-my-bookings" secondary label="Le mie prenotazioni" onPress={() => router.push('/delivery/orders')} />
    <View style={s.outline}><CityPicker id="delivery-city" value={city} onSelect={setCity} />{city && <Action id="delivery-all-italy" secondary label="Mostra tutta Italia" onPress={() => setCity(null)} />}</View>
    <Text testID="delivery-services-title" style={s.h2}>Cosa stai organizzando?</Text>
    <Choices id="delivery-category" values={[{ id: 'all', label: 'Tutti' }, ...categories]} selected={category} onSelect={setCategory} />
    <Choices id="delivery-mode" values={[{id:'all',label:'Tutte le modalità'},{id:'instant',label:'Prenotazione immediata'}]} selected={mode} onSelect={setMode} />
    <Field testID="delivery-search-input" label="Cerca chef, azienda o specialità" value={text} onChangeText={setText} maxLength={100} placeholder="Chef, risotto, cucina vegetale…" />
    <Action id="delivery-search" label="Trova il tuo chef" onPress={() => setSearch(text.trim())} />
    <PaymentNotice config={q.data?.payments} />
    {q.isLoading && <Loading id="delivery-loading" />}<QueryError query={q} id="delivery-catalogue" />
    {q.data && <Text testID="delivery-result-count" style={s.muted}>{q.data.items.length} professionisti{city ? ` per ${city.name}` : ' in Italia'}</Text>}
    {q.data?.items.map(p => <ProviderCard key={p.id} provider={p} />)}
    {q.data?.items.length === 0 && <View style={s.card}><Ionicons name="sparkles-outline" size={32} color={colors.brandSecondary} /><Text testID="delivery-empty-title" style={s.h2}>Il prossimo talento potresti essere tu.</Text><Notice id="delivery-empty" text="Non ci sono ancora professionisti approvati per questi filtri. Cambia zona o servizio, oppure crea la tua scheda." /><Action id="delivery-empty-provider" label="Sono uno chef o un’azienda" onPress={() => router.push('/delivery/provider')} /></View>}
    <Action id="delivery-become-provider" label="Offri i tuoi servizi su Delivery Chef" secondary onPress={() => router.push('/delivery/provider')} />
  </ShopPage>;
}