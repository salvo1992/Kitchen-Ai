import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Action, Course, Field, Loading, money, Notice, ShopPage, useShopAccess, useShopStyles } from '@/src/shop-ui';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';

type EditableLesson = { id: string; title: string; content: string; preview: boolean };
const blank = (): EditableLesson => ({ id: `lesson_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, title: '', content: '', preview: false });
const categories = ['Basi di cucina', 'Cucina italiana', 'Dolci', 'Anti-spreco', 'Cucina vegetale'];

export default function CourseEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>(); const s = useShopStyles(); const access = useShopAccess(); const { user } = useAuth(); const qc = useQueryClient(); const router = useRouter();
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [price, setPrice] = useState(''); const [category, setCategory] = useState(categories[0]); const [lessons, setLessons] = useState<EditableLesson[]>([blank()]);
  const q = useQuery({ queryKey: ['course-editor', id, user?.user_id], queryFn: () => api<Course>(`/api/courses/${id}`), enabled: !!id && !!access.data?.is_creator });
  useEffect(() => { if (q.data) { setTitle(q.data.title); setDescription(q.data.description); setPrice((q.data.price_cents / 100).toFixed(2)); setCategory(q.data.category); setLessons((q.data.lessons || []).map(l => ({ id: l.id, title: l.title, content: l.content || '', preview: l.preview }))); } }, [q.data]);
  const cents = Math.round(Number(price.replace(',', '.')) * 100);
  const valid = title.trim().length >= 3 && description.trim().length >= 20 && /^\d+([.,]\d{1,2})?$/.test(price) && cents >= 399 && cents <= 99999 && lessons.every(l => l.title.trim().length >= 2 && l.content.trim().length >= 10);
  const save = useMutation({ mutationFn: () => api(`/api/creator/courses${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify({ title, description, category, price_cents: cents, lessons }) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['creator-dashboard'] }); qc.invalidateQueries({ queryKey: ['course-detail', id] }); router.replace('/creator'); } });
  const changeLesson = (index: number, patch: Partial<EditableLesson>) => setLessons(items => items.map((l, i) => i === index ? { ...l, ...patch } : l));
  return <ShopPage title={id ? 'Modifica corso' : 'Nuovo corso'} id="course-editor">
    {access.isLoading || (id && q.isLoading) ? <Loading /> : !access.data?.is_creator ? <Notice id="course-editor-forbidden" error text="Per creare corsi serve una candidatura approvata." /> : <>
      <Notice id="course-editor-load-error" error text={q.error?.message} />
      <Text testID="course-editor-title" style={s.title}>Dai forma alla tua lezione.</Text>
      <Field testID="course-title-input" label="Titolo (almeno 3 caratteri)" value={title} onChangeText={setTitle} maxLength={120} />
      <Field testID="course-description-input" label="Cosa impareranno? (almeno 20 caratteri)" value={description} onChangeText={setDescription} maxLength={3000} multiline />
      <Text testID="course-category-label" style={s.h3}>Categoria</Text><View style={s.wrap}>{categories.map((c, i) => <Action key={c} id={`course-category-${i}`} label={`${category === c ? '✓ ' : ''}${c}`} secondary={category !== c} onPress={() => setCategory(c)} />)}</View>
      <Field testID="course-price-input" label="Prezzo proposto in euro (3,99–999,99)" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
      <Notice id="course-price-note" text={Number.isFinite(cents) && cents >= 399 ? `Prezzo proposto: ${money(cents)}. Vendite non ancora attive; il prezzo finale dovrà essere configurato negli store.` : 'Il prezzo sarà esaminato insieme al corso. Nessun acquisto viene attivato salvando la bozza.'} />
      <Text testID="course-lessons-label" style={s.h2}>Lezioni scritte</Text>
      {lessons.map((l, i) => <View key={l.id} style={s.card}>
        <Text testID={`editor-lesson-${i}-number`} style={s.caption}>LEZIONE {i + 1}</Text>
        <Field testID={`lesson-${i}-title-input`} label="Titolo lezione" value={l.title} onChangeText={v => changeLesson(i, { title: v })} maxLength={120} />
        <Field testID={`lesson-${i}-content-input`} label="Testo e passaggi (almeno 10 caratteri)" multiline value={l.content} onChangeText={v => changeLesson(i, { content: v })} maxLength={20000} />
        <Action id={`lesson-${i}-preview-toggle`} secondary label={l.preview ? 'Anteprima gratuita: sì' : 'Anteprima gratuita: no'} onPress={() => changeLesson(i, { preview: !l.preview })} />
        {lessons.length > 1 && <Action id={`lesson-${i}-remove`} secondary label="Rimuovi lezione" onPress={() => setLessons(items => items.filter((_, j) => i !== j))} />}
      </View>)}
      <Action id="course-add-lesson" label="Aggiungi lezione" secondary disabled={lessons.length >= 40} onPress={() => setLessons(items => [...items, blank()])} />
      <Notice id="course-editor-review-info" text="Salverai una bozza. Quando è pronta, inviala in revisione dal tuo studio: sarà visibile solo dopo l’approvazione admin." />
      <Action id="course-save" label="Salva bozza" busy={save.isPending} disabled={!valid || q.isError} onPress={() => save.mutate()} /><Notice id="course-save-error" error text={save.error?.message} />
    </>}
  </ShopPage>;
}