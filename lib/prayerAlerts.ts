import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { AZAN_NOTIFICATION_SOUND } from './azan';
import { localGetAyah, localGetScheduleAyahId } from './offlineDb';
import { calculatePrayerTimes } from './prayerTimes';
import { getDefaultTranslation } from './queries';
import { supabase } from './supabase';

/**
 * Wave 3 (v1.0.4) — lock-screen morning verse (#7) + azan alerts (#3).
 *
 * Both features are scheduled as one-shot DATE notifications for a
 * rolling window of upcoming days, rebuilt by refreshPrayerAlerts()
 * on app open / foreground and whenever a toggle changes. Scheduling
 * is idempotent: every refresh first cancels ONLY this module's own
 * notifications (identifiers prefixed `mv-` / `azan-`) and rebuilds.
 *
 * INTERPLAY WITH THE LEGACY DAILY REMINDER (lib/notifications.ts):
 * the legacy scheduleDailyNotification() / cancelNotifications()
 * call cancelAllScheduledNotificationsAsync(), which would also wipe
 * these notifications (and vice versa is NOT true — this module never
 * cancels anything but its own prefixes). The refresh-on-app-open
 * rebuild self-heals after any legacy wipe; the legacy reminder is
 * left untouched by this module.
 *
 * iOS PENDING-NOTIFICATION BUDGET: iOS keeps only the soonest 64
 * pending local notifications per app. Worst case here:
 *   morning verse 14 + azan 9 days x 5 prayers (45) + legacy daily
 *   repeating reminder (1) = 60 <= 64. When the morning verse is off,
 *   the azan window extends to 12 days (60 + 1 = 61 <= 64).
 */

const MORNING_VERSE_KEY = 'morning_verse_enabled';
const AZAN_ALERTS_KEY = 'azan_alerts_enabled';
const COORDS_KEY = 'user_coords';

const MORNING_ID_PREFIX = 'mv-';
const AZAN_ID_PREFIX = 'azan-';

const MORNING_CHANNEL_ID = 'morning-verse';
const AZAN_CHANNEL_ID = 'azan';

const MORNING_WINDOW_DAYS = 14;
const FUTURE_BUFFER_MS = 30_000;

export const AZAN_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type AzanPrayer = (typeof AZAN_PRAYERS)[number];

export const AZAN_PRAYER_LABELS: Record<AzanPrayer, string> = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface RefreshResult {
  morningScheduled: number;
  azanScheduled: number;
  /** True when a feature is on but no location is stored yet. */
  needsLocation: boolean;
}

/* ---------------------------------------------------------------
 * Settings flags (both default OFF)
 * ------------------------------------------------------------- */

export async function getMorningVerseEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(MORNING_VERSE_KEY)) === 'true';
}

export async function setMorningVerseEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(MORNING_VERSE_KEY, on ? 'true' : 'false');
}

export async function getAzanAlertsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(AZAN_ALERTS_KEY)) === 'true';
}

export async function setAzanAlertsEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(AZAN_ALERTS_KEY, on ? 'true' : 'false');
}

/* ---------------------------------------------------------------
 * Stored location (prayer times need coordinates; the app previously
 * only ever computed them transiently)
 * ------------------------------------------------------------- */

