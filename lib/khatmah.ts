// Khatmah / reading plans — local-only, no backend, no account.
//
// A khatmah plan divides the whole Quran (6,236 ayahs, Hafs count — the
// same count as the `ayahs` table in Supabase) into equal daily portions,
// read in order from 1:1. Portion boundaries are computed from the
// standard per-surah ayah counts below (factual metadata; the counts sum
// to exactly 6,236, matching the rows stored in Supabase). Portions are
// never hardcoded as surah:ayah ranges — every range is derived here.
//
// State lives in AsyncStorage under `khatmah_state`:
//   { planId, startDate, completedPortions }
// There are deliberately NO streak mechanics: a missed day never resets
// anything, never loses progress, and is never framed as a failure. The
// suggested portion for today is simply the earliest unfinished one, so
// the reader's place is kept however their days fall.
//
// All dates are LOCAL calendar dates (YYYY-MM-DD built from
// getFullYear/getMonth/getDate). No toISOString() day logic — that class
// of UTC bug would shift "today" for evening users in the Americas.
//
// Content note (standing rule): every string in this module is neutral,
// original UI copy written for this app. Nothing here is a quotation or
// paraphrase of any tafsir, hadith, or scholar, and nothing is
// attributed to anyone.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const KHATMAH_STORAGE_KEY = 'khatmah_state';

export const TOTAL_AYAHS = 6236;

// Standard per-surah ayah counts (Hafs), surahs 1–114. Sum = 6,236.
export const SURAH_AYAH_COUNTS: number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
  123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
  34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
  60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
  28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
  15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
  5, 4, 5, 6,
];

// Fallback English surah names (factual metadata), used only when the
// names stored in Supabase cannot be fetched. The UI prefers the
// Supabase `surahs` names whenever they load (see lib/queries.ts).
export const SURAH_NAMES_ENGLISH: string[] = [
  'Al-Fatihah', 'Al-Baqarah', 'Aal-e-Imran', 'An-Nisa', 'Al-Maidah',
  "Al-An'am", "Al-A'raf", 'Al-Anfal', 'At-Taubah', 'Yunus',
  'Hud', 'Yusuf', "Ar-Ra'd", 'Ibrahim', 'Al-Hijr',
  'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Taha',
  'Al-Anbiya', 'Al-Hajj', 'Al-Muminun', 'An-Nur', 'Al-Furqan',
  "Ash-Shu'ara", 'An-Naml', 'Al-Qasas', 'Al-Ankabut', 'Ar-Rum',
  'Luqman', 'As-Sajdah', 'Al-Ahzab', 'Saba', 'Fatir',
  'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir',
  'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah',
  'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf',
  'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman',
  "Al-Waqi'ah", 'Al-Hadid', 'Al-Mujadila', 'Al-Hashr', 'Al-Mumtahanah',
  'As-Saff', "Al-Jumu'ah", 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq',
  'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqah', "Al-Ma'arij",
  'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyamah',
  'Al-Insan', 'Al-Mursalat', 'An-Naba', "An-Nazi'at", "'Abasa",
  'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj',
  'At-Tariq', "Al-A'la", 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad',
  'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin',
  "Al-'Alaq", 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', "Al-'Adiyat",
  "Al-Qari'ah", 'At-Takathur', "Al-'Asr", 'Al-Humazah', 'Al-Fil',
  'Quraysh', "Al-Ma'un", 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr',
  'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas',
];

export interface KhatmahPlan {
  id: string;
  /** Honest, neutral plan name — no religious claims attached. */
  name: string;
  days: number;
  /** Plain description of the pace, in verses per day. */
  description: string;
}

export const KHATMAH_PLANS: KhatmahPlan[] = [
  {
    id: 'khatmah-30',
    name: '30-Day Khatmah',
    days: 30,
    description: 'The whole Quran in 30 days, in order — about 208 verses a day.',
  },
  {
    id: 'khatmah-90',
    name: '90-Day Khatmah',
    days: 90,
    description: 'The whole Quran in 90 days, in order — about 69 verses a day.',
  },
  {
    id: 'quran-in-a-year',
    name: 'Quran in a Year',
    days: 365,
    description:
      'The whole Quran in 365 days, in order — about 17 verses a day. ' +
      'Portions follow the same in-order sequence as the app\u2019s daily verse schedule.',
  },
];

