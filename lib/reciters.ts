import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Recitation audio — multiple reciters + on-device downloads.
 *
 * Uses the expo-file-system API documented for Expo SDK 57
 * (File / Directory / Paths — the legacy string-path methods throw
 * at runtime in this SDK version and are not used here).
 *
 * Source: everyayah.com verse-by-verse MP3s, one folder per reciter,
 * file name SSSAAA.mp3 (zero-padded surah + ayah), e.g.
 *   https://everyayah.com/data/Husary_128kbps/002255.mp3
 *
 * ⚠️ LICENSING FLAG (open item from the 2026-10-11 handover, §3):
 * everyayah.com's terms of use were never formally verified. This
 * module does not change that status — it streams/downloads from the
 * same host the app already used for Husary. See the PR body.
 *
 * VERIFICATION (2026-10-16, HEAD requests, recorded in the PR body):
 * every folder listed in RECITERS below returned HTTP 200 with
 * Content-Type audio/mpeg for BOTH probe ayahs 001001 and 002255.
 * The fourth candidate, Abdul_Basit_Murattal_128kbps, returned
 * HTTP 404 for both probes and was therefore DROPPED, per the
 * verify-or-drop rule — it is not in the table and no UI offers it.
 *
 * Content note (Shia rule): this module deals only in Quran
 * recitation audio — the recited Arabic text itself. It adds no
 * translation, tafsir, commentary or any other sourced text.
 */

export const RECITER_STORAGE_KEY = 'selected_reciter';

export interface Reciter {
  /** Stable id — persisted in AsyncStorage and used as a path segment. */
  id: string;
  /** Display name shown in the pickers. */
  name: string;
  /** everyayah.com data folder for this reciter. */
  folder: string;
}

export const RECITERS: Reciter[] = [
  { id: 'husary', name: 'Husary', folder: 'Husary_128kbps' },
  { id: 'alafasy', name: 'Alafasy', folder: 'Alafasy_128kbps' },
  { id: 'minshawy', name: 'Minshawy', folder: 'Minshawy_Murattal_128kbps' },
];

export const DEFAULT_RECITER: Reciter = RECITERS[0];

export function getReciterById(id: string | null | undefined): Reciter {
  if (!id) return DEFAULT_RECITER;
  return RECITERS.find((r) => r.id === id) ?? DEFAULT_RECITER;
}

/** Read the persisted reciter choice. Never throws; defaults to Husary. */
export async function getSelectedReciter(): Promise<Reciter> {
  try {
    return getReciterById(await AsyncStorage.getItem(RECITER_STORAGE_KEY));
  } catch {
    return DEFAULT_RECITER;
  }
}

/** Persist the reciter choice under `selected_reciter`. */
export async function setSelectedReciter(reciter: Reciter): Promise<void> {
  await AsyncStorage.setItem(RECITER_STORAGE_KEY, reciter.id);
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/** Remote streaming URL for one ayah in the given reciter's voice. */
export function remoteAudioUrl(reciter: Reciter, surah: number, ayah: number): string {
  return `https://everyayah.com/data/${reciter.folder}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

// ── Downloads ─────────────────────────────────────────────────────────
// Downloaded ayahs live under the app document directory, keyed by
// reciter / surah / ayah:
//   <document>/recitation-audio/<reciterId>/<SSS>/<AAA>.mp3
// Playback always prefers a downloaded file over streaming.

export const DOWNLOADS_DIR_NAME = 'recitation-audio';

export function downloadsRootDir(): Directory {
  return new Directory(Paths.document, DOWNLOADS_DIR_NAME);
}

function ayahDir(reciter: Reciter, surah: number): Directory {
  return new Directory(downloadsRootDir(), reciter.id, pad3(surah));
}

function ayahFile(reciter: Reciter, surah: number, ayah: number): File {
  return new File(ayahDir(reciter, surah), `${pad3(ayah)}.mp3`);
}

/** Local file URI for a downloaded ayah (whether or not it exists yet). */
export function localAudioUri(reciter: Reciter, surah: number, ayah: number): string {
  return ayahFile(reciter, surah, ayah).uri;
}

/** True when this ayah has already been downloaded for this reciter. */
export async function isAudioDownloaded(
  reciter: Reciter,
  surah: number,
  ayah: number
): Promise<boolean> {
  try {
    const file = ayahFile(reciter, surah, ayah);
    return file.exists && file.size > 0;
  } catch {
    return false;
  }
}

/**
 * The URI playback should use for an ayah: the downloaded file when
 * one is present, otherwise the remote streaming URL.
 */
export async function resolvePlaybackUri(
  reciter: Reciter,
  surah: number,
  ayah: number
): Promise<string> {
  return (await isAudioDownloaded(reciter, surah, ayah))
    ? localAudioUri(reciter, surah, ayah)
    : remoteAudioUrl(reciter, surah, ayah);
}

/**
 * Download one ayah's audio for the given reciter.
 * Returns the local file URI. Throws if the download fails or lands
 * as a zero-byte file, so callers can show an honest failure state
 * (File.downloadFileAsync rejects on network/HTTP errors).
 */
export async function downloadAyahAudio(
  reciter: Reciter,
  surah: number,
  ayah: number
): Promise<string> {
  const dir = ayahDir(reciter, surah);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  const target = ayahFile(reciter, surah, ayah);
  const downloaded = await File.downloadFileAsync(remoteAudioUrl(reciter, surah, ayah), target, {
    idempotent: true,
  });
  if (!downloaded.exists || downloaded.size === 0) {
    try {
      if (downloaded.exists) downloaded.delete();
    } catch {
      // Best-effort cleanup only.
    }
    throw new Error('Download produced an empty file');
  }
  return downloaded.uri;
}

function dirSizeBytes(dir: Directory): number {
  let total = 0;
  let entries: (Directory | File)[];
  try {
    entries = dir.list();
  } catch {
    return 0;
  }
  for (const entry of entries) {
    try {
      if (entry instanceof Directory) {
        total += dirSizeBytes(entry);
      } else {
        total += entry.size ?? 0;
      }
    } catch {
      // A single unreadable entry must not sink the total.
    }
  }
  return total;
}

/** Total size in bytes of all downloaded recitation audio. */
export async function getDownloadsSizeBytes(): Promise<number> {
  try {
    const root = downloadsRootDir();
    if (!root.exists) return 0;
    return dirSizeBytes(root);
  } catch {
    return 0;
  }
}

/** Delete every downloaded ayah for every reciter. */
export async function clearDownloads(): Promise<void> {
  const root = downloadsRootDir();
  if (root.exists) {
    root.delete();
  }
}

/** Human-readable byte size, e.g. "812 KB", "3.4 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
