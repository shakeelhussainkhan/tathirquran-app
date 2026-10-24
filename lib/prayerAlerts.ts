import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { AZAN_NOTIFICATION_SOUND } from './azan';
import {
  getQuoteForDate,
  quoteAttribution,
  NAHJUL_BALAGHA_TRANSLATOR,
} from './nahjulBalagha';
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
 * pending local notifications per app. Verse reminders are capped at
 * 21 pending by construction (see VERSE_REMINDER_WINDOW_DAYS), and
 * the azan window shrinks as the verse-reminder count grows:
 *   verse off (0)          + azan 12 days x 5 (60) + legacy (1) = 61
 *   morning (14 x 1 = 14)  + azan  9 days x 5 (45) + legacy (1) = 60
 *   morning+evening (10x2) + azan  8 days x 5 (40) + legacy (1) = 61
 *   few (7 x 3 = 21)       + azan  8 days x 5 (40) + legacy (1) = 62
 * all <= 64.
 *
 * VERSE REMINDER FREQUENCY (v1.0.5, Saira): the v1.0.4 morning-verse
 * on/off toggle grew into a frequency — 'off' | 'morning' |
 * 'morning_evening' | 'few' — stored under VERSE_REMINDER_KEY and
 * migrated once from the legacy boolean (see
 * getVerseReminderFrequency). Slots: morning = the day's verse at
 * Fajr (the original #7 behaviour, identifier/content unchanged);
 * evening = Maghrib, a return to the SAME day's verse; midday
 * ('few' only) = Dhuhr, the day's Nahjul Balagha saying — titled
 * "From Nahjul Balagha" and attributed in the body, never presented
 * as Quran. All verse-reminder identifiers keep the `mv-` prefix, so
 * the wipe-and-rebuild in refreshPrayerAlerts covers every slot.
 */

const MORNING_VERSE_KEY = 'morning_verse_enabled';
const VERSE_REMINDER_KEY = 'verse_reminder_frequency';
const AZAN_ALERTS_KEY = 'azan_alerts_enabled';
const COORDS_KEY = 'user_coords';

const MORNING_ID_PREFIX = 'mv-';
const AZAN_ID_PREFIX = 'azan-';

const MORNING_CHANNEL_ID = 'morning-verse';
const AZAN_CHANNEL_ID = 'azan';

/**
 * Rolling window per frequency. Days x slots-per-day keeps pending
 * verse reminders at or under 21: morning 14x1, morning+evening 10x2,
 * few 7x3.
 */
const VERSE_REMINDER_WINDOW_DAYS: Record<VerseReminderFrequency, number> = {
  off: 0,
  morning: 14,
  morning_evening: 10,
  few: 7,
};
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
 * Settings flags. Azan alerts default OFF. Verse reminders are a
 * frequency (v1.0.5) migrated once from the legacy morning-verse
 * boolean: legacy off -> 'off'; legacy on -> 'morning'; never set ->
 * 'morning' when notification permission is already granted (the
 * morning verse is the default experience), otherwise 'off'. The
 * migrated value is written back so the resolution happens once.
 * ------------------------------------------------------------- */

export type VerseReminderFrequency = 'off' | 'morning' | 'morning_evening' | 'few';

function isVerseReminderFrequency(v: string | null): v is VerseReminderFrequency {
  return v === 'off' || v === 'morning' || v === 'morning_evening' || v === 'few';
}

export async function getVerseReminderFrequency(): Promise<VerseReminderFrequency> {
  const stored = await AsyncStorage.getItem(VERSE_REMINDER_KEY);
  if (isVerseReminderFrequency(stored)) return stored;

  const legacy = await AsyncStorage.getItem(MORNING_VERSE_KEY);
  let migrated: VerseReminderFrequency;
  if (legacy === 'true') {
    migrated = 'morning';
  } else if (legacy === 'false') {
    migrated = 'off';
  } else {
    const permissions = await Notifications.getPermissionsAsync();
    migrated = permissions.granted ? 'morning' : 'off';
  }
  await AsyncStorage.setItem(VERSE_REMINDER_KEY, migrated);
  return migrated;
}

export async function setVerseReminderFrequency(
  frequency: VerseReminderFrequency,
): Promise<void> {
  await AsyncStorage.setItem(VERSE_REMINDER_KEY, frequency);
  // Keep the legacy boolean in step for anything still reading it.
  await AsyncStorage.setItem(MORNING_VERSE_KEY, frequency === 'off' ? 'false' : 'true');
}

/** Legacy boolean view of the frequency (kept for API stability). */
export async function getMorningVerseEnabled(): Promise<boolean> {
  return (await getVerseReminderFrequency()) !== 'off';
}

export async function setMorningVerseEnabled(on: boolean): Promise<void> {
  await setVerseReminderFrequency(on ? 'morning' : 'off');
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
    // Carries the bundled azan excerpt (AZAN_NOTIFICATION_SOUND,
    // the single source of truth in lib/azan.ts).
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

async function scheduleVerseReminder(
  identifier: string,
  title: string,
  body: string,
  at: Date,
  data: Record<string, string>,
): Promise<void> {
  const trigger: Notifications.DateTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: at,
  };
  if (Platform.OS === 'android') trigger.channelId = MORNING_CHANNEL_ID;
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body, sound: 'default', data },
    trigger,
  });
}

