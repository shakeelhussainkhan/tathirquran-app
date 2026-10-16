import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  OFFLINE_LAST_SYNCED_KEY,
  ensureOfflineData,
  isOfflineStale,
  localGetAyah,
  localGetDefaultTranslation,
  localGetLiveLanguages,
  localGetRecentSchedule,
  localGetScheduleAyahId,
  localGetTafsir,
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
