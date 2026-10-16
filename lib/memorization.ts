import AsyncStorage from '@react-native-async-storage/async-storage';

// Memorization (hifz) helpers.
//
// This module only manipulates the DISPLAY of the ayah text and
// translation the app already loaded, and stores the user's own
// "memorized" marks on-device. It contains no religious content of
// its own: the Arabic words shown/hidden here are split, unaltered,
// from the ayah's stored text (split on whitespace only).

export interface MemorizedEntry {
  key: string;
  surah: number;
  ayah: number;
  surahName?: string;
  arabic?: string;
  translation?: string;
  date?: string;
}

export function memorizedKey(surah: number, ayah: number): string {
  return `memorized_${surah}_${ayah}`;
}

// Parse a `memorized_<surah>_<ayah>` key. Returns null for any other key.
export function parseMemorizedKey(key: string): { surah: number; ayah: number } | null {
  const m = /^memorized_(\d+)_(\d+)$/.exec(key);
  if (!m) return null;
  const surah = parseInt(m[1], 10);
  const ayah = parseInt(m[2], 10);
  if (!Number.isFinite(surah) || !Number.isFinite(ayah)) return null;
  return { surah, ayah };
}

// Split an ayah's Arabic text into words on whitespace. The text
// itself is never altered — the returned words are the exact tokens
// as stored, in reading order.
export function splitAyahWords(arabic: string | null | undefined): string[] {
  if (!arabic) return [];
  return arabic.split(/\s+/).filter(w => w.length > 0);
}

// The next word (in reading order) that is not yet hidden.
export function nextWordToHide(wordCount: number, hidden: ReadonlySet<number>): number | null {
  for (let i = 0; i < wordCount; i++) {
    if (!hidden.has(i)) return i;
  }
  return null;
}

// The earliest hidden word (in reading order), for word-by-word reveal.
export function nextWordToReveal(hidden: ReadonlySet<number>): number | null {
  let best: number | null = null;
  hidden.forEach(i => {
    if (best === null || i < best) best = i;
  });
  return best;
}

export async function isMemorized(surah: number, ayah: number): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(memorizedKey(surah, ayah));
    return v !== null;
  } catch {
    return false;
  }
}

// Mark/unmark an ayah as memorized. When marking, a small display
// record (same shape as bookmarks) is stored under the key so the
// Archive "Memorized" filter can show the verse without a lookup.
export async function setMemorized(
  entry: { surah: number; ayah: number; surahName?: string; arabic?: string; translation?: string },
  memorized: boolean,
): Promise<void> {
  const key = memorizedKey(entry.surah, entry.ayah);
  if (!memorized) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify({
    surah: entry.surah,
    ayah: entry.ayah,
    surahName: entry.surahName,
    arabic: entry.arabic,
    translation: entry.translation,
    date: new Date().toISOString(),
  }));
}

// All ayahs the user has marked as memorized, newest first.
export async function listMemorized(): Promise<MemorizedEntry[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keys = (allKeys as string[]).filter(k => parseMemorizedKey(k) !== null);
    const entries: MemorizedEntry[] = [];
    for (const k of keys) {
      const parsed = parseMemorizedKey(k)!;
      const v = await AsyncStorage.getItem(k);
      let extra: Partial<MemorizedEntry> = {};
      if (v) {
        try { extra = JSON.parse(v); } catch { /* plain flag value — key alone is enough */ }
      }
      entries.push({ key: k, surah: parsed.surah, ayah: parsed.ayah, ...extra });
    }
    entries.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      if (db !== da) return db - da;
      return a.surah - b.surah || a.ayah - b.ayah;
    });
    return entries;
  } catch {
    return [];
  }
}
