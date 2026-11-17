import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { stopSpeech } from './speech';
import { getPlaybackRate } from './playbackRate';

/**
 * Streamed narration audio (1.0.8) — pre-generated MP3s hosted on the
 * tathirquran-audio GitHub repo's releases, played through expo-audio.
 * GitHub caps one release at 1,000 assets: v1 filled with tafsir files
 * (2026-11-13), so translation and quote assets live in v2 and later
 * libraries. Playback tries each library in NARRATION_BASE_URLS order.
 * (the same library + audio-session conventions as the recitation
 * player in components/VerseReader.tsx: setAudioModeAsync with
 * playsInSilentMode before playback).
 *
 * Hybrid model: a Listen button first tries the streamed narration for
 * its section; when the asset does not exist (many are still being
 * generated) the name is remembered in a session-level missing-cache
 * and the button falls back to guarded device TTS (see
 * components/ListenButton.tsx). The cache is deliberately NOT
 * persisted: a file generated tomorrow must be picked up on the next
 * app launch.
 *
 * Playback detail: the files are downloaded to an on-device cache and
 * played from the local file (the same File.downloadFileAsync pattern
 * as lib/reciters.ts downloads). AVPlayer will not stream the release
 * URL itself — GitHub's redirect lands on a signed URL with no .mp3
 * extension and an application/octet-stream type, which the player
 * cannot sniff as media (verified in the iOS simulator, 2026-11-01:
 * the player sat in an 'unknown' state forever). A failed download
 * (404) is what marks an asset missing.
 *
 * One narration at a time: starting one stops any other narration and
 * any device speech (lib/speech stopSpeech).
 */

export const NARRATION_BASE_URL =
  'https://github.com/shakeelhussainkhan/tathirquran-audio/releases/download/v1/';

/** All narration asset libraries, tried in order (see header note). */
export const NARRATION_BASE_URLS: string[] = [
  NARRATION_BASE_URL,
  'https://github.com/shakeelhussainkhan/tathirquran-audio/releases/download/v2/',
];

export type NarrationGender = 'm' | 'f';

export const NARRATION_GENDER_STORAGE_KEY = 'narrationGender';

export type NarrationDescriptor =
  | {
      type: 'tafsir';
      /** namoona = Urdu Tafsir-e-Namoona; majma = Arabic Majma' al-Bayan;
       *  tibyan = Arabic Al-Tibyan (assets generated after 1.0.9; until
       *  they exist the Listen button falls back to guarded device TTS). */
      slug: 'namoona' | 'majma' | 'tibyan';
      lang: 'ur' | 'ar';
      surah: number;
      /** First ayah of the tafsir block (inclusive). */
      start: number;
      /** Last ayah of the tafsir block (inclusive). */
      end: number;
    }
  | {
      type: 'translation';
      translationId: number;
      /** Global ayah_id of the verse. */
      ayahId: number;
      lang: string;
    }
  | {
      type: 'quote';
      /** Nahjul Balagha saying number. */
      sayingId: number;
      lang: string;
    };

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/** Deterministic asset file name for a descriptor + voice gender. */
export function narrationAssetName(
  descriptor: NarrationDescriptor,
  gender: NarrationGender,
): string {
  switch (descriptor.type) {
    case 'tafsir':
      return `tafsir-${descriptor.lang}-${descriptor.slug}-${pad3(descriptor.surah)}-${pad3(descriptor.start)}-${pad3(descriptor.end)}-${gender}.mp3`;
    case 'translation':
      return `tr-${descriptor.translationId}-${descriptor.ayahId}-${gender}.mp3`;
    case 'quote':
      return `quote-${descriptor.sayingId}-${descriptor.lang}-${gender}.mp3`;
  }
}

export function narrationUrl(assetName: string, baseIndex = 0): string {
  return `${NARRATION_BASE_URLS[baseIndex]}${assetName}`;
}

// ── Narration voice gender preference ───────────────────────────────

let genderCache: NarrationGender | null = null;

/** Read the persisted narration voice gender. Never throws; default 'm'. */
export async function getNarrationGender(): Promise<NarrationGender> {
  if (genderCache) return genderCache;
  try {
    const val = await AsyncStorage.getItem(NARRATION_GENDER_STORAGE_KEY);
    genderCache = val === 'f' ? 'f' : 'm';
  } catch {
    genderCache = 'm';
  }
  return genderCache;
}

/** Persist the narration voice gender under `narrationGender`. */
export async function setNarrationGender(gender: NarrationGender): Promise<void> {
  genderCache = gender;
  try {
    await AsyncStorage.setItem(NARRATION_GENDER_STORAGE_KEY, gender);
  } catch {
    // Best-effort; the in-memory value still applies this session.
  }
}

// ── Known-missing assets (session level) ────────────────────────────

const missingAssets = new Set<string>();

export function isNarrationMissing(assetName: string): boolean {
  return missingAssets.has(assetName);
}

export function markNarrationMissing(assetName: string): void {
  missingAssets.add(assetName);
}

// ── Player state ────────────────────────────────────────────────────

export interface NarrationState {
  /** Section id of the loaded narration, or null when idle. */
  sectionId: string | null;
  /** True between a play request and its load resolving/failing. */
  loading: boolean;
  playing: boolean;
  /** Seconds. */
  position: number;
  /** Seconds (0 until known). */
  duration: number;
}

const IDLE_STATE: NarrationState = {
  sectionId: null,
  loading: false,
  playing: false,
  position: 0,
  duration: 0,
};

