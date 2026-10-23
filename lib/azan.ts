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
 * source research and verdict (2026-10-22: no candidate passed both
 * halves of the gate, so the slot ships empty).
 *
 * TO COMPLETE THIS FEATURE, a follow-up change needs to:
 *   1. Add the verified audio file under assets/sounds/ (iOS
 *      notification sounds must be <= 30 seconds; .wav recommended —
 *      trim an excerpt only if the licence permits derivatives).
 *   2. List the file in the expo-notifications plugin "sounds" array
 *      in app.json.
 *   3. Fill in AZAN_RECORDING below (fileName must match the bundled
 *      file name exactly) — the notification scheduling, the Android
 *      azan channel sound, and the Settings label all read from here.
 *   4. Wire in-app playback of the bundled asset (expo-audio) at the
 *      prayer-times surface.
 */

export interface AzanRecordingInfo {
  /** Bundled file name, exactly as listed in app.json plugin sounds. */
  fileName: string;
  /** Name of the muezzin / reciter, for the Settings attribution line. */
  muezzin: string;
  /** Where the recording came from (name of the source). */
  sourceName: string;
  /** Source page URL. */
  sourceUrl: string;
  /** Licence under which it is bundled (e.g. "CC BY 4.0"). */
  license: string;
}

/** Null until a recording passes BOTH halves of the gate above. */
export const AZAN_RECORDING: AzanRecordingInfo | null = null;

/**
 * Notification sound name to use for azan alerts: the bundled file when
 * a verified recording exists, otherwise the system default sound.
 */
function soundFileFor(recording: AzanRecordingInfo | null): string {
  return recording ? recording.fileName : 'default';
}

export const AZAN_NOTIFICATION_SOUND: string = soundFileFor(AZAN_RECORDING);
