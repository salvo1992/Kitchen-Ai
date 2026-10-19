import { useState } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Action, Course, Loading, money, Notice, ShopPage, useShopStyles } from '@/src/shop-ui';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';
import { DigitalOffer } from '@/src/digital';

export default function CourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(); const s = useShopStyles(); const { user } = useAuth(); const qc = useQueryClient(); const [opened, setOpened] = useState<string | null>(null);
  const key = ['course-detail', id, user?.user_id];
  const q = useQuery({ queryKey: key, queryFn: () => api<Course>(`/api/courses/${id}`), enabled: !!id && !!user });
  const mutate = useMutation({ mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(`/api/courses/${id}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['my-courses'] }); } });
  const c = q.data;
  return <ShopPage id="course-detail" title="Il corso">
    {q.isLoading && <Loading />}<Notice id="course-detail-error" error text={q.error?.message} />
    {c && <><Text testID="course-detail-category" style={s.badge}>{c.category}</Text><Text testID="course-detail-title" style={s.title}>{c.title}</Text><Text testID="course-detail-author" style={s.muted}>Con {c.creator_name} · {c.lesson_count} lezioni</Text><Text testID="course-detail-description" style={s.body}>{c.description}</Text>
      <View style={s.card}><Text testID="course-detail-price" style={s.h2}>{money(c.price_cents)} · prezzo previsto</Text><Notice id="course-access-status" text={c.owned ? 'Corso acquistato e verificato: tutte le lezioni sono disponibili.' : 'Le anteprime sono gratuite. Per tutte le lezioni serve l’acquisto singolo verificato, distinto dall’abbonamento Coach.'} /><Action id="course-follow" label={c.saved ? 'Corso nei tuoi percorsi' : 'Segui questo corso'} disabled={c.saved || (c.status !== 'published' && !c.owned)} busy={mutate.isPending} onPress={() => mutate.mutate({ path: 'follow' })} /></View>
      {!c.owned && <DigitalOffer itemKey={`course:${id}`} />}
      <Text testID="course-program-title" style={s.h2}>Il programma</Text>
      {c.lessons?.map((l, i) => <View key={l.id} style={s.outline}>
        <Text testID={`lesson-title-${l.id}`} style={s.h3}>{i + 1}. {l.title}</Text><Text testID={`lesson-status-${l.id}`} style={s.badge}>{l.preview ? 'Anteprima gratuita' : l.locked ? 'Lezione riservata' : 'Vista autore / admin'}</Text>
        {!l.locked && <Action id={`lesson-open-${l.id}`} secondary label={opened === l.id ? 'Chiudi lezione' : 'Leggi la lezione'} onPress={() => setOpened(opened === l.id ? null : l.id)} />}
        {opened === l.id && !l.locked && <><Text testID={`lesson-content-${l.id}`} style={s.body} selectable>{l.content}</Text>{((l.preview && c.status === 'published') || c.owned) && <Action id={`lesson-complete-${l.id}`} label={c.completed?.includes(l.id) ? 'Completata · segna da ripassare' : 'Segna come completata'} busy={mutate.isPending} onPress={() => mutate.mutate({ path: 'progress', body: { lesson_id: l.id, complete: !c.completed?.includes(l.id) } })} />}</>}
      </View>)}
      <Notice id="course-action-error" error text={mutate.error?.message} />
    </>}
  </ShopPage>;
}