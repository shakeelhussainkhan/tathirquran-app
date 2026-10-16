import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRecentSchedule } from '../lib/queries';
import { getAllNoteEntries, type AyahNotesEntry } from '../lib/notes';
import NoteTagsEditor from '../components/NoteTagsEditor';
import { Colors } from '../constants/colors';
import { useTheme } from '../lib/theme';

interface Bookmark {
  key: string;
  surah: number;
  ayah: number;
  surahName: string;
  arabic: string;
  translation: string;
  date: string;
}

export default function ArchiveScreen() {
  const theme = useTheme();
  const [schedule, setSchedule] = useState<any[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'archive' | 'bookmarks' | 'notes'>('archive');
  const [noteEntries, setNoteEntries] = useState<AyahNotesEntry[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    getRecentSchedule(60).then(data => { setSchedule(data); setLoading(false); });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBookmarks();
      loadNotes();
    }, [])
  );

  const loadNotes = async () => {
    setNoteEntries(await getAllNoteEntries());
  };

  const notesWithText = noteEntries.filter(e => e.note.trim().length > 0);

  // Surah name / Arabic for a noted ayah, when we already have it locally
  // (from a bookmark or from the loaded archive schedule) — no extra fetch.
  const enrichNote = (e: AyahNotesEntry) => {
    const bm = bookmarks.find(b => b.surah === e.surah && b.ayah === e.ayah);
    if (bm) return { surahName: bm.surahName, arabic: bm.arabic };
    const s = schedule.find((it: any) => it.ayahs?.surah_number === e.surah && it.ayahs?.ayah_number === e.ayah);
    if (s) return { surahName: s.ayahs?.surahs?.name_english as string | undefined, arabic: s.ayahs?.arabic_uthmani as string | undefined };
    return { surahName: undefined, arabic: undefined };
  };

  const loadBookmarks = async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const bmKeys = (allKeys as string[]).filter((k: string) => k.startsWith('bookmark_'));
      if (bmKeys.length === 0) { setBookmarks([]); return; }
      const bms: Bookmark[] = [];
      for (const k of bmKeys) {
        const v = await AsyncStorage.getItem(k);
        if (v) bms.push({ key: k, ...JSON.parse(v) });
      }
      bms.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setBookmarks(bms);
    } catch {
      setBookmarks([]);
    }
  };

  const removeBookmark = async (key: string) => {
    await AsyncStorage.removeItem(key);
    setBookmarks(prev => prev.filter(b => b.key !== key));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.goldBar, { backgroundColor: theme.bronze }]} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: theme.gold }]}>← Today</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.gold }]}>ARCHIVE</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tab toggle */}
      <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'archive' && [styles.tabBtnActive, { borderBottomColor: theme.gold }]]}
          onPress={() => setTab('archive')}
        >
          <Text style={[styles.tabBtnText, { color: tab === 'archive' ? theme.gold : theme.textSecondary }]}>
            ARCHIVE
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'bookmarks' && [styles.tabBtnActive, { borderBottomColor: theme.gold }]]}
          onPress={() => setTab('bookmarks')}
        >
          <Text style={[styles.tabBtnText, { color: tab === 'bookmarks' ? theme.gold : theme.textSecondary }]}>
            BOOKMARKS {bookmarks.length > 0 ? `(${bookmarks.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'notes' && [styles.tabBtnActive, { borderBottomColor: theme.gold }]]}
          onPress={() => setTab('notes')}
        >
          <Text style={[styles.tabBtnText, { color: tab === 'notes' ? theme.gold : theme.textSecondary }]}>
            MY NOTES {notesWithText.length > 0 ? `(${notesWithText.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'archive' ? (
        loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Colors.bronze} />
          </View>
        ) : (
          <ScrollView>
            {schedule.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.row, { borderBottomColor: theme.border }]}
                onPress={() => router.push(`/ayah/${item.ayahs?.surah_number}/${item.ayahs?.ayah_number}` as any)}
              >
                <Text style={[styles.rowDate, { color: theme.textSecondary }]}>{item.schedule_date}</Text>
                <Text style={[styles.rowSurah, { color: theme.gold }]}>
                  {item.ayahs?.surahs?.name_english} {item.ayahs?.surah_number}:{item.ayahs?.ayah_number}
                </Text>
                <Text style={[styles.rowArabic, { color: theme.text }]} numberOfLines={1}>
                  {item.ayahs?.arabic_uthmani}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )
      ) : tab === 'bookmarks' ? (
        <ScrollView>
          {bookmarks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No bookmarks yet.{'\n'}Tap 🔖 on the Today screen to save a verse.
              </Text>
            </View>
          ) : (
            bookmarks.map(bm => {
              const entry = noteEntries.find(e => e.surah === bm.surah && e.ayah === bm.ayah);
              const expanded = expandedKey === bm.key;
              return (
                <View key={bm.key} style={{ borderBottomWidth: 0.5, borderBottomColor: theme.border }}>
                  <View style={[styles.row, { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowSurah, { color: theme.gold }]}>
                        {bm.surahName} {bm.surah}:{bm.ayah}
                      </Text>
                      <Text style={[styles.rowArabic, { color: theme.text }]} numberOfLines={1}>
                        {bm.arabic}
                      </Text>
                      {bm.translation ? (
                        <Text style={[styles.bmTranslation, { color: theme.textSecondary }]} numberOfLines={2}>
                          {bm.translation}
                        </Text>
                      ) : null}
                      {entry && (entry.note || entry.tags.length > 0) ? (
                        <Text style={[styles.bmTranslation, { color: theme.gold }]} numberOfLines={2}>
                          ✎ {entry.note ? entry.note : entry.tags.map(t => `#${t}`).join(' ')}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => setExpandedKey(expanded ? null : bm.key)}
                      style={styles.removeBtn}
                    >
                      <Text style={{ color: theme.bronze, fontSize: 13 }}>✎</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeBookmark(bm.key)} style={styles.removeBtn}>
                      <Text style={{ color: theme.textSecondary, fontSize: 16 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                  {expanded && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                      <NoteTagsEditor surah={bm.surah} ayah={bm.ayah} theme={theme} onChanged={loadNotes} />
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView>
          {noteEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No notes yet.{'\n'}Open the Today screen and write a note on today's ayah — it stays on this device only.
              </Text>
            </View>
          ) : (
            noteEntries.map(e => {
              const { surahName, arabic } = enrichNote(e);
              const rowKey = `note_${e.surah}_${e.ayah}`;
              const expanded = expandedKey === rowKey;
              return (
                <View key={rowKey} style={{ borderBottomWidth: 0.5, borderBottomColor: theme.border }}>
                  <TouchableOpacity
                    style={[styles.row, { borderBottomWidth: 0 }]}
                    onPress={() => setExpandedKey(expanded ? null : rowKey)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowSurah, { color: theme.gold }]}>
                        {surahName ? `${surahName} ` : `Surah `}{e.surah}:{e.ayah}
                      </Text>
                      {arabic ? (
                        <Text style={[styles.rowArabic, { color: theme.text }]} numberOfLines={1}>
                          {arabic}
                        </Text>
                      ) : null}
                      {e.note ? (
                        <Text style={[styles.bmTranslation, { color: theme.text }]} numberOfLines={3}>
                          {e.note}
                        </Text>
                      ) : null}
                      {e.tags.length > 0 && (
                        <View style={styles.tagRow}>
                          {e.tags.map(t => (
                            <View key={t} style={[styles.tagChip, { borderColor: theme.border }]}>
                              <Text style={[styles.tagChipText, { color: theme.textSecondary }]}>{t}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <Text style={{ color: theme.bronze, fontSize: 13, padding: 8 }}>✎</Text>
                  </TouchableOpacity>
                  {expanded && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                      <NoteTagsEditor surah={e.surah} ayah={e.ayah} theme={theme} onChanged={loadNotes} />
                    </View>
                  )}
                </View>
              );
            })
          )}
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
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {},
  tabBtnText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 9,
    letterSpacing: 2,
  },
  row: { padding: 16, borderBottomWidth: 0.5, flexDirection: 'row', alignItems: 'center' },
  rowDate: { fontFamily: 'Amiri_400Regular', fontSize: 11, letterSpacing: 0.5, marginBottom: 3 },
  rowSurah: { fontFamily: 'Amiri_400Regular', fontSize: 13, letterSpacing: 0.5, marginBottom: 3 },
  rowArabic: { fontFamily: 'Amiri_700Bold', fontSize: 20, textAlign: 'right', writingDirection: 'rtl' },
  bmTranslation: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 4,
  },
  removeBtn: {
    padding: 8,
    marginLeft: 8,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tagChip: { borderWidth: 0.5, borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8 },
  tagChipText: { fontFamily: 'Amiri_400Regular', fontSize: 11 },
  emptyState: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 24,
  },
});
