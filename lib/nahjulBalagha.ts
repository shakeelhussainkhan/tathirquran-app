import AsyncStorage from '@react-native-async-storage/async-storage';
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
 * Arabic (textAr) and Urdu (textUr) were added under the same rule
 * (quote-translations feature): Arabic verbatim from the same chapter's
 * per-saying posts on hadith.net (Ahlul Bayt DIL), where the Arabic is
 * printed interleaved with this same Ali Raza translation; Urdu verbatim
 * from Allama Mufti Jafar Hussain's translation as published by Markaz
 * Afkar-e-Islami (afkareislami.com), translation text only — his sharh
 * (commentary) is never included. Per-language provenance, alignment
 * method and curation notes live in the JSON "meta" block ("translations"
 * key). A saying whose Arabic or Urdu could not be verified verbatim
 * simply omits that field; the card falls back to the English.
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
  /** The saying in English, verbatim (attribution prefix rendered by the UI). */
  text: string;
  /** The saying in the original Arabic, verbatim from hadith.net (see JSON meta). Absent when not yet verified. */
  textAr?: string;
  /** The saying in Urdu (Mufti Jafar Hussain), verbatim (see JSON meta). Absent when not yet verified. */
  textUr?: string;
  /** Chapter URL the text was transcribed from (see JSON meta). */
  sourceUrl: string;
}

/** Languages the quote card can display. */
export type QuoteLanguage = 'en' | 'ar' | 'ur';

export const NAHJUL_BALAGHA_QUOTES: NahjulBalaghaQuote[] = quotesData.sayings;

/** Shown under every quote, per the Wave 2 brief. */
export function quoteAttribution(quote: NahjulBalaghaQuote): string {
  return `Nahjul Balagha, Saying ${quote.number} — Imam Ali ibn Abi Talib (AS)`;
}

/** Translator credit, shown wherever a quote displays (English). */
export const NAHJUL_BALAGHA_TRANSLATOR = 'Translation by Syed Ali Raza';

/** Translator credit for the Urdu text (Mufti Jafar Hussain). */
export const NAHJUL_BALAGHA_TRANSLATOR_UR =
  'Urdu translation by Allama Mufti Jafar Hussain';

/** Credit line for the Arabic text — the original words; no translator. */
export const NAHJUL_BALAGHA_ARABIC_CREDIT = 'Original Arabic text';

/** The credit line matching the language actually displayed. */
export function quoteCredit(lang: QuoteLanguage): string {
  if (lang === 'ur') return NAHJUL_BALAGHA_TRANSLATOR_UR;
  if (lang === 'ar') return NAHJUL_BALAGHA_ARABIC_CREDIT;
  return NAHJUL_BALAGHA_TRANSLATOR;
}

/**
 * The text to display for a language choice. Falls back to the English
 * when the saying has no verified text in the chosen language; the
 * returned `lang` is the language actually shown (drives the credit
 * line and RTL rendering), so a fallback never credits the wrong text.
 */
export function quoteText(
  quote: NahjulBalaghaQuote,
  lang: QuoteLanguage,
): { text: string; lang: QuoteLanguage } {
  if (lang === 'ar' && quote.textAr) return { text: quote.textAr, lang: 'ar' };
  if (lang === 'ur' && quote.textUr) return { text: quote.textUr, lang: 'ur' };
  return { text: quote.text, lang: 'en' };
}

/** AsyncStorage key for the quote card's language choice. */
export const QUOTE_LANGUAGE_STORAGE_KEY = 'nb_quote_language';

/** Read the persisted quote language. Never throws; defaults to English. */
export async function getQuoteLanguage(): Promise<QuoteLanguage> {
  try {
    const val = await AsyncStorage.getItem(QUOTE_LANGUAGE_STORAGE_KEY);
    if (val === 'ar' || val === 'ur' || val === 'en') return val;
  } catch {
    /* fall through to the default */
  }
  return 'en';
}

/** Persist the quote language choice under `nb_quote_language`. */
export async function setQuoteLanguage(lang: QuoteLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(QUOTE_LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* persistence is best-effort; the in-memory choice still applies */
  }
}

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
