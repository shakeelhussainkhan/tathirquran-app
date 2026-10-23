/**
 * Surah-name search (v1.0.4) — lets the Search screen find a surah by the
 * name a reader actually types, not only by verse text.
 *
 * Why: user feedback (Arsheen, via the 1.0.3 release) — typing
 * "Surah at tahreem" into Search returned "No results", because Search
 * only scanned verse text. Readers think in surah names, so the screen
 * now offers a SURAHS section above the verse results.
 *
 * Everything here is derived from the surah names the app already holds
 * (the `surahs` table via lib/queries.ts getSurahList: number, English
 * name, transliterated name, ayah count). No name, alias or spelling is
 * invented: matching works by normalizing BOTH the query and each stored
 * name the same way and comparing the results.
 *
 * Normalization handles how real users type:
 *   - an optional "surah / sura / surat" prefix ("Surah at tahreem")
 *   - case, hyphens and apostrophes ("at-tahrim", "Al-Jumu'ah")
 *   - the assimilated definite article (al- / at- / an- / ar- / ash- …),
 *     so "tahrim" and "at-tahrim" land on the same surah
 *   - common transliteration vowel variance: long vowels are folded
 *     (aa → a, ee → i, oo → u), so "tahreem" = "tahrim",
 *     "yaseen" = "yasin", "noor" = "nur", whichever spelling the stored
 *     name or the user happens to use
 *   - a bare integer 1–114 is the surah number ("66" → At-Tahrim)
 *
 * False-positive discipline: a query only matches on a whole normalized
 * name, a whole name token, a name prefix of 3+ characters, or the surah
 * number. Ordinary words that occur inside verse text ("mercy",
 * "patience") and bare fragments ("al") match nothing.
 *
 * This module is pure (no imports) so it can be exercised directly by a
 * node harness — see the v1.0.4 build notes.
 */

export interface SurahMatchEntry {
  number: number;
  /** Display name (the surahs table's name_english). */
  nameEnglish: string;
  /** The surahs table's name_transliterated, when present. */
  nameTransliterated: string | null;
  nameArabic: string | null;
  ayahCount: number | null;
}

/** Map raw getSurahList rows (surahs table shape) to match entries. */
export function entriesFromSurahRows(rows: any[] | null | undefined): SurahMatchEntry[] {
  if (!rows) return [];
  const entries: SurahMatchEntry[] = [];
  for (const r of rows as any[]) {
    const number = typeof r?.surah_number === 'number' ? r.surah_number : Number(r?.surah_number);
    if (!Number.isFinite(number) || number < 1 || number > 114) continue;
    entries.push({
      number,
      nameEnglish: typeof r?.name_english === 'string' ? r.name_english : `Surah ${number}`,
      nameTransliterated:
        typeof r?.name_transliterated === 'string' ? r.name_transliterated : null,
      nameArabic: typeof r?.name_arabic === 'string' ? r.name_arabic : null,
      ayahCount: typeof r?.ayah_count === 'number' ? r.ayah_count : null,
    });
  }
  return entries.sort((a, b) => a.number - b.number);
}

/** Words that may precede a surah name in a query and carry no meaning. */
const PREFIX_WORDS = new Set(['surah', 'sura', 'surat', 'sourah', 'surahs']);

/**
 * Assimilated forms of the Arabic definite article as they appear at the
 * start of transliterated surah names (Al-, At-, An-, Ar-, Ash-, Az-,
 * Ad-, Adh-, Ath-, As-, plus El-/Il- spellings). Only ever stripped as a
 * name's FIRST token, and only when a further token follows.
 */
const ARTICLE_TOKENS = new Set([
  'al', 'el', 'il',
  'at', 'an', 'ar', 'as', 'az', 'ad', 'adh', 'ash', 'ath',
]);

