import { useState } from 'react';
import { Text, View, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Action, Field, Loading, money, Notice, ShopPage, statusLabel, useShopAccess, useShopStyles } from '@/src/shop-ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';

export default function ShopAdmin() {
  const s = useShopStyles(); const access = useShopAccess(); const { user } = useAuth(); const router = useRouter(); const qc = useQueryClient(); const inset = useSafeAreaInsets(); const [note, setNote] = useState(''); const [payout, setPayout] = useState<any>(null); const [reference, setReference] = useState('');
  const q = useQuery({ queryKey: ['admin-shop', user?.user_id], queryFn: () => api<any>('/api/admin/shop'), enabled: !!access.data?.is_admin });
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => api(`/api/admin/${path}`, { method: 'POST', body: JSON.stringify(body) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-shop'] }); qc.invalidateQueries({ queryKey: ['courses'] }); qc.invalidateQueries({ queryKey: ['course-detail'] }); setPayout(null); setReference(''); } });
  return <ShopPage id="shop-admin" title="Amministrazione Shop">
    {access.isLoading && <Loading />}
    {access.data && !access.data.is_admin && <Notice id="admin-forbidden" error text="Accesso riservato al titolare. Per amministrare lo Shop accedi con Google usando l’email autorizzata." />}
    <Notice id="admin-access-error" error text={access.error?.message} />
    {access.data?.is_admin && <>
      <Text testID="admin-title" style={s.title}>Un’Accademia curata,{ '\n' }un passo alla volta.</Text>
      <Notice id="admin-store-note" text="Coach: abbonamento gestito da RevenueCat, prezzo effettivo letto dallo store. Acquisti singoli e vendite corsi non ancora attivi. Le modifiche alle tariffe store richiedono la configurazione dei prodotti, non un semplice cambio del prezzo proposto." />
      {q.isLoading && <Loading />}<Notice id="admin-dashboard-error" error text={q.error?.message} />
      {q.data && <>
        <View style={s.card}><Text testID="admin-balance-title" style={s.caption}>DA LIQUIDARE AI CREATORI</Text><Text testID="admin-balance" style={s.title}>{money(q.data.balance_cents)}</Text><Text testID="admin-paid-total" style={s.muted}>{money(q.data.paid_cents)} registrati come pagati</Text><Text testID="admin-split" style={s.body}>90% creatore / 10% app</Text></View>
        <Field testID="admin-review-note" label="Nota per la prossima revisione (facoltativa)" value={note} onChangeText={setNote} multiline maxLength={1000} />
        <Text testID="admin-applications-title" style={s.h2}>Candidature creatori</Text>
        {!q.data.applications.length && <Notice id="admin-applications-empty" text="Nessuna candidatura da esaminare." />}
        {q.data.applications.map((a: any) => <View key={a.user_id} style={s.outline}><Text testID={`admin-applicant-${a.user_id}`} style={s.h3}>{a.name}</Text><Text testID={`admin-applicant-email-${a.user_id}`} style={s.muted}>{a.email}</Text><Text testID={`admin-applicant-bio-${a.user_id}`} style={s.body}>{a.bio}</Text><Text testID={`admin-applicant-status-${a.user_id}`} style={s.badge}>{statusLabel[a.status]}</Text>
          {a.status !== 'approved' && <Action id={`admin-approve-creator-${a.user_id}`} label="Approva creatore" busy={act.isPending} onPress={() => act.mutate({ path: `creators/${a.user_id}/review`, body: { decision: 'approved', note } })} />}
          {a.status !== 'rejected' && <Action id={`admin-reject-creator-${a.user_id}`} secondary label={a.status === 'approved' ? 'Sospendi creatore e ritira i corsi' : 'Non approvare'} busy={act.isPending} onPress={() => act.mutate({ path: `creators/${a.user_id}/review`, body: { decision: 'rejected', note } })} />}
        </View>)}
        <Text testID="admin-courses-title" style={s.h2}>Corsi e prezzi proposti</Text>
        {!q.data.courses.length && <Notice id="admin-courses-empty" text="Nessun corso creato." />}
        {q.data.courses.map((c: any) => <View key={c.id} style={s.outline}><Text testID={`admin-course-title-${c.id}`} style={s.h3}>{c.title}</Text><Text testID={`admin-course-price-${c.id}`} style={s.muted}>{c.creator_name} · {money(c.price_cents)}</Text><Text testID={`admin-course-status-${c.id}`} style={s.badge}>{statusLabel[c.status]}</Text><Action id={`admin-preview-${c.id}`} secondary label="Leggi tutte le lezioni" onPress={() => router.push({ pathname: '/course/[id]', params: { id: c.id } })} />
          {c.status === 'pending' && <Action id={`admin-publish-${c.id}`} label="Approva e pubblica" busy={act.isPending} onPress={() => act.mutate({ path: `courses/${c.id}/review`, body: { decision: 'approved', note } })} />}
          {['pending', 'published'].includes(c.status) && <Action id={`admin-reject-course-${c.id}`} secondary label={c.status === 'published' ? 'Ritira dalla vetrina' : 'Richiedi modifiche'} busy={act.isPending} onPress={() => act.mutate({ path: `courses/${c.id}/review`, body: { decision: 'rejected', note } })} />}
        </View>)}
        <Text testID="admin-payouts-title" style={s.h2}>Registro pagamenti</Text>
        {!q.data.earnings.length && <Notice id="admin-earnings-empty" text="Nessuna vendita verificata da liquidare. I test dell’abbonamento Coach non generano saldi creatori." />}
        {q.data.earnings.map((e: any) => <View key={e.id} style={s.outline}><Text testID={`admin-earning-${e.id}`} style={s.body}>{e.course_title} · {money(e.creator_cents)}</Text><Text testID={`admin-earning-status-${e.id}`} style={s.muted}>{e.status === 'paid' ? `Pagato · ${e.payment_reference}` : 'Da liquidare'}</Text>{e.status === 'earned' && <Action id={`admin-pay-${e.id}`} label="Registra pagamento effettuato" onPress={() => { setPayout(e); setReference(''); act.reset(); }} />}</View>)}
      </>}
      <Notice id="admin-action-error" error text={act.error?.message} />
    </>}
    <Modal testID="admin-payout-modal" visible={!!payout} animationType="slide" onRequestClose={() => !act.isPending && setPayout(null)}>
      <KeyboardAvoidingView style={[s.root, { paddingTop: inset.top + 24 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text testID="admin-payout-title" style={s.h2}>Hai già pagato il creatore?</Text><Text testID="admin-payout-description" style={s.body}>Questa operazione registra {money(payout?.creator_cents || 0)} come già pagati. Non invia denaro. Verifica prima il bonifico o il pagamento esterno.</Text>
        <Field testID="admin-payment-reference" label="Riferimento bonifico / pagamento" value={reference} onChangeText={setReference} maxLength={120} />
        <Action id="admin-confirm-payout" label="Confermo: pagamento già effettuato" busy={act.isPending} disabled={reference.trim().length < 3} onPress={() => act.mutate({ path: `earnings/${payout.id}/paid`, body: { reference: reference.trim() } })} />
        <Action id="admin-cancel-payout" secondary label="Annulla" disabled={act.isPending} onPress={() => setPayout(null)} /><Notice id="admin-payout-error" error text={act.error?.message} />
      </ScrollView></KeyboardAvoidingView>
    </Modal>
  </ShopPage>;
}