export function getPlan(planId: string): KhatmahPlan | null {
  return KHATMAH_PLANS.find((p) => p.id === planId) ?? null;
}

// ── Local dates ─────────────────────────────────────────────────────────────

/** Local calendar date as YYYY-MM-DD (never UTC). */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

/** Parse a YYYY-MM-DD string as a LOCAL date (midnight local time). */
export function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whole local calendar days from `from` to `to` (both YYYY-MM-DD).
 * Uses date components only, so DST transitions cannot skew the result.
 * Negative when `to` is before `from`.
 */
export function localDayDiff(from: string, to: string): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  if (!a || !b) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bUtc - aUtc) / msPerDay);
}

// ── Portion maths (pure) ────────────────────────────────────────────────────

export interface SurahAyahRef {
  surah: number; // 1–114
  ayah: number; // 1-based within the surah
}

/** Convert a 0-based global ayah index (0 = 1:1) to a surah:ayah ref. */
export function globalIndexToRef(index: number): SurahAyahRef {
  const clamped = Math.max(0, Math.min(TOTAL_AYAHS - 1, Math.floor(index)));
  let remaining = clamped;
  for (let s = 0; s < SURAH_AYAH_COUNTS.length; s++) {
    if (remaining < SURAH_AYAH_COUNTS[s]) {
      return { surah: s + 1, ayah: remaining + 1 };
    }
    remaining -= SURAH_AYAH_COUNTS[s];
  }
  // Unreachable while counts sum to TOTAL_AYAHS; kept as a safe floor.
  return { surah: 114, ayah: SURAH_AYAH_COUNTS[113] };
}

/** Convert a surah:ayah ref to a 0-based global ayah index. */
export function refToGlobalIndex(ref: SurahAyahRef): number {
  let idx = 0;
  for (let s = 1; s < ref.surah; s++) idx += SURAH_AYAH_COUNTS[s - 1];
  return idx + (ref.ayah - 1);
}

export interface KhatmahPortion {
  /** 0-based portion index within the plan. */
  index: number;
  start: SurahAyahRef;
  end: SurahAyahRef;
  ayahCount: number;
}

/**
 * The portion for a 0-based day index of a plan with `planDays` portions.
 * Boundaries use floor(i * TOTAL / days), so the portions exactly
 * partition all 6,236 ayahs: no gaps, no overlaps, in Quran order.
 */
export function getPortion(planDays: number, index: number): KhatmahPortion {
  const days = Math.max(1, Math.floor(planDays));
  const i = Math.max(0, Math.min(days - 1, Math.floor(index)));
  const startGlobal = Math.floor((i * TOTAL_AYAHS) / days);
  const endGlobalExclusive = Math.floor(((i + 1) * TOTAL_AYAHS) / days);
  return {
    index: i,
    start: globalIndexToRef(startGlobal),
    end: globalIndexToRef(endGlobalExclusive - 1),
    ayahCount: endGlobalExclusive - startGlobal,
  };
}

/** Human label for a portion range, e.g. "Al-Baqarah 2:115 – 2:252". */
export function formatPortionRange(
  portion: KhatmahPortion,
  surahNames: string[] = SURAH_NAMES_ENGLISH,
): string {
  const name = (surah: number) => surahNames[surah - 1] ?? `Surah ${surah}`;
  const { start, end } = portion;
  if (start.surah === end.surah) {
    return `${name(start.surah)} ${start.surah}:${start.ayah} – ${end.ayah}`;
  }
  return (
    `${name(start.surah)} ${start.surah}:${start.ayah} – ` +
    `${name(end.surah)} ${end.surah}:${end.ayah}`
  );
}

/** Short numeric label, e.g. "2:115 – 2:252". */
export function formatPortionRef(portion: KhatmahPortion): string {
  const { start, end } = portion;
  if (start.surah === end.surah) return `${start.surah}:${start.ayah} – ${end.ayah}`;
  return `${start.surah}:${start.ayah} – ${end.surah}:${end.ayah}`;
}

// ── State ───────────────────────────────────────────────────────────────────

export interface KhatmahState {
  planId: string;
  /** Local YYYY-MM-DD the plan was started. */
  startDate: string;
  /** 0-based portion indices the reader has marked done. */
  completedPortions: number[];
}