/**
 * Schedule the verse reminders for the chosen frequency over its
 * rolling window. The morning slot is the original v1.0.4 #7
 * behaviour, byte-identical in identifier and content. The evening
 * slot re-presents the SAME day's verse (resolved with the morning's
 * date key, exactly what Today showed that day); the midday slot
 * carries the day's Nahjul Balagha saying, labelled as such.
 */
async function scheduleVerseReminders(
  coords: Coords,
  frequency: VerseReminderFrequency,
): Promise<number> {
  const days = VERSE_REMINDER_WINDOW_DAYS[frequency];
  const now = Date.now();
  let scheduled = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(startOfToday(), i);
    const times = calculatePrayerTimes(coords.latitude, coords.longitude, day);

    // Resolved lazily, once per day, shared by the morning/evening slots.
    let verse: VerseContent | null | undefined;
    const dayVerse = async (): Promise<VerseContent | null> => {
      if (verse === undefined) verse = await resolveVerse(utcDateKey(times.fajr));
      return verse;
    };

    // Morning — Fajr, the day's verse.
    if (times.fajr.getTime() > now + FUTURE_BUFFER_MS) {
      const v = await dayVerse();
      if (v) {
        await scheduleVerseReminder(
          `${MORNING_ID_PREFIX}${utcDateKey(times.fajr)}`,
          `Today's Verse — ${v.surahName} ${v.surahNumber}:${v.ayahNumber}`,
          v.translationText,
          times.fajr,
          { type: 'morning-verse', dateKey: utcDateKey(times.fajr) },
        );
        scheduled++;
      }
    }

    // Midday ('few' only) — Dhuhr, the day's Nahjul Balagha saying.
    // The quote is keyed on the Dhuhr instant, matching what the app
    // shows at that moment (getQuoteForDate reads the UTC day).
    if (frequency === 'few' && times.dhuhr.getTime() > now + FUTURE_BUFFER_MS) {
      const quote = getQuoteForDate(times.dhuhr);
      if (quote) {
        await scheduleVerseReminder(
          `${MORNING_ID_PREFIX}mid-${localDateKey(day)}`,
          'From Nahjul Balagha',
          `"${quote.text}"\n${quoteAttribution(quote)}\n${NAHJUL_BALAGHA_TRANSLATOR}`,
          times.dhuhr,
          { type: 'nahjul-balagha', slot: 'midday' },
        );
        scheduled++;
      }
    }

    // Evening — Maghrib, a return to the same day's verse.
    if (frequency !== 'morning' && times.maghrib.getTime() > now + FUTURE_BUFFER_MS) {
      const v = await dayVerse();
      if (v) {
        await scheduleVerseReminder(
          `${MORNING_ID_PREFIX}eve-${localDateKey(day)}`,
          `Return to Today's Verse — ${v.surahName} ${v.surahNumber}:${v.ayahNumber}`,
          v.translationText,
          times.maghrib,
          { type: 'morning-verse', slot: 'evening', dateKey: utcDateKey(times.fajr) },
        );
        scheduled++;
      }
    }
  }
  return scheduled;
}

function azanWindowDays(frequency: VerseReminderFrequency): number {
  // See the iOS 64-notification budget note at the top of this file:
  // the azan window shrinks as the verse-reminder count grows.
  switch (frequency) {
    case 'off':
      return 12;
    case 'morning':
      return 9;
    case 'morning_evening':
    case 'few':
      return 8;
  }
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
          // The Jafri Library credit lives in Settings, beside the
          // toggle — not repeated in every alert body.
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
    const [frequency, azanOn] = await Promise.all([
      getVerseReminderFrequency(),
      getAzanAlertsEnabled(),
    ]);
    const verseOn = frequency !== 'off';

    await cancelWave3Scheduled();
    if (!verseOn && !azanOn) return empty;

    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) return empty;

    const coords = await getStoredCoords();
    if (!coords) return { ...empty, needsLocation: true };

    await ensureAndroidChannels();

    // morningScheduled reports all verse-reminder slots scheduled.
    const morningScheduled = verseOn
      ? await scheduleVerseReminders(coords, frequency)
      : 0;
    const azanScheduled = azanOn
      ? await scheduleAzanAlerts(coords, azanWindowDays(frequency))
      : 0;

    return { morningScheduled, azanScheduled, needsLocation: false };
  } catch {
    return empty;
  }
}
