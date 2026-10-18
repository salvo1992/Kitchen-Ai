import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Action, ShopPage, useShopStyles, Notice, Loading, Course } from '@/src/shop-ui';
import { CourseCard } from '@/src/components/CourseCard';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';
export default function MyCourses() {
  const s = useShopStyles(); const router = useRouter(); const { user } = useAuth();
  const q = useQuery({ queryKey: ['my-courses', user?.user_id], queryFn: () => api<{ items: Course[] }>('/api/courses/mine'), enabled: !!user });
  return <ShopPage id="my-courses" title="I miei percorsi"><Text testID="my-courses-title" style={s.title}>Il tuo quaderno{ '\n' }di nuove abilità.</Text>
    <Text testID="my-courses-description" style={s.muted}>Corsi seguiti e lezioni in anteprima completate. Seguire un corso non equivale ad acquistarlo.</Text>
    {q.isLoading && <Loading />}<Notice id="my-courses-error" error text={q.error?.message} />
    {q.data?.items.map(c => <CourseCard key={c.id} course={c} />)}
    {q.data?.items.length === 0 && <View style={s.card}><Text testID="my-courses-empty" style={s.body}>Il prossimo passo è tutto da scegliere. Salva un corso per ritrovarlo qui.</Text></View>}
    <Action id="my-courses-browse" label="Esplora l’Accademia" onPress={() => router.push('/courses')} />
  </ShopPage>;
}