function normaliseState(raw: unknown): KhatmahState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const plan = typeof r.planId === 'string' ? getPlan(r.planId) : null;
  if (!plan) return null;
  if (typeof r.startDate !== 'string' || !parseLocalDate(r.startDate)) return null;
  const completed = Array.isArray(r.completedPortions)
    ? Array.from(
        new Set(
          r.completedPortions.filter(
            (n): n is number =>
              typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < plan.days,
          ),
        ),
      ).sort((a, b) => a - b)
    : [];
  return { planId: plan.id, startDate: r.startDate, completedPortions: completed };
}

/** Load the saved plan state, or null when no plan is active. Never throws. */
export async function loadKhatmahState(): Promise<KhatmahState | null> {
  try {
    const raw = await AsyncStorage.getItem(KHATMAH_STORAGE_KEY);
    if (!raw) return null;
    return normaliseState(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function saveKhatmahState(state: KhatmahState): Promise<void> {
  await AsyncStorage.setItem(KHATMAH_STORAGE_KEY, JSON.stringify(state));
}

/** Start (or restart) a plan today. Returns the new state. */
export async function startKhatmahPlan(planId: string): Promise<KhatmahState | null> {
  const plan = getPlan(planId);
  if (!plan) return null;
  const state: KhatmahState = {
    planId: plan.id,
    startDate: todayLocalDate(),
    completedPortions: [],
  };
  await saveKhatmahState(state);
  return state;
}

/** End the active plan and clear its state. */
export async function clearKhatmahPlan(): Promise<void> {
  await AsyncStorage.removeItem(KHATMAH_STORAGE_KEY);
}

/** Mark a portion done (idempotent). Returns the updated state. */
export async function markPortionDone(
  state: KhatmahState,
  portionIndex: number,
): Promise<KhatmahState> {
  if (state.completedPortions.includes(portionIndex)) return state;
  const next: KhatmahState = {
    ...state,
    completedPortions: [...state.completedPortions, portionIndex].sort((a, b) => a - b),
  };
  await saveKhatmahState(next);
  return next;
}

/** Undo a done mark (idempotent). Returns the updated state. */
export async function markPortionNotDone(
  state: KhatmahState,
  portionIndex: number,
): Promise<KhatmahState> {
  if (!state.completedPortions.includes(portionIndex)) return state;
  const next: KhatmahState = {
    ...state,
    completedPortions: state.completedPortions.filter((n) => n !== portionIndex),
  };
  await saveKhatmahState(next);
  return next;
}

// ── Derived progress (pure) ─────────────────────────────────────────────────

export interface KhatmahProgress {
  plan: KhatmahPlan;
  /** Portions marked done. */
  completedCount: number;
  totalPortions: number;
  /** Ayahs covered by the completed portions. */
  ayahsRead: number;
  /** 0–1 fraction of the Quran covered by completed portions. */
  fraction: number;
  /** Whole local days since the plan started (0 on the start day). */
  elapsedDays: number;
  /**
   * The portion to read next: the earliest unfinished portion, or null
   * when the plan is complete. This — not the calendar — is what keeps
   * the reader's place, so a missed day changes nothing.
   */
  nextPortion: KhatmahPortion | null;
  isComplete: boolean;
}

export function getKhatmahProgress(
  state: KhatmahState,
  today: string = todayLocalDate(),
): KhatmahProgress | null {
  const plan = getPlan(state.planId);
  if (!plan) return null;

  let ayahsRead = 0;
  const done = new Set(state.completedPortions);
  for (const idx of done) {
    if (idx >= 0 && idx < plan.days) ayahsRead += getPortion(plan.days, idx).ayahCount;
  }

  let nextPortion: KhatmahPortion | null = null;
  for (let i = 0; i < plan.days; i++) {
    if (!done.has(i)) {
      nextPortion = getPortion(plan.days, i);
      break;
    }
  }

  return {
    plan,
    completedCount: done.size,
    totalPortions: plan.days,
    ayahsRead,
    fraction: ayahsRead / TOTAL_AYAHS,
    elapsedDays: Math.max(0, localDayDiff(state.startDate, today)),
    nextPortion,
    isComplete: nextPortion === null,
  };
}
