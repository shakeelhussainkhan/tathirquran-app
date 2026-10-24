import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import VerseReader from '../components/VerseReader';
import {
  SURAH_AYAH_COUNTS,
  SURAH_NAMES_ENGLISH,
  getPortion,
  formatPortionRange,
  refToGlobalIndex,
  loadKhatmahState,
  markPortionDone,
  getPlan,
  type KhatmahState,
} from '../lib/khatmah';
import { getJuzRanges, getSurahNames, type JuzRange } from '../lib/queries';
import { Colors } from '../constants/colors';
import { useTheme } from '../lib/theme';

/**
 * Reader route (v1.0.4) — one route, three entry modes, all rendering the
 * shared VerseReader over an ayah_id range:
 *   ?mode=surah&surah=N        a whole surah (from the Mushaf index)
 *   ?mode=juz&juz=N            a whole juz (from the Mushaf index)
 *   ?mode=portion&plan=DAYS&portion=I   a Khatmah portion (suggestion #6:
 *                              the plan's verses, readable in the app)
 */

interface ResolvedRange {
  startAyahId: number;
  endAyahId: number;
  heading: string;
  subheading?: string;
}

export default function ReadScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    mode?: string;
    surah?: string;
    juz?: string;
    plan?: string;
    portion?: string;
  }>();

  const [range, setRange] = useState<ResolvedRange | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [khatmahState, setKhatmahState] = useState<KhatmahState | null>(null);
  const [portionDone, setPortionDone] = useState(false);

  const mode = params.mode ?? '';
  const planDays = parseInt(params.plan ?? '', 10);
  const portionIndex = parseInt(params.portion ?? '', 10);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (mode === 'surah') {
          const surah = parseInt(params.surah ?? '', 10);
          if (!Number.isFinite(surah) || surah < 1 || surah > 114) {
            if (!cancelled) setNotFound(true);
            return;
          }
          const names = await getSurahNames().catch(() => []);
          const name =
            (names.length === 114 ? names[surah - 1] : SURAH_NAMES_ENGLISH[surah - 1]) ??
            `Surah ${surah}`;
          const startId = refToGlobalIndex({ surah, ayah: 1 }) + 1; // ayah_id is 1-based
          const count = SURAH_AYAH_COUNTS[surah - 1];
          if (!cancelled) {
            setRange({
              startAyahId: startId,
              endAyahId: startId + count - 1,
              heading: name,
              subheading: `Surah ${surah} · ${count} verses`,
            });
          }
        } else if (mode === 'juz') {
          const juz = parseInt(params.juz ?? '', 10);
          const ranges: JuzRange[] = await getJuzRanges().catch(() => []);
          const found = ranges.find((r) => r.juz === juz);
          if (!found) {
            if (!cancelled) setNotFound(true);
            return;
          }
          if (!cancelled) {
            setRange({
              startAyahId: found.startAyahId,
              endAyahId: found.endAyahId,
              heading: `Juz ${found.juz}`,
              subheading:
                `${found.startSurah}:${found.startAyah} – ${found.endSurah}:${found.endAyah}` +
                ` · ${found.ayahCount} verses`,
            });
          }
        } else if (mode === 'portion') {
          if (
            !Number.isFinite(planDays) ||
            !Number.isFinite(portionIndex) ||
            portionIndex < 0 ||
            portionIndex >= planDays
          ) {
            if (!cancelled) setNotFound(true);
            return;
          }
          const [names, state] = await Promise.all([
            getSurahNames().catch(() => []),
            loadKhatmahState(),
          ]);
          if (cancelled) return;
          const portion = getPortion(planDays, portionIndex);
          setKhatmahState(state);
          setPortionDone(state?.completedPortions.includes(portionIndex) ?? false);
          setRange({
            startAyahId: refToGlobalIndex(portion.start) + 1,
            endAyahId: refToGlobalIndex(portion.end) + 1,
            heading: `Portion ${portionIndex + 1} of ${planDays}`,
            subheading: formatPortionRange(
              portion,
              names.length === 114 ? names : SURAH_NAMES_ENGLISH,
            ),
          });
        } else {
          setNotFound(true);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, params.surah, params.juz, planDays, portionIndex]);

  const handleMarkRead = useCallback(async () => {
    if (!khatmahState) return;
    const next = await markPortionDone(khatmahState, portionIndex);
    setKhatmahState(next);
    setPortionDone(true);
    router.back();
  }, [khatmahState, portionIndex]);

  const s = makeStyles(theme);
  const headerTitle =
    mode === 'portion' ? 'READING PLAN' : mode === 'juz' ? 'JUZ' : 'MUSHAF';

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.goldBar} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>{headerTitle}</Text>
        <View style={{ width: 60 }} />
      </View>

      {notFound ? (
        <View style={s.center}>
          <Text style={[s.emptyTitle, { color: theme.text }]}>Nothing to read here</Text>
          <Text style={[s.emptyText, { color: theme.textSecondary }]}>
            This reading range could not be found. Please go back and choose again.
          </Text>
        </View>
      ) : !range ? (
        <View style={s.center}>
          <ActivityIndicator color={Colors.bronze} />
        </View>
      ) : (
        <VerseReader
          startAyahId={range.startAyahId}
          endAyahId={range.endAyahId}
          heading={range.heading}
          subheading={range.subheading}
          footerAction={
            mode === 'portion' && khatmahState && !portionDone
              ? { label: '✓ MARK THIS PORTION READ', onPress: handleMarkRead }
              : undefined
          }
          footerNote={
            mode === 'portion' && portionDone
              ? `✓ READ · ${getPlan(khatmahState?.planId ?? '')?.name ?? 'Reading plan'}`
              : undefined
          }
        />
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
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    back: { fontFamily: 'Amiri_400Regular', fontSize: 14, width: 60, color: theme.goldText },
    title: { fontFamily: 'Amiri_400Regular', fontSize: 11, letterSpacing: 3, color: theme.goldText },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 10,
    },
    emptyTitle: { fontFamily: 'Amiri_400Regular', fontSize: 17 },
    emptyText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
}
