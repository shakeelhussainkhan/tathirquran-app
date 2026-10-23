import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { searchAyahs } from '../lib/queries';
import { Colors } from '../constants/colors';
import { useTheme } from '../lib/theme';

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

/** Returns a window of `text` centred on the first case-insensitive match. */
function snippetAround(text: string, query: string, radius = 110): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) {
    return text.length > radius * 2 ? `${text.slice(0, radius * 2)}…` : text;
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/** Renders text with every case-insensitive occurrence of `query` bolded. */
function Highlighted({ text, query, style }: { text: string; query: string; style: any }) {
  if (!query) return <Text style={style}>{text}</Text>;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (;;) {
    const idx = lower.indexOf(needle, cursor);
    if (idx === -1) break;
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <Text key={key++} style={{ fontWeight: '700', color: Colors.bronzeDark }}>
        {text.slice(idx, idx + query.length)}
      </Text>
    );
    cursor = idx + query.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <Text style={style}>{parts}</Text>;
}

export default function SearchScreen() {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const requestIdRef = useRef(0);

  // Debounce typed input: a new term resets to page 1.
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed === query) return;
    const t = setTimeout(() => setQuery(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input, query]);

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setTotalResults(0);
      setTotalPages(1);
      setPage(1);
      setError(null);
      setSearched(false);
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    searchAyahs(query, 1)
      .then((data) => {
        if (requestIdRef.current !== requestId) return;
        setResults(data.results);
        setTotalResults(data.totalResults);
        setTotalPages(data.totalPages);
        setPage(1);
        setSearched(true);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setResults([]);
        setError('Search failed. Please check your connection and try again.');
        setSearched(true);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [query]);

  const loadMore = () => {
    if (loading || loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    searchAyahs(query, nextPage)
      .then((data) => {
        if (requestIdRef.current !== requestId) return;
        setResults((prev) => [...prev, ...data.results]);
        setPage(nextPage);
        setTotalResults(data.totalResults);
        setTotalPages(data.totalPages);
      })
      .catch(() => {
        if (requestIdRef.current === requestId) {
          setError('Could not load more results. Please try again.');
        }
      })
      .finally(() => setLoadingMore(false));
  };

  const renderResult = ({ item }: { item: any }) => {
    const ref = `${item.surahNameTransliterated || item.surahNameEnglish} ${item.surahNumber}:${item.ayahNumber}`;
    const arabicMatched = item.matchedIn?.includes('arabic');
    return (
      <TouchableOpacity
        style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgCard }]}
        onPress={() => router.push(`/ayah/${item.surahNumber}/${item.ayahNumber}` as any)}
      >
        <Text style={[styles.ref, { color: theme.gold }]}>
          {ref}
          {item.surahNameEnglish ? ` · ${item.surahNameEnglish}` : ''}
        </Text>
        {arabicMatched ? (
          <Highlighted
            text={snippetAround(item.arabicUthmani, query, 60)}
            query={query}
            style={[styles.arabic, { color: theme.text }]}
          />
        ) : (
          <Text style={[styles.arabic, { color: theme.text }]} numberOfLines={2}>
            {item.arabicUthmani}
          </Text>
        )}
        {item.matches && item.matches.length > 0 ? (
          item.matches.map((m: any, i: number) => (
            <View key={i} style={{ marginTop: 8 }}>
              <Highlighted
                text={snippetAround(m.text, query)}
                query={query}
                style={[
                  styles.translation,
                  { color: theme.textSecondary },
                  (m.languageCode === 'fa' || m.languageCode === 'ur') && styles.translationRtl,
                ]}
              />
              <Text style={[styles.scholar, { color: theme.textSecondary }]}>
                {m.scholarName} · {m.languageCode}
              </Text>
            </View>
          ))
        ) : item.translationText ? (
          <View style={{ marginTop: 8 }}>
            <Text style={[styles.translation, { color: theme.textSecondary }]} numberOfLines={4}>
              {item.translationText}
            </Text>
            {item.translationScholar ? (
              <Text style={[styles.scholar, { color: theme.textSecondary }]}>
                {item.translationScholar}
                {item.translationLanguageCode ? ` · ${item.translationLanguageCode}` : ''}
              </Text>
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={[styles.goldBar, { backgroundColor: theme.bronze }]} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={{ width: 60 }} />
        <Text style={[styles.title, { color: theme.gold }]}>SEARCH</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchBoxWrap}>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgCard }]}
          value={input}
          onChangeText={setInput}
          placeholder="Search the Quran — a word, a phrase, or Arabic…"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Searches the Arabic text and every translation (English, Persian and
          Urdu). Arabic is matched exactly as written in the Uthmani script,
          including its diacritics.
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.bronze} />
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>Searching…</Text>
        </View>
      ) : error && results.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>{error}</Text>
        </View>
      ) : query.length < MIN_QUERY_LENGTH ? (
        <View style={styles.center}>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Type at least {MIN_QUERY_LENGTH} characters — for example
            “mercy”, “patience”, or an Arabic word — and results will appear
            as you type.
          </Text>
        </View>
      ) : searched && results.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            No results for “{query}”
          </Text>
          <Text style={[styles.centerText, { color: theme.textSecondary }]}>
            Check the spelling, try a shorter phrase, or search the Arabic
            text exactly as it appears in the Uthmani script.
          </Text>
        </View>
      ) : (
        <FlatList
          contentInsetAdjustmentBehavior="never"
          data={results}
          keyExtractor={(item) => String(item.ayahId)}
          renderItem={renderResult}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <Text style={[styles.count, { color: theme.textSecondary }]}>
              {totalResults} {totalResults === 1 ? 'verse' : 'verses'} found
              for “{query}”
            </Text>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color={Colors.bronze} />
              </View>
            ) : error ? (
              <Text style={[styles.centerText, { color: theme.textSecondary, paddingVertical: 12 }]}>
                {error}
              </Text>
            ) : page < totalPages ? (
              <Text style={[styles.centerText, { color: theme.textSecondary, paddingVertical: 12 }]}>
                Showing {results.length} of {totalResults} — scroll for more
              </Text>
            ) : null
          }
        />
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
  title: { fontFamily: 'Amiri_400Regular', fontSize: 10, letterSpacing: 3 },
  searchBoxWrap: { padding: 16, paddingBottom: 8 },
  input: {
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 0.5,
    borderRadius: 4,
  },
  hint: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  list: { padding: 16, paddingTop: 4, gap: 12 },
  count: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  card: {
    borderWidth: 0.5,
    borderRadius: 4,
    padding: 16,
  },
  ref: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  arabic: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 20,
    lineHeight: 34,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  translation: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 21,
  },
  translationRtl: { textAlign: 'right', writingDirection: 'rtl' },
  scholar: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 3,
  },
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
  emptyTitle: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 17,
    textAlign: 'center',
  },
});