export async function getStoredCoords(): Promise<Coords | null> {
  try {
    const raw = await AsyncStorage.getItem(COORDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Coords>;
    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      return { latitude: parsed.latitude, longitude: parsed.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCoords(coords: Coords): Promise<void> {
  await AsyncStorage.setItem(COORDS_KEY, JSON.stringify(coords));
}

/**
 * Return stored coords, or — when the user is present to answer the
 * system prompt (Settings toggle) — request foreground location
 * permission and persist the current position. Mirrors the pattern
 * used by the Today screen (Accuracy.Low is plenty for prayer times).
 */
export async function ensureCoordsInteractive(): Promise<Coords | null> {
  const stored = await getStoredCoords();
  if (stored) return stored;
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const requested = await Location.requestForegroundPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
    const coords: Coords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    await saveCoords(coords);
    return coords;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------
 * Date keys. The daily ayah schedule is keyed by UTC date string
 * (lib/queries.ts getTodayAyah uses toISOString), so the morning
 * verse for a given Fajr instant resolves its verse with the UTC key
 * OF THAT INSTANT — exactly what the Today screen will show when
 * the user wakes to that Fajr.
 * ------------------------------------------------------------- */

function utcDateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Local calendar key — used only as a stable identifier component. */
function localDateKey(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/* ---------------------------------------------------------------
 * Verse resolution for an arbitrary schedule date key — same data
 * path as the Today screen (local offline DB first, Supabase
 * fallback), in the user's selected language's default translation.
 * ------------------------------------------------------------- */

interface VerseContent {
  surahName: string;
  surahNumber: number;
  ayahNumber: number;
  translationText: string;
}

async function resolveVerse(dateKey: string): Promise<VerseContent | null> {
  try {
    let ayah: Record<string, unknown> | null = null;

    const localId = await localGetScheduleAyahId(dateKey);
    if (localId !== null) {
      ayah = (await localGetAyah(localId)) as Record<string, unknown> | null;
    }
    if (!ayah) {
      const { data: schedule } = await supabase
        .from('daily_schedule')
        .select('ayah_id')
        .eq('schedule_date', dateKey)
        .single();
      if (!schedule) return null;
      const { data } = await supabase
        .from('ayahs')
        .select('*, surahs(*)')
        .eq('ayah_id', schedule.ayah_id)
        .single();
      ayah = data as Record<string, unknown> | null;
    }
    if (!ayah) return null;

    const language = (await AsyncStorage.getItem('selected_language')) ?? 'en';
    const translation = await getDefaultTranslation(ayah.ayah_id as number, language);
    if (!translation?.text) return null;

    const surahs = ayah.surahs as { name_english?: string } | null;
    return {
      surahName: surahs?.name_english ?? `Surah ${ayah.surah_number as number}`,
      surahNumber: ayah.surah_number as number,
      ayahNumber: ayah.ayah_number as number,
      translationText: translation.text as string,
    };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------
 * Scheduling internals
 * ------------------------------------------------------------- */

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(MORNING_CHANNEL_ID, {
    name: 'Morning Verse',
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync(AZAN_CHANNEL_ID, {
    name: 'Azan',
    importance: Notifications.AndroidImportance.HIGH,
    // Carries the bundled azan file once AZAN_RECORDING is set;
    // 'default' (system sound) until then.
    sound: AZAN_NOTIFICATION_SOUND,
  });
}

/** Cancel ONLY this module's notifications — never the legacy ones. */
async function cancelWave3Scheduled(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const own = all.filter(
    (n) =>
      n.identifier.startsWith(MORNING_ID_PREFIX) ||
      n.identifier.startsWith(AZAN_ID_PREFIX),
  );
  await Promise.all(
    own.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

async function scheduleMorningVerse(coords: Coords): Promise<number> {
  const now = Date.now();
  let scheduled = 0;
  for (let i = 0; i < MORNING_WINDOW_DAYS; i++) {
    const day = addDays(startOfToday(), i);
    const times = calculatePrayerTimes(coords.latitude, coords.longitude, day);
    const fajr = times.fajr;
    if (fajr.getTime() <= now + FUTURE_BUFFER_MS) continue;

    const dateKey = utcDateKey(fajr);
    const verse = await resolveVerse(dateKey);
    if (!verse) continue;

    const trigger: Notifications.DateTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fajr,
    };
    if (Platform.OS === 'android') trigger.channelId = MORNING_CHANNEL_ID;

    await Notifications.scheduleNotificationAsync({
      identifier: `${MORNING_ID_PREFIX}${dateKey}`,
      content: {
        title: `Today's Verse — ${verse.surahName} ${verse.surahNumber}:${verse.ayahNumber}`,
        body: verse.translationText,
        sound: 'default',
        data: { type: 'morning-verse', dateKey },
      },
      trigger,
    });
    scheduled++;
  }
  return scheduled;
}

function azanWindowDays(morningEnabled: boolean): number {
  // See the iOS 64-notification budget note at the top of this file.
  return morningEnabled ? 9 : 12;
}

async function scheduleAzanAlerts(coords: Coords, days: number): Promise<number> {
  const now = Date.now();
  let scheduled = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(startOfToday(), i);
    const times = calculatePrayerTimes(coords.latitude, coords.longitude, day);
    for (const prayer of AZAN_PRAYERS) {
      const at = times[prayer];
      if (at.getTime() <= now + FUTURE_BUFFER_MS) continue;

      const trigger: Notifications.DateTriggerInput = {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
      };
      if (Platform.OS === 'android') trigger.channelId = AZAN_CHANNEL_ID;

      await Notifications.scheduleNotificationAsync({
        identifier: `${AZAN_ID_PREFIX}${prayer}-${localDateKey(day)}`,
        content: {
          title: `Azan — ${AZAN_PRAYER_LABELS[prayer]}`,
          // The "recording pending" disclosure lives in Settings, where
          // the toggle is labelled — not repeated in every alert body.
          body: `Time for ${AZAN_PRAYER_LABELS[prayer]} prayer.`,
          sound: AZAN_NOTIFICATION_SOUND,
          data: { type: 'azan', prayer },
        },
        trigger,
      });
      scheduled++;
    }
  }
  return scheduled;
}

/* ---------------------------------------------------------------
 * Public entry point — call on app open/foreground and after any
 * toggle change. Safe to call when everything is off (it just keeps
 * the module's own schedule cleared).
 * ------------------------------------------------------------- */

export async function refreshPrayerAlerts(): Promise<RefreshResult> {
  const empty: RefreshResult = { morningScheduled: 0, azanScheduled: 0, needsLocation: false };
  try {
    const [morningOn, azanOn] = await Promise.all([
      getMorningVerseEnabled(),
      getAzanAlertsEnabled(),
    ]);

    await cancelWave3Scheduled();
    if (!morningOn && !azanOn) return empty;

    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) return empty;

    const coords = await getStoredCoords();
    if (!coords) return { ...empty, needsLocation: true };

    await ensureAndroidChannels();

    const morningScheduled = morningOn ? await scheduleMorningVerse(coords) : 0;
    const azanScheduled = azanOn
      ? await scheduleAzanAlerts(coords, azanWindowDays(morningOn))
      : 0;

    return { morningScheduled, azanScheduled, needsLocation: false };
  } catch {
    return empty;
  }
}
