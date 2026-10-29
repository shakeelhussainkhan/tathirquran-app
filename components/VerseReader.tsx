import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
 *
 * The header carries a real "Play all" control: continuous playback from
 * the first ayah of the list, advancing ayah-by-ayah as each recitation
 * finishes. (The old hint line's "▶" was inert text that iOS rendered as
 * a blue emoji button; users tapped it expecting exactly this.)
 *
 * Once audio is engaged — the continuous queue, or a single verse tapped
 * in the list — a compact mini-player bar sits in-flow above the list,
 * outside the FlatList, so it never scrolls away: pause/resume, stop,
 * and the current verse reference (plus the position within the list in
 * continuous mode). Testers reading a long surah (Ya Sin, 83 verses)
 * asked for control without scrolling back to the top. While the bar is
 * visible it is the control surface; the header button is the entry
 * point and yields to it.
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

  // Continuous ("Play all") playback: when active, the finish handler
  // advances to the next ayah instead of just clearing the marker.
  // `continuous` drives the header button's label; the ref mirror lets
  // the status effect and async advance loop read the live value.
  const [continuous, setContinuous] = useState(false);
  const continuousRef = useRef(false);
  const advancingRef = useRef(false);
  const playingIdRef = useRef<number | null>(null);
  const ayahsRef = useRef<ReaderAyah[]>([]);
  const playAyahRef = useRef<((ayah: ReaderAyah) => Promise<boolean>) | null>(null);

  const setContinuousBoth = useCallback((value: boolean) => {
    continuousRef.current = value;
    setContinuous(value);
  }, []);

  // The list's ayahs in reading order (rows also carry header rows).
  const ayahs = useMemo(
    () => rows.flatMap((r) => (r.kind === 'ayah' ? [r.ayah] : [])),
    [rows],
  );

  useEffect(() => {
    ayahsRef.current = ayahs;
  }, [ayahs]);

  useEffect(() => {
    playingIdRef.current = playingId;
  }, [playingId]);

  useEffect(() => {
    let cancelled = false;
    // A new range starts fresh: any continuous queue belongs to the old one.
    setContinuousBoth(false);
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

  // Stop playback when leaving the reader (and drop any queued
  // continuous advance with it).
  useEffect(() => {
    return () => {
      continuousRef.current = false;
      try {
        player.pause();
      } catch {
        // player may already be released
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Load one ayah's recitation and play it. Returns false when the audio
   * could not be loaded/played (audio is best-effort throughout), so
   * continuous playback can skip past a bad file instead of stalling.
   */
  const playAyah = useCallback(
    async (ayah: ReaderAyah): Promise<boolean> => {
      try {
        const uri = await resolvePlaybackUri(reciter, ayah.surah_number, ayah.ayah_number);
        if (loadedAudioUri.current === uri && player.duration > 0) {
          setPlayingId(ayah.ayah_id);
          player.play();
          return true;
        }
        await setAudioModeAsync({ playsInSilentMode: true });
        player.replace({ uri });
        loadedAudioUri.current = uri;
        setPlayingId(ayah.ayah_id);
        player.play();
        return true;
      } catch {
        // Audio is best-effort; the text remains fully readable.
        return false;
      }
    },
    [player, reciter],
  );

  useEffect(() => {
    playAyahRef.current = playAyah;
  }, [playAyah]);

  // When a recitation finishes: single-verse playback just clears the
  // playing marker (as before); continuous playback advances to the next
  // ayah in the list, skipping any that fail to load, and stops cleanly
  // after the last one.
  useEffect(() => {
    if (!playerStatus.didJustFinish) return;
    if (!continuousRef.current) {
      setPlayingId(null);
      return;
    }
    if (advancingRef.current) return;
    advancingRef.current = true;
    (async () => {
      try {
        const list = ayahsRef.current;
        const idx = list.findIndex((a) => a.ayah_id === playingIdRef.current);
        if (idx >= 0) {
          for (let i = idx + 1; i < list.length; i++) {
            if (!continuousRef.current) return;
            const play = playAyahRef.current;
            if (play && (await play(list[i]))) return;
          }
        }
        // Last ayah (or the position was lost): stop and reset.
        setContinuousBoth(false);
        setPlayingId(null);
      } finally {
        advancingRef.current = false;
      }
    })();
  }, [playerStatus.didJustFinish, setContinuousBoth]);

  const togglePlay = useCallback(
    async (ayah: ReaderAyah) => {
      // A per-verse tap always takes over: continuous playback is cancelled.
      setContinuousBoth(false);
      try {
        if (playingId === ayah.ayah_id) {
          if (player.playing) {
            player.pause();
          } else {
            player.play();
          }
          return;
        }
      } catch {
        // Audio is best-effort; the text remains fully readable.
        return;
      }
      await playAyah(ayah);
    },
    [player, playingId, playAyah, setContinuousBoth],
  );

  /**
   * Header "Play all" control. First tap starts continuous playback at
   * the first ayah of the list; while the queue is active the same
   * button pauses, and resumes the current ayah when tapped again.
   */
  const togglePlayAll = useCallback(async () => {
    if (continuousRef.current) {
      try {
        if (player.playing) {
          player.pause();
        } else {
          player.play();
        }
      } catch {
        // Audio is best-effort; the text remains fully readable.
      }
      return;
    }
    const list = ayahsRef.current;
    if (list.length === 0) return;
    setContinuousBoth(true);
    // Skip forward past any ayah that fails to load, so one bad file
    // cannot stall the whole list before it has even started.
    for (const ayah of list) {
      if (!continuousRef.current) return;
      if (await playAyah(ayah)) return;
    }
    setContinuousBoth(false);
    setPlayingId(null);
  }, [player, playAyah, setContinuousBoth]);

  /**
   * Mini-player stop: end playback entirely — cancel any continuous
   * queue, pause, forget the loaded file (so the next play starts its
   * ayah from the beginning rather than resuming mid-verse) and clear
   * the playing marker, which also hides the bar.
   */
  const stopPlayback = useCallback(() => {
    setContinuousBoth(false);
    loadedAudioUri.current = null;
    try {
      player.pause();
    } catch {
      // Audio is best-effort; the text remains fully readable.
    }
    setPlayingId(null);
  }, [player, setContinuousBoth]);

  /**
   * Mini-player pause/resume. Both playback modes share the one player
   * and its loaded source is always the current ayah, so a bare
   * pause/play on the player is the whole behaviour — the same thing
   * the header button and the per-verse button do for the ayah they
   * control. A continuous queue paused this way stays queued: on
   * finish, the advance effect picks up from the current ayah as usual.
   */
  const toggleBarPlayPause = useCallback(() => {
    try {
      if (player.playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      // Audio is best-effort; the text remains fully readable.
    }
  }, [player]);

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
          <Text style={[s.refChip, { color: theme.goldText }]}>
            {ayah.surah_number}:{ayah.ayah_number}
          </Text>
          <TouchableOpacity
            onPress={() => togglePlay(ayah)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isPlayingThis ? 'Pause recitation' : 'Play recitation'}
          >
            <Text style={[s.playBtn, { color: theme.goldText }]}>
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

  // "Play all" is the neutral label: this reader renders a surah, a juz,
  // or a Khatmah portion depending on the route, never just one thing.
  const playAllLabel = !continuous
    ? '▶ Play all'
    : playerStatus.playing
      ? '⏸ Pause'
      : '▶ Resume';

  // Mini-player: shown while audio is engaged from this reader — the
  // continuous queue is active, or a verse is loaded (playing or
  // paused). It drives the same shared player state as every other
  // control; the header "Play all" button hides while it is up so
  // there is exactly one control surface at a time.
  const showMiniPlayer = continuous || playingId != null;
  const currentIndex =
    playingId == null ? -1 : ayahs.findIndex((a) => a.ayah_id === playingId);
  const currentAyah = currentIndex >= 0 ? ayahs[currentIndex] : null;

  return (
    <View style={s.root}>
      {showMiniPlayer ? (
        <View
          style={[
            s.miniPlayer,
            { backgroundColor: theme.bgSoft, borderBottomColor: theme.border },
          ]}
        >
          <TouchableOpacity
            onPress={toggleBarPlayPause}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel={
              playerStatus.playing ? 'Pause recitation' : 'Resume recitation'
            }
          >
            <Text style={[s.miniBtn, { color: theme.goldText }]}>
              {playerStatus.playing ? '⏸' : '▶'}
            </Text>
          </TouchableOpacity>
          <Text style={[s.miniRef, { color: theme.text }]}>
            {currentAyah
              ? `${currentAyah.surah_number}:${currentAyah.ayah_number}${
                  continuous ? `  ·  ${currentIndex + 1} of ${ayahs.length}` : ''
                }`
              : 'Recitation'}
          </Text>
          <TouchableOpacity
            onPress={stopPlayback}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="Stop recitation"
          >
            <Text style={[s.miniBtn, { color: theme.goldText }]}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    <FlatList
      style={s.listFlex}
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
            Tap a verse to open it · Play all to listen in order
          </Text>
          {!showMiniPlayer ? (
            <TouchableOpacity
              style={[s.playAllBtn, { backgroundColor: theme.bronze }]}
              onPress={togglePlayAll}
              activeOpacity={0.7}
              accessibilityLabel={
                !continuous
                  ? 'Play all verses in order'
                  : playerStatus.playing
                    ? 'Pause recitation'
                    : 'Resume recitation'
              }
            >
              <Text style={s.playAllBtnText}>{playAllLabel}</Text>
            </TouchableOpacity>
          ) : null}
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
              <Text style={[s.footerNote, { color: theme.goldText }]}>{footerNote}</Text>
            )}
          </View>
        ) : null
      }
    />
    </View>
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
    root: { flex: 1 },
    listFlex: { flex: 1 },
    miniPlayer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 24,
      borderBottomWidth: 0.5,
    },
    miniBtn: { fontSize: 16, paddingHorizontal: 4 },
    miniRef: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      letterSpacing: 1,
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
      fontSize: 11,
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
    playAllBtn: {
      paddingVertical: 11,
      paddingHorizontal: 18,
      borderRadius: 2,
      marginTop: 4,
      marginBottom: 8,
    },
    playAllBtnText: {
      color: '#fff',
      fontSize: 11,
      letterSpacing: 1.5,
      fontFamily: 'Amiri_400Regular',
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
      fontSize: 11,
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
      lineHeight: 28,
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
