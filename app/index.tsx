import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import ShareVerseCard from '../components/ShareVerseCard';
import NoteTagsEditor from '../components/NoteTagsEditor';
import { getTodayAyah, getDefaultTranslation, getLiveLanguages, getAllTafsirForAyah } from '../lib/queries';
import {
  splitAyahWords, nextWordToHide, nextWordToReveal,
  isMemorized as fetchIsMemorized, setMemorized as storeSetMemorized,
} from '../lib/memorization';
import { Colors } from '../constants/colors';
import { gregorianToHijri } from '../lib/utils';
import { useTheme } from '../lib/theme';
import { calculatePrayerTimes, formatTime } from '../lib/prayerTimes';
import {
  recordDailyVerseView,
  streakLabel,
  WELCOME_BACK_MESSAGE,
  type StreakMilestone,
  type StreakState,
} from '../lib/streaks';

const REFLECTION_NOTE = 'Written by the TathirQuran team to aid reflection. Not a quotation from any tafsir. Under review by scholars.';

const SCHOLAR_CONFIG: Record<string, { label: string; sublabel?: string; note?: string; hideSourceBook?: boolean }> = {
  // ── Live ──────────────────────────────────────────────────────────────────
  'Reflection': {
    label: 'Reflection — pending scholarly review',
    hideSourceBook: true,
    note: REFLECTION_NOTE,
  },
  // ── Future verified content ───────────────────────────────────────────────
  "Allamah Tabataba'i": {
    label: 'Al-Mizan',
    sublabel: "Allamah Tabataba'i (RA)",
  },
  'Ahlul Bayt (AS)': {
    label: 'From the Ahlul Bayt (AS)',
    sublabel: 'Tafsir al-Burhan — Narrations of the Imams',
  },
};

