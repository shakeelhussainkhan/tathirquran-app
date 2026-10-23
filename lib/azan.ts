/**
 * Azan recording — SINGLE SOURCE OF TRUTH for the bundled azan audio.
 *
 * GATE (both halves required before anything is bundled here):
 *   1. Licence: the recording's reuse must be CLEARLY permitted for
 *      bundling/redistribution inside an app (e.g. CC-BY, CC0, public
 *      domain, or written permission from the rights holder).
 *   2. Content: the recording must be verifiably the SHIA azan — it
 *      includes "Ashhadu anna Aliyyan Waliyullah" (x2) and
 *      "Hayya 'ala khayril 'amal" (x2), and does NOT include the Fajr
 *      addition "as-salatu khayrun min an-nawm".
 * A non-Shia azan is NEVER substituted. See WAVE3-REPORT.md for the
 * source research and verdict.
 *
 * CURRENT RECORDING (selected by the app owner, 2026-10-22):
 *   "Ammal & Namaz — Shia Azan [01]", hosted by the Jafri Library
 *   (jafrilibrary.com/audio/286) — a Shia library; the item is
 *   catalogued there explicitly as a Shia azan. Written permission to
 *   bundle it was requested from the Jafri Library (Faiyaz Hasan) on
 *   2026-10-22, in parallel with this wiring; Jafri Library is credited
 *   in Settings and on the About screen. The reciter is not reliably
 *   identified in the file's metadata, so no reciter is credited.
 *
 * FILES:
 *   - Full recording: assets/sounds/jafri-shia-azan.mp3 (5:24) —
 *     byte-identical to the Jafri Library file; used for in-app
 *     playback from Settings.
 *   - Notification excerpt: assets/sounds/azan-notification.wav —
 *     the first 29 seconds of the same recording (iOS caps custom
 *     notification sounds at 30 s) with a gentle 2-second fade-out;
 *     listed in app.json's expo-notifications plugin "sounds" array.
 */

export interface AzanRecordingInfo {
  /** Bundled notification-sound file name, exactly as listed in app.json plugin sounds. */
  fileName: string;
  /** Full-recording file name under assets/sounds/, for in-app playback. */
  playbackFileName: string;
  /** Where the recording came from (name of the source). */
  sourceName: string;
  /** Source page URL. */
  sourceUrl: string;
  /** Basis under which it is bundled. */
  license: string;
}

export const AZAN_RECORDING: AzanRecordingInfo = {
  fileName: 'azan-notification.wav',
  playbackFileName: 'jafri-shia-azan.mp3',
  sourceName: 'Jafri Library',
  sourceUrl: 'https://jafrilibrary.com/audio/286',
  license:
    'Courtesy of Jafri Library — written permission to bundle requested 2026-10-22 (owner-directed; do not ship publicly before the grant lands).',
};

/**
 * The full azan recording as a bundled asset, for in-app playback
 * (expo-audio accepts a require()'d asset as its source). Kept here so
 * lib/azan.ts stays the single source of truth for azan audio.
 */
export const AZAN_PLAYBACK_ASSET = require('../assets/sounds/jafri-shia-azan.mp3');

/**
 * Notification sound name to use for azan alerts: the bundled file when
 * a verified recording exists, otherwise the system default sound.
 */
function soundFileFor(recording: AzanRecordingInfo | null): string {
  return recording ? recording.fileName : 'default';
}

export const AZAN_NOTIFICATION_SOUND: string = soundFileFor(AZAN_RECORDING);
