import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRecentSchedule } from '../lib/queries';
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
  const [tab, setTab] = useState<'archive' | 'bookmarks'>('archive');

  useEffect(() => {
    getRecentSchedule(60).then(data => { setSchedule(data); setLoading(false); });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBookmarks();
    }, [])
  );

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
      ) : (
        <ScrollView>
          {bookmarks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No bookmarks yet.{'\n'}Tap 🔖 on the Today screen to save a verse.
              </Text>
            </View>
          ) : (
            bookmarks.map(bm => (
              <View key={bm.key} style={[styles.row, { borderBottomColor: theme.border }]}>
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
                </View>
                <TouchableOpacity onPress={() => removeBookmark(bm.key)} style={styles.removeBtn}>
                  <Text style={{ color: theme.textSecondary, fontSize: 16 }}>×</Text>
                </TouchableOpacity>
              </View>
            ))
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
