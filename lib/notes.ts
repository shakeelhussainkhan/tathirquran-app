import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Personal notes & tags — Wave B, Feature 1.
 *
 * Privacy: notes and tags are the user's own personal text. They are stored
 * ONLY on this device in AsyncStorage. They are never sent to Supabase, any
 * API, or any server, and there are no accounts to sync them to.
 *
 * Storage keys (one pair per ayah):
 *   note_<surah>_<ayah>  — plain-text note (key removed when the note is empty)
 *   tags_<surah>_<ayah>  — JSON array of tag strings (key removed when empty)
 *
 * No sample, placeholder or demo notes/tags are bundled anywhere.
 */

export function noteKey(surah: number, ayah: number): string {
  return `note_${surah}_${ayah}`;
}

export function tagsKey(surah: number, ayah: number): string {
  return `tags_${surah}_${ayah}`;
}

export interface AyahNotesEntry {
  surah: number;
  ayah: number;
  note: string;
  tags: string[];
}

export function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  } catch {
    return [];
  }
}

/** De-duplicate (case-insensitive), trim, and drop empty tags. Order preserved. */
export function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const clean = t.trim();
    if (!clean) continue;
    const k = clean.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(clean);
  }
  return out;
}

export async function getNote(surah: number, ayah: number): Promise<string> {
  try {
    return (await AsyncStorage.getItem(noteKey(surah, ayah))) ?? '';
  } catch {
    return '';
  }
}

export async function getTags(surah: number, ayah: number): Promise<string[]> {
  try {
    return parseTags(await AsyncStorage.getItem(tagsKey(surah, ayah)));
  } catch {
    return [];
  }
}

export async function getNoteAndTags(surah: number, ayah: number): Promise<{ note: string; tags: string[] }> {
  const [note, tags] = await Promise.all([getNote(surah, ayah), getTags(surah, ayah)]);
  return { note, tags };
}

/** Saves a note. An empty / whitespace-only note removes the key entirely. */
export async function saveNote(surah: number, ayah: number, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean) {
    await AsyncStorage.removeItem(noteKey(surah, ayah));
  } else {
    await AsyncStorage.setItem(noteKey(surah, ayah), clean);
  }
}

export async function deleteNote(surah: number, ayah: number): Promise<void> {
  await AsyncStorage.removeItem(noteKey(surah, ayah));
}

/** Saves tags (normalised). An empty list removes the key entirely. */
export async function saveTags(surah: number, ayah: number, tags: string[]): Promise<void> {
  const clean = normaliseTags(tags);
  if (clean.length === 0) {
    await AsyncStorage.removeItem(tagsKey(surah, ayah));
  } else {
    await AsyncStorage.setItem(tagsKey(surah, ayah), JSON.stringify(clean));
  }
}

const NOTE_KEY_RE = /^note_(\d+)_(\d+)$/;
const TAGS_KEY_RE = /^tags_(\d+)_(\d+)$/;

/**
 * Lists every ayah that has a note and/or tags, in Quran order.
 * Used by the Archive "My Notes" view.
 */
export async function getAllNoteEntries(): Promise<AyahNotesEntry[]> {
  const byRef = new Map<string, AyahNotesEntry>();
  try {
    const allKeys = (await AsyncStorage.getAllKeys()) as string[];
    const relevant = allKeys.filter((k) => NOTE_KEY_RE.test(k) || TAGS_KEY_RE.test(k));
    if (relevant.length === 0) return [];
    const pairs = await AsyncStorage.multiGet(relevant);
    for (const [key, value] of pairs) {
      if (value == null) continue;
      const noteMatch = key.match(NOTE_KEY_RE);
      const tagsMatch = key.match(TAGS_KEY_RE);
      const m = noteMatch ?? tagsMatch;
      if (!m) continue;
      const surah = parseInt(m[1], 10);
      const ayah = parseInt(m[2], 10);
      const id = `${surah}_${ayah}`;
      const entry = byRef.get(id) ?? { surah, ayah, note: '', tags: [] as string[] };
      if (noteMatch) entry.note = value;
      if (tagsMatch) entry.tags = parseTags(value);
      byRef.set(id, entry);
    }
  } catch {
    return [];
  }
  return [...byRef.values()]
    .filter((e) => e.note.trim().length > 0 || e.tags.length > 0)
    .sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
}

/** Ayahs that have a written note (the Archive "My Notes" filter). */
export async function getAyahsWithNotes(): Promise<AyahNotesEntry[]> {
  const all = await getAllNoteEntries();
  return all.filter((e) => e.note.trim().length > 0);
}
