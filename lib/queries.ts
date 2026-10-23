import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  OFFLINE_LAST_SYNCED_KEY,
  ensureOfflineData,
  isOfflineStale,
  localGetAyah,
  localGetAyahRange,
  localGetAyahWords,
  localGetDefaultTranslation,
  localGetJuzRanges,
  localGetLiveLanguages,
  localGetRangeTranslation,
  localGetRecentSchedule,
  localGetScheduleAyahId,
  localGetSurahs,
  localGetTafsir,
  type LocalJuzRange,
} from './offlineDb';

/**
 * All reads are local-first: they serve from the on-device SQLite store
 * (lib/offlineDb.ts) when it holds fresh data, fall back to Supabase when
 * local data is missing, and serve the local copy when the network fails.
 * When local data is stale (> 7 days) the network is tried first and a
 * background re-sync is kicked off.
 */

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0);
}

async function localFirst<T>(getLocal: () => Promise<T>, getRemote: () => Promise<T>): Promise<T> {
  let local: T | null = null;
  try {
    local = await getLocal();
  } catch {
    local = null;
  }
  const hasLocal = !isEmpty(local);

  const lastSyncedAt = await AsyncStorage.getItem(OFFLINE_LAST_SYNCED_KEY).catch(() => null);
  if (hasLocal && !isOfflineStale(lastSyncedAt)) {
    return local as T;
  }

  let remote: T | null = null;
  try {
    remote = await getRemote();
  } catch {
    remote = null;
  }
  if (!isEmpty(remote)) {
    if (!hasLocal || isOfflineStale(lastSyncedAt)) {
      // Fill / refresh the local store in the background; never block reads.
      void ensureOfflineData();
    }
    return remote as T;
  }

  if (hasLocal) return local as T;
  return (remote ?? local) as T;
}

export async function getTodayAyah() {
  const today = new Date().toISOString().split('T')[0];

  return localFirst(
    async () => {
      const ayahId = await localGetScheduleAyahId(today);
      if (ayahId === null) return null;
      return localGetAyah(ayahId);
    },
    async () => {
      const { data: schedule } = await supabase
        .from('daily_schedule')
        .select('ayah_id')
        .eq('schedule_date', today)
        .single();

      if (!schedule) return null;

      const { data: ayah } = await supabase
        .from('ayahs')
        .select('*, surahs(*)')
        .eq('ayah_id', schedule.ayah_id)
        .single();

      return ayah;
    },
  );
}

export async function getDefaultTranslation(ayahId: number, languageCode: string = 'en') {
  return localFirst(
    () => localGetDefaultTranslation(ayahId, languageCode),
    async () => {
      const { data: translation } = await supabase
        .from('translations')
        .select('translation_id')
        .eq('language_code', languageCode)
        .eq('is_default', true)
        .single();

      if (!translation) return null;

      const { data: ayahTranslation } = await supabase
        .from('ayah_translations')
        .select('text, translations(scholar_name, attribution_text)')
        .eq('ayah_id', ayahId)
        .eq('translation_id', translation.translation_id)
        .single();

      return ayahTranslation;
    },
  );
}

export async function getLiveLanguages() {
  return localFirst(
    () => localGetLiveLanguages(),
    async () => {
      const { data } = await supabase
        .from('languages')
        .select('*')
        .in('launch_status', ['live', 'beta'])
        .order('display_order');
      return data || [];
    },
  );
}

export async function getAllTafsirForAyah(ayahId: number, languageCode: string = 'en') {
  return localFirst(
    () => localGetTafsir(ayahId, languageCode),
    async () => {
      const { data } = await supabase
        .from('tafsir')
        .select('*')
        .eq('ayah_id', ayahId)
        .eq('language_code', languageCode)
        .order('scholar');
      return data || [];
    },
  );
}

/**
 * English surah names from the `surahs` table, in surah order, for
 * labelling Khatmah plan portions. Returns an array indexed by
 * surah - 1, or an empty array when the fetch fails / the table shape
 * is unexpected — callers fall back to the built-in name list in
 * lib/khatmah.ts. Names are read from the rows already in Supabase;
 * nothing is invented here.
 */
export async function getSurahNames(): Promise<string[]> {
  try {
    const { data } = await supabase.from('surahs').select('*');
    if (!data || data.length === 0) return [];
    const bySurah = new Map<number, string>();
    for (const row of data as Record<string, unknown>[]) {
      const num =
        typeof row.surah_number === 'number'
          ? row.surah_number
          : typeof row.id === 'number'
            ? row.id
            : typeof row.number === 'number'
              ? row.number
              : null;
      const name =
        typeof row.name_english === 'string'
          ? row.name_english
          : typeof row.name_simple === 'string'
            ? row.name_simple
            : typeof row.name === 'string'
              ? row.name
              : null;
      if (num !== null && name) bySurah.set(num, name);
    }
    if (bySurah.size === 0) return [];
    const names: string[] = [];
    for (let s = 1; s <= Math.max(...bySurah.keys()); s++) {
      const n = bySurah.get(s);
      if (!n) return []; // incomplete — let the caller use its fallback
      names.push(n);
    }
    return names;
  } catch {
    return [];
  }
}