/** Lowercase, drop diacritics/apostrophes, punctuation → single spaces. */
function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritic marks
    .replace(/[''`ʼ‘’]/g, '') // apostrophes vanish: An'am → anam, 'Alaq → alaq
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Fold long-vowel spellings so tahreem/tahrim, yaseen/yasin, noor/nur agree. */
function foldLongVowels(s: string): string {
  return s.replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u');
}

function nameTokens(raw: string): string[] {
  const norm = foldLongVowels(normalizeName(raw));
  return norm ? norm.split(' ') : [];
}

/** Tokens with a leading article token removed (when anything follows it). */
function coreTokens(tokens: string[]): string[] {
  if (tokens.length >= 2 && ARTICLE_TOKENS.has(tokens[0])) return tokens.slice(1);
  return tokens;
}

interface NameForms {
  joined: string; // full name, tokens joined with spaces
  core: string; // article-stripped name, tokens joined with spaces
  squashed: string; // full name, spaces removed
  coreSquashed: string; // article-stripped name, spaces removed
  tokenSet: Set<string>; // article-stripped tokens
}

function formsForName(raw: string): NameForms | null {
  const tokens = nameTokens(raw);
  if (tokens.length === 0) return null;
  const core = coreTokens(tokens);
  return {
    joined: tokens.join(' '),
    core: core.join(' '),
    squashed: tokens.join(''),
    coreSquashed: core.join(''),
    tokenSet: new Set(core),
  };
}

const MAX_SURAH_MATCHES = 6;

/**
 * Return the surahs whose name matches `query`, best matches first
 * (exact name → whole-token → prefix; surah number order within a tier).
 * Returns [] for empty/gibberish/verse-word queries.
 */
export function matchSurahs(query: string, entries: SurahMatchEntry[]): SurahMatchEntry[] {
  if (!entries || entries.length === 0) return [];
  let tokens = nameTokens(query ?? '');
  if (tokens.length === 0) return [];

  // Optional "surah" prefix word.
  if (tokens.length >= 2 && PREFIX_WORDS.has(tokens[0])) tokens = tokens.slice(1);
  if (tokens.length === 1 && PREFIX_WORDS.has(tokens[0])) return [];

  // A bare integer is a surah number.
  if (tokens.length === 1 && /^\d+$/.test(tokens[0])) {
    const n = parseInt(tokens[0], 10);
    if (n < 1 || n > 114) return [];
    const hit = entries.find((e) => e.number === n);
    return hit ? [hit] : [];
  }

  // A lone article fragment ("al") names nothing.
  if (tokens.length === 1 && ARTICLE_TOKENS.has(tokens[0])) return [];

  const qCore = coreTokens(tokens);
  const qJoined = tokens.join(' ');
  const qCoreJoined = qCore.join(' ');
  const qSquashed = tokens.join('');
  const qCoreSquashed = qCore.join('');

  const scored: { entry: SurahMatchEntry; tier: number }[] = [];
  for (const entry of entries) {
    const forms: NameForms[] = [];
    for (const raw of [entry.nameTransliterated, entry.nameEnglish]) {
      if (!raw) continue;
      const f = formsForName(raw);
      if (f && !forms.some((g) => g.joined === f.joined)) forms.push(f);
    }
    let best = Infinity;
    for (const f of forms) {
      // Tier 0 — the query IS the name (with or without its article).
      if (
        qJoined === f.joined ||
        qCoreJoined === f.core ||
        qJoined === f.core ||
        qSquashed === f.squashed ||
        qCoreSquashed === f.coreSquashed ||
        qSquashed === f.coreSquashed
      ) {
        best = 0;
        break;
      }
      // Tier 1 — every query token is a whole token of the name
      // ("imran" in Aal-e-Imran, "sin" in Ya-Sin, "mulk" in Al-Mulk).
      // Tokens of 1 character never count (the "e" in Aal-e-Imran).
      if (
        qCore.length > 0 &&
        qCore.every((t) => t.length >= 2 && f.tokenSet.has(t))
      ) {
        best = Math.min(best, 1);
        continue;
      }
      // Tier 2 — the query is a 3+ character prefix of the name
      // ("fatiha" → Al-Fatihah, "baqa" → Al-Baqarah).
      if (
        qCoreJoined.length >= 3 &&
        (f.core.startsWith(qCoreJoined) || f.coreSquashed.startsWith(qCoreSquashed))
      ) {
        best = Math.min(best, 2);
      }
    }
    if (best !== Infinity) scored.push({ entry, tier: best });
  }

  scored.sort((a, b) => a.tier - b.tier || a.entry.number - b.entry.number);
  return scored.slice(0, MAX_SURAH_MATCHES).map((s) => s.entry);
}
