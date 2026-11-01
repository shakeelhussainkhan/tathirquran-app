import * as Speech from 'expo-speech';

/**
 * Shared listen-aloud controller (device text-to-speech) — 1.0.8.
 *
 * One controller for every "Listen" affordance (ayah-screen translations,
 * the Arabic Majma' al-Bayan and Urdu Tafsir-e-Namoona sections, the
 * Nahjul Balagha quote card) so that only ONE section ever speaks at a
 * time: starting a section stops whatever is speaking, and every button
 * renders its Play/Stop state from the same source of truth.
 *
 * The voice is the device's own synthetic voice for the section's
 * language — there is no recorded narration for the tafsir texts. Long
 * sections are spoken in chunks (see splitIntoChunks) chained through
 * onDone, because platform TTS engines truncate or fail on very long
 * single utterances (the Namoona blocks run to tens of thousands of
 * characters).
 *
 * The Arabic ayah text itself is deliberately NOT spoken through this
 * module — the reciter audio already covers it.
 */

/** Default maximum characters per spoken chunk. */
export const MAX_CHUNK_LENGTH = 400;

/** App language code -> device TTS locale. Unknown codes pass through. */
const LANGUAGE_LOCALES: Record<string, string> = {
  en: 'en-US',
  ur: 'ur-PK',
  ar: 'ar-SA',
  fa: 'fa-IR',
};

export function speechLocaleFor(language: string): string {
  return LANGUAGE_LOCALES[language] ?? language;
}

const SENTENCE_END = /[.!?۔؟…\n]/;

/**
 * Split text into speakable chunks of at most maxLen characters.
 *
 * Cuts prefer sentence boundaries (. ! ? ۔ ؟ … and newlines); when no
 * boundary falls inside the window the cut falls back to the last space
 * before maxLen, so a word is never split (the one exception: a single
 * "word" longer than maxLen is hard-cut at maxLen). Whitespace is
 * normalised first, and joining the chunks with single spaces reproduces
 * the normalised source exactly.
 */
export function splitIntoChunks(
  text: string,
  maxLen: number = MAX_CHUNK_LENGTH,
): string[] {
  const limit = maxLen > 0 ? Math.floor(maxLen) : MAX_CHUNK_LENGTH;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let rest = normalized;
  while (rest.length > limit) {
    let cut = -1;
    // Last sentence boundary at or before the limit (index limit-1 is the
    // last character allowed inside the chunk). The boundary must be
    // followed by a space: punctuation clusters (e.g. the Urdu '۔۔۔۔۔'
    // after a quoted phrase) are not cut points, so joining the chunks
    // with single spaces reproduces the normalised source exactly.
    for (let i = limit - 1; i >= 0; i--) {
      if (SENTENCE_END.test(rest[i]) && rest[i + 1] === ' ') {
        cut = i + 1;
        break;
      }
    }
    if (cut <= 0) {
      // No sentence boundary in range: last space before the limit.
      cut = rest.lastIndexOf(' ', limit);
      if (cut <= 0) cut = limit; // single word longer than the limit
    }
    const chunk = rest.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// ── Controller state ────────────────────────────────────────────────
// A monotonically increasing generation invalidates the callbacks of any
// run that has been stopped or superseded, so a late onDone/onStopped
// from a killed utterance can never resurrect or corrupt state.

let speakingSectionId: string | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Subscribe to speaking-state changes (useSyncExternalStore-ready). */
export function subscribeSpeech(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The section currently speaking, or null (useSyncExternalStore-ready). */
export function getSpeakingSectionId(): string | null {
  return speakingSectionId;
}

function setSpeaking(sectionId: string | null): void {
  if (speakingSectionId === sectionId) return;
  speakingSectionId = sectionId;
  emit();
}

/** Stop any current speech and clear the speaking state. */
export function stopSpeech(): void {
  generation += 1;
  setSpeaking(null);
  void Speech.stop();
}

/**
 * Speak `text` as section `sectionId` in `language` (app code: en/ur/ar/fa).
 * Any current speech is stopped first — only one section speaks at a time.
 */
export function speakSection(sectionId: string, text: string, language: string): void {
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) return;

  const gen = (generation += 1);
  void Speech.stop(); // kill whatever is speaking before starting
  setSpeaking(sectionId);

  const locale = speechLocaleFor(language);
  const speakChunk = (index: number): void => {
    if (gen !== generation) return; // stopped or superseded
    if (index >= chunks.length) {
      setSpeaking(null);
      return;
    }
    Speech.speak(chunks[index], {
      language: locale,
      // Matches the Today screen's existing listen-aloud rate.
      rate: 0.9,
      onDone: () => speakChunk(index + 1),
      onStopped: () => {
        if (gen === generation) setSpeaking(null);
      },
      onError: () => {
        if (gen === generation) setSpeaking(null);
      },
    });
  };
  speakChunk(0);
}