export async function getRecentSchedule(limit = 30) {
  return localFirst<any[]>(
    () => localGetRecentSchedule(limit),
    async () => {
      const { data } = await supabase
        .from('daily_schedule')
        .select('schedule_date, ayah_id, ayahs(surah_number, ayah_number, arabic_uthmani, surahs(name_english, name_arabic))')
        .order('schedule_date', { ascending: false })
        .limit(limit);
      return data || [];
    },
  );
}

// ---------- Search ----------
// Mirrors searchAyahs in tathirquran-web/lib/queries.ts (the two repos
// re-implement the same queries independently — see HANDOVER §2).
// Searches ONLY existing Supabase data: ayah_translations.text across every
// translation already in the DB, plus ayahs.arabic_uthmani. No external
// content source is added.

export const SEARCH_PAGE_SIZE = 20;

// Supabase/PostgREST returns at most 1,000 rows per request — scan in batches.
const SEARCH_SCAN_BATCH = 1000;

// Escape LIKE/ILIKE wildcards so user input is matched literally.
function escapeIlike(term: string) {
  return term.replace(/[%_\\]/g, '\\$&');
}

async function collectMatchingAyahIds(
  makeQuery: (
    from: number,
    to: number,
    withCount: boolean
  ) => PromiseLike<{ data: { ayah_id: number }[] | null; count: number | null; error: any }>
) {
  const ids = new Set<number>();
  const first = await makeQuery(0, SEARCH_SCAN_BATCH - 1, true);
  if (first.error) throw first.error;
  (first.data || []).forEach((r) => ids.add(r.ayah_id));
  const total = first.count ?? ids.size;
  if (total > SEARCH_SCAN_BATCH) {
    const batches = [];
    for (let from = SEARCH_SCAN_BATCH; from < total; from += SEARCH_SCAN_BATCH) {
      batches.push(makeQuery(from, from + SEARCH_SCAN_BATCH - 1, false));
    }
    const rest = await Promise.all(batches);
    for (const batch of rest) {
      if (batch.error) throw batch.error;
      (batch.data || []).forEach((r) => ids.add(r.ayah_id));
    }
  }
  return ids;
}

