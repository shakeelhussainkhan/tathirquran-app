import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { getAyahRange, getRangeTranslation } from '../lib/queries';
import {
  getSelectedReciter,
  resolvePlaybackUri,
  DEFAULT_RECITER,
  type Reciter,
} from '../lib/reciters';
import { Colors } from '../constants/colors';
import { useTheme } from '../lib/theme';

/**
 * The shared in-app verse reader (v1.0.4, suggestions #1 + #6).
 *
 * Renders an ayah_id range ayah-by-ayah — Arabic (Uthmani) plus the
 * translation the user selected in Settings (the language's default
 * translation, exactly as the Today screen resolves it) — with per-ayah
 * recitation playback through the existing reciter plumbing. Used by the
 * Mushaf screen (a surah, or a juz) and by Khatmah portions, so a reading
 * plan never sends the user outside the app to read.
 *
 * All text comes from the app's existing local-first data layer
 * (lib/queries.ts getAyahRange / getRangeTranslation): the full Quran text
 * and translations the app already downloads for offline use.
 */

const BISMILLAH = 'بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ';

const isRtlLang = (code: string) => code === 'ar' || code === 'fa' || code === 'ur';

interface ReaderAyah {
  ayah_id: number;
  surah_number: number;
  ayah_number: number;
  arabic_uthmani: string;
  surahs: {
    name_english?: string;
    name_arabic?: string;
    name_transliterated?: string;
  } | null;
}

type Row =
  | { kind: 'surahHeader'; key: string; surah: number; nameEnglish: string; nameArabic: string }
  | { kind: 'bismillah'; key: string }
  | { kind: 'ayah'; key: string; ayah: ReaderAyah; text: string | null };

export interface VerseReaderProps {
  startAyahId: number;
  endAyahId: number;
  heading: string;
  subheading?: string;
  /** Optional closing action (e.g. "Mark this portion read" for Khatmah). */
  footerAction?: { label: string; onPress: () => void };
  /** Optional static line rendered at the very end instead of a button. */
  footerNote?: string;
}

