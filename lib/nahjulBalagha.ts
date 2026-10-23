import quotesData from './nahjulBalaghaQuotes.json';

/**
 * Daily Nahjul Balagha quote (suggestion #4, v1.0.4 Wave 2).
 *
 * Content rule (Shakeel, standing): the sayings in nahjulBalaghaQuotes.json
 * are VERBATIM from a verified Shia source — al-islam.org's Nahjul Balagha,
 * Part 2 (Letters and Sayings), Sayings chapter, English translation by
 * Syed Ali Raza. The full provenance manifest (source, chapter URL,
 * translator, fetch + cross-check notes, curation rules) lives in the
 * JSON file's "meta" block. Never add sayings from memory or from another
 * translation; extend the JSON from the same source instead.
 *
 * The data is bundled (offline-first, like the rest of the app): no network
 * call, no Supabase row, so the quote is available in airplane mode and is
 * identical in the app and the iOS widget.
 *
 * Daily selection is deterministic by date and aligned with the ayah of
 * the day: lib/queries.ts getTodayAyah() keys the daily schedule on the
 * UTC date (new Date().toISOString().slice(0, 10)); here the quote index is
 * (whole days since 1970-01-01 UTC) mod count. The widget mirrors this
 * exact rule in Swift (widget-src/TathirQuranWidget.swift), so both
 * surfaces show the same saying on the same day.
 */

export interface NahjulBalaghaQuote {
  /** Saying number in the al-islam.org chapter ("Hadith n. N"). */
  number: number;
  /** The saying, verbatim (attribution prefix rendered by the UI). */
  text: string;
  /** Chapter URL the text was transcribed from (see JSON meta). */
  sourceUrl: string;
}

export const NAHJUL_BALAGHA_QUOTES: NahjulBalaghaQuote[] = quotesData.sayings;

/** Shown under every quote, per the Wave 2 brief. */
export function quoteAttribution(quote: NahjulBalaghaQuote): string {
  return `Nahjul Balagha, Saying ${quote.number} — Imam Ali ibn Abi Talib (AS)`;
}

/** Translator credit, shown wherever a quote displays. */
export const NAHJUL_BALAGHA_TRANSLATOR = 'Translation by Syed Ali Raza';

/** Whole days since 1970-01-01 UTC for the given date (UTC calendar day). */
export function utcDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000,
  );
}

/** The deterministic quote for a date. Null only if the bundle is empty. */
export function getQuoteForDate(date: Date): NahjulBalaghaQuote | null {
  const count = NAHJUL_BALAGHA_QUOTES.length;
  if (count === 0) return null;
  const index = ((utcDayNumber(date) % count) + count) % count;
  return NAHJUL_BALAGHA_QUOTES[index];
}

/** Today's quote (same UTC-day basis as the ayah of the day). */
export function getTodayQuote(): NahjulBalaghaQuote | null {
  return getQuoteForDate(new Date());
}