let state: NarrationState = IDLE_STATE;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(next: NarrationState): void {
  state = next;
  emit();
}

/** Subscribe to narration-state changes (useSyncExternalStore-ready). */
export function subscribeNarration(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current narration state snapshot (useSyncExternalStore-ready). */
export function getNarrationState(): NarrationState {
  return state;
}

// ── Player ──────────────────────────────────────────────────────────

let player: AudioPlayer | null = null;
/** Generation guard: invalidates async loads superseded by a stop/new play. */
let generation = 0;

function ensurePlayer(): AudioPlayer {
  if (player) return player;
  player = createAudioPlayer(null, { updateInterval: 250 });
  player.addListener('playbackStatusUpdate', (status) => {
    if (state.sectionId === null) return;
    if (status.error) {
      // A load/playback error after a successful start: end the session.
      stopNarration();
      return;
    }
    if (status.didJustFinish) {
      setState(IDLE_STATE);
      return;
    }
    setState({
      sectionId: state.sectionId,
      loading: false,
      playing: status.playing,
      position: status.currentTime ?? 0,
      duration: status.duration ?? 0,
    });
  });
  return player;
}

/** Stop narration entirely and clear the player state. */
export function stopNarration(): void {
  generation += 1;
  if (player) {
    try {
      player.pause();
    } catch {
      // Player may already be released.
    }
  }
  if (state !== IDLE_STATE) setState(IDLE_STATE);
}

export function pauseNarration(): void {
  if (!player || state.sectionId === null) return;
  try {
    player.pause();
  } catch {
    // Best-effort.
  }
  setState({ ...state, playing: false });
}

/**
 * Apply a playback speed to the live narration player (used by the
 * ListenButton speed chip so a change takes effect mid-playback, not
 * only on the next narration). Best-effort.
 */
export function applyNarrationPlaybackRate(rate: number): void {
  if (!player) return;
  try {
    player.setPlaybackRate(rate);
  } catch {
    // Best-effort.
  }
}

export function resumeNarration(): void {
  if (!player || state.sectionId === null) return;
  try {
    player.play();
  } catch {
    // Best-effort.
  }
  setState({ ...state, playing: true });
}

/**
 * Try to play the streamed narration for `sectionId`.
 *
 * Returns true when the asset exists and playback has started. Returns
 * false when the asset is missing/unloadable — the asset name is then
 * in the missing-cache and the caller should fall back to device TTS.
 */
export async function playNarration(
  sectionId: string,
  descriptor: NarrationDescriptor,
): Promise<boolean> {
  const gender = await getNarrationGender();
  const assetName = narrationAssetName(descriptor, gender);
  if (isNarrationMissing(assetName)) return false;

  const gen = (generation += 1);
  stopSpeech(); // one audio voice at a time
  const p = ensurePlayer();
  try {
    p.pause();
  } catch {
    // Best-effort.
  }
  setState({ sectionId, loading: true, playing: false, position: 0, duration: 0 });

  // Download to the on-device cache (or reuse a previous download of
  // the same asset). A download failure — above all a 404 for a file
  // that has not been generated yet — marks the asset missing for this
  // session and the caller falls back to guarded device TTS.
  let localUri: string;
  try {
    const dir = new Directory(Paths.cache, 'narration-audio');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, assetName);
    if (file.exists && file.size > 0) {
      localUri = file.uri;
    } else {
      // Try each asset library in order; only a miss in ALL of them
      // marks the asset missing for this session.
      let downloadedUri: string | null = null;
      for (let base = 0; base < NARRATION_BASE_URLS.length && !downloadedUri; base++) {
        try {
          const downloaded = await File.downloadFileAsync(
            narrationUrl(assetName, base),
            file,
            { idempotent: true },
          );
          if (downloaded.exists && downloaded.size > 0) {
            downloadedUri = downloaded.uri;
          }
        } catch {
          // Not in this library — try the next one.
        }
        if (!downloadedUri && file.exists) {
          try {
            file.delete();
          } catch {
            // Best-effort cleanup only.
          }
        }
      }
      if (!downloadedUri) {
        throw new Error('Narration asset not found in any library');
      }
      localUri = downloadedUri;
    }
  } catch {
    markNarrationMissing(assetName);
    if (gen === generation) setState(IDLE_STATE);
    return false;
  }
  if (gen !== generation) return false;

  try {
    // shouldPlayInBackground (with the expo-audio plugin's background
    // modes in app.json) keeps narration playing after the screen locks
    // — 1.0.9 fix: it previously stopped a few seconds after lock.
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true });
    p.replace({ uri: localUri });
    try {
      p.setPlaybackRate(await getPlaybackRate());
    } catch {
      // Rate is best-effort; playback itself must not fail over it.
    }
    p.play();
  } catch {
    markNarrationMissing(assetName);
    if (gen === generation) setState(IDLE_STATE);
    return false;
  }

  // Wait briefly for the load to resolve: an error status (or a player
  // that never loads) marks the asset missing so the caller can fall
  // back to device TTS instead of leaving a dead player on screen.
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (gen !== generation) return false; // stopped/superseded meanwhile
    const status = p.currentStatus;
    if (status?.error) break;
    if (status?.isLoaded) {
      setState({
        sectionId,
        loading: false,
        playing: true,
        position: status.currentTime ?? 0,
        duration: status.duration ?? 0,
      });
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  markNarrationMissing(assetName);
  try {
    p.pause();
  } catch {
    // Best-effort.
  }
  if (gen === generation) setState(IDLE_STATE);
  return false;
}