export async function searchAyahs(rawQuery: string, page = 1) {
  const query = (rawQuery || '').trim();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const pattern = `%${escapeIlike(query)}%`;

  const [translationIds, arabicIds] = await Promise.all([
    collectMatchingAyahIds((from, to, withCount) =>
      supabase
        .from('ayah_translations')
        .select('ayah_id', withCount ? { count: 'exact' } : undefined)
        .ilike('text', pattern)
        .order('ayah_id')
        .order('id')
        .range(from, to)
    ),
    collectMatchingAyahIds((from, to, withCount) =>
      supabase
        .from('ayahs')
        .select('ayah_id', withCount ? { count: 'exact' } : undefined)
        .ilike('arabic_uthmani', pattern)
        .order('ayah_id')
        .range(from, to)
    ),
  ]);

  const sortedIds = [...new Set([...translationIds, ...arabicIds])].sort(
    (a, b) => a - b
  );
  const totalResults = sortedIds.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / SEARCH_PAGE_SIZE));
  const pageIds = sortedIds.slice(
    (safePage - 1) * SEARCH_PAGE_SIZE,
    safePage * SEARCH_PAGE_SIZE
  );

  if (pageIds.length === 0) {
    return {
      query,
      page: safePage,
      pageSize: SEARCH_PAGE_SIZE,
      totalResults,
      totalPages,
      results: [],
    };
  }

  const { data: ayahs, error: ayahError } = await supabase
    .from('ayahs')
    .select('*, surahs(*)')
    .in('ayah_id', pageIds);
  if (ayahError) throw ayahError;
  const ayahById = new Map((ayahs || []).map((a) => [a.ayah_id, a]));

  const { data: matchRows } = await supabase
    .from('ayah_translations')
    .select('*, translations(scholar_name, language_code)')
    .in('ayah_id', pageIds)
    .ilike('text', pattern)
    .order('ayah_id');
  const matchesByAyah = new Map();
  for (const row of matchRows || []) {
    const list = matchesByAyah.get(row.ayah_id) || [];
    if (list.length < 3) list.push(row);
    matchesByAyah.set(row.ayah_id, list);
  }

  // Fallback display translation (default English) for ayahs that matched
  // only in Arabic, so every result has readable context.
  const needsFallback = pageIds.filter((id) => !matchesByAyah.has(id));
  const fallbackByAyah = new Map();
  let fallbackScholar = null;
  let fallbackLanguage = null;
  if (needsFallback.length > 0) {
    const { data: def } = await supabase
      .from('translations')
      .select('translation_id, scholar_name, language_code')
      .eq('language_code', 'en')
      .eq('is_default', true)
      .single();
    if (def) {
      fallbackScholar = def.scholar_name;
      fallbackLanguage = def.language_code;
      const { data: rows } = await supabase
        .from('ayah_translations')
        .select('*')
        .in('ayah_id', needsFallback)
        .eq('translation_id', def.translation_id);
      (rows || []).forEach((r) => fallbackByAyah.set(r.ayah_id, r));
    }
  }

  const results = pageIds
    .map((id) => {
      const ayah = ayahById.get(id);
      if (!ayah) return null;
      const matches = matchesByAyah.get(id) || [];
      const fallback = fallbackByAyah.get(id);
      const firstMatch = matches[0];
      const matchedIn = [];
      if (arabicIds.has(id)) matchedIn.push('arabic');
      if (translationIds.has(id)) matchedIn.push('translation');
      return {
        ayahId: ayah.ayah_id,
        surahNumber: ayah.surah_number,
        ayahNumber: ayah.ayah_number,
        surahNameEnglish: ayah.surahs?.name_english ?? '',
        surahNameTransliterated: ayah.surahs?.name_transliterated ?? '',
        surahNameArabic: ayah.surahs?.name_arabic ?? '',
        arabicUthmani: ayah.arabic_uthmani,
        matchedIn,
        matches: matches.map((m: any) => ({
          text: m.text,
          scholarName: m.translations?.scholar_name ?? '',
          languageCode: m.translations?.language_code ?? '',
        })),
        translationText: firstMatch
          ? firstMatch.text
          : fallback
            ? fallback.text
            : null,
        translationScholar: firstMatch
          ? (firstMatch.translations?.scholar_name ?? null)
          : fallback
            ? fallbackScholar
            : null,
        translationLanguageCode: firstMatch
          ? (firstMatch.translations?.language_code ?? null)
          : fallback
            ? fallbackLanguage
            : null,
      };
    })
    .filter(Boolean);

  return {
    query,
    page: safePage,
    pageSize: SEARCH_PAGE_SIZE,
    totalResults,
    totalPages,
    results,
  };
}

// ---------- Word-by-word (lexical glosses) ----------

/**
 * One word of an ayah with its LEXICAL gloss (dictionary meaning of that
 * single word) and transliteration, from the ayah_words table (Quran.com
 * API v4 word data, loaded by tathirquran-web/scripts/load_ayah_words.js).
 * NOT tafsir/commentary and NOT a verse translation.
 */
export interface AyahWord {
  id: number;
  ayah_id: number;
  position: number;
  arabic_text: string;
  transliteration: string | null;
  translation_en: string | null;
}

function toAyahWord(r: any): AyahWord {
  return {
    id: r.id,
    ayah_id: r.ayah_id,
    position: r.position,
    arabic_text: r.arabic_text,
    transliteration: r.transliteration ?? null,
    translation_en: r.translation_en ?? null,
  };
}

/**
 * Word-by-word glosses for one ayah, local-first like the other reads.
 * Returns [] whenever no rows are available — including before migration
 * 011 / the loader have run (the Supabase query errors and is swallowed) —
 * so callers hide the word-by-word UI entirely. Never throws.
 */
export async function getAyahWords(ayahId: number): Promise<AyahWord[]> {
  try {
    return await localFirst<AyahWord[]>(
      async () => {
        const rows = await localGetAyahWords(ayahId);
        return rows.map(toAyahWord);
      },
      async () => {
        const { data, error } = await supabase
          .from('ayah_words')
          .select('*')
          .eq('ayah_id', ayahId)
          .order('position');
        if (error) return [];
        return ((data as any[]) || []).map(toAyahWord);
      },
    );
  } catch {
    return [];
  }
}

// ---------- Ayah detail (used by the /ayah/[surah]/[ayah] screen) ----------

