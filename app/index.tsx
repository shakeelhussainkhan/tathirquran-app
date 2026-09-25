import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTodayAyah, getDefaultTranslation, getLiveLanguages, getAllTafsirForAyah } from '../lib/queries';
import { Colors } from '../constants/colors';
import { gregorianToHijri } from '../lib/utils';
import { useTheme } from '../lib/theme';
import { calculatePrayerTimes, formatTime } from '../lib/prayerTimes';

const SCHOLAR_CONFIG: Record<string, { label: string; sublabel: string }> = {
  "Allamah Tabataba'i": {
    label: 'Al-Mizan',
    sublabel: "Allamah Tabataba'i (RA)",
  },
  'Ahlul Bayt (AS)': {
    label: 'From the Ahlul Bayt (AS)',
    sublabel: 'Tafsir al-Burhan — Narrations of the Imams',
  },
};

const SCHOLAR_ORDER = ["Allamah Tabataba'i", 'Ahlul Bayt (AS)'];

export default function HomeScreen() {
  const theme = useTheme();
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
  const player = useAudioPlayer(null);

  useEffect(() => {
    async function load() {
      const bismPref = await AsyncStorage.getItem('show_bismillah');
      setShowBismillah(bismPref !== 'false');

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

  const toggleAudio = async () => {
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

        {/* Arabic verse */}
        <Text style={[styles.arabic, { color: theme.text }]}>{ayah?.arabic_uthmani}</Text>

        {/* Ornament */}
        <View style={styles.ornament}>
          <View style={[styles.ornamentLine, { backgroundColor: theme.border }]} />
          <Text style={[styles.ornamentDiamond, { color: theme.bronze }]}>◆</Text>
          <View style={[styles.ornamentLine, { backgroundColor: theme.border }]} />
        </View>

        {/* Translation */}
        <Text style={[styles.translation, { color: theme.text }]}>
          {translation ? `"${translation.text}"` : ''}
        </Text>

        {/* Reference */}
        <Text style={[styles.ref, { color: theme.gold }]}>
          {ayah?.surahs?.name_english?.toUpperCase()} · {ayah?.surah_number}:{ayah?.ayah_number}
        </Text>

        {/* Scholar */}
        <Text style={[styles.scholar, { color: theme.bronze }]}>
          {translation?.translations?.scholar_name}
        </Text>

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
          <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.border }]} onPress={toggleBookmark} activeOpacity={0.7}>
            <Text style={[styles.actionBtnText, { color: bookmarked ? theme.gold : theme.bronze }]}>
              {bookmarked ? '🔖 SAVED' : '🔖 SAVE'}
            </Text>
          </TouchableOpacity>
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
                      {entries.map((entry, i) => (
                        <View key={entry.id}>
                          <Text style={[styles.tafsirText, { color: theme.text }]}>{entry.text}</Text>
                          <Text style={[styles.tafsirSource, i < entries.length - 1 && { marginBottom: 14 }, { color: theme.bronze }]}>
                            — {entry.source_book}
                          </Text>
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

      <View style={[styles.goldBar, { backgroundColor: theme.bronze }]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
