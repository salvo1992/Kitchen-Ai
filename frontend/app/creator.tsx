import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Action, Field, Loading, money, Notice, ShopPage, statusLabel, useShopAccess, useShopStyles, Course } from '@/src/shop-ui';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';

export default function Creator() {
  const s = useShopStyles(); const access = useShopAccess(); const { user } = useAuth(); const router = useRouter(); const qc = useQueryClient(); const [bio, setBio] = useState('');
  const q = useQuery({ queryKey: ['creator-dashboard', user?.user_id], queryFn: () => api<{ courses: Course[]; balance_cents: number; paid_cents: number; followers: number; earnings: any[] }>('/api/creator/dashboard'), enabled: !!access.data?.is_creator });
  const apply = useMutation({ mutationFn: () => api('/api/creator/application', { method: 'POST', body: JSON.stringify({ bio: bio.trim() }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['shop-access'] }) });
  const submit = useMutation({ mutationFn: (id: string) => api(`/api/creator/courses/${id}/submit`, { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['creator-dashboard'] }) });
  return <ShopPage id="creator" title="Studio creatore">
    <Text testID="creator-title" style={s.title}>Il tuo sapere,{ '\n' }la loro prossima scoperta.</Text>
    <Notice id="creator-revenue-policy" text="90% al creatore · 10% all’app. Saldo da vendite verificate e pagamenti registrati manualmente dall’admin. Le vendite dei corsi non sono ancora attive." />
    {access.isLoading && <Loading />}<Notice id="creator-access-error" error text={access.error?.message} />
    {access.data && !access.data.is_creator && <View style={s.card}>
      <Text testID="creator-application-title" style={s.h2}>{access.data.application ? 'La tua candidatura' : 'Entra in Accademia'}</Text>
      {access.data.application ? <><Text testID="creator-application-status" style={s.badge}>{statusLabel[access.data.application.status]}</Text><Notice id="creator-review-note" text={access.data.application.review_note || 'L’amministratore esaminerà il tuo profilo. Torna qui per conoscere l’esito.'} /><Action id="creator-refresh" secondary label="Aggiorna stato" onPress={() => access.refetch()} /></> : <>
        <Text testID="creator-application-hint" style={s.body}>Raccontaci la tua esperienza e cosa vorresti insegnare. Dopo l’approvazione potrai creare le tue lezioni.</Text>
        <Field testID="creator-bio" label="Presentati (almeno 20 caratteri)" multiline value={bio} onChangeText={setBio} maxLength={1500} />
        <Action id="creator-apply" label="Invia candidatura" disabled={bio.trim().length < 20} busy={apply.isPending} onPress={() => apply.mutate()} /><Notice id="creator-apply-error" error text={apply.error?.message} />
      </>}
    </View>}
    {access.data?.is_creator && <>
      {q.isLoading && <Loading />}<Notice id="creator-dashboard-error" error text={q.error?.message} />
      {q.data && <><View style={s.card}><Text testID="creator-balance-label" style={s.caption}>SALDO DA LIQUIDARE</Text><Text testID="creator-balance" style={s.title}>{money(q.data.balance_cents)}</Text><Text testID="creator-paid" style={s.muted}>{money(q.data.paid_cents)} già registrati come pagati</Text><Text testID="creator-followers" style={s.body}>{q.data.followers} percorsi seguiti</Text></View>
        <Action id="creator-new-course" label="Crea un corso" onPress={() => router.push('/course-editor')} />
        <Text testID="creator-courses-title" style={s.h2}>I tuoi corsi</Text>
        {!q.data.courses.length && <Notice id="creator-courses-empty" text="Il tuo studio è pronto. Crea la prima bozza, aggiungi le lezioni e inviala in revisione." />}
        {q.data.courses.map(c => <View key={c.id} style={s.outline}><Text testID={`creator-course-${c.id}-title`} style={s.h3}>{c.title}</Text><Text testID={`creator-course-${c.id}-status`} style={s.badge}>{statusLabel[c.status]}</Text><Text testID={`creator-course-${c.id}-price`} style={s.muted}>{money(c.price_cents)} · {c.lesson_count} lezioni</Text><Notice id={`creator-review-${c.id}`} text={c.review_note} />
          <Action id={`creator-preview-${c.id}`} secondary label="Anteprima corso" onPress={() => router.push({ pathname: '/course/[id]', params: { id: c.id } })} />
          {['draft', 'rejected'].includes(c.status) && <><Action id={`creator-edit-${c.id}`} secondary label="Modifica bozza" onPress={() => router.push({ pathname: '/course-editor', params: { id: c.id } })} /><Action id={`creator-submit-${c.id}`} label="Invia in revisione" busy={submit.isPending} onPress={() => submit.mutate(c.id)} /></>}
        </View>)}
        {!q.data.earnings.length && <Notice id="creator-earnings-empty" text="Nessuna vendita contabilizzata. Il saldo non include anteprime o abbonamenti Coach." />}
        {q.data.earnings.map(e => <View key={e.id} style={s.outline}><Text testID={`creator-earning-${e.id}`} style={s.body}>{e.course_title} · {money(e.creator_cents)} · {e.status === 'paid' ? 'Pagato' : 'Da liquidare'}</Text>{e.payment_reference && <Text testID={`creator-payment-${e.id}`} style={s.muted}>Riferimento: {e.payment_reference}</Text>}</View>)}
      </>}
      <Notice id="creator-submit-error" error text={submit.error?.message} />
    </>}
  </ShopPage>;
}