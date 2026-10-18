import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Action, Field, ShopPage, useShopStyles, Notice, Loading, Course } from '@/src/shop-ui';
import { CourseCard } from '@/src/components/CourseCard';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';

export default function Courses() {
  const s = useShopStyles(); const router = useRouter(); const { user } = useAuth(); const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['courses', user?.user_id], queryFn: () => api<{ items: Course[] }>('/api/courses'), enabled: !!user });
  const items = (q.data?.items || []).filter(c => `${c.title} ${c.category} ${c.creator_name}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <ShopPage title="Accademia di cucina" id="courses">
    <Text testID="courses-title" style={s.title}>C’è sempre qualcosa{ '\n' }di buono da imparare.</Text>
    <Notice id="courses-sales-status" text="L’Accademia sta prendendo forma. Esplora le anteprime dei corsi approvati: gli acquisti singoli non sono ancora attivi." />
    <Field testID="courses-search" label="Trova il tuo prossimo corso" placeholder="Tecnica, creatore o categoria" value={search} onChangeText={setSearch} />
    {q.isLoading && <Loading />}<Notice id="courses-error" error text={q.error?.message} />
    {q.isError && <Action id="courses-retry" label="Riprova" onPress={() => q.refetch()} />}
    {items.map(c => <CourseCard key={c.id} course={c} />)}
    {!q.isLoading && !q.isError && !items.length && <View style={s.card}><Text testID="courses-empty" style={s.h2}>{search ? 'Nessun corso trovato' : 'I primi corsi stanno arrivando'}</Text><Text testID="courses-empty-note" style={s.body}>{search ? 'Prova con un’altra parola.' : 'Hai una tecnica da insegnare o una ricetta da raccontare? Porta il tuo sapere in Accademia.'}</Text><Action id="courses-become-creator" label="Proponiti come creatore" onPress={() => router.push('/creator')} /></View>}
    <Action id="courses-my-learning" secondary label="Vai ai miei percorsi" onPress={() => router.push('/my-courses')} />
  </ShopPage>;
}