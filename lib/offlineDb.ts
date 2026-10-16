/**
 * Offline-first local store (expo-sqlite).
 *
 * On first launch (and on demand from Settings) the full Quran corpus that
 * already lives in Supabase is mirrored into an on-device SQLite database:
 *   - ayahs            (all 6,236 Arabic verses)
 *   - surahs           (needed to render ayah references offline)
 *   - translations     (metadata for every translation row in the DB)
 *   - ayah_translations (the text of every translation in the DB — the four
 *                        complete Shia translations: Shakir, Sarwar,
 *                        Ghomshei and Jawadi; placeholder translation rows
 *                        have no text rows in Supabase and sync as none)
 *   - daily_schedule   (date -> ayah_id for the whole published schedule)
 *   - languages        (language picker metadata)
 *   - tafsir           (the existing Reflection rows, exactly as stored)
 *
 * Content rule: this module ONLY mirrors rows that already exist in
 * Supabase. It never adds, substitutes or "completes" any translation or
 * tafsir content from any other source.
 *
 * lib/queries.ts reads from this store first and falls back to Supabase
 * when local data is missing or stale (see OFFLINE_STALE_MS). The older
 * last-verse AsyncStorage cache (cached_ayah / cached_date) in
 * app/index.tsx remains as a final fallback layer and is untouched.
 */
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const OFFLINE_LAST_SYNCED_KEY = 'offline_last_synced_at';

/** Local data older than this is treated as stale by lib/queries.ts. */
export const OFFLINE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

const DB_NAME = 'tathirquran-offline.db';
const PAGE_SIZE = 1000; // Supabase returns at most 1,000 rows per query.
const MAX_BIND_PARAMS = 900; // Stay safely under SQLite's bound-variable limit.

export interface OfflineSyncStatus {
  state: 'never' | 'ready' | 'syncing' | 'error';
  lastSyncedAt: string | null;
  ayahCount: number;
  translationTextCount: number;
  scheduleCount: number;
  error?: string;
}

export type SyncProgress = (stage: string, rowsFetched: number) => void;

// ---------------------------------------------------------------------------
// Database handle (lazily opened, failures degrade to "no local data")
// ---------------------------------------------------------------------------

let dbPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

