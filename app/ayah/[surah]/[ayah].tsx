import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAyahDetail } from '../../../lib/queries';
import { Colors } from '../../../constants/colors';
import { useTheme } from '../../../lib/theme';

// Same honest labelling as the Today screen: the "Reflection" rows are
// AI-written pending scholarly review, never presented as a scholarly quote.
const REFLECTION_NOTE =
  'Written by the TathirQuran team to aid reflection. Not a quotation from any tafsir. Under review by scholars.';

const isRtlLang = (code: string) => code === 'ar' || code === 'fa' || code === 'ur';

/**
 * Minimal ayah detail screen. Search results and Archive rows navigate here
 * (previously /ayah/[surah]/[ayah] did not exist — finding M-a4). Shows the
 * Arabic text, every translation stored for the ayah, and any
 * reflection/tafsir rows, with previous/next navigation inside the surah.
 */
export default function AyahDetailScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ surah: string; ayah: string }>();
  const surahNumber = parseInt(params.surah ?? '', 10);
  const ayahNumber = parseInt(params.ayah ?? '', 10);

  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setNotFound(false);
      if (!Number.isFinite(surahNumber) || !Number.isFinite(ayahNumber)) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      try {
        const data = await getAyahDetail(surahNumber, ayahNumber);
        if (cancelled) return;
        if (!data) {
          setNotFound(true);
        } else {
          setDetail(data);
          const key = `bookmark_${surahNumber}_${ayahNumber}`;
          const existing = await AsyncStorage.getItem(key);
          if (!cancelled) setBookmarked(!!existing);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [surahNumber, ayahNumber]);

  const toggleBookmark = async () => {
    if (!detail) return;
    const ayah = detail.ayah;
    const key = `bookmark_${ayah.surah_number}_${ayah.ayah_number}`;
    if (bookmarked) {
      await AsyncStorage.removeItem(key);
      setBookmarked(false);
    } else {
      const enTranslation =
        detail.translations.find((t: any) => t.languageCode === 'en' && t.isDefault) ??
        detail.translations[0];
      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          surah: ayah.surah_number,
          ayah: ayah.ayah_number,
          surahName: ayah.surahs?.name_english,
          arabic: ayah.arabic_uthmani,
          translation: enTranslation?.text,
          date: new Date().toISOString(),
        })
      );
      setBookmarked(true);
    }
  };

  const ayah = detail?.ayah;
  const surah = ayah?.surahs;
  const ref = surah
    ? `${surah.name_transliterated || surah.name_english} ${surahNumber}:${ayahNumber}`
    : `Quran ${surahNumber}:${ayahNumber}`;
  const ayahCount = surah?.ayah_count ?? 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.goldBar, { backgroundColor: theme.bronze }]} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: theme.gold }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.gold }]}>AYAH</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.bronze} />
        </View>
      ) : notFound || !ayah ? (
        <View style={styles.center}>
          <Text style={[styles.notFoundTitle, { color: theme.text }]}>Ayah not found</Text>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            We could not find {surahNumber}:{ayahNumber}. Please check the
            reference and try again.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.refRow}>
            <Text style={[styles.surahLabel, { color: theme.textSecondary }]}>
              {surah?.name_english}
              {surah?.revelation_type ? ` · ${surah.revelation_type}` : ''}
            </Text>
            <TouchableOpacity onPress={toggleBookmark}>
              <Text style={{ fontSize: 18 }}>{bookmarked ? '🔖' : '🏷️'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.arabic, { color: theme.text }]}>{ayah.arabic_uthmani}</Text>

          <View style={styles.ornament}>
            <View style={[styles.ornamentLine, { backgroundColor: theme.border }]} />
            <Text style={{ fontSize: 9, color: theme.gold }}>◆</Text>
            <View style={[styles.ornamentLine, { backgroundColor: theme.border }]} />
          </View>

          <Text style={[styles.ref, { color: theme.gold }]}>{ref}</Text>

          {detail.translations.map((t: any) => (
            <View key={t.id} style={styles.translationBlock}>
              <Text
                style={[
                  styles.translation,
                  { color: theme.text },
                  isRtlLang(t.languageCode) && styles.translationRtl,
                ]}
              >
                {t.text}
              </Text>
              <Text
                style={[
                  styles.scholar,
                  { color: theme.textSecondary },
                  isRtlLang(t.languageCode) && { textAlign: 'right' },
                ]}
              >
                {t.scholarName} · {t.languageCode}
                {t.isDefault ? ' · default' : ''}
              </Text>
            </View>
          ))}

          {detail.tafsirEntries && detail.tafsirEntries.length > 0 && (
            <View style={styles.tafsirSection}>
              {detail.tafsirEntries.map((entry: any) => {
                const isReflection = entry.scholar === 'Reflection';
                return (
                  <View key={entry.id} style={[styles.tafsirBlock, { borderLeftColor: theme.border }]}>
                    <Text style={[styles.tafsirLabel, { color: theme.textSecondary }]}>
                      {isReflection
                        ? entry.review_status === 'approved'
                          ? 'Reflection'
                          : 'Reflection — pending scholarly review'
                        : entry.scholar}
                    </Text>
                    <Text style={[styles.tafsirText, { color: theme.text }]}>{entry.text}</Text>
                    {isReflection ? (
                      <Text style={[styles.scholar, { color: theme.textSecondary }]}>
                        {REFLECTION_NOTE}
                      </Text>
                    ) : entry.source_book ? (
                      <Text style={[styles.scholar, { color: theme.textSecondary }]}>
                        {entry.source_book}
                        {entry.volume ? `, vol. ${entry.volume}` : ''}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <View style={[styles.nav, { borderTopColor: theme.border }]}>
            {ayahNumber > 1 ? (
              <TouchableOpacity
                onPress={() => router.replace(`/ayah/${surahNumber}/${ayahNumber - 1}` as any)}
              >
                <Text style={[styles.navText, { color: theme.gold }]}>← Previous</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            {ayahCount > 0 && ayahNumber < ayahCount ? (
              <TouchableOpacity
                onPress={() => router.replace(`/ayah/${surahNumber}/${ayahNumber + 1}` as any)}
              >
                <Text style={[styles.navText, { color: theme.gold }]}>Next →</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
          </View>
        </ScrollView>
      )}
      <View style={[styles.goldBar, { backgroundColor: theme.bronze }]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  goldBar: { height: 4 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
  },
  back: { fontFamily: 'Amiri_400Regular', fontSize: 14, width: 60 },
  title: { fontFamily: 'Amiri_400Regular', fontSize: 10, letterSpacing: 3 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  centerText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  notFoundTitle: { fontFamily: 'Amiri_400Regular', fontSize: 17 },
  body: { padding: 24, paddingBottom: 40 },
  refRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  surahLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  arabic: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 30,
    lineHeight: 54,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 20,
  },
  ornament: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  ornamentLine: { width: 48, height: 0.5 },
  ref: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 24,
  },
  translationBlock: { marginBottom: 20 },
  translation: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 26,
  },
  translationRtl: { textAlign: 'right', writingDirection: 'rtl', fontStyle: 'normal' },
  scholar: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  tafsirSection: { marginTop: 8, marginBottom: 8 },
  tafsirBlock: {
    borderLeftWidth: 2,
    paddingLeft: 14,
    marginBottom: 16,
  },
  tafsirLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tafsirText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
    lineHeight: 24,
  },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    borderTopWidth: 0.5,
    paddingTop: 18,
  },
  navText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
