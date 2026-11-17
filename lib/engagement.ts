import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { Share } from 'react-native';

/**
 * Engagement prompts (1.0.10): a system store-review request and a
 * one-time share card, both earned by regular use — never shown on
 * first run, never repeated.
 *
 * - Usage days: the local dates the app was opened, kept in
 *   AsyncStorage ('usage_days', unique, most recent 90).
 * - Review: from the 7th distinct day, once per app version, via
 *   expo-store-review (SKStoreReviewController / Play In-App Review).
 *   The OS itself caps frequency and skips users who already rated;
 *   'review_prompted_version' only stops OUR side asking twice.
 * - Share card: from the 5th distinct day, until dismissed once
 *   ('share_card_dismissed'). The Share button opens the OS share
 *   sheet, which is where contacts / Messages / WhatsApp are offered —
 *   the app never touches the address book.
 *
 * Everything here is best-effort and never throws.
 */

const USAGE_DAYS_KEY = 'usage_days';
const REVIEW_PROMPTED_KEY = 'review_prompted_version';
const SHARE_DISMISSED_KEY = 'share_card_dismissed';

export const REVIEW_MIN_DAYS = 7;
export const SHARE_MIN_DAYS = 5;

export const SHARE_APP_MESSAGE =
  'Assalamu alaikum — I start my mornings with TathirQuran: a free app with a ' +
  'Quran verse every day, with translations, tafsir and recitation. No ads, ' +
  'no account. You can get it here: https://tathirquran.com';

function localToday(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Record today as a day the app was used; returns the distinct-day count. */
export async function recordUsageDay(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_DAYS_KEY);
    const days: string[] = raw ? JSON.parse(raw) : [];
    const today = localToday();
    if (!days.includes(today)) {
      days.push(today);
      days.sort();
      await AsyncStorage.setItem(USAGE_DAYS_KEY, JSON.stringify(days.slice(-90)));
    }
    return days.length;
  } catch {
    return 0;
  }
}

/**
 * Ask for a store review via the system prompt when the user has used
 * the app on REVIEW_MIN_DAYS distinct days and this app version has
 * not asked yet. Returns true when the prompt was actually requested.
 */
export async function maybeRequestReview(dayCount: number): Promise<boolean> {
  try {
    if (dayCount < REVIEW_MIN_DAYS) return false;
    const version = Constants.expoConfig?.version ?? '';
    const prompted = await AsyncStorage.getItem(REVIEW_PROMPTED_KEY);
    if (prompted === version) return false;
    if (!(await StoreReview.isAvailableAsync())) return false;
    if (!(await StoreReview.hasAction())) return false;
    // Record before asking, so a crash mid-prompt can't re-ask tomorrow.
    await AsyncStorage.setItem(REVIEW_PROMPTED_KEY, version);
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

export async function shouldShowShareCard(dayCount: number): Promise<boolean> {
  try {
    if (dayCount < SHARE_MIN_DAYS) return false;
    return (await AsyncStorage.getItem(SHARE_DISMISSED_KEY)) !== 'true';
  } catch {
    return false;
  }
}

export async function dismissShareCard(): Promise<void> {
  try {
    await AsyncStorage.setItem(SHARE_DISMISSED_KEY, 'true');
  } catch {
    // best-effort — the card simply stays eligible
  }
}

/** Open the OS share sheet with the share-the-app message. */
export async function shareApp(): Promise<void> {
  try {
    await Share.share({ message: SHARE_APP_MESSAGE });
  } catch {
    // user dismissed the sheet or sharing is unavailable — silent
  }
}
