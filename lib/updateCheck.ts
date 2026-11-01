import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

/**
 * App Store update check — the data half of the "new version available"
 * soft prompt (components/UpdatePrompt.tsx).
 *
 * How it works (iOS): Apple's public lookup endpoint reports the latest
 * PUBLISHED version of the app and its store page:
 *   GET https://itunes.apple.com/lookup?id=6811745113
 *   → results[0].version / results[0].trackViewUrl
 * That is compared against the installed version from app.json, surfaced
 * by expo-constants (Constants.expoConfig.version) — no native module
 * needed. If the store version is newer, the prompt offers to open the
 * store page. The prompt is a SOFT prompt: always dismissible, never
 * forced, and every failure path here resolves to "no prompt" — this
 * feature must never disturb the app.
 *
 * Android: deliberately NO Play Store check yet. TathirQuran for Android
 * is closed-testing only, and Play pushes updates to testers itself;
 * there is also no public Play lookup equivalent to Apple's endpoint.
 * fetchLatestStoreVersion() returns null off iOS, so the prompt simply
 * never appears on Android. If Android ships to production, return the
 * same StoreUpdateInfo shape from whatever source is chosen then — the
 * comparison, throttle and dismissal logic below is platform-agnostic.
 *
 * Nag control (AsyncStorage, same persistence pattern as the quote
 * language in lib/nahjulBalagha.ts):
 * - at most one lookup per 24 hours (`update_check_last_at`); the
 *   attempt timestamp is written BEFORE the fetch, so a failed lookup
 *   also backs off instead of retrying on every launch;
 * - "Later" records the dismissed store version
 *   (`update_dismissed_version`); the prompt stays silent for that
 *   version and returns only when a still-newer version ships.
 */

const APP_STORE_ID = '6811745113';
const LOOKUP_URL = `https://itunes.apple.com/lookup?id=${APP_STORE_ID}`;

/** AsyncStorage key: epoch ms of the last lookup attempt. */
export const UPDATE_CHECK_LAST_AT_KEY = 'update_check_last_at';

/** AsyncStorage key: store version the user dismissed with "Later". */
export const UPDATE_DISMISSED_VERSION_KEY = 'update_dismissed_version';

/** At most one App Store lookup per 24 hours. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface StoreUpdateInfo {
  /** Latest version published on the store, e.g. "1.0.6". */
  latestVersion: string;
  /** Store page URL the "Update" button opens. */
  storeUrl: string;
}

/** The installed version from app.json (via expo-constants). */
export function installedVersion(): string | null {
  const version = Constants.expoConfig?.version;
  return typeof version === 'string' && version.length > 0 ? version : null;
}

/**
 * Dotted-numeric version comparison: > 0 when `a` is newer than `b`,
 * < 0 when older, 0 when equal. Segments compare NUMERICALLY, so
 * "1.0.10" > "1.0.9"; missing segments count as 0 ("1.1" == "1.1.0").
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.');
  const partsB = b.split('.');
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const numA = parseInt(partsA[i] ?? '0', 10) || 0;
    const numB = parseInt(partsB[i] ?? '0', 10) || 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

/** True when `candidate` is strictly newer than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/**
 * Ask the App Store for the latest published version (iOS only — see
 * the Android note at the top of this file). Null on any failure:
 * offline, non-200, unexpected payload.
 */
export async function fetchLatestStoreVersion(): Promise<StoreUpdateInfo | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const response = await fetch(LOOKUP_URL);
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const first = (payload as { results?: unknown[] } | null)?.results?.[0] as
      | { version?: unknown; trackViewUrl?: unknown }
      | undefined;
    if (
      !first ||
      typeof first.version !== 'string' ||
      typeof first.trackViewUrl !== 'string'
    ) {
      return null;
    }
    // Defense in depth (pentest 2026-10-31): the store URL comes from the
    // lookup response and is handed to Linking.openURL on tap. Only ever
    // open an Apple store URL — anything else (a non-Apple host or a
    // non-https scheme) is treated as no-update rather than opened.
    if (
      !first.trackViewUrl.startsWith('https://apps.apple.com/') &&
      !first.trackViewUrl.startsWith('https://itunes.apple.com/')
    ) {
      return null;
    }
    return { latestVersion: first.version, storeUrl: first.trackViewUrl };
  } catch {
    return null;
  }
}

/**
 * The full launch decision: the store info when a newer, not-dismissed
 * version exists and the 24h throttle allows a check; otherwise null.
 * Never throws.
 */
export async function checkForUpdate(): Promise<StoreUpdateInfo | null> {
  try {
    const current = installedVersion();
    if (!current) return null;

    const lastAtRaw = await AsyncStorage.getItem(UPDATE_CHECK_LAST_AT_KEY);
    const lastAt = lastAtRaw ? parseInt(lastAtRaw, 10) : NaN;
    const now = Date.now();
    if (
      Number.isFinite(lastAt) &&
      now - lastAt < UPDATE_CHECK_INTERVAL_MS
    ) {
      return null;
    }
    // Record the attempt before fetching: failures back off for 24h too.
    await AsyncStorage.setItem(UPDATE_CHECK_LAST_AT_KEY, String(now));

    const info = await fetchLatestStoreVersion();
    if (!info) return null;
    if (!isNewerVersion(info.latestVersion, current)) return null;

    const dismissed = await AsyncStorage.getItem(UPDATE_DISMISSED_VERSION_KEY);
    if (dismissed === info.latestVersion) return null;

    return info;
  } catch {
    return null;
  }
}

/** Silence the prompt for one store version (the "Later" button). */
export async function dismissUpdateForVersion(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(UPDATE_DISMISSED_VERSION_KEY, version);
  } catch {
    /* best-effort — the prompt simply closes for this session */
  }
}
