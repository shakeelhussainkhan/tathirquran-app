import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../lib/theme';
import type { DevotionalText } from '../lib/devotionals';

/**
 * A card on Today linking to a devotional text (dua / ziyarat).
 * Rendered ONLY when a matching devotional_texts row exists — callers pass
 * a real row or render nothing. No placeholder cards.
 */
export default function DevotionalCard({
  devotional,
  label,
}: {
  devotional: DevotionalText;
  label: string;
}) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: theme.border, backgroundColor: theme.gold + '0D' }]}
      onPress={() => router.push(`/devotional/${devotional.slug}`)}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, { color: theme.gold }]}>{label}</Text>
      <View style={styles.row}>
        <Text style={[styles.title, { color: theme.bronze, flex: 1 }]}>{devotional.title}</Text>
        <Text style={[styles.chevron, { color: theme.bronze }]}>→</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 0.5,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 10,
    width: '100%',
  },
  label: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: 'Amiri_700Bold', fontSize: 15, letterSpacing: 0.5 },
  chevron: { fontSize: 16, marginLeft: 8 },
});
