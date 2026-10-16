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
