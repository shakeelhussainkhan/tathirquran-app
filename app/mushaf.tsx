import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { getJuzRanges, getSurahList, type JuzRange } from '../lib/queries';
import { SURAH_AYAH_COUNTS, SURAH_NAMES_ENGLISH } from '../lib/khatmah';
import { Colors } from '../constants/colors';
import { useTheme } from '../lib/theme';

/**
 * Mushaf (v1.0.4, suggestion #1) — browse the whole Quran by Surah or by
 * Juz and read it in the app. Both indexes are built from data the app
 * already holds: surah metadata from the `surahs` table (with the built-in
 * factual fallback list) and juz boundaries from the per-ayah juz_number
 * data the offline sync already downloads. Tapping an entry opens the
 * shared verse reader (/read).
 */

interface SurahRow {
  number: number;
  nameEnglish: string;
  nameArabic: string;
  ayahCount: number;
  revelationType: string | null;
}

export default function MushafScreen() {
  const theme = useTheme();
  const [tab, setTab] = useState<'surah' | 'juz'>('surah');
  const [surahs, setSurahs] = useState<SurahRow[]>([]);
  const [juzRanges, setJuzRanges] = useState<JuzRange[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [surahData, juzData] = await Promise.all([
      getSurahList().catch(() => []),
      getJuzRanges().catch(() => []),
    ]);

    const rows: SurahRow[] = [];
    if (surahData && surahData.length === 114) {
      for (const r of surahData as any[]) {
        rows.push({
          number: r.surah_number,
          nameEnglish: r.name_english ?? SURAH_NAMES_ENGLISH[r.surah_number - 1],
          nameArabic: r.name_arabic ?? '',
          ayahCount: r.ayah_count ?? SURAH_AYAH_COUNTS[r.surah_number - 1],
          revelationType: r.revelation_type ?? null,
        });
      }
    } else {
      // Fallback: the built-in factual surah metadata (lib/khatmah.ts).
      for (let i = 0; i < 114; i++) {
        rows.push({
          number: i + 1,
          nameEnglish: SURAH_NAMES_ENGLISH[i],
          nameArabic: '',
          ayahCount: SURAH_AYAH_COUNTS[i],
          revelationType: null,
        });
      }
    }
    setSurahs(rows);
    setJuzRanges(juzData ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const s = makeStyles(theme);
  const surahName = (n: number) =>
    surahs[n - 1]?.nameEnglish ?? SURAH_NAMES_ENGLISH[n - 1] ?? `Surah ${n}`;

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.goldBar} />
      <View style={s.header}>
        <Text style={s.headerTitle}>MUSHAF</Text>
      </View>

      {/* Surah / Juz toggle */}
      <View style={[s.tabRow, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'surah' && [s.tabBtnActive, { borderBottomColor: theme.gold }]]}
          onPress={() => setTab('surah')}
        >
          <Text style={[s.tabBtnText, { color: tab === 'surah' ? theme.gold : theme.textSecondary }]}>
            BY SURAH
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'juz' && [s.tabBtnActive, { borderBottomColor: theme.gold }]]}
          onPress={() => setTab('juz')}
        >
          <Text style={[s.tabBtnText, { color: tab === 'juz' ? theme.gold : theme.textSecondary }]}>
            BY JUZ
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={Colors.bronze} />
        </View>
      ) : tab === 'surah' ? (
        <ScrollView contentInsetAdjustmentBehavior="never">
          {surahs.map((surah) => (
            <TouchableOpacity
              key={surah.number}
              style={[s.row, { borderBottomColor: theme.border }]}
              onPress={() => router.push(`/read?mode=surah&surah=${surah.number}` as any)}
              activeOpacity={0.7}
            >
              <Text style={[s.rowNumber, { color: theme.gold }]}>{surah.number}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowName, { color: theme.text }]}>{surah.nameEnglish}</Text>
                <Text style={[s.rowMeta, { color: theme.textSecondary }]}>
                  {surah.ayahCount} verses
                  {surah.revelationType ? ` · ${surah.revelationType}` : ''}
                </Text>
              </View>
              {surah.nameArabic ? (
                <Text style={[s.rowArabic, { color: theme.bronze }]}>{surah.nameArabic}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      ) : juzRanges.length === 0 ? (
        <View style={s.center}>
          <Text style={[s.emptyText, { color: theme.textSecondary }]}>
            The Juz index is not on this device yet. Connect to the internet
            once so the app can download the full Quran text, then try again.
          </Text>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="never">
          {juzRanges.map((range) => (
            <TouchableOpacity
              key={range.juz}
              style={[s.row, { borderBottomColor: theme.border }]}
              onPress={() => router.push(`/read?mode=juz&juz=${range.juz}` as any)}
              activeOpacity={0.7}
            >
              <Text style={[s.rowNumber, { color: theme.gold }]}>{range.juz}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowName, { color: theme.text }]}>
                  Juz {range.juz}
                </Text>
                <Text style={[s.rowMeta, { color: theme.textSecondary }]}>
                  {surahName(range.startSurah)} {range.startSurah}:{range.startAyah} –{' '}
                  {surahName(range.endSurah)} {range.endSurah}:{range.endAyah} ·{' '}
                  {range.ayahCount} verses
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
      <View style={s.goldBar} />
    </SafeAreaView>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    goldBar: { height: 4, backgroundColor: theme.bronze },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      letterSpacing: 3,
      color: theme.gold,
      textAlign: 'center',
    },
    tabRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabBtnActive: { borderBottomWidth: 2 },
    tabBtnText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      letterSpacing: 2,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    emptyText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingVertical: 13,
      borderBottomWidth: 0.5,
    },
    rowNumber: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 14,
      width: 30,
      textAlign: 'center',
    },
    rowName: { fontFamily: 'Amiri_400Regular', fontSize: 15 },
    rowMeta: { fontFamily: 'Amiri_400Regular', fontSize: 11, marginTop: 2 },
    rowArabic: { fontFamily: 'Amiri_400Regular', fontSize: 18 },
  });
}
