import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAyahDetail, getAyahWords } from '../../../lib/queries';
import WordByWord from '../../../components/WordByWord';
import { Colors } from '../../../constants/colors';
import { useTheme } from '../../../lib/theme';
import NoteTagsEditor from '../../../components/NoteTagsEditor';
import ListenButton from '../../../components/ListenButton';
import { stopSpeech } from '../../../lib/speech';
import { stopNarration } from '../../../lib/narration';

// Same honest labelling as the Today screen: the "Reflection" rows are
// AI-written pending scholarly review, never presented as a scholarly quote.
const REFLECTION_NOTE =
  'Written by the TathirQuran team to aid reflection. Not a quotation from any tafsir. Under review by scholars.';

// Majma' al-Bayan (al-Tabarsi) attribution, verbatim from the feasibility
// report (§5) — the CC BY-NC-SA 4.0 credit lines shown with the tafsir
// section below (credit + licence + the changes made to the source text).
const MAJMA_ATTRIBUTION_AR =
  'التفسير: الطبرسي، مجمع البيان في تفسير القرآن، عبر مكتبة OpenITI (إصدار 2025.1.9)، النصّ من altafsir.com. مرخّص بموجب CC BY-NC-SA 4.0 — جرى تقسيم النصّ على الآيات وحذف علامات صفحات الطبعة، والمتن بنصّه دون تغيير.';
const MAJMA_ATTRIBUTION_EN =
  "Commentary: al-Tabarsi, Majma' al-Bayan fi Tafsir al-Qur'an, via OpenITI (release 2025.1.9), text URI 0548IbnHasanTabarsi.TafsirMajmacBayan.Tafsir04003-ara1 — https://github.com/OpenITI/0550AH — licensed CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/). Changes: the text was segmented per verse-range and edition page markers were removed; wording is otherwise verbatim. This dataset is shared under CC BY-NC-SA 4.0.";

// Tafsir-e-Namoona attribution — a condition of the permission granted
// 2026-11-01 (Fi Sabeelillah, free non-commercial use): this exact line
// is shown with every Namoona section, and the full credit is on the
// About screen.
const NAMOONA_ATTRIBUTION =
  'Tafsir-e-Namoona by Ayatullah Naser Makarem Shirazi — Urdu Translation by Safdar Husain Najafi';

const isRtlLang = (code: string) => code === 'ar' || code === 'fa' || code === 'ur';

/**
 * Minimal ayah detail screen. Search results and Archive rows navigate here
 * (previously /ayah/[surah]/[ayah] did not exist — finding M-a4). Shows the
 * Arabic text, every translation stored for the ayah, and any
 * reflection/tafsir rows, with previous/next navigation inside the surah.
 */
