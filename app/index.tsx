import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Share, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import ShareVerseCard from '../components/ShareVerseCard';
import ReciterPicker from '../components/ReciterPicker';
import {
  DEFAULT_RECITER,
  downloadAyahAudio,
  getSelectedReciter,
  isAudioDownloaded,
  resolvePlaybackUri,
  setSelectedReciter,
  type Reciter,
} from '../lib/reciters';
import NoteTagsEditor from '../components/NoteTagsEditor';
import { getTodayAyah, getDefaultTranslation, getLiveLanguages, getAllTafsirForAyah, getSurahNames, getAyahDetail, getSurahList } from '../lib/queries';
import {
  splitAyahWords, nextWordToHide, nextWordToReveal,
  isMemorized as fetchIsMemorized, setMemorized as storeSetMemorized,
} from '../lib/memorization';
import {
  loadKhatmahState,
  markPortionDone,
  getKhatmahProgress,
  type KhatmahState,
} from '../lib/khatmah';
import KhatmahCard from '../components/KhatmahCard';
import { Colors } from '../constants/colors';
import { gregorianToHijri } from '../lib/utils';
import { useTheme } from '../lib/theme';
import { calculatePrayerTimes, formatTime } from '../lib/prayerTimes';
import { getTodayDevotionals, isThursdayEvening, type TodayDevotionals } from '../lib/devotionals';
import DevotionalCard from '../components/DevotionalCard';
import { getTodayQuote } from '../lib/nahjulBalagha';
import NahjulBalaghaCard from '../components/NahjulBalaghaCard';
import {
  recordDailyVerseView,
  streakLabel,
  WELCOME_BACK_MESSAGE,
  type StreakMilestone,
  type StreakState,
} from '../lib/streaks';
import { maybeCheckInToCircle, loadMembership, fetchCircleToday, type CircleToday } from '../lib/circles';
import PrayerModule from '../components/PrayerModule';
import PrayerTimesModal from '../components/PrayerClock';
import { getIslamicOccasions, getTodayHijriParts, hijriMonthName } from '../lib/calendar';
import { qiblaBearing } from '../lib/qibla';
import { Ionicons } from '@expo/vector-icons';

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
  // Bundled + deterministic by date, so a plain initializer is enough —
  // no fetch, no loading state (lib/nahjulBalagha.ts).
  const [todayQuote] = useState(() => getTodayQuote());
  const [devotionals, setDevotionals] = useState<TodayDevotionals | null>(null);
  const [streakMilestone, setStreakMilestone] = useState<StreakMilestone | null>(null);
  const [streakReturned, setStreakReturned] = useState(false);
  const [reciter, setReciter] = useState<Reciter>(DEFAULT_RECITER);
  const [audioDownloaded, setAudioDownloaded] = useState(false);
  const [downloadingAudio, setDownloadingAudio] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [khatmahState, setKhatmahState] = useState<KhatmahState | null>(null);
  const [khatmahSurahNames, setKhatmahSurahNames] = useState<string[]>([]);
  // Today screen tabs (v1.0.5, Saira): the verse, the quote and the
  // reading plan get one tab each instead of a single long scroll.
  const [activeTab, setActiveTab] = useState<'quran' | 'quote' | 'plan'>('quran');
  const [reciterModalOpen, setReciterModalOpen] = useState(false);
  // v1.0.6 design round: prayer clock pop-out, qibla bearing for the
  // prayer module, today's occasion (calendar), circle summary for the
  // Reading Plan tab, and Prev/Next ayah browsing from Today.
  const [prayerClockOpen, setPrayerClockOpen] = useState(false);
  const [bearing, setBearing] = useState<number | null>(null);
  const [todayAyahId, setTodayAyahId] = useState<number | null>(null);
  const [todayOccasion, setTodayOccasion] = useState<string | null>(null);
  const [surahList, setSurahList] = useState<any[]>([]);
  const [inCircle, setInCircle] = useState(false);
  const [circleToday, setCircleToday] = useState<CircleToday | null>(null);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const currentAyahId = useRef<number | null>(null);
  // URI currently loaded in the player. Playback only "resumes" when the
  // desired URI (reciter + ayah + local-vs-remote) is exactly this one —
  // otherwise switching reciter would keep playing the previous voice.
  const loadedAudioUri = useRef<string | null>(null);

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
      // Family circle check-in: if this device is in a circle, tell the
      // circle today's verse was opened (local date). Fire-and-forget —
      // it never throws and a failure is silent, so reading the verse
      // never depends on the circle service being up.
      void maybeCheckInToCircle();
      if (result.isNewDay) {
        setStreakMilestone(result.milestone);
        setStreakReturned(result.returnedAfterGap);
      }
    }

    async function load() {
      setReciter(await getSelectedReciter());

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
          setTodayAyahId(todayAyah.ayah_id);
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
            loadedAudioUri.current = null;
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

  // Khatmah reading plan: refresh on focus so a portion marked read on
  // the plan screen (or a plan just started/ended) is reflected here.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        // Family circle summary for the Reading Plan tab (best-effort;
        // no membership simply means the invite card shows instead).
        try {
          const membership = await loadMembership();
          if (!cancelled && membership) {
            setInCircle(true);
            const todayInfo = await fetchCircleToday(membership.circle_id).catch(() => null);
            if (!cancelled && todayInfo) setCircleToday(todayInfo);
          } else if (!cancelled) {
            setInCircle(false);
            setCircleToday(null);
          }
        } catch {
          // Circles are optional — silence by design.
        }
        const saved = await loadKhatmahState();
        if (cancelled) return;
        setKhatmahState(saved);
        if (saved) {
          const names = await getSurahNames();
          if (!cancelled && names.length > 0) setKhatmahSurahNames(names);
        }
      })();
      return () => { cancelled = true; };
    }, []),
  );

  const handleKhatmahMarkDone = async (portionIndex: number) => {
    if (!khatmahState) return;
    setKhatmahState(await markPortionDone(khatmahState, portionIndex));
  };

  // Surah list — Prev/Next needs each surah's ayah count at the edges.
  useEffect(() => {
    let cancelled = false;
    getSurahList().then((rows) => {
      if (!cancelled && Array.isArray(rows)) setSurahList(rows);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Today's Islamic occasion (Wiladat / Shahadat), from the same
  // islamic_calendar_tags rows the calendar screen reads — shown as one
  // quiet line under the header on occasion days only, and the Hijri
  // date itself is the shortcut into the calendar.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const parts = getTodayHijriParts();
      if (!parts) return;
      const occasions = await getIslamicOccasions();
      if (cancelled) return;
      const match = occasions.find(
        (o) => o.hijriMonth === parts.month && o.hijriDay === parts.day,
      );
      if (match) setTodayOccasion(match.occasion);
    })();
    return () => { cancelled = true; };
  }, []);

  // Check bookmark state when ayah loads
  useEffect(() => {
    if (ayah) {
      const key = `bookmark_${ayah.surah_number}_${ayah.ayah_number}`;
      AsyncStorage.getItem(key).then(val => setBookmarked(!!val));
    }
  }, [ayah]);

  // Check whether this ayah is already downloaded for the selected reciter
  useEffect(() => {
    if (!ayah) {
      setAudioDownloaded(false);
      return;
    }
    let cancelled = false;
    isAudioDownloaded(reciter, ayah.surah_number, ayah.ayah_number).then((present) => {
      if (!cancelled) setAudioDownloaded(present);
    });
    return () => { cancelled = true; };
  }, [ayah, reciter]);

  // If the reciter was changed in Settings, pick it up when Today
  // regains focus so both pickers always agree.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getSelectedReciter().then((saved) => {
        if (cancelled) return;
        setReciter((current) => {
          if (saved.id !== current.id) {
            if (player.playing) player.pause();
            loadedAudioUri.current = null;
          }
          return saved;
        });
      });
      return () => { cancelled = true; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const handleReciterChange = async (next: Reciter) => {
    if (next.id === reciter.id) return;
    // The loaded track belongs to the previous reciter — stop and forget
    // it so the next LISTEN loads the new voice instead of resuming.
    if (player.playing) player.pause();
    loadedAudioUri.current = null;
    setReciter(next);
    setDownloadFailed(false);
    await setSelectedReciter(next);
  };

  const handleDownloadAudio = async () => {
    if (!ayah || downloadingAudio || audioDownloaded) return;
    setDownloadingAudio(true);
    setDownloadFailed(false);
    try {
      await downloadAyahAudio(reciter, ayah.surah_number, ayah.ayah_number);
      setAudioDownloaded(true);
      // If the streamed copy is loaded, the next play should use the file.
      loadedAudioUri.current = null;
      if (player.playing) player.pause();
    } catch (e) {
      console.error('Audio download error:', e);
      setDownloadFailed(true);
    } finally {
      setDownloadingAudio(false);
    }
  };
  // Devotionals (occasion duas & ziyarat): best-effort — an empty seed or
  // a missing table simply means no cards are shown. Never placeholder text.
  useEffect(() => {
    (async () => {
      try {
        setDevotionals(await getTodayDevotionals());
      } catch {
        setDevotionals(null);
      }
    })();
  }, []);

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
        setBearing(qiblaBearing(loc.coords.latitude, loc.coords.longitude));
      } catch {
        // Prayer times are optional — silently skip
      }
    })();
  }, []);

  // ── Prev/Next ayah browsing (v1.0.6, Saira) ──────────────────────
  // Steps from the verse on screen, across surah edges, using the same
  // detail read as the ayah page. "Today's verse" returns to the
  // scheduled verse. Audio never carries across a step.
  const browsing = todayAyahId !== null && !!ayah && ayah.ayah_id !== todayAyahId;

  const loadAyahAt = async (surah: number, ayahNumber: number) => {
    try {
      const detail = await getAyahDetail(surah, ayahNumber);
      if (!detail?.ayah) return;
      Speech.stop();
      setIsSpeaking(false);
      if (player.playing) player.pause();
      loadedAudioUri.current = null;
      currentAyahId.current = detail.ayah.ayah_id;
      setAyah(detail.ayah);
      const picked =
        detail.translations.find((t: any) => t.languageCode === selectedLang) ??
        detail.translations.find((t: any) => t.isDefault) ??
        detail.translations[0];
      setTranslation(
        picked
          ? { text: picked.text, translations: { scholar_name: picked.scholarName } }
          : null,
      );
      setTafsirEntries(detail.tafsirEntries ?? []);
    } catch {
      // Stay on the current verse if the step cannot load.
    }
  };

  const surahAyahCount = (surah: number): number | null => {
    const row = surahList.find((r: any) => r.surah_number === surah);
    return row?.ayah_count ?? null;
  };

  const handlePrevAyah = () => {
    if (!ayah) return;
    if (ayah.ayah_number > 1) {
      void loadAyahAt(ayah.surah_number, ayah.ayah_number - 1);
    } else if (ayah.surah_number > 1) {
      const count = surahAyahCount(ayah.surah_number - 1);
      if (count) void loadAyahAt(ayah.surah_number - 1, count);
    }
  };

  const handleNextAyah = () => {
    if (!ayah) return;
    const count = surahAyahCount(ayah.surah_number);
    if (count !== null && ayah.ayah_number < count) {
      void loadAyahAt(ayah.surah_number, ayah.ayah_number + 1);
    } else if (count !== null && ayah.surah_number < 114) {
      void loadAyahAt(ayah.surah_number + 1, 1);
    }
  };

  const returnToToday = async () => {
    try {
      const todayAyah = await getTodayAyah();
      if (!todayAyah) return;
      const [trans, tafsir] = await Promise.all([
        getDefaultTranslation(todayAyah.ayah_id, selectedLang),
        getAllTafsirForAyah(todayAyah.ayah_id, 'en'),
      ]);
      Speech.stop();
      setIsSpeaking(false);
      if (player.playing) player.pause();
      loadedAudioUri.current = null;
      currentAyahId.current = todayAyah.ayah_id;
      setAyah(todayAyah);
      setTranslation(trans);
      setTafsirEntries(tafsir);
    } catch {
      // Stay where we are.
    }
  };

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
      // Playback uses the selected reciter, preferring a downloaded
      // copy of this ayah when one is on the device.
      const uri = await resolvePlaybackUri(
        reciter,
        ayah?.surah_number || 1,
        ayah?.ayah_number || 1
      );
      if (loadedAudioUri.current === uri && player.duration > 0) {
        player.play();
        return;
      }
      setAudioLoading(true);
      await setAudioModeAsync({ playsInSilentMode: true });
      player.replace({ uri });
      loadedAudioUri.current = uri;
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
  const hijriParts = getTodayHijriParts();

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

      {/* Header — the Hijri date is the shortcut into the Islamic
          calendar (v1.0.6: the calendar no longer hides in Settings). */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerLogo, { color: theme.bronze }]}>TATHIRQURAN</Text>
        <TouchableOpacity onPress={() => router.push('/calendar')} activeOpacity={0.7} hitSlop={8}>
          <Text style={[styles.headerDate, { color: theme.textSecondary }]}>{hijri}</Text>
        </TouchableOpacity>
      </View>

      {/* Occasion line — Wiladat / Shahadat days only, from the
          islamic_calendar_tags rows; one quiet line, tap for the calendar. */}
      {todayOccasion && hijriParts && (
        <TouchableOpacity onPress={() => router.push('/calendar')} activeOpacity={0.7}>
          <Text style={[styles.occasionLine, { color: theme.goldText }]}>
            {hijriParts.day} {hijriMonthName(hijriParts.month)} · {todayOccasion}
          </Text>
        </TouchableOpacity>
      )}

      {/* Today tabs (v1.0.5, Saira): verse / quote / reading plan */}
      <View style={[styles.tabBar, { backgroundColor: theme.bgSoft }]}>
        {([
          { key: 'quran', label: 'Quran' },
          { key: 'quote', label: 'Quote' },
          { key: 'plan', label: 'Reading Plan' },
        ] as const).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && { backgroundColor: theme.bronze }]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }}
          >
            <Text style={[styles.tabText, { color: activeTab === tab.key ? '#FAF6ED' : theme.textSecondary }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.scroll}>
        {activeTab === 'quran' && (<>
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
        <Text style={[styles.ref, { color: theme.goldText }]}>
          {ayah?.surahs?.name_english?.toUpperCase()} · {ayah?.surahs?.name_arabic ? `${ayah.surahs.name_arabic} · ` : ''}{ayah?.surah_number}:{ayah?.ayah_number}
        </Text>

        {/* Scholar */}
        <Text style={[styles.scholar, { color: theme.bronze }]}>
          {translation?.translations?.scholar_name}
        </Text>

        {/* Previous / Next ayah (v1.0.6, Saira) */}
        <View style={styles.prevNextRow}>
          <TouchableOpacity onPress={handlePrevAyah} hitSlop={8} activeOpacity={0.7}>
            <Text style={[styles.prevNextText, { color: theme.primary }]}>‹ Previous</Text>
          </TouchableOpacity>
          {browsing ? (
            <TouchableOpacity onPress={returnToToday} hitSlop={8} activeOpacity={0.7}>
              <Text style={[styles.todayChip, { color: theme.goldText, borderColor: theme.border }]}>TODAY'S VERSE</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <TouchableOpacity onPress={handleNextAyah} hitSlop={8} activeOpacity={0.7}>
            <Text style={[styles.prevNextText, { color: theme.primary }]}>Next ›</Text>
          </TouchableOpacity>
        </View>

        {/* Verse actions (v1.0.6: the floating rail is abolished — only
            Audio, Share and Reciter remain, below the verse). */}
        <View style={styles.actionRow}>
          <View style={styles.actionItem}>
            <TouchableOpacity
              style={[styles.actionCircle, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={toggleAudio}
              activeOpacity={0.7}
              accessibilityLabel={player.playing ? 'Pause recitation' : 'Listen to this verse'}
            >
              {audioLoading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Ionicons name={player.playing ? 'pause' : 'play'} size={21} color={theme.primary} />
              )}
            </TouchableOpacity>
            <Text style={[styles.actionLabel, { color: theme.textSecondary }]}>Audio</Text>
          </View>
          <View style={styles.actionItem}>
            <TouchableOpacity
              style={[styles.actionCircle, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={handleShare}
              activeOpacity={0.7}
              accessibilityLabel="Share this verse"
            >
              <Ionicons name="share-outline" size={20} color={theme.primary} />
            </TouchableOpacity>
            <Text style={[styles.actionLabel, { color: theme.textSecondary }]}>Share</Text>
          </View>
          <View style={styles.actionItem}>
            <TouchableOpacity
              style={[styles.actionCircle, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={() => setReciterModalOpen(true)}
              activeOpacity={0.7}
              accessibilityLabel="Choose reciter"
            >
              <Ionicons name="mic-outline" size={20} color={theme.primary} />
            </TouchableOpacity>
            <Text style={[styles.actionLabel, { color: theme.textSecondary }]}>Reciter</Text>
          </View>
        </View>

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

        {/* Devotional cards — only when a matching devotional_texts row exists */}
        {devotionals?.occasionDevotional && (
          <DevotionalCard
            devotional={devotionals.occasionDevotional}
            label="For today's occasion"
          />
        )}
        {/* Memorization panel */}
        {memorizeMode && (
          <View style={[styles.memorizePanel, { borderColor: theme.border }]}>
            <Text style={[styles.memorizeTitle, { color: theme.goldText }]}>MEMORIZE THIS AYAH</Text>
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
            <Text style={[styles.memorizeTitle, { color: theme.goldText, marginTop: 14 }]}>REPEAT RECITATION</Text>
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
                <Text style={[styles.actionBtnText, { color: theme.goldText }]}>
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
              <Text style={[styles.actionBtnText, { color: memorized ? theme.goldText : theme.bronze }]}>
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

        {/* Personal note & tags (stored on this device only) */}
        {ayah && (
          <NoteTagsEditor
            key={`${ayah.surah_number}_${ayah.ayah_number}`}
            surah={ayah.surah_number}
            ayah={ayah.ayah_number}
            theme={theme}
          />
        )}

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
              // Honest labelling: a Reflection keeps the "pending scholarly
              // review" label until a human reviewer has approved EVERY
              // entry in this group (web migration 013). A missing
              // review_status — the column does not exist until the
              // migration runs, and older offline copies do not carry it —
              // counts as pending.
              const headingLabel =
                scholar === 'Reflection' &&
                entries.every((e: any) => e.review_status === 'approved')
                  ? 'Reflection'
                  : config?.label || scholar;
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
                        {headingLabel}
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
                        <Text style={[styles.listenBtnText, { color: theme.goldText }]}>
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

        </>)}
        {activeTab === 'quote' && (<>
        {/* Daily Nahjul Balagha quote — bundled verbatim sayings (Ali Raza
            translation, al-islam.org), deterministic by UTC date; see
            lib/nahjulBalagha.ts. Below the verse, in its own panel. */}
        {todayQuote && <NahjulBalaghaCard quote={todayQuote} />}

        {devotionals?.kumayl &&
          isThursdayEvening(new Date(), prayerTimes?.maghrib ?? null) && (
            <DevotionalCard
              devotional={devotionals.kumayl}
              label="Thursday evening · Laylat al-Jumu'ah"
            />
          )}

        </>)}
        {activeTab === 'plan' && (<>
        {/* Khatmah reading plan card (only while a plan is active) */}
        {khatmahState && (() => {
          const progress = getKhatmahProgress(khatmahState);
          if (!progress) return null;
          return (
            <KhatmahCard
              progress={progress}
              surahNames={khatmahSurahNames}
              onMarkDone={handleKhatmahMarkDone}
            />
          );
        })()}
          {!khatmahState && (
            <View style={[styles.planEmpty, { borderColor: theme.border }]}>
              <Text style={[styles.memorizeHint, { color: theme.textSecondary }]}>
                No reading plan yet. Start a Khatmah to read the whole Quran portion by
                portion — your place is kept if a day is missed.
              </Text>
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: theme.border }]}
                onPress={() => router.push('/khatmah')}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionBtnText, { color: theme.bronze }]}>START A PLAN →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Family Circle (v1.0.6: surfaced from Settings onto the
              Reading Plan tab — reading together, beside your own plan). */}
          <TouchableOpacity
            style={[styles.circleCard, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
            onPress={() => router.push('/circles')}
            activeOpacity={0.7}
          >
            <Text style={[styles.circleKicker, { color: theme.goldText }]}>FAMILY CIRCLE · READING TOGETHER</Text>
            <Text style={[styles.circleText, { color: theme.textSecondary }]}>
              {inCircle && circleToday
                ? `${circleToday.members.filter((m) => m.checked_in).length} of ${circleToday.members.length} in ${circleToday.name} have read today's verse.`
                : inCircle
                  ? "See how your circle is doing with today's verse."
                  : 'Read the daily verse together with your family — no accounts, just an invite code.'}
            </Text>
            <Text style={[styles.circleLink, { color: theme.bronze }]}>
              {inCircle ? 'OPEN CIRCLE →' : 'START OR JOIN A CIRCLE →'}
            </Text>
          </TouchableOpacity>
        </>)}
        <PrayerModule
          theme={theme}
          bearing={bearing}
          onOpenPrayerTimes={() => setPrayerClockOpen(true)}
        />
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Reciter picker + this ayah's audio download — moved off the
          scroll into a modal behind the rail's reciter button. */}
      <Modal
        visible={reciterModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReciterModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setReciterModalOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.bg, borderColor: theme.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: theme.bronze }]}>RECITER</Text>
            <ReciterPicker
              selected={reciter}
              onSelect={(next) => {
                void handleReciterChange(next);
                setReciterModalOpen(false);
              }}
              variant="rows"
            />
            <TouchableOpacity
              style={[styles.modalDownload, { borderColor: theme.border }]}
              onPress={handleDownloadAudio}
              disabled={downloadingAudio || audioDownloaded}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionBtnText, { color: audioDownloaded ? theme.goldText : theme.bronze }]}>
                {downloadingAudio
                  ? 'DOWNLOADING…'
                  : audioDownloaded
                    ? '✓ DOWNLOADED — PLAYS OFFLINE'
                    : '⬇ DOWNLOAD AUDIO FOR THIS AYAH'}
              </Text>
            </TouchableOpacity>
            {downloadFailed && (
              <Text style={[styles.downloadNote, { color: theme.textSecondary }]}>
                Download failed — check your connection and try again.
              </Text>
            )}
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setReciterModalOpen(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionBtnText, { color: theme.bronze }]}>CLOSE</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <PrayerTimesModal
        visible={prayerClockOpen}
        onClose={() => setPrayerClockOpen(false)}
        times={prayerTimes}
        theme={theme}
        onQibla={() => {
          setPrayerClockOpen(false);
          router.push('/qibla');
        }}
      />

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
    fontSize: 11,
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
    fontSize: 11,
    letterSpacing: 3,
  },
  headerDate: {
    fontSize: 10,
    letterSpacing: 0.4,
  },
  occasionLine: {
    fontSize: 11.5,
    textAlign: 'center',
    paddingVertical: 7,
    letterSpacing: 0.3,
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
    fontSize: 33,
    textAlign: 'center',
    writingDirection: 'rtl',
    // Amiri's tall marks need ~2x the font size in line height — at 56/36
    // iOS clipped the first line's diacritics (Saira, 1.0.4 device test).
    lineHeight: 70,
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
    // Urdu (Arabic script) runs tall in Amiri too — same headroom rule.
    lineHeight: 42,
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
    marginBottom: 14,
  },
  actionBtn: {
    borderWidth: 0.5,
    padding: 8,
    borderRadius: 2,
    alignSelf: 'center',
  },
  actionBtnText: {
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: 'Amiri_400Regular',
  },
  downloadNote: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 6,
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
    fontSize: 11,
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
  pillTextActive: { color: '#fff', fontSize: 11, letterSpacing: 1 },
  pillTextInactive: { fontSize: 11, letterSpacing: 1 },
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
    fontSize: 11,
    letterSpacing: 2,
  },
  tafsirBtnSublabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
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
  // Today tabs (v1.0.6: sage-track pill with a champagne active pill)
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 999,
    padding: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 999 },
  tabText: {
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  // Prev/Next + verse actions + circle card (v1.0.6)
  prevNextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  prevNextText: { fontSize: 13, fontWeight: '600' },
  todayChip: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.5,
    borderWidth: 0.5,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 34,
    marginBottom: 20,
  },
  actionItem: { alignItems: 'center', gap: 7 },
  actionCircle: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2E2A24',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  actionLabel: { fontSize: 11, fontWeight: '500' },
  circleCard: {
    width: '100%',
    borderWidth: 0.5,
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
    alignItems: 'center',
    gap: 8,
  },
  circleKicker: { fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  circleText: { fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  circleLink: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(13,10,4,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    borderWidth: 0.5,
    borderRadius: 6,
    paddingVertical: 16,
    paddingHorizontal: 6,
  },
  modalTitle: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalDownload: {
    borderWidth: 0.5,
    borderRadius: 2,
    padding: 10,
    marginTop: 14,
    marginHorizontal: 14,
    alignItems: 'center',
  },
  modalClose: { padding: 10, marginTop: 8, alignItems: 'center' },
  planEmpty: {
    width: '100%',
    borderWidth: 0.5,
    borderRadius: 4,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
});
