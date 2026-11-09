import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Shared listen-aloud playback speed (1.0.9, Shahid Hussain's request).
 *
 * One persisted preference drives both listen-aloud engines: the
 * streamed narration player (lib/narration.ts, applied through
 * AudioPlayer.setPlaybackRate) and the guarded device-TTS fallback
 * (lib/speech.ts, applied as a multiplier on its base rate). The
 * ListenButton speed chip cycles through PLAYBACK_RATES; the choice is
 * remembered across launches.
 */

export const PLAYBACK_RATE_STORAGE_KEY = 'playbackRate';

/** Speeds offered by the ListenButton chip, in cycle order. */
export const PLAYBACK_RATES: readonly number[] = [1, 1.25, 1.5, 2];

let rateCache: number | null = null;

function sanitize(rate: number): number {
  return PLAYBACK_RATES.includes(rate) ? rate : 1;
}

/** Read the persisted playback speed. Never throws; default 1. */
export async function getPlaybackRate(): Promise<number> {
  if (rateCache !== null) return rateCache;
  try {
    const raw = await AsyncStorage.getItem(PLAYBACK_RATE_STORAGE_KEY);
    rateCache = sanitize(raw ? parseFloat(raw) : 1);
  } catch {
    rateCache = 1;
  }
  return rateCache;
}

/** Persist the playback speed. Never throws. */
export async function setPlaybackRate(rate: number): Promise<void> {
  rateCache = sanitize(rate);
  try {
    await AsyncStorage.setItem(PLAYBACK_RATE_STORAGE_KEY, String(rateCache));
  } catch {
    // Best-effort; the in-memory value still applies this session.
  }
}

/** The next speed in the cycle after `rate`. */
export function nextPlaybackRate(rate: number): number {
  const idx = PLAYBACK_RATES.indexOf(sanitize(rate));
  return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
}

/** Chip label, e.g. "1×", "1.5×", "2×". */
export function formatPlaybackRate(rate: number): string {
  return `${rate}×`;
}