export default function AyahDetailScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    surah: string;
    ayah: string;
    tafsirLang?: string;
    focusTafsir?: string;
  }>();
  const surahNumber = parseInt(params.surah ?? '', 10);
  const ayahNumber = parseInt(params.ayah ?? '', 10);

  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  // Word-by-word (lexical glosses): words stay [] until ayah_words has rows
  // for this ayah — the toggle and view are then hidden entirely.
  const [words, setWords] = useState<any[]>([]);
  const [showWbw, setShowWbw] = useState(false);
  const [showTransliteration, setShowTransliteration] = useState(false);
  // Tafsir language tab (1.0.8): 'ar' = Majma' al-Bayan, 'ur' = Namoona.
  // Persisted in AsyncStorage ('tafsirLang') and restored on every ayah
  // screen; a tafsirLang navigation param (daily-ayah chips) overrides
  // and re-persists it.
  const [tafsirLang, setTafsirLang] = useState<'ar' | 'ur'>('ur');
  const scrollRef = useRef<ScrollView | null>(null);
  const tafsirYRef = useRef(0);
  const focusHandledRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('show_transliteration').then((v) => {
      setShowTransliteration(v === 'true');
    });
    AsyncStorage.getItem('tafsirLang').then((v) => {
      if (v === 'ar' || v === 'ur') setTafsirLang(v);
    });
  }, []);

  // Daily-ayah tafsir chips navigate here with a language param: adopt
  // it as the tab (and persist it, like a manual tab tap).
  useEffect(() => {
    if (params.tafsirLang === 'ar' || params.tafsirLang === 'ur') {
      setTafsirLang(params.tafsirLang);
      void AsyncStorage.setItem('tafsirLang', params.tafsirLang);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tafsirLang]);

  // A focusTafsir navigation can land on an already-mounted ayah screen
  // (deep link / chip tap for another verse): re-arm the focus scroll
  // whenever the verse changes.
  useEffect(() => {
    focusHandledRef.current = false;
    tafsirYRef.current = 0;
  }, [surahNumber, ayahNumber]);

  const chooseTafsirLang = (lang: 'ar' | 'ur') => {
    setTafsirLang(lang);
    void AsyncStorage.setItem('tafsirLang', lang);
  };

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
          // Word-by-word preference (default off) + glosses for this ayah.
          const pref = await AsyncStorage.getItem('show_word_by_word');
          if (!cancelled) setShowWbw(pref === 'true');
          const ws = await getAyahWords(data.ayah.ayah_id);
          if (!cancelled) setWords(ws);
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

  // Listen-aloud (1.0.8): speech belongs to the ayah on screen — stop it
  // when moving to another ayah, when the screen loses focus, and on
  // unmount, so a translation or tafsir section never keeps reading over
  // another screen.
  useEffect(() => {
    return () => {
      stopSpeech();
      stopNarration();
    };
  }, [surahNumber, ayahNumber]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        stopSpeech();
        stopNarration();
      };
    }, [])
  );

  // focusTafsir (daily-ayah chips): once the detail has loaded, scroll
  // the tafsir area into view (best-effort — the tab is already set by
  // the tafsirLang param effect above).
  useEffect(() => {
    if (!params.focusTafsir || !detail || focusHandledRef.current) return;
    // The tab row's onLayout can land after the detail renders (cold
    // start / deep link), so retry briefly until its position is known
    // instead of scrolling once on a fixed timer.
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (tafsirYRef.current > 0) {
        focusHandledRef.current = true;
        scrollRef.current?.scrollTo({
          y: Math.max(0, tafsirYRef.current - 16),
          animated: true,
        });
        clearInterval(interval);
      } else if (attempts >= 10) {
        focusHandledRef.current = true;
        scrollRef.current?.scrollToEnd({ animated: true });
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const toggleWbw = async () => {
    const next = !showWbw;
    setShowWbw(next);
    await AsyncStorage.setItem('show_word_by_word', next ? 'true' : 'false');
  };

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

  // Tafsir tabs: only the selected language's tafsir renders. When this
  // verse has just one of the two, that one shows regardless of the tab
  // (and the tab row only offers languages that exist for this verse).
  const hasMajma = !!detail?.majmaTafsir;
  const hasNamoona = !!detail?.namoonaTafsir;
  const effectiveTafsirLang: 'ar' | 'ur' =
    tafsirLang === 'ar'
      ? hasMajma
        ? 'ar'
        : 'ur'
      : hasNamoona
        ? 'ur'
        : 'ar';
  const showMajma = hasMajma && effectiveTafsirLang === 'ar';
  const showNamoona = hasNamoona && effectiveTafsirLang === 'ur';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.goldBar, { backgroundColor: theme.bronze }]} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: theme.goldText }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.goldText }]}>AYAH</Text>
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
        <ScrollView ref={scrollRef} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.body}>
          <View style={styles.refRow}>
            <Text style={[styles.surahLabel, { color: theme.textSecondary }]}>
              {surah?.name_english}
              {surah?.revelation_type ? ` · ${surah.revelation_type}` : ''}
            </Text>
            <TouchableOpacity onPress={toggleBookmark}>
              <Text style={{ fontSize: 18 }}>{bookmarked ? '🔖' : '🏷️'}</Text>
            </TouchableOpacity>
          </View>

          {words.length > 0 && (
            <TouchableOpacity
              onPress={toggleWbw}
              style={[styles.wbwToggle, { borderColor: theme.gold }]}
            >
              <Text style={[styles.wbwToggleText, { color: theme.goldText }]}>
                WORD BY WORD {showWbw ? '▾ ON' : '▸ OFF'}
              </Text>
            </TouchableOpacity>
          )}

          {showWbw && words.length > 0 ? (
            <WordByWord words={words} />
          ) : (
            <Text style={[styles.arabic, { color: theme.text }]}>{ayah.arabic_uthmani}</Text>
          )}

          {/* Transliteration — phonetic transcription of the Arabic (not a
              translation). Hidden entirely until the loader populates it. */}
          {showTransliteration && ayah.transliteration ? (
            <>
              <Text style={[styles.transliterationLabel, { color: theme.bronze }]}>TRANSLITERATION</Text>
              <Text style={[styles.transliteration, { color: theme.textSecondary }]}>{ayah.transliteration}</Text>
            </>
          ) : null}

          <View style={styles.ornament}>
            <View style={[styles.ornamentLine, { backgroundColor: theme.border }]} />
            <Text style={{ fontSize: 9, color: theme.gold }}>◆</Text>
            <View style={[styles.ornamentLine, { backgroundColor: theme.border }]} />
          </View>

          <Text style={[styles.ref, { color: theme.goldText }]}>{ref}</Text>

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
              <View
                style={[
                  styles.listenRow,
                  isRtlLang(t.languageCode) && styles.listenRowRtl,
                ]}
              >
                <ListenButton
                  sectionId={`ayah-${surahNumber}-${ayahNumber}-translation-${t.id}`}
                  text={t.text}
                  language={t.languageCode}
                  narration={
                    typeof t.translationId === 'number' && detail.ayah?.ayah_id
                      ? {
                          type: 'translation',
                          translationId: t.translationId,
                          ayahId: detail.ayah.ayah_id,
                          lang: t.languageCode,
                        }
                      : undefined
                  }
                />
              </View>
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

          {/* Tafsir language tabs (1.0.8): Arabic = Majma' al-Bayan,
              Urdu = Tafsir-e-Namoona. Only tabs for tafsirs that exist
              for THIS verse are shown; only the selected language's
              section renders below. No English tab — there is no
              English tafsir in the app. */}
          {(hasMajma || hasNamoona) && (
            <View
              onLayout={(e) => {
                tafsirYRef.current = e.nativeEvent.layout.y;
              }}
              style={styles.tafsirTabRow}
            >
              {hasMajma && (
                <TouchableOpacity
                  onPress={() => chooseTafsirLang('ar')}
                  activeOpacity={0.7}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: effectiveTafsirLang === 'ar' }}
                  style={[
                    styles.tafsirTab,
                    {
                      borderColor: effectiveTafsirLang === 'ar' ? theme.gold : theme.border,
                      backgroundColor:
                        effectiveTafsirLang === 'ar' ? theme.gold + '2E' : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.tafsirTabText, { color: theme.goldText }]}>
                    العربية · Arabic
                  </Text>
                </TouchableOpacity>
              )}
              {hasNamoona && (
                <TouchableOpacity
                  onPress={() => chooseTafsirLang('ur')}
                  activeOpacity={0.7}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: effectiveTafsirLang === 'ur' }}
                  style={[
                    styles.tafsirTab,
                    {
                      borderColor: effectiveTafsirLang === 'ur' ? theme.gold : theme.border,
                      backgroundColor:
                        effectiveTafsirLang === 'ur' ? theme.gold + '2E' : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.tafsirTabText, { color: theme.goldText }]}>
                    اردو · Urdu
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Majma' al-Bayan (al-Tabarsi) — Arabic tafsir via OpenITI,
              CC BY-NC-SA 4.0. The block whose verse range contains this
              ayah, with the range stated. Kept separate from the
              Reflection entries above and from the translations: it is
              the original-language scholarly commentary, so it shows
              regardless of the selected translation language. Renders
              only once the Majma' rows are loaded. */}
          {showMajma && detail.majmaTafsir && (
            <View style={[styles.tafsirBlock, { borderLeftColor: theme.gold }]}>
              <View style={styles.majmaHeadingRow}>
                <Text style={[styles.majmaHeadingAr, { color: theme.goldText }]}>التفسير</Text>
                <Text style={[styles.tafsirLabel, { color: theme.textSecondary }]}>TAFSIR</Text>
                <View style={styles.headingListen}>
                  <ListenButton
                    sectionId={`ayah-${surahNumber}-${ayahNumber}-tafsir-majma`}
                    text={detail.majmaTafsir.text}
                    language="ar"
                    narration={{
                      type: 'tafsir',
                      slug: 'majma',
                      lang: 'ar',
                      surah: detail.majmaTafsir.surah,
                      start: detail.majmaTafsir.ayahFrom,
                      end: detail.majmaTafsir.ayahTo,
                    }}
                  />
                </View>
              </View>
              <Text style={[styles.majmaScholar, { color: theme.text }]}>
                الطبرسي — مجمع البيان
              </Text>
              <Text style={[styles.scholar, { color: theme.textSecondary }]}>
                {detail.majmaTafsir.ayahFrom === detail.majmaTafsir.ayahTo
                  ? `Verse ${detail.majmaTafsir.surah}:${detail.majmaTafsir.ayahFrom}`
                  : `Verses ${detail.majmaTafsir.surah}:${detail.majmaTafsir.ayahFrom}–${detail.majmaTafsir.ayahTo}`}
              </Text>
              <Text style={[styles.majmaText, { color: theme.text }]}>
                {detail.majmaTafsir.text}
              </Text>
              <Text style={[styles.majmaAttributionAr, { color: theme.textSecondary }]}>
                {MAJMA_ATTRIBUTION_AR}
              </Text>
              <Text style={[styles.majmaAttribution, { color: theme.textSecondary }]}>
                {MAJMA_ATTRIBUTION_EN}
              </Text>
            </View>
          )}

          {/* Tafsir-e-Namoona (Makarem Shirazi) — Urdu tafsir, included
              with permission (granted 2026-11-01), Fi Sabeelillah, for
              free non-commercial use. The block whose verse range
              contains this ayah, with the range stated — same block
              model as the Majma' section above. Renders only once the
              Namoona rows are loaded. The attribution line below is a
              condition of the permission and appears with the section
              every time it is shown. */}
          {showNamoona && detail.namoonaTafsir && (
            <View style={[styles.tafsirBlock, { borderLeftColor: theme.gold }]}>
              <View style={styles.majmaHeadingRow}>
                <Text style={[styles.namoonaHeadingUr, { color: theme.goldText }]}>اردو تفسیر</Text>
                <Text style={[styles.tafsirLabel, { color: theme.textSecondary }]}>TAFSIR-E-NAMOONA</Text>
                <View style={styles.headingListen}>
                  <ListenButton
                    sectionId={`ayah-${surahNumber}-${ayahNumber}-tafsir-namoona`}
                    text={detail.namoonaTafsir.text}
                    language="ur"
                    narration={{
                      type: 'tafsir',
                      slug: 'namoona',
                      lang: 'ur',
                      surah: detail.namoonaTafsir.surah,
                      start: detail.namoonaTafsir.ayahFrom,
                      end: detail.namoonaTafsir.ayahTo,
                    }}
                  />
                </View>
              </View>
              <Text style={[styles.namoonaScholar, { color: theme.text }]}>
                Makarem Shirazi — Tafsir-e-Namoona
              </Text>
              <Text style={[styles.scholar, { color: theme.textSecondary }]}>
                {detail.namoonaTafsir.ayahFrom === detail.namoonaTafsir.ayahTo
                  ? `Verse ${detail.namoonaTafsir.surah}:${detail.namoonaTafsir.ayahFrom}`
                  : `Verses ${detail.namoonaTafsir.surah}:${detail.namoonaTafsir.ayahFrom}–${detail.namoonaTafsir.ayahTo}`}
              </Text>
              <Text style={[styles.namoonaText, { color: theme.text }]}>
                {detail.namoonaTafsir.text}
              </Text>
              <Text style={[styles.majmaAttribution, { color: theme.textSecondary }]}>
                {NAMOONA_ATTRIBUTION}
              </Text>
            </View>
          )}


          {/* Personal note & tags (stored on this device only) */}
          <NoteTagsEditor
            key={`${surahNumber}_${ayahNumber}`}
            surah={surahNumber}
            ayah={ayahNumber}
            theme={theme}
          />

          <View style={[styles.nav, { borderTopColor: theme.border }]}>
            {ayahNumber > 1 ? (
              <TouchableOpacity
                onPress={() => router.replace(`/ayah/${surahNumber}/${ayahNumber - 1}` as any)}
              >
                <Text style={[styles.navText, { color: theme.goldText }]}>← Previous</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            {ayahCount > 0 && ayahNumber < ayahCount ? (
              <TouchableOpacity
                onPress={() => router.replace(`/ayah/${surahNumber}/${ayahNumber + 1}` as any)}
              >
                <Text style={[styles.navText, { color: theme.goldText }]}>Next →</Text>
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
  title: { fontFamily: 'Amiri_400Regular', fontSize: 11, letterSpacing: 3 },
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
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  arabic: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 30,
    lineHeight: 60,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 20,
  },
  wbwToggle: {
    alignSelf: 'center',
    borderWidth: 0.5,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  wbwToggleText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  transliterationLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 2,
  },
  transliteration: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 17,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 16,
    paddingHorizontal: 8,
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
  listenRow: { marginTop: 10, alignItems: 'flex-start' },
  listenRowRtl: { alignItems: 'flex-end' },
  headingListen: { marginLeft: 'auto', flexShrink: 1 },
  translation: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 30,
  },
  translationRtl: { textAlign: 'right', writingDirection: 'rtl', fontStyle: 'normal' },
  scholar: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  tafsirSection: { marginTop: 8, marginBottom: 8 },
  tafsirTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 14,
  },
  tafsirTab: {
    borderWidth: 0.5,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  tafsirTabText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  tafsirBlock: {
    borderLeftWidth: 2,
    paddingLeft: 14,
    marginBottom: 16,
  },
  tafsirLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tafsirText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
    lineHeight: 24,
  },
  majmaHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 2,
  },
  majmaHeadingAr: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 20,
  },
  majmaScholar: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  majmaText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 17,
    lineHeight: 34,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 8,
  },
  majmaAttributionAr: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 10,
  },
  majmaAttribution: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  namoonaHeadingUr: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 20,
  },
  namoonaScholar: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
  },
  namoonaText: {
    // Urdu renders in the app's single Arabic-script face (Amiri — the
    // same treatment as Urdu translation text: Amiri + RTL, no italics).
    fontFamily: 'Amiri_400Regular',
    fontSize: 17,
    lineHeight: 34,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 8,
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
