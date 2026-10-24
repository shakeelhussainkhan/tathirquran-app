import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';
import {
  quoteAttribution,
  NAHJUL_BALAGHA_TRANSLATOR,
  type NahjulBalaghaQuote,
} from '../lib/nahjulBalagha';

/**
 * Today's Nahjul Balagha quote card (suggestion #4), shown on the Today
 * screen below the verse. Visually distinct from the verse block: a
 * bordered, gold-tinted panel with its own label, the saying in italic,
 * and the full attribution + translator credit underneath (attribution is
 * part of the content licence — it renders wherever a quote displays).
 * Rendered only when a quote exists — no placeholder card.
 */
export default function NahjulBalaghaCard({ quote }: { quote: NahjulBalaghaQuote }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { borderColor: theme.border, backgroundColor: theme.gold + '0D' },
      ]}
    >
      <Text style={[styles.label, { color: theme.goldText }]}>From Nahjul Balagha</Text>
      <Text style={[styles.quote, { color: theme.text }]}>“{quote.text}”</Text>
      <Text style={[styles.attribution, { color: theme.bronze }]}>
        {quoteAttribution(quote)}
      </Text>
      <Text style={[styles.translator, { color: theme.textSecondary }]}>
        {NAHJUL_BALAGHA_TRANSLATOR}
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
  quote: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 23,
    textAlign: 'center',
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
