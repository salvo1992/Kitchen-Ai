import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Action, Course, money, useShopStyles } from '@/src/shop-ui';
import { useTheme } from '@/src/theme';

export function CourseCard({ course }: { course: Course }) {
  const s = useShopStyles(); const router = useRouter(); const { colors } = useTheme();
  return <View testID={`course-card-${course.id}`} style={s.card}>
    <View style={s.row}><Ionicons name="restaurant-outline" size={26} color={colors.brandSecondary} /><Text testID={`course-category-${course.id}`} style={s.badge}>{course.category}</Text></View>
    <Text testID={`course-title-${course.id}`} style={s.h2}>{course.title}</Text>
    <Text testID={`course-author-${course.id}`} style={s.muted}>{course.creator_name} · {course.lesson_count} lezioni</Text>
    <Text testID={`course-description-${course.id}`} numberOfLines={3} style={s.body}>{course.description}</Text>
    <Text testID={`course-price-${course.id}`} style={s.h3}>{money(course.price_cents)} · prezzo previsto</Text>
    {!!course.completed && <Text testID={`course-progress-${course.id}`} style={s.muted}>{course.completed.length} anteprime completate</Text>}
    <Action id={`course-open-${course.id}`} label="Scopri il programma" secondary onPress={() => router.push({ pathname: '/course/[id]', params: { id: course.id } })} />
  </View>;
}