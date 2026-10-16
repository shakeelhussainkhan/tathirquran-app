import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useTheme } from '../lib/theme';
import type { AyahWord } from '../lib/queries';

/**
 * Word-by-word view for the ayah detail screen.
 *
 * The words are LEXICAL GLOSSES — dictionary meanings of individual Arabic
 * words (Quran.com API v4 word data in the ayah_words table). They are NOT
 * tafsir/commentary and NOT a translation of the verse; the note under the
 * strip says so on screen.
 *
 * Renders the Arabic as tappable words, a panel with the selected word's
 * transliteration + gloss, and a word-by-word strip (Arabic / transliteration
 * / gloss per row). Renders NOTHING when there are no words — callers also
 * hide the toggle in that case, so the feature is fully absent until
 * migration 011 + the loader have populated ayah_words.
 */
export default function WordByWord({ words }: { words: AyahWord[] }) {
  const theme = useTheme();
  const [selected, setSelected] = useState(0);

  if (!words || words.length === 0) return null;

  const ordered = [...words].sort((a, b) => a.position - b.position);
  const current = ordered[Math.min(selected, ordered.length - 1)];

  return (
    <View>
      {/* Tappable Arabic words, in reading order (right to left) */}
      <View style={styles.wordsWrap}>
        {ordered.map((w, i) => (
          <TouchableOpacity
            key={w.id ?? w.position}
            onPress={() => setSelected(i)}
            style={[
              styles.wordChip,
              i === selected && {
                backgroundColor: 'rgba(201,162,39,0.22)',
                borderBottomColor: theme.gold,
              },
            ]}
          >
            <Text style={[styles.wordText, { color: theme.text }]}>{w.arabic_text}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Selected-word panel */}
      {current && (
        <View style={[styles.panel, { borderColor: theme.border }]}>
          <Text style={[styles.panelArabic, { color: theme.text }]}>{current.arabic_text}</Text>
          {!!current.transliteration && (
            <Text style={[styles.panelTranslit, { color: theme.text }]}>{current.transliteration}</Text>
          )}
          {!!current.translation_en && (
            <Text style={[styles.panelGloss, { color: theme.text }]}>{current.translation_en}</Text>
          )}
        </View>
      )}

      {/* Word-by-word strip */}
      <View style={styles.strip}>
        <Text style={[styles.stripLabel, { color: theme.textSecondary }]}>WORD BY WORD</Text>
        {ordered.map((w, i) => (
          <TouchableOpacity
            key={w.id ?? w.position}
            onPress={() => setSelected(i)}
            style={[
              styles.stripRow,
              { borderBottomColor: theme.border },
              i === selected && { backgroundColor: 'rgba(201,162,39,0.10)' },
            ]}
          >
            <Text style={[styles.stripArabic, { color: theme.text }]}>{w.arabic_text}</Text>
            <Text style={[styles.stripTranslit, { color: theme.textSecondary }]}>
              {w.transliteration ?? ''}
            </Text>
            <Text style={[styles.stripGloss, { color: theme.text }]}>{w.translation_en ?? ''}</Text>
          </TouchableOpacity>
        ))}
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Word glosses are the lexical (dictionary) meanings of each word on
          its own — not a translation of the verse and not tafsir. Source:
          Quran.com word data.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wordsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  wordChip: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    borderRadius: 6,
  },
  wordText: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 30,
    lineHeight: 54,
  },
  panel: {
    borderWidth: 0.5,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 20,
  },
  panelArabic: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 26,
    lineHeight: 44,
    writingDirection: 'rtl',
  },
  panelTranslit: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
    fontStyle: 'italic',
    marginTop: 2,
  },
  panelGloss: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  strip: { marginBottom: 8 },
  stripLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
  },
  stripArabic: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 19,
    lineHeight: 30,
    flex: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  stripTranslit: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    fontStyle: 'italic',
    width: 95,
  },
  stripGloss: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    flex: 1.2,
  },
  note: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 10,
  },
});