export function getOfflineDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync(DB_NAME);
        await db.execAsync(SCHEMA_SQL);
        return db;
      } catch {
        return null;
      }
    })();
  }
  return dbPromise;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS surahs (
  surah_number INTEGER PRIMARY KEY,
  name_arabic TEXT NOT NULL,
  name_transliterated TEXT NOT NULL,
  name_english TEXT NOT NULL,
  revelation_type TEXT,
  ayah_count INTEGER NOT NULL,
  juz_start INTEGER
);
CREATE TABLE IF NOT EXISTS ayahs (
  ayah_id INTEGER PRIMARY KEY,
  surah_number INTEGER,
  ayah_number INTEGER NOT NULL,
  arabic_uthmani TEXT NOT NULL,
  transliteration TEXT,
  juz_number INTEGER,
  page_number INTEGER,
  hizb_number INTEGER
);
CREATE INDEX IF NOT EXISTS idx_offline_ayahs_surah ON ayahs(surah_number);
CREATE TABLE IF NOT EXISTS languages (
  language_code TEXT PRIMARY KEY,
  language_name TEXT NOT NULL,
  native_name TEXT NOT NULL,
  script TEXT NOT NULL,
  rtl INTEGER DEFAULT 0,
  font_family TEXT,
  launch_status TEXT DEFAULT 'pending',
  display_order INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS translations (
  translation_id INTEGER PRIMARY KEY,
  language_code TEXT,
  scholar_name TEXT NOT NULL,
  scholar_title TEXT,
  institution TEXT,
  school TEXT,
  is_verified_shia INTEGER DEFAULT 0,
  is_default INTEGER DEFAULT 0,
  is_placeholder INTEGER DEFAULT 0,
  placeholder_note TEXT,
  license_type TEXT,
  attribution_text TEXT,
  completeness_pct INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS ayah_translations (
  id INTEGER PRIMARY KEY,
  ayah_id INTEGER,
  translation_id INTEGER,
  text TEXT NOT NULL,
  verified_at TEXT,
  UNIQUE(ayah_id, translation_id)
);
CREATE INDEX IF NOT EXISTS idx_offline_at_ayah ON ayah_translations(ayah_id);
CREATE INDEX IF NOT EXISTS idx_offline_at_translation ON ayah_translations(translation_id);
CREATE TABLE IF NOT EXISTS daily_schedule (
  schedule_date TEXT PRIMARY KEY,
  ayah_id INTEGER,
  reason TEXT DEFAULT 'sequential',
  notes TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS tafsir (
  id INTEGER PRIMARY KEY,
  ayah_id INTEGER,
  scholar TEXT NOT NULL,
  language_code TEXT,
  text TEXT NOT NULL,
  source_book TEXT,
  volume TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_offline_tafsir_ayah ON tafsir(ayah_id);
`;

// ---------------------------------------------------------------------------
// Sync: Supabase -> SQLite
// ---------------------------------------------------------------------------

interface TableSpec {
  table: string;
  label: string;
  columns: string[];
  orderBy: string;
}

const TABLE_SPECS: TableSpec[] = [
  {
    table: 'surahs',
    label: 'Surahs',
    columns: ['surah_number', 'name_arabic', 'name_transliterated', 'name_english', 'revelation_type', 'ayah_count', 'juz_start'],
    orderBy: 'surah_number',
  },
  {
    table: 'ayahs',
    label: 'Quran text',
    columns: ['ayah_id', 'surah_number', 'ayah_number', 'arabic_uthmani', 'transliteration', 'juz_number', 'page_number', 'hizb_number'],
    orderBy: 'ayah_id',
  },
  {
    table: 'languages',
    label: 'Languages',
    columns: ['language_code', 'language_name', 'native_name', 'script', 'rtl', 'font_family', 'launch_status', 'display_order', 'created_at'],
    orderBy: 'language_code',
  },
  {
    table: 'translations',
    label: 'Translations',
    columns: ['translation_id', 'language_code', 'scholar_name', 'scholar_title', 'institution', 'school', 'is_verified_shia', 'is_default', 'is_placeholder', 'placeholder_note', 'license_type', 'attribution_text', 'completeness_pct', 'created_at'],
    orderBy: 'translation_id',
  },
  {
    table: 'ayah_translations',
    label: 'Translation texts',
    columns: ['id', 'ayah_id', 'translation_id', 'text', 'verified_at'],
    orderBy: 'id',
  },
  {
    table: 'daily_schedule',
    label: 'Daily schedule',
    columns: ['schedule_date', 'ayah_id', 'reason', 'notes', 'created_at'],
    orderBy: 'schedule_date',
  },
  {
    table: 'tafsir',
    label: 'Reflections',
    columns: ['id', 'ayah_id', 'scholar', 'language_code', 'text', 'source_book', 'volume', 'created_at'],
    orderBy: 'id',
  },
];

type Row = Record<string, unknown>;

function bindValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return String(value);
}

/** Fetch every row of a table from Supabase, paginating past the 1,000-row cap. */
async function fetchAllRows(spec: TableSpec, onProgress?: SyncProgress): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(spec.table)
      .select(spec.columns.join(','))
      .order(spec.orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${spec.table}: ${error.message}`);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    onProgress?.(spec.label, rows.length);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function insertRows(db: SQLite.SQLiteDatabase, spec: TableSpec, rows: Row[]): Promise<void> {
  const cols = spec.columns;
  const chunkSize = Math.max(1, Math.floor(MAX_BIND_PARAMS / cols.length));
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk
      .map(() => `(${cols.map(() => '?').join(',')})`)
      .join(',');
    const params: (string | number | null)[] = [];
    for (const row of chunk) {
      for (const col of cols) params.push(bindValue(row[col]));
    }
    await db.runAsync(
      `INSERT OR REPLACE INTO ${spec.table} (${cols.join(',')}) VALUES ${placeholders}`,
      params,
    );
  }
}

let syncInFlight: Promise<OfflineSyncStatus> | null = null;
let lastSyncError: string | null = null;

/**
 * Download the full corpus from Supabase into the local store.
 * Safe to call concurrently — concurrent callers share one in-flight sync.
 * With `force: false` (the first-launch path) it is a no-op when a previous
 * sync is still fresh.
 */
export function syncOfflineData(
  options: { force?: boolean; onProgress?: SyncProgress } = {},
): Promise<OfflineSyncStatus> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    try {
      if (!options.force) {
        const status = await getOfflineSyncStatus();
        // NB: status.state is 'syncing' while this very call is in flight,
        // so freshness is judged on the stored data + stamp, not the state.
        if (status.ayahCount > 0 && !isOfflineStale(status.lastSyncedAt)) {
          return { ...status, state: 'ready' };
        }
      }

      const db = await getOfflineDb();
      if (!db) throw new Error('Local database unavailable on this device.');

      // Fetch everything first; the local store is only replaced once all
      // data has arrived, so a failed sync never destroys a good copy.
      const fetched = new Map<string, Row[]>();
      for (const spec of TABLE_SPECS) {
        fetched.set(spec.table, await fetchAllRows(spec, options.onProgress));
      }

      const ayahCount = fetched.get('ayahs')?.length ?? 0;
      const translationTextCount = fetched.get('ayah_translations')?.length ?? 0;
      const scheduleCount = fetched.get('daily_schedule')?.length ?? 0;
      if (ayahCount === 0 || translationTextCount === 0 || scheduleCount === 0) {
        throw new Error('Sync returned incomplete data; keeping the previous offline copy.');
      }

      await db.withTransactionAsync(async () => {
        for (const spec of TABLE_SPECS) {
          await db.runAsync(`DELETE FROM ${spec.table}`);
          await insertRows(db, spec, fetched.get(spec.table) ?? []);
        }
      });

      const syncedAt = new Date().toISOString();
      await AsyncStorage.setItem(OFFLINE_LAST_SYNCED_KEY, syncedAt);
      lastSyncError = null;
      return {
        state: 'ready',
        lastSyncedAt: syncedAt,
        ayahCount,
        translationTextCount,
        scheduleCount,
      };
    } catch (e) {
      lastSyncError = e instanceof Error ? e.message : 'Offline sync failed.';
      const status = await getOfflineSyncStatus();
      return { ...status, state: status.ayahCount > 0 ? 'ready' : 'error', error: lastSyncError };
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

/** First-launch entry point: sync only if never synced or stale. */
export async function ensureOfflineData(): Promise<void> {
  try {
    await syncOfflineData({ force: false });
  } catch {
    // Offline-first must never block or crash app launch.
  }
}

export function isOfflineStale(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return true;
  const t = Date.parse(lastSyncedAt);
  if (Number.isNaN(t)) return true;
  return Date.now() - t > OFFLINE_STALE_MS;
}

export async function getOfflineSyncStatus(): Promise<OfflineSyncStatus> {
  const lastSyncedAt = await AsyncStorage.getItem(OFFLINE_LAST_SYNCED_KEY);
  const db = await getOfflineDb();
  if (!db) {
    return {
      state: lastSyncError ? 'error' : 'never',
      lastSyncedAt,
      ayahCount: 0,
      translationTextCount: 0,
      scheduleCount: 0,
      error: lastSyncError ?? undefined,
    };
  }
  try {
    const counts = await db.getFirstAsync<{
      ayahs: number;
      texts: number;
      schedule: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM ayahs) AS ayahs,
         (SELECT COUNT(*) FROM ayah_translations) AS texts,
         (SELECT COUNT(*) FROM daily_schedule) AS schedule`,
    );
    const ayahCount = counts?.ayahs ?? 0;
    return {
      state: syncInFlight ? 'syncing' : ayahCount > 0 ? 'ready' : lastSyncError ? 'error' : 'never',
      lastSyncedAt,
      ayahCount,
      translationTextCount: counts?.texts ?? 0,
      scheduleCount: counts?.schedule ?? 0,
      error: lastSyncError ?? undefined,
    };
  } catch {
    return {
      state: 'never',
      lastSyncedAt,
      ayahCount: 0,
      translationTextCount: 0,
      scheduleCount: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Local reads used by lib/queries.ts. Every helper returns null / [] when the
// local store is unavailable or has no matching row, so callers can fall
// back to the network.
// ---------------------------------------------------------------------------

export async function localGetScheduleAyahId(dateStr: string): Promise<number | null> {
  const db = await getOfflineDb();
  if (!db) return null;
  const row = await db.getFirstAsync<{ ayah_id: number }>(
    'SELECT ayah_id FROM daily_schedule WHERE schedule_date = ?',
    [dateStr],
  );
  return row?.ayah_id ?? null;
}

export async function localGetAyah(ayahId: number): Promise<Row | null> {
  const db = await getOfflineDb();
  if (!db) return null;
  const ayah = await db.getFirstAsync<Row>('SELECT * FROM ayahs WHERE ayah_id = ?', [ayahId]);
  if (!ayah) return null;
  const surah = await db.getFirstAsync<Row>(
    'SELECT * FROM surahs WHERE surah_number = ?',
    [ayah.surah_number as number],
  );
  return { ...ayah, surahs: surah ?? null };
}

export async function localGetDefaultTranslation(
  ayahId: number,
  languageCode: string,
): Promise<Row | null> {
  const db = await getOfflineDb();
  if (!db) return null;
  const translation = await db.getFirstAsync<Row>(
    'SELECT * FROM translations WHERE language_code = ? AND is_default = 1 LIMIT 1',
    [languageCode],
  );
  if (!translation) return null;
  const row = await db.getFirstAsync<{ text: string }>(
    'SELECT text FROM ayah_translations WHERE ayah_id = ? AND translation_id = ?',
    [ayahId, translation.translation_id as number],
  );
  if (!row) return null;
  return {
    text: row.text,
    translations: {
      scholar_name: translation.scholar_name,
      attribution_text: translation.attribution_text,
    },
  };
}

export async function localGetLiveLanguages(): Promise<Row[]> {
  const db = await getOfflineDb();
  if (!db) return [];
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM languages WHERE launch_status IN ('live', 'beta') ORDER BY display_order ASC`,
  );
  return rows.map((r) => ({ ...r, rtl: r.rtl === 1 || r.rtl === true }));
}

export async function localGetTafsir(ayahId: number, languageCode: string): Promise<Row[]> {
  const db = await getOfflineDb();
  if (!db) return [];
  return db.getAllAsync<Row>(
    'SELECT * FROM tafsir WHERE ayah_id = ? AND language_code = ? ORDER BY scholar ASC',
    [ayahId, languageCode],
  );
}

export interface LocalScheduleRow {
  schedule_date: string;
  ayah_id: number;
  ayahs: {
    surah_number: number | null;
    ayah_number: number | null;
    arabic_uthmani: string | null;
    surahs: { name_english: string | null; name_arabic: string | null } | null;
  } | null;
}

export async function localGetRecentSchedule(limit: number): Promise<LocalScheduleRow[]> {
  const db = await getOfflineDb();
  if (!db) return [];
  const rows = await db.getAllAsync<{
    schedule_date: string;
    ayah_id: number;
    surah_number: number | null;
    ayah_number: number | null;
    arabic_uthmani: string | null;
    name_english: string | null;
    name_arabic: string | null;
  }>(
    `SELECT ds.schedule_date AS schedule_date, ds.ayah_id AS ayah_id,
            a.surah_number AS surah_number, a.ayah_number AS ayah_number,
            a.arabic_uthmani AS arabic_uthmani,
            s.name_english AS name_english, s.name_arabic AS name_arabic
       FROM daily_schedule ds
       LEFT JOIN ayahs a ON a.ayah_id = ds.ayah_id
       LEFT JOIN surahs s ON s.surah_number = a.surah_number
      ORDER BY ds.schedule_date DESC
      LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    schedule_date: r.schedule_date,
    ayah_id: r.ayah_id,
    ayahs:
      r.surah_number === null
        ? null
        : {
            surah_number: r.surah_number,
            ayah_number: r.ayah_number,
            arabic_uthmani: r.arabic_uthmani,
            surahs: { name_english: r.name_english, name_arabic: r.name_arabic },
          },
  }));
}