export async function getAyahDetail(surahNumber: number, ayahNumber: number) {
  const { data: ayah } = await supabase
    .from('ayahs')
    .select('*, surahs(*)')
    .eq('surah_number', surahNumber)
    .eq('ayah_number', ayahNumber)
    .single();

  if (!ayah) return null;

  const { data: translationRows } = await supabase
    .from('ayah_translations')
    .select('id, text, translations(scholar_name, language_code, is_default)')
    .eq('ayah_id', ayah.ayah_id);

  const translations = ((translationRows as any[]) || [])
    .map((r) => ({
      id: r.id,
      text: r.text,
      scholarName: r.translations?.scholar_name ?? '',
      languageCode: r.translations?.language_code ?? '',
      isDefault: !!r.translations?.is_default,
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

  const tafsirEntries = await getAllTafsirForAyah(ayah.ayah_id, 'en');

  return { ayah, translations, tafsirEntries };
}

// ---------- Verse reader ranges (Mushaf / Juz / Khatmah portions) ----------
// Local-first like every read above: the offline store holds the full Quran
// text and every translation, so ranges are served on-device and only fall
// back to Supabase when the local store is empty.

/** All surah metadata rows, in surah order (Mushaf index). */
export async function getSurahList() {
  return localFirst<any[]>(
    () => localGetSurahs(),
    async () => {
      const { data } = await supabase.from('surahs').select('*').order('surah_number');
      return data || [];
    },
  );
}

/** Every ayah in an ayah_id range (inclusive), in Quran order. */
export async function getAyahRange(startAyahId: number, endAyahId: number) {
  return localFirst<any[]>(
    () => localGetAyahRange(startAyahId, endAyahId),
    async () => {
      const { data } = await supabase
        .from('ayahs')
        .select('*, surahs(*)')
        .gte('ayah_id', startAyahId)
        .lte('ayah_id', endAyahId)
        .order('ayah_id');
      return data || [];
    },
  );
}

export interface RangeTranslation {
  scholarName: string | null;
  /** ayah_id -> translation text, for the ayahs that have one. */
  texts: Record<number, string>;
}

/**
 * The default translation for `languageCode` across an ayah_id range —
 * the same translation the Today screen shows for that language.
 */
export async function getRangeTranslation(
  startAyahId: number,
  endAyahId: number,
  languageCode: string = 'en',
): Promise<RangeTranslation> {
  const result = await localFirst<RangeTranslation | null>(
    () => localGetRangeTranslation(startAyahId, endAyahId, languageCode),
    async () => {
      const { data: translation } = await supabase
        .from('translations')
        .select('translation_id, scholar_name')
        .eq('language_code', languageCode)
        .eq('is_default', true)
        .single();
      if (!translation) return null;

      // PostgREST caps responses at 1,000 rows — page through the range.
      const texts: Record<number, string> = {};
      const PAGE = 1000;
      for (let from = startAyahId; from <= endAyahId; from += PAGE) {
        const to = Math.min(endAyahId, from + PAGE - 1);
        const { data: rows } = await supabase
          .from('ayah_translations')
          .select('ayah_id, text')
          .eq('translation_id', translation.translation_id)
          .gte('ayah_id', from)
          .lte('ayah_id', to)
          .order('ayah_id');
        for (const r of (rows as any[]) || []) texts[r.ayah_id] = r.text;
        if (!rows || rows.length < to - from + 1) break;
      }
      return {
        scholarName: translation.scholar_name ?? null,
        texts,
      } as RangeTranslation;
    },
  );
  return result ?? { scholarName: null, texts: {} };
}

export type JuzRange = LocalJuzRange;

/**
 * Juz boundaries (start/end refs + counts) for the Mushaf Juz index.
 * Derived from the per-ayah juz_number data the app already syncs — no
 * boundary list is hardcoded here.
 */
export async function getJuzRanges(): Promise<JuzRange[]> {
  return localFirst<JuzRange[]>(
    () => localGetJuzRanges(),
    async () => {
      // Fallback only (the local store is the primary path): resolve each
      // juz's first/last ayah and count with small per-juz queries.
      const ranges: JuzRange[] = [];
      await Promise.all(
        Array.from({ length: 30 }, (_, i) => i + 1).map(async (juz) => {
          const base = () =>
            supabase
              .from('ayahs')
              .select('ayah_id, surah_number, ayah_number')
              .eq('juz_number', juz);
          const [first, last, counted] = await Promise.all([
            base().order('ayah_id', { ascending: true }).limit(1),
            base().order('ayah_id', { ascending: false }).limit(1),
            supabase
              .from('ayahs')
              .select('ayah_id', { count: 'exact' })
              .eq('juz_number', juz)
              .limit(1),
          ]);
          const f = (first.data as any[])?.[0];
          const l = (last.data as any[])?.[0];
          if (!f || !l) return;
          ranges.push({
            juz,
            startAyahId: f.ayah_id,
            endAyahId: l.ayah_id,
            startSurah: f.surah_number,
            startAyah: f.ayah_number,
            endSurah: l.surah_number,
            endAyah: l.ayah_number,
            ayahCount: counted.count ?? l.ayah_id - f.ayah_id + 1,
          });
        }),
      );
      return ranges.sort((a, b) => a.juz - b.juz);
    },
  );
}
