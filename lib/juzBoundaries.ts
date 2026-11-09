import {
  SURAH_AYAH_COUNTS,
  globalIndexToRef,
  refToGlobalIndex,
} from './khatmah';
import type { LocalJuzRange } from './offlineDb';

/**
 * The 30 canonical juz boundaries, bundled with the app (1.0.9).
 *
 * Why this exists: the Mushaf Juz index originally derived its ranges
 * solely from the per-ayah `juz_number` column — which the seed had
 * left NULL for every ayah, so BY JUZ was empty for every user while
 * Settings still showed the offline data as "Ready" (diagnosed
 * 2026-11-07; the server data was backfilled the same day). Juz
 * boundaries are fixed properties of the standard mushaf and never
 * change, so they are bundled here as the final fallback: getJuzRanges
 * still prefers the synced data, but the index can never silently come
 * back empty again.
 *
 * Start refs verified 2026-11-07 against Tanzil Quran Metadata v1.0
 * (CC BY 3.0), cross-checked ayat-by-ayat against the Quran.com API v4
 * /juzs listing (30/30 agreement) and against the backfilled server
 * data (6,236 ayahs, 30 juz, 60 hizb).
 */
const JUZ_STARTS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148],
  [5, 82], [6, 111], [7, 88], [8, 41], [9, 93], [11, 6],
  [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1],
  [25, 21], [27, 56], [29, 46], [33, 31], [36, 28], [39, 32],
  [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

const TOTAL_AYAHS = SURAH_AYAH_COUNTS.reduce((a, b) => a + b, 0);

export const STATIC_JUZ_RANGES: LocalJuzRange[] = JUZ_STARTS.map(
  ([surah, ayah], i) => {
    const startAyahId = refToGlobalIndex({ surah, ayah }) + 1;
    const nextStartId =
      i + 1 < JUZ_STARTS.length
        ? refToGlobalIndex({
            surah: JUZ_STARTS[i + 1][0],
            ayah: JUZ_STARTS[i + 1][1],
          }) + 1
        : TOTAL_AYAHS + 1;
    const endAyahId = nextStartId - 1;
    const endRef = globalIndexToRef(endAyahId - 1);
    return {
      juz: i + 1,
      startAyahId,
      endAyahId,
      startSurah: surah,
      startAyah: ayah,
      endSurah: endRef.surah,
      endAyah: endRef.ayah,
      ayahCount: endAyahId - startAyahId + 1,
    };
  },
);
