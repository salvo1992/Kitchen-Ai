import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Action, Field, Notice, ShopPage, useShopStyles, Loading } from '@/src/shop-ui';
import { usePurchases } from '@/src/purchases';
import { useAuth } from '@/src/auth';
import { api } from '@/src/api';

type Message = { id: string; role: string; content: string };
export default function FoodCoach() {
  const s = useShopStyles(); const p = usePurchases(); const { user } = useAuth(); const router = useRouter(); const qc = useQueryClient(); const [text, setText] = useState('');
  const key = ['coach-history', user?.user_id];
  const q = useQuery({ queryKey: key, queryFn: () => api<{ items: Message[] }>('/api/coach/history'), enabled: !!user && p.isSubscribed });
  const send = useMutation({ mutationFn: (message: string) => { if (!p.isSubscribed) throw new Error('Abbonamento non attivo'); return api('/api/coach/message', { method: 'POST', body: JSON.stringify({ message }) }); }, onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: key }); } });
  return <ShopPage id="food-coach" title="AI Food Coach">
    <Text testID="coach-title" style={s.title}>Il benessere comincia{ '\n' }dalle piccole abitudini.</Text>
    <Notice id="coach-disclaimer" text="Consigli generali, non prescrizioni mediche. Per patologie, allergie o una dieta clinica rivolgiti a un professionista." />
    {p.loading ? <Loading /> : !p.isSubscribed ? <View style={s.card}><Text testID="coach-locked" style={s.body}>Il tuo percorso personale è incluso nell’abbonamento AI Food Coach.</Text><Action id="coach-go-shop" label="Scopri l’abbonamento" onPress={() => router.push('/shop')} /></View> : <>
      <Text testID="coach-current-diet" style={s.muted}>{user?.diet ? `Le tue preferenze: ${user.diet}` : 'Il Coach usa le tue preferenze alimentari e gli ingredienti che hai in casa.'}</Text>
      <Action id="coach-edit-preferences" secondary label="Aggiorna le mie preferenze" onPress={() => router.push('/settings')} />
      {q.isLoading && <Loading id="coach-history-loading" />}<Notice id="coach-history-error" error text={q.error?.message} />
      {(q.data?.items || []).map(m => <View key={m.id} style={m.role === 'assistant' ? s.card : s.outline}><Text testID={`coach-message-${m.id}-role`} style={s.caption}>{m.role === 'assistant' ? 'Il tuo Coach' : 'Tu'}</Text><Text testID={`coach-message-${m.id}`} selectable style={s.body}>{m.content}</Text></View>)}
      {!q.data?.items.length && <><Text testID="coach-starter-title" style={s.h2}>Da cosa partiamo?</Text>{['Vorrei pasti più equilibrati', 'Aiutami a variare le colazioni', 'Come organizzo i pasti con poco tempo?'].map((prompt, i) => <Action key={prompt} id={`coach-prompt-${i}`} secondary label={prompt} onPress={() => setText(prompt)} />)}</>}
      <Field testID="coach-input" label="Racconta al Coach la tua giornata" value={text} onChangeText={setText} multiline maxLength={2000} placeholder="Abitudini, dubbi, idee per i pasti…" />
      <Action id="coach-send" label={send.isPending ? 'Il Coach sta pensando…' : 'Chiedi al Coach'} busy={send.isPending} disabled={text.trim().length < 2} onPress={() => send.mutate(text.trim())} />
      <Notice id="coach-send-error" error text={send.error?.message} />
    </>}
  </ShopPage>;
}