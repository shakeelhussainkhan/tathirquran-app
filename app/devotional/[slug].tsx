import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getDevotionalBySlug, type DevotionalText } from '../../lib/devotionals';
import { Colors } from '../../constants/colors';
import { useTheme } from '../../lib/theme';

/**
 * A single devotional text (dua / ziyarat), read from devotional_texts.
 *
 * The Arabic is shown exactly as stored (a verbatim text from the Shia
 * source cited in source_note). The English translation is shown ONLY when
 * a verified one is stored; otherwise an honest note says so — a
 * translation is never invented to fill the space. If no row exists for
 * the slug, an honest not-available state is shown (no placeholder text).
 */
export default function DevotionalScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = params.slug ?? '';

  const [devotional, setDevotional] = useState<DevotionalText | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const data = slug ? await getDevotionalBySlug(slug) : null;
      if (!cancelled) {
        setDevotional(data);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={Colors.bronze} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.goldBar, { backgroundColor: theme.bronze }]} />
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.bronze }]}>← TODAY</Text>
        </TouchableOpacity>

        {!devotional ? (
          <Text style={[styles.notAvailable, { color: theme.textSecondary }]}>
            This devotional text is not available yet.
          </Text>
        ) : (
          <>
            <Text style={[styles.title, { color: theme.text }]}>{devotional.title}</Text>
            {devotional.occasion_tag ? (
              <Text style={[styles.occasion, { color: theme.gold }]}>{devotional.occasion_tag}</Text>
            ) : null}

            {/* Arabic text — verbatim from the cited Shia source */}
            <Text style={[styles.arabic, { color: theme.text }]}>{devotional.arabic_text}</Text>

            {devotional.translation_text ? (
              <Text style={[styles.translation, { color: theme.text }]}>{devotional.translation_text}</Text>
            ) : (
              <Text style={[styles.translationNote, { color: theme.textSecondary }]}>
                English translation to be added from a verified source.
              </Text>
            )}

            <View style={[styles.sourceBox, { borderTopColor: theme.border }]}>
              <Text style={[styles.source, { color: theme.textSecondary }]}>
                Source: {devotional.source_note}
              </Text>
            </View>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
      <View style={[styles.goldBar, { backgroundColor: theme.bronze }]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  goldBar: { height: 3, width: '100%' },
  scroll: { paddingHorizontal: 24, paddingTop: 16, alignItems: 'center' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { fontFamily: 'Amiri_400Regular', fontSize: 11, letterSpacing: 1.5 },
  notAvailable: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 60,
  },
  title: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 26,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  occasion: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 20,
  },
  arabic: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 24,
    lineHeight: 48,
    textAlign: 'right',
    writingDirection: 'rtl',
    width: '100%',
    marginBottom: 28,
  },
  translation: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 17,
    lineHeight: 28,
    width: '100%',
    marginBottom: 28,
  },
  translationNote: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 28,
  },
  sourceBox: { borderTopWidth: 0.5, paddingTop: 12, width: '100%' },
  source: { fontFamily: 'Amiri_400Regular', fontSize: 12, lineHeight: 18 },
});
