import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { getTodayAyah, getDefaultTranslation, getLiveLanguages, getAllTafsirForAyah } from '../lib/queries';
import { Colors } from '../constants/colors';
import { gregorianToHijri } from '../lib/utils';

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
  const [ayah, setAyah] = useState<any>(null);
  const [translation, setTranslation] = useState<any>(null);
  const [languages, setLanguages] = useState<any[]>([]);
  const [selectedLang, setSelectedLang] = useState('en');
  const [tafsirEntries, setTafsirEntries] = useState<any[]>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [todayAyah, langs] = await Promise.all([
        getTodayAyah(),
        getLiveLanguages(),
      ]);
      if (todayAyah) {
        const [trans, tafsir] = await Promise.all([
          getDefaultTranslation(todayAyah.ayah_id, 'en'),
          getAllTafsirForAyah(todayAyah.ayah_id, 'en'),
        ]);
        setAyah(todayAyah);
        setTranslation(trans);
        setTafsirEntries(tafsir);
      }
      setLanguages(langs);
      setLoading(false);
    }
    load();
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

  const handleAudio = () => {
    const surahStr = String(ayah?.surah_number || 1).padStart(3, '0');
    const ayahStr = String(ayah?.ayah_number || 1).padStart(3, '0');
    const url = `https://everyayah.com/data/Husary_128kbps/${surahStr}${ayahStr}.mp3`;
    Linking.openURL(url);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.bronze} />
      </View>
    );
  }

  const today = new Date();
  const hijri = gregorianToHijri(today);

  // Group tafsir by scholar
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Gold top bar */}
      <View style={styles.goldBar} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>TATHIRQURAN</Text>
        <Text style={styles.headerDate}>{hijri}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Bismillah */}
        <Text style={styles.bismillah}>بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ</Text>

        {/* Arabic verse */}
        <Text style={styles.arabic}>{ayah?.arabic_uthmani}</Text>

        {/* Ornament */}
        <View style={styles.ornament}>
          <View style={styles.ornamentLine} />
          <Text style={styles.ornamentDiamond}>◆</Text>
          <View style={styles.ornamentLine} />
        </View>

        {/* Translation */}
        <Text style={styles.translation}>
          {translation ? `"${translation.text}"` : ''}
        </Text>

        {/* Reference */}
        <Text style={styles.ref}>
          {ayah?.surahs?.name_english?.toUpperCase()} · {ayah?.surah_number}:{ayah?.ayah_number}
        </Text>

        {/* Scholar */}
        <Text style={styles.scholar}>
          {translation?.translations?.scholar_name}
        </Text>

        {/* Audio player */}
        <TouchableOpacity style={styles.playBtn} onPress={handleAudio} activeOpacity={0.7}>
          <Text style={styles.playBtnText}>▶ LISTEN</Text>
        </TouchableOpacity>

        {/* Language pills */}
        <View style={styles.langSection}>
          <Text style={styles.langLabel}>LANGUAGE</Text>
          <View style={styles.pillRow}>
            {languages.map(lang => (
              <TouchableOpacity
                key={lang.language_code}
                style={selectedLang === lang.language_code ? styles.pillActive : styles.pillInactive}
                onPress={() => handleLangChange(lang.language_code)}
                disabled={lang.launch_status === 'beta'}
              >
                <Text style={selectedLang === lang.language_code ? styles.pillTextActive : styles.pillTextInactive}>
                  {lang.language_name}
                  {lang.launch_status === 'beta' ? ' *' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Tafsir — multi-section collapsible */}
        {scholars.length === 0 ? (
          <View style={styles.tafsirBtn}>
            <Text style={[styles.tafsirBtnText, { opacity: 0.5 }]}>TAFSIR BEING ADDED</Text>
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
                    style={styles.tafsirBtn}
                    onPress={() => toggleSection(scholar)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tafsirBtnText}>
                        {config?.label || scholar}
                      </Text>
                      {config?.sublabel && (
                        <Text style={styles.tafsirBtnSublabel}>
                          {config.sublabel}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.tafsirChevron}>{isOpen ? '↑' : '↓'}</Text>
                  </TouchableOpacity>

                  {isOpen && (
                    <View style={styles.tafsirBody}>
                      {entries.map((entry, i) => (
                        <View key={entry.id}>
                          <Text style={styles.tafsirText}>{entry.text}</Text>
                          <Text style={[styles.tafsirSource, i < entries.length - 1 && { marginBottom: 14 }]}>
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

      {/* Gold bottom bar */}
      <View style={styles.goldBar} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.parchment },
  goldBar: {
    height: 4,
    backgroundColor: Colors.bronze,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.bronzeSubtle,
  },
  headerLogo: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    letterSpacing: 3,
    color: Colors.bronze,
  },
  headerDate: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    color: Colors.inkSoft,
    letterSpacing: 0.5,
  },
  scroll: {
    padding: 28,
    alignItems: 'center',
  },
  bismillah: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 14,
    color: 'rgba(139,101,32,0.55)',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 16,
  },
  arabic: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 36,
    color: Colors.ink,
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
  ornamentLine: {
    width: 40,
    height: 0.5,
    backgroundColor: Colors.bronzeFaded,
  },
  ornamentDiamond: {
    fontSize: 9,
    color: Colors.bronze,
    opacity: 0.8,
  },
  translation: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 20,
    fontStyle: 'italic',
    color: Colors.inkMid,
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  ref: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    letterSpacing: 2,
    color: Colors.bronze,
    textAlign: 'center',
    marginBottom: 4,
  },
  scholar: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    color: Colors.inkSoft,
    textAlign: 'center',
    marginBottom: 24,
  },
  playBtn: {
    borderWidth: 0.5,
    borderColor: Colors.bronzeFaded,
    padding: 8,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  playBtnText: { color: Colors.bronze, fontSize: 10, letterSpacing: 2, fontFamily: 'Amiri_400Regular' },
  langSection: { width: '100%', marginBottom: 16 },
  langLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 8,
    letterSpacing: 2,
    color: Colors.inkSoft,
    marginBottom: 8,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pillActive: {
    backgroundColor: Colors.bronze,
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 2,
  },
  pillInactive: {
    borderWidth: 0.5,
    borderColor: Colors.bronzeFaded,
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 2,
  },
  pillTextActive: { color: '#fff', fontSize: 9, letterSpacing: 1 },
  pillTextInactive: { color: Colors.inkSoft, fontSize: 9, letterSpacing: 1 },
  tafsirContainer: { width: '100%' },
  tafsirBtn: {
    borderWidth: 0.5,
    borderColor: Colors.bronzeFaded,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 2,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  tafsirBtnText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 9,
    letterSpacing: 2,
    color: Colors.bronze,
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
    color: Colors.bronze,
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
    fontSize: 14,
    fontStyle: 'italic',
    color: Colors.inkMid,
    lineHeight: 22,
    marginBottom: 8,
  },
  tafsirSource: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 9,
    color: Colors.inkSoft,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
});