const SCHOLAR_ORDER = ['Reflection', "Allamah Tabataba'i", 'Ahlul Bayt (AS)'];

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [ayah, setAyah] = useState<any>(null);
  const [translation, setTranslation] = useState<any>(null);
  const [languages, setLanguages] = useState<any[]>([]);
  const [selectedLang, setSelectedLang] = useState('en');
  const [tafsirEntries, setTafsirEntries] = useState<any[]>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [audioLoading, setAudioLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [prayerTimes, setPrayerTimes] = useState<any>(null);
  const [showBismillah, setShowBismillah] = useState(true);
  const [showTransliteration, setShowTransliteration] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sharingCard, setSharingCard] = useState(false);
  const shareCardRef = useRef<View>(null);
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [streakMilestone, setStreakMilestone] = useState<StreakMilestone | null>(null);
  const [streakReturned, setStreakReturned] = useState(false);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const currentAyahId = useRef<number | null>(null);

  // ── Memorization mode ──────────────────────────────────────────────
  // Display-only: it hides/reveals the translation and the Arabic words
  // of the ayah already loaded above. No new content is introduced.
  const [memorizeMode, setMemorizeMode] = useState(false);
  const [translationHidden, setTranslationHidden] = useState(false);
  const [hiddenWords, setHiddenWords] = useState<Set<number>>(new Set());
  const [memorized, setMemorized] = useState(false);
  // Repeat-audio loop (uses the same recitation player as LISTEN)
  const LOOP_COUNTS = [1, 3, 5, 10];
  const [loopCount, setLoopCount] = useState(3);
  const [loopActive, setLoopActive] = useState(false);
  const [loopPlaysDone, setLoopPlaysDone] = useState(0);
  const loopRef = useRef<{ active: boolean; target: number; done: number }>({ active: false, target: 0, done: 0 });

  // Stop TTS on unmount
  useEffect(() => {
    return () => { Speech.stop(); };
  }, []);

  useEffect(() => {
    async function noteVerseViewed() {
      // Local-day streak: recording is idempotent within a day and
      // never throws, so it is safe on both the live and cached paths.
      const result = await recordDailyVerseView();
      setStreak(result.state);
      if (result.isNewDay) {
        setStreakMilestone(result.milestone);
        setStreakReturned(result.returnedAfterGap);
      }
    }

    async function load() {
      const bismPref = await AsyncStorage.getItem('show_bismillah');
      setShowBismillah(bismPref !== 'false');

      const translitPref = await AsyncStorage.getItem('show_transliteration');
      setShowTransliteration(translitPref === 'true');

      const savedLang = await AsyncStorage.getItem('selected_language');
      const lang = savedLang || 'en';
      setSelectedLang(lang);

      try {
        const [todayAyah, langs] = await Promise.all([
          getTodayAyah(),
          getLiveLanguages(),
        ]);
        if (todayAyah) {
          const [trans, tafsir] = await Promise.all([
            getDefaultTranslation(todayAyah.ayah_id, lang),
            getAllTafsirForAyah(todayAyah.ayah_id, 'en'),
          ]);
          setAyah(todayAyah);
          setTranslation(trans);
          setTafsirEntries(tafsir);
          await noteVerseViewed();
          if (currentAyahId.current !== todayAyah.ayah_id) {
            Speech.stop();
            setIsSpeaking(false);
            currentAyahId.current = todayAyah.ayah_id;
          }
          // Cache for offline
          await AsyncStorage.setItem('cached_ayah', JSON.stringify(todayAyah));
          await AsyncStorage.setItem('cached_translation', JSON.stringify(trans));
          await AsyncStorage.setItem('cached_date', new Date().toDateString());
        }
        setLanguages(langs);
        setOfflineMode(false);
      } catch {
        // Load from cache
        const cached = await AsyncStorage.getItem('cached_ayah');
        const cachedTrans = await AsyncStorage.getItem('cached_translation');
        if (cached) {
          setAyah(JSON.parse(cached));
          setOfflineMode(true);
          await noteVerseViewed();
        }
        if (cachedTrans) {
          setTranslation(JSON.parse(cachedTrans));
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  // Check bookmark state when ayah loads
  useEffect(() => {
    if (ayah) {
      const key = `bookmark_${ayah.surah_number}_${ayah.ayah_number}`;
      AsyncStorage.getItem(key).then(val => setBookmarked(!!val));
    }
  }, [ayah]);

  // Check memorized state and reset memorization display when ayah changes
  useEffect(() => {
    if (ayah) {
      fetchIsMemorized(ayah.surah_number, ayah.ayah_number).then(setMemorized);
      setHiddenWords(new Set());
      setTranslationHidden(false);
      loopRef.current.active = false;
      setLoopActive(false);
      setLoopPlaysDone(0);
    }
  }, [ayah]);

  // Fetch prayer times
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const times = calculatePrayerTimes(loc.coords.latitude, loc.coords.longitude, new Date());
        setPrayerTimes(times);
      } catch {
        // Prayer times are optional — silently skip
      }
    })();
  }, []);

  const handleLangChange = async (langCode: string) => {
    setSelectedLang(langCode);
    if (ayah) {
      const trans = await getDefaultTranslation(ayah.ayah_id, langCode);
      setTranslation(trans);
    }
  };

  const toggleSection = (scholar: string) => {
    setOpenSections((prev) => ({ ...prev, [scholar]: !prev[scholar] }));
  };

  const handleShare = async () => {
    const surahName = ayah?.surahs?.name_english || 'Quran';
    const ref = `${surahName} ${ayah?.surah_number}:${ayah?.ayah_number}`;
    const text = `"${translation?.text}"\n— ${ref}\n\nTathirQuran · tathirquran.com`;
    await Share.share({ message: text });
  };

  // Share-as-image: capture the off-screen ShareVerseCard (same design as
  // the web /api/verse-card PNG) and hand the PNG to the OS share sheet.
  // Falls back to the text share above if image sharing is unavailable.
  const handleShareCard = async () => {
    if (!ayah || sharingCard) return;
    setSharingCard(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        await handleShare();
        return;
      }
      // Let the off-screen card settle a frame before capturing it.
      await new Promise((resolve) => setTimeout(resolve, 60));
      const uri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: 1080,
        height: 1350,
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share this ayah',
        UTI: 'public.png',
      });
    } catch (e) {
      console.error('Share card error:', e);
      await handleShare();
    } finally {
      setSharingCard(false);
    }
  };

  const toggleBookmark = async () => {
    if (!ayah) return;
    const key = `bookmark_${ayah.surah_number}_${ayah.ayah_number}`;
    if (bookmarked) {
      await AsyncStorage.removeItem(key);
      setBookmarked(false);
    } else {
      await AsyncStorage.setItem(key, JSON.stringify({
        surah: ayah.surah_number,
        ayah: ayah.ayah_number,
        surahName: ayah.surahs?.name_english,
        arabic: ayah.arabic_uthmani,
        translation: translation?.text,
        date: new Date().toISOString(),
      }));
      setBookmarked(true);
    }
  };

  const toggleSpeech = (text: string) => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }
    // Pause Quran audio if playing
    if (player.playing) { player.pause(); }
    setIsSpeaking(true);
    Speech.speak(text, {
      language: 'en-US',
      rate: 0.9,
      pitch: 1.0,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const ayahAudioUrl = () => {
    const surahStr = String(ayah?.surah_number || 1).padStart(3, '0');
    const ayahStr = String(ayah?.ayah_number || 1).padStart(3, '0');
    return `https://everyayah.com/data/Husary_128kbps/${surahStr}${ayahStr}.mp3`;
  };

  // ── Repeat-audio loop (memorization) ───────────────────────────────
  const stopLoop = () => {
    loopRef.current.active = false;
    setLoopActive(false);
    try { player.pause(); } catch { /* player may not be loaded */ }
  };

  const startLoop = async () => {
    if (!ayah) return;
    Speech.stop();
    setIsSpeaking(false);
    try {
      setAudioLoading(true);
      await setAudioModeAsync({ playsInSilentMode: true });
      player.replace({ uri: ayahAudioUrl() });
      loopRef.current = { active: true, target: loopCount, done: 0 };
      setLoopPlaysDone(0);
      setLoopActive(true);
      player.play();
      setAudioLoading(false);
    } catch (e) {
      console.error('Audio loop error:', e);
      loopRef.current.active = false;
      setLoopActive(false);
      setAudioLoading(false);
    }
  };

  // Count completed plays; replay from the start until the chosen
  // repeat count is reached, then stop on its own.
  useEffect(() => {
    if (!playerStatus.didJustFinish) return;
    const loop = loopRef.current;
    if (!loop.active) return;
    const done = loop.done + 1;
    loop.done = done;
    setLoopPlaysDone(done);
    if (done < loop.target) {
      try {
        player.seekTo(0);
        player.play();
      } catch { /* ignore */ }
    } else {
      loop.active = false;
      setLoopActive(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerStatus.didJustFinish]);

  // ── Memorization display controls ──────────────────────────────────
  const ayahWords = splitAyahWords(ayah?.arabic_uthmani);

  const toggleMemorizeMode = () => {
    if (memorizeMode) {
      // Leaving memorize mode restores the full ayah.
      setMemorizeMode(false);
      setTranslationHidden(false);
      setHiddenWords(new Set());
      stopLoop();
    } else {
      setMemorizeMode(true);
      // Progressive reveal, step one: the translation goes first.
      setTranslationHidden(true);
      setHiddenWords(new Set());
    }
  };

  const hideNextWord = () => {
    const idx = nextWordToHide(ayahWords.length, hiddenWords);
    if (idx === null) return;
    setHiddenWords(prev => new Set(prev).add(idx));
  };

  const revealNextWord = () => {
    const idx = nextWordToReveal(hiddenWords);
    if (idx === null) return;
    setHiddenWords(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  };

  const revealWord = (idx: number) => {
    setHiddenWords(prev => {
      if (!prev.has(idx)) return prev;
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  };

  const toggleMemorized = async () => {
    if (!ayah) return;
    const next = !memorized;
    await storeSetMemorized({
      surah: ayah.surah_number,
      ayah: ayah.ayah_number,
      surahName: ayah.surahs?.name_english,
      arabic: ayah.arabic_uthmani,
      translation: translation?.text,
    }, next);
    setMemorized(next);
  };

  const toggleAudio = async () => {
    // A manual LISTEN press cancels any repeat loop in progress.
    if (loopRef.current.active) stopLoop();
    // Stop TTS when Quran recitation starts
    if (!player.playing) {
      Speech.stop();
      setIsSpeaking(false);
    }
    try {
      if (player.playing) {
        player.pause();
        return;
      }
      if (player.duration > 0) {
        player.play();
        return;
      }
      setAudioLoading(true);
      const surahStr = String(ayah?.surah_number || 1).padStart(3, '0');
      const ayahStr = String(ayah?.ayah_number || 1).padStart(3, '0');
      const url = `https://everyayah.com/data/Husary_128kbps/${surahStr}${ayahStr}.mp3`;
      await setAudioModeAsync({ playsInSilentMode: true });
      player.replace({ uri: url });
      player.play();
      setAudioLoading(false);
    } catch (e) {
      console.error('Audio error:', e);
      setAudioLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.bronze} />
      </View>
    );
  }

  const today = new Date();
  const hijri = gregorianToHijri(today);

  const grouped: Record<string, any[]> = {};
  tafsirEntries.forEach((t) => {
    if (!grouped[t.scholar]) grouped[t.scholar] = [];
    grouped[t.scholar].push(t);
  });
  const scholars = [
    ...SCHOLAR_ORDER.filter((s) => grouped[s]),
    ...Object.keys(grouped).filter((s) => !SCHOLAR_ORDER.includes(s)),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.goldBar, { backgroundColor: theme.bronze }]} />

      {/* Offline banner */}
      {offlineMode && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>Showing cached verse — check your connection</Text>
        </View>
      )}

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerLogo, { color: theme.bronze }]}>TATHIRQURAN</Text>
        <Text style={[styles.headerDate, { color: theme.textSecondary }]}>{hijri}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Bismillah */}
        {showBismillah && (
          <Text style={[styles.bismillah, { color: theme.bronze + '8C' }]}>
            بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ
          </Text>
        )}

        {/* Arabic verse — in memorize mode the exact same text is rendered
            word-by-word (split on whitespace, unaltered) so individual
            words can be hidden and tapped to reveal. */}
        {memorizeMode ? (
          <Text style={[styles.arabic, { color: theme.text }]}>
            {ayahWords.map((word, i) => (
              <Text
                key={i}
                onPress={hiddenWords.has(i) ? () => revealWord(i) : undefined}
                style={hiddenWords.has(i) ? { color: theme.bronze } : undefined}
              >
                {hiddenWords.has(i) ? '••••' : word}{i < ayahWords.length - 1 ? ' ' : ''}
              </Text>
            ))}
          </Text>
        ) : (
          <Text style={[styles.arabic, { color: theme.text }]}>{ayah?.arabic_uthmani}</Text>
        )}

        {/* Transliteration — phonetic transcription of the Arabic (not a
            translation). Hidden entirely until the loader populates the field. */}
        {showTransliteration && ayah?.transliteration ? (
          <>
            <Text style={[styles.transliterationLabel, { color: theme.bronze }]}>TRANSLITERATION</Text>
            <Text style={[styles.transliteration, { color: theme.textSecondary }]}>{ayah.transliteration}</Text>
          </>
        ) : null}

        {/* Ornament */}
        <View style={styles.ornament}>
          <View style={[styles.ornamentLine, { backgroundColor: theme.border }]} />
          <Text style={[styles.ornamentDiamond, { color: theme.bronze }]}>◆</Text>
          <View style={[styles.ornamentLine, { backgroundColor: theme.border }]} />
        </View>

        {/* Translation — hidden first in memorize mode (progressive reveal) */}
        {memorizeMode && translationHidden ? (
          <TouchableOpacity onPress={() => setTranslationHidden(false)} activeOpacity={0.7}>
            <Text style={[styles.translation, { color: theme.textSecondary }]}>
              Translation hidden — tap to reveal
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.translation, { color: theme.text }]}>
            {translation ? `"${translation.text}"` : ''}
          </Text>
        )}

        {/* Reference */}
        <Text style={[styles.ref, { color: theme.gold }]}>
          {ayah?.surahs?.name_english?.toUpperCase()} · {ayah?.surah_number}:{ayah?.ayah_number}
        </Text>

        {/* Scholar */}
        <Text style={[styles.scholar, { color: theme.bronze }]}>
          {translation?.translations?.scholar_name}
        </Text>

        {/* Streak — small and gentle; milestones celebrate, misses welcome */}
        {streak && streak.current_streak > 0 && (
          <View style={[styles.streakBox, { borderColor: theme.border }]}>
            <Text style={[styles.streakText, { color: theme.bronze }]}>
              ✦ {streakLabel(streak.current_streak)}
              {streak.longest_streak > streak.current_streak
                ? `  ·  Longest ${streak.longest_streak}`
                : ''}
            </Text>
            {streakMilestone ? (
              <>
                <Text style={[styles.streakMilestone, { color: theme.gold }]}>
                  {streakMilestone.title}
                </Text>
                <Text style={[styles.streakMessage, { color: theme.textSecondary }]}>
                  {streakMilestone.message}
                </Text>
              </>
            ) : streakReturned ? (
              <Text style={[styles.streakMessage, { color: theme.textSecondary }]}>
                {WELCOME_BACK_MESSAGE}
              </Text>
            ) : null}
          </View>
        )}

        {/* Audio + Share + Bookmark row */}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 8, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.border }]} onPress={toggleAudio} activeOpacity={0.7}>
            <Text style={[styles.actionBtnText, { color: theme.bronze }]}>
              {audioLoading ? 'LOADING...' : player.playing ? '⏸ PAUSE' : '▶ LISTEN'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.border }]} onPress={handleShare} activeOpacity={0.7}>
            <Text style={[styles.actionBtnText, { color: theme.bronze }]}>↑ SHARE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.border }]} onPress={handleShareCard} activeOpacity={0.7}>
            <Text style={[styles.actionBtnText, { color: theme.bronze }]}>
              {sharingCard ? 'MAKING CARD…' : '🖼 SHARE CARD'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.border }]} onPress={toggleBookmark} activeOpacity={0.7}>
            <Text style={[styles.actionBtnText, { color: bookmarked ? theme.gold : theme.bronze }]}>
              {bookmarked ? '🔖 SAVED' : '🔖 SAVE'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: memorizeMode ? theme.gold : theme.border, backgroundColor: memorizeMode ? 'rgba(201,162,39,0.10)' : 'transparent' }]}
            onPress={toggleMemorizeMode}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionBtnText, { color: memorizeMode ? theme.gold : theme.bronze }]}>
              🧠 MEMORIZE
            </Text>
          </TouchableOpacity>
        </View>

        {/* Personal note & tags (stored on this device only) */}
        {ayah && (
          <NoteTagsEditor
            key={`${ayah.surah_number}_${ayah.ayah_number}`}
            surah={ayah.surah_number}
            ayah={ayah.ayah_number}
            theme={theme}
          />
        )}

        {/* Memorization panel */}
        {memorizeMode && (
          <View style={[styles.memorizePanel, { borderColor: theme.border }]}>
            <Text style={[styles.memorizeTitle, { color: theme.gold }]}>MEMORIZE THIS AYAH</Text>
            <Text style={[styles.memorizeHint, { color: theme.textSecondary }]}>
              The translation is hidden first. Then hide the Arabic words little by little,
              recite from memory, and tap a hidden word — or Reveal — to check yourself.
            </Text>

            {/* Step 1: translation */}
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: theme.border }]}
              onPress={() => setTranslationHidden(!translationHidden)}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionBtnText, { color: theme.bronze }]}>
                {translationHidden ? 'SHOW TRANSLATION' : 'HIDE TRANSLATION'}
              </Text>
            </TouchableOpacity>

            {/* Step 2: hide Arabic words incrementally */}
            <Text style={[styles.memorizeStatus, { color: theme.textSecondary }]}>
              {hiddenWords.size} of {ayahWords.length} words hidden
            </Text>
            <View style={styles.memorizeRow}>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.border }]} onPress={hideNextWord} activeOpacity={0.7}>
                <Text style={[styles.actionBtnText, { color: theme.bronze }]}>HIDE A WORD</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.border }]} onPress={revealNextWord} activeOpacity={0.7}>
                <Text style={[styles.actionBtnText, { color: theme.bronze }]}>REVEAL A WORD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: theme.border }]}
                onPress={() => setHiddenWords(new Set(ayahWords.map((_, i) => i)))}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionBtnText, { color: theme.bronze }]}>HIDE ALL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: theme.border }]}
                onPress={() => setHiddenWords(new Set())}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionBtnText, { color: theme.bronze }]}>SHOW ALL</Text>
              </TouchableOpacity>
            </View>

            {/* Repeat-audio loop */}
            <Text style={[styles.memorizeTitle, { color: theme.gold, marginTop: 14 }]}>REPEAT RECITATION</Text>
            <View style={styles.memorizeRow}>
              {LOOP_COUNTS.map(n => (
                <TouchableOpacity
                  key={n}
                  style={loopCount === n
                    ? [styles.pillActive, { backgroundColor: theme.bronze }]
                    : [styles.pillInactive, { borderColor: theme.border }]}
                  onPress={() => setLoopCount(n)}
                  activeOpacity={0.7}
                >
                  <Text style={loopCount === n ? styles.pillTextActive : [styles.pillTextInactive, { color: theme.textSecondary }]}>
                    {n}×
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {loopActive ? (
              <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.gold }]} onPress={stopLoop} activeOpacity={0.7}>
                <Text style={[styles.actionBtnText, { color: theme.gold }]}>
                  ■ STOP — PLAYING {Math.min(loopPlaysDone + 1, loopCount)} OF {loopCount}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.border }]} onPress={startLoop} activeOpacity={0.7}>
                <Text style={[styles.actionBtnText, { color: theme.bronze }]}>
                  {audioLoading ? 'LOADING...' : `▶ REPEAT ${loopCount}×`}
                </Text>
              </TouchableOpacity>
            )}

            {/* Self-check */}
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: memorized ? theme.gold : theme.border, marginTop: 14, backgroundColor: memorized ? 'rgba(201,162,39,0.10)' : 'transparent' }]}
              onPress={toggleMemorized}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionBtnText, { color: memorized ? theme.gold : theme.bronze }]}>
                {memorized ? '✓ MEMORIZED — TAP TO UNDO' : 'MARK AS MEMORIZED'}
              </Text>
            </TouchableOpacity>
            {memorized && (
              <Text style={[styles.memorizeHint, { color: theme.textSecondary }]}>
                Saved on this device. Find it any time under Archive → Memorized.
              </Text>
            )}
          </View>
        )}

        {/* Language pills */}
        <View style={styles.langSection}>
          <Text style={[styles.langLabel, { color: theme.bronze }]}>LANGUAGE</Text>
          <View style={styles.pillRow}>
            {languages.map(lang => (
              <TouchableOpacity
                key={lang.language_code}
                style={selectedLang === lang.language_code
                  ? [styles.pillActive, { backgroundColor: theme.bronze }]
                  : [styles.pillInactive, { borderColor: theme.border }]}
                onPress={() => handleLangChange(lang.language_code)}
                disabled={lang.launch_status === 'beta'}
              >
                <Text style={selectedLang === lang.language_code
                  ? styles.pillTextActive
                  : [styles.pillTextInactive, { color: theme.textSecondary }]}>
                  {lang.language_name}
                  {lang.launch_status === 'beta' ? ' *' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Prayer times strip */}
        {prayerTimes && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.prayerStrip}>
            {[
              { name: 'Fajr', time: prayerTimes.fajr },
              { name: 'Sunrise', time: prayerTimes.sunrise },
              { name: 'Dhuhr', time: prayerTimes.dhuhr },
              { name: 'Asr', time: prayerTimes.asr },
              { name: 'Maghrib', time: prayerTimes.maghrib },
              { name: 'Isha', time: prayerTimes.isha },
            ].map(p => (
              <View key={p.name} style={styles.prayerItem}>
                <Text style={styles.prayerName}>{p.name}</Text>
                <Text style={[styles.prayerTime, { color: theme.gold }]}>{formatTime(p.time)}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Qibla entry point */}
        <TouchableOpacity
          style={[styles.tafsirBtn, { borderColor: theme.border, marginTop: 10 }]}
          onPress={() => router.push('/qibla')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tafsirBtnText, { color: theme.bronze, flex: 1 }]}>
            🧭 QIBLA DIRECTION
          </Text>
          <Text style={[styles.tafsirChevron, { color: theme.bronze }]}>→</Text>
        </TouchableOpacity>

        {/* Tafsir */}
        {scholars.length === 0 ? (
          <View style={[styles.tafsirBtn, { borderColor: theme.border }]}>
            <Text style={[styles.tafsirBtnText, { opacity: 0.5, color: theme.bronze }]}>TAFSIR BEING ADDED</Text>
          </View>
        ) : (
          <View style={styles.tafsirContainer}>
            {scholars.map((scholar) => {
              const config = SCHOLAR_CONFIG[scholar];
              const entries = grouped[scholar];
              const isOpen = openSections[scholar];
              const allText = entries.map(e => e.text).join(' ');
              return (
                <View key={scholar} style={{ marginBottom: 6 }}>
                  <TouchableOpacity
                    style={[styles.tafsirBtn, { borderColor: theme.border }]}
                    onPress={() => toggleSection(scholar)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tafsirBtnText, { color: theme.bronze }]}>
                        {config?.label || scholar}
                      </Text>
                      {config?.sublabel && (
                        <Text style={styles.tafsirBtnSublabel}>
                          {config.sublabel}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.tafsirChevron, { color: theme.bronze }]}>{isOpen ? '↑' : '↓'}</Text>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.tafsirBody}>
                      {config?.note && (
                        <Text style={[styles.tafsirNote, { color: theme.textSecondary }]}>
                          {config.note}
                        </Text>
                      )}
                      {/* TTS listen button */}
                      <TouchableOpacity
                        style={[styles.listenBtn, { borderColor: isSpeaking ? theme.gold : 'rgba(201,162,39,0.4)' }]}
                        onPress={() => toggleSpeech(allText)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.listenBtnText, { color: theme.gold }]}>
                          {isSpeaking ? '■ STOP' : '🔊 LISTEN'}
                        </Text>
                      </TouchableOpacity>
                      {entries.map((entry, i) => (
                        <View key={entry.id}>
                          <Text style={[styles.tafsirText, { color: theme.text }]}>{entry.text}</Text>
                          {!config?.hideSourceBook && (
                            <Text style={[styles.tafsirSource, i < entries.length - 1 && { marginBottom: 14 }, { color: theme.bronze }]}>
                              — {entry.source_book}
                            </Text>
                          )}
                          {config?.hideSourceBook && i < entries.length - 1 && (
                            <View style={{ height: 14 }} />
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Off-screen share card — laid out (so view-shot can capture it)
          but positioned far off-screen; never visible to the user. */}
      {ayah && (
        <View style={styles.offscreenCard} pointerEvents="none">
          <ShareVerseCard
            ref={shareCardRef}
            arabicText={ayah.arabic_uthmani}
            translationText={translation?.text}
            surahName={ayah?.surahs?.name_english || 'Quran'}
            surahNumber={ayah.surah_number}
            ayahNumber={ayah.ayah_number}
          />
        </View>
      )}

      <View style={[styles.goldBar, { backgroundColor: theme.bronze }]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  offscreenCard: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  goldBar: { height: 4 },
  offlineBanner: {
    backgroundColor: 'rgba(139,101,32,0.12)',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  offlineBannerText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    color: '#8b6520',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerLogo: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    letterSpacing: 3,
  },
  headerDate: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  scroll: { padding: 28, alignItems: 'center' },
  bismillah: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 14,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 16,
  },
  arabic: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 36,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 56,
    marginBottom: 4,
  },
  transliterationLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 2,
  },
  transliteration: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 17,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  ornament: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 16,
  },
  ornamentLine: { width: 40, height: 0.5 },
  ornamentDiamond: { fontSize: 9, opacity: 0.8 },
  translation: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 20,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  ref: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 13,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 4,
  },
  scholar: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  streakBox: {
    borderWidth: 0.5,
    borderRadius: 2,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: -8,
    marginBottom: 20,
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: '100%',
  },
  streakText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  streakMilestone: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  streakMessage: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 2,
  },
  actionBtn: {
    borderWidth: 0.5,
    padding: 8,
    borderRadius: 2,
    alignSelf: 'center',
  },
  actionBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: 'Amiri_400Regular',
  },
  memorizePanel: {
    width: '100%',
    borderWidth: 0.5,
    borderRadius: 4,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(201,162,39,0.04)',
  },
  memorizeTitle: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    letterSpacing: 2,
    textAlign: 'center',
  },
  memorizeHint: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  memorizeStatus: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1,
  },
  memorizeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  langSection: { width: '100%', marginBottom: 16 },
  langLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pillActive: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 2 },
  pillInactive: { borderWidth: 0.5, paddingVertical: 5, paddingHorizontal: 14, borderRadius: 2 },
  pillTextActive: { color: '#fff', fontSize: 9, letterSpacing: 1 },
  pillTextInactive: { fontSize: 9, letterSpacing: 1 },
  prayerStrip: { marginTop: 10, marginBottom: 4, width: '100%' },
  prayerItem: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(201,162,39,0.2)',
    borderRadius: 4,
  },
  prayerName: {
    fontSize: 10,
    color: '#8b6520',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  prayerTime: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  tafsirContainer: { width: '100%', marginTop: 8, gap: 8 },
  tafsirBtn: {
    borderWidth: 0.5,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 2,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  tafsirBtnText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    letterSpacing: 2,
  },
  tafsirBtnSublabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 8,
    color: 'rgba(139,101,32,0.55)',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  tafsirChevron: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    marginLeft: 8,
  },
  tafsirBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(201,162,39,0.04)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(201,162,39,0.3)',
    marginTop: 2,
  },
  tafsirNote: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: 10,
  },
  listenBtn: {
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 12,
  },
  listenBtnText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    letterSpacing: 1,
  },
  tafsirText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 26,
    marginBottom: 8,
  },
  tafsirSource: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
});
