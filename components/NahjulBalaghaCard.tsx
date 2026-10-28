import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import {
  quoteAttribution,
  quoteCredit,
  quoteText,
  getQuoteLanguage,
  setQuoteLanguage,
  type NahjulBalaghaQuote,
  type QuoteLanguage,
} from '../lib/nahjulBalagha';

/**
 * Today's Nahjul Balagha quote card (suggestion #4), shown on the Today
 * screen below the verse. Visually distinct from the verse block: a
 * bordered, gold-tinted panel with its own label, the saying, and the
 * full attribution + translator credit underneath (attribution is part
 * of the content licence — it renders wherever a quote displays).
 * Rendered only when a quote exists — no placeholder card.
 *
 * Language toggle (quote-translations feature): English (Ali Raza) /
 * Arabic (original) / Urdu (Mufti Jafar Hussain), all verbatim — see
 * lib/nahjulBalagha.ts and the JSON meta block for provenance. The
 * choice persists via AsyncStorage (`nb_quote_language`), the same
 * mechanism as the verse translation / reciter preferences. If a saying
 * has no verified text in the chosen language, the card falls back to
 * the English for that saying and the credit line follows the text
 * actually displayed (see quoteText). The iOS widget always shows the
 * English and is unaffected by this choice.
 */
const LANGUAGE_OPTIONS: { lang: QuoteLanguage; label: string }[] = [
  { lang: 'en', label: 'English' },
  { lang: 'ar', label: 'عربي' },
  { lang: 'ur', label: 'اردو' },
];

export default function NahjulBalaghaCard({ quote }: { quote: NahjulBalaghaQuote }) {
  const theme = useTheme();
  const [lang, setLang] = useState<QuoteLanguage>('en');

  useEffect(() => {
    let cancelled = false;
    getQuoteLanguage().then((saved) => {
      if (!cancelled) setLang(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (next: QuoteLanguage) => {
    setLang(next);
    void setQuoteLanguage(next);
  };

  const { text, lang: shownLang } = quoteText(quote, lang);
  const isRtl = shownLang !== 'en';

  return (
    <View
      style={[
        styles.card,
        { borderColor: theme.border, backgroundColor: theme.gold + '0D' },
      ]}
    >
      <Text style={[styles.label, { color: theme.goldText }]}>From Nahjul Balagha</Text>

      <View style={styles.toggleRow}>
        {LANGUAGE_OPTIONS.map(({ lang: optionLang, label }) => {
          const selected = optionLang === lang;
          return (
            <Pressable
              key={optionLang}
              onPress={() => choose(optionLang)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show quote in ${label}`}
              style={[
                styles.toggleChip,
                {
                  borderColor: selected ? theme.gold : theme.border,
                  backgroundColor: selected ? theme.gold + '2E' : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.toggleText,
                  { color: selected ? theme.text : theme.textSecondary },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={[
          styles.quote,
          { color: theme.text },
          isRtl && styles.quoteRtl,
        ]}
      >
        {isRtl ? text : `“${text}”`}
      </Text>
      <Text style={[styles.attribution, { color: theme.bronze }]}>
        {quoteAttribution(quote)}
      </Text>
      <Text style={[styles.translator, { color: theme.textSecondary }]}>
        {quoteCredit(shownLang)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 0.5,
    borderRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  toggleChip: {
    borderWidth: 0.5,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  toggleText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  quote: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 23,
    textAlign: 'center',
  },
  quoteRtl: {
    // Arabic script runs tall in Amiri (same headroom rule as the verse
    // translations): no italic slant, taller line height, right-aligned
    // RTL flow instead of the English centre alignment.
    fontStyle: 'normal',
    fontSize: 17,
    lineHeight: 34,
    textAlign: 'right',
    writingDirection: 'rtl',
    alignSelf: 'stretch',
  },
  attribution: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 10,
  },
  translator: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 2,
  },
});