export default function VerseReader({
  startAyahId,
  endAyahId,
  heading,
  subheading,
  footerAction,
  footerNote,
}: VerseReaderProps) {
  const theme = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [scholarName, setScholarName] = useState<string | null>(null);
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [reciter, setReciter] = useState<Reciter>(DEFAULT_RECITER);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const loadedAudioUri = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setUnavailable(false);
      try {
        const [savedLang, bismPref, savedReciter] = await Promise.all([
          AsyncStorage.getItem('selected_language'),
          AsyncStorage.getItem('show_bismillah'),
          getSelectedReciter(),
        ]);
        if (cancelled) return;
        const lang = savedLang || 'en';
        setLanguage(lang);
        setReciter(savedReciter);

        const [ayahs, translation] = await Promise.all([
          getAyahRange(startAyahId, endAyahId),
          getRangeTranslation(startAyahId, endAyahId, lang),
        ]);
        if (cancelled) return;

        const list = (ayahs as ReaderAyah[]).filter(
          (a) => a && typeof a.ayah_id === 'number',
        );
        if (list.length === 0) {
          setUnavailable(true);
          setRows([]);
          return;
        }
        setScholarName(translation.scholarName);

        const showBismillah = bismPref !== 'false';
        const built: Row[] = [];
        let lastSurah = 0;
        for (const ayah of list) {
          if (ayah.surah_number !== lastSurah) {
            lastSurah = ayah.surah_number;
            built.push({
              kind: 'surahHeader',
              key: `surah-${ayah.surah_number}`,
              surah: ayah.surah_number,
              nameEnglish: ayah.surahs?.name_english ?? `Surah ${ayah.surah_number}`,
              nameArabic: ayah.surahs?.name_arabic ?? '',
            });
            // The Bismillah heads every surah except 1 (whose first ayah
            // IS the Bismillah) and 9 (At-Taubah, which has none) — and
            // only when the range actually starts at the surah's opening.
            if (
              showBismillah &&
              ayah.ayah_number === 1 &&
              ayah.surah_number !== 1 &&
              ayah.surah_number !== 9
            ) {
              built.push({ kind: 'bismillah', key: `bismillah-${ayah.surah_number}` });
            }
          }
          built.push({
            kind: 'ayah',
            key: `ayah-${ayah.ayah_id}`,
            ayah,
            text: translation.texts[ayah.ayah_id] ?? null,
          });
        }
        setRows(built);
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startAyahId, endAyahId]);

  // Stop playback when leaving the reader.
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // player may already be released
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear the playing marker when a recitation finishes.
  useEffect(() => {
    if (playerStatus.didJustFinish) setPlayingId(null);
  }, [playerStatus.didJustFinish]);

  const togglePlay = useCallback(
    async (ayah: ReaderAyah) => {
      try {
        if (playingId === ayah.ayah_id) {
          if (player.playing) {
            player.pause();
          } else {
            player.play();
          }
          return;
        }
        const uri = await resolvePlaybackUri(reciter, ayah.surah_number, ayah.ayah_number);
        if (loadedAudioUri.current === uri && player.duration > 0) {
          setPlayingId(ayah.ayah_id);
          player.play();
          return;
        }
        await setAudioModeAsync({ playsInSilentMode: true });
        player.replace({ uri });
        loadedAudioUri.current = uri;
        setPlayingId(ayah.ayah_id);
        player.play();
      } catch {
        // Audio is best-effort; the text remains fully readable.
      }
    },
    [player, playingId, reciter],
  );

  const s = makeStyles(theme);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.bronze} />
      </View>
    );
  }

  if (unavailable) {
    return (
      <View style={s.center}>
        <Text style={[s.emptyTitle, { color: theme.text }]}>Not available yet</Text>
        <Text style={[s.emptyText, { color: theme.textSecondary }]}>
          These verses are not on this device yet. Connect to the internet once
          so the app can download the full Quran text, then try again.
        </Text>
      </View>
    );
  }

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'surahHeader') {
      return (
        <View style={[s.surahHeader, { borderColor: theme.border }]}>
          <Text style={[s.surahHeaderName, { color: theme.text }]}>
            {item.nameEnglish}
          </Text>
          {item.nameArabic ? (
            <Text style={[s.surahHeaderArabic, { color: theme.bronze }]}>
              {item.nameArabic}
            </Text>
          ) : null}
          <Text style={[s.surahHeaderMeta, { color: theme.textSecondary }]}>
            SURAH {item.surah}
          </Text>
        </View>
      );
    }
    if (item.kind === 'bismillah') {
      return (
        <Text style={[s.bismillah, { color: theme.bronze + '8C' }]}>{BISMILLAH}</Text>
      );
    }

    const ayah = item.ayah;
    const text = item.text;
    const isPlayingThis = playingId === ayah.ayah_id && playerStatus.playing;
    return (
      <View style={[s.ayahBlock, { borderBottomColor: theme.border }]}>
        <View style={s.ayahTopRow}>
          <Text style={[s.refChip, { color: theme.gold }]}>
            {ayah.surah_number}:{ayah.ayah_number}
          </Text>
          <TouchableOpacity
            onPress={() => togglePlay(ayah)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isPlayingThis ? 'Pause recitation' : 'Play recitation'}
          >
            <Text style={[s.playBtn, { color: theme.gold }]}>
              {isPlayingThis ? '⏸' : '▶'}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() =>
            router.push(`/ayah/${ayah.surah_number}/${ayah.ayah_number}` as any)
          }
        >
          <Text style={[s.arabic, { color: theme.text }]}>{ayah.arabic_uthmani}</Text>
          {text ? (
            <Text
              style={[
                s.translation,
                { color: theme.text },
                isRtlLang(language) && s.translationRtl,
              ]}
            >
              {text}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.key}
      renderItem={renderRow}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={s.list}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={9}
      removeClippedSubviews={false}
      ListHeaderComponent={
        <View style={s.listHeader}>
          <Text style={[s.heading, { color: theme.text }]}>{heading}</Text>
          {subheading ? (
            <Text style={[s.subheading, { color: theme.textSecondary }]}>{subheading}</Text>
          ) : null}
          {scholarName ? (
            <Text style={[s.credit, { color: theme.bronze }]}>
              Translation · {scholarName}
            </Text>
          ) : null}
          <Text style={[s.hint, { color: theme.textSecondary }]}>
            Tap a verse to open it · ▶ to listen
          </Text>
        </View>
      }
      ListFooterComponent={
        footerAction || footerNote ? (
          <View style={s.footer}>
            {footerAction ? (
              <TouchableOpacity
                style={[s.footerBtn, { backgroundColor: theme.bronze }]}
                onPress={footerAction.onPress}
                activeOpacity={0.7}
              >
                <Text style={s.footerBtnText}>{footerAction.label}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[s.footerNote, { color: theme.gold }]}>{footerNote}</Text>
            )}
          </View>
        ) : null
      }
    />
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
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
    list: { paddingHorizontal: 24, paddingBottom: 40 },
    listHeader: { alignItems: 'center', paddingTop: 20, paddingBottom: 8 },
    heading: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 22,
      textAlign: 'center',
      marginBottom: 4,
    },
    subheading: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 4,
    },
    credit: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    hint: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 11,
      fontStyle: 'italic',
      textAlign: 'center',
      marginBottom: 8,
    },
    surahHeader: {
      alignItems: 'center',
      borderWidth: 0.5,
      borderRadius: 4,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginTop: 20,
      marginBottom: 6,
    },
    surahHeaderName: { fontFamily: 'Amiri_400Regular', fontSize: 17, textAlign: 'center' },
    surahHeaderArabic: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 20,
      textAlign: 'center',
      marginTop: 2,
    },
    surahHeaderMeta: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 9,
      letterSpacing: 2,
      marginTop: 4,
    },
    bismillah: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 22,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 4,
    },
    ayahBlock: {
      borderBottomWidth: 0.5,
      paddingVertical: 16,
    },
    ayahTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    refChip: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 11,
      letterSpacing: 1.5,
    },
    playBtn: { fontSize: 15, paddingHorizontal: 4 },
    arabic: {
      fontFamily: 'Amiri_700Bold',
      fontSize: 26,
      lineHeight: 48,
      textAlign: 'right',
      writingDirection: 'rtl',
      marginBottom: 10,
    },
    translation: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 15,
      lineHeight: 24,
    },
    translationRtl: { textAlign: 'right', writingDirection: 'rtl' },
    footer: { alignItems: 'center', paddingTop: 24 },
    footerBtn: {
      paddingVertical: 11,
      paddingHorizontal: 18,
      borderRadius: 2,
    },
    footerBtnText: {
      color: '#fff',
      fontSize: 11,
      letterSpacing: 1.5,
      fontFamily: 'Amiri_400Regular',
    },
    footerNote: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 12,
      letterSpacing: 1.5,
    },
  });
}
