import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Daily-verse streaks — local-only, no backend, no account.
 *
 * Storage: AsyncStorage key `streak_state`
 *   {
 *     last_view_date: string | null,  // local YYYY-MM-DD of the last viewed day
 *     current_streak: number,         // consecutive local days up to last_view_date
 *     longest_streak: number,         // best run ever
 *     viewed_dates: string[],         // every local YYYY-MM-DD viewed, sorted, unique
 *   }
 *
 * Day boundaries are ALWAYS local dates. Never use `toISOString()` here:
 * it is UTC, and it is the root of the known M-a8 bug class (US-evening
 * users seeing tomorrow's verse). Local components (getFullYear /
 * getMonth / getDate) are the only source of "today" in this module.
 *
 * Framing is gentle by design: milestones celebrate consistency, and a
 * missed day is met with a welcome, never shame. See WELCOME_BACK_MESSAGE.
 */

export const STREAK_STORAGE_KEY = 'streak_state';

export interface StreakState {
  last_view_date: string | null;
  current_streak: number;
  longest_streak: number;
  viewed_dates: string[];
}

export interface StreakMilestone {
  days: number;
  title: string;
  message: string;
}

export interface RecordViewResult {
  state: StreakState;
  /** True when this call was the first view of a new local day. */
  isNewDay: boolean;
  /** Milestone reached by this view, or null. Only set on a new day. */
  milestone: StreakMilestone | null;
  /** True when this view resumes after one or more missed days. */
  returnedAfterGap: boolean;
}

export const WELCOME_BACK_MESSAGE =
  'Welcome back — the door is always open. Every return to the Quran is a new beginning.';

export const STREAK_MILESTONES: StreakMilestone[] = [
  {
    days: 7,
    title: 'Barakah — 7 days with the Quran',
    message: 'A full week of returning to the Quran, one verse at a time.',
  },
  {
    days: 30,
    title: 'Barakah — 30 days with the Quran',
    message: 'Thirty days of consistency. May this habit bring light to your days.',
  },
  {
    days: 40,
    title: 'Barakah — 40 days with the Quran',
    message: 'Forty days — a number of deep significance. Steadfast and blessed.',
  },
  {
    days: 100,
    title: 'Barakah — 100 days with the Quran',
    message: 'One hundred days with the Quran. A beautiful, steady companionship.',
  },
  {
    days: 365,
    title: 'Barakah — a full year with the Quran',
    message: 'A whole year of daily verses. May it continue, day after day.',
  },
];

export function emptyStreakState(): StreakState {
  return {
    last_view_date: null,
    current_streak: 0,
    longest_streak: 0,
    viewed_dates: [],
  };
}

/** Format a Date as a local YYYY-MM-DD string. Never UTC. */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today's local date as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  return formatLocalDate(now);
}

function parseLocalDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * Whole calendar days from `a` to `b` (b - a), computed from the local
 * date components only. Using Date.UTC on the *components* is just
 * arithmetic — it never asks the clock what day it is in UTC — so DST
 * transitions cannot skew the result.
 */
export function daysBetweenLocalDates(a: string, b: string): number | null {
  const pa = parseLocalDate(a);
  const pb = parseLocalDate(b);
  if (!pa || !pb) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / msPerDay
  );
}

export function milestoneForStreak(days: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.days === days) ?? null;
}

function normaliseState(raw: unknown): StreakState {
  if (!raw || typeof raw !== 'object') return emptyStreakState();
  const value = raw as Partial<StreakState>;
  const viewed = Array.isArray(value.viewed_dates)
    ? Array.from(
        new Set(
          value.viewed_dates.filter(
            (d): d is string => typeof d === 'string' && parseLocalDate(d) !== null
          )
        )
      ).sort()
    : [];
  const current =
    typeof value.current_streak === 'number' && value.current_streak > 0
      ? Math.floor(value.current_streak)
      : 0;
  const longest =
    typeof value.longest_streak === 'number' && value.longest_streak > 0
      ? Math.floor(value.longest_streak)
      : current;
  const last =
    typeof value.last_view_date === 'string' && parseLocalDate(value.last_view_date)
      ? value.last_view_date
      : viewed.length > 0
        ? viewed[viewed.length - 1]
        : null;
  return {
    last_view_date: last,
    current_streak: current,
    longest_streak: Math.max(longest, current),
    viewed_dates: viewed,
  };
}

/**
 * Pure streak transition: given the previous state and a local today
 * string, return what viewing the daily verse today produces.
 * Exported for testing; screens should use recordDailyVerseView().
 */
export function computeNextStreakState(
  prev: StreakState,
  today: string
): RecordViewResult {
  const state = normaliseState(prev);

  if (state.last_view_date === today) {
    return { state, isNewDay: false, milestone: null, returnedAfterGap: false };
  }

  let current = 1;
  let returnedAfterGap = false;

  if (state.last_view_date) {
    const gap = daysBetweenLocalDates(state.last_view_date, today);
    if (gap === 1) {
      current = state.current_streak + 1;
    } else if (gap !== null && gap > 1) {
      // Missed one or more days: the run restarts, with a welcome — no shame.
      returnedAfterGap = state.current_streak > 0 || state.viewed_dates.length > 0;
      current = 1;
    } else if (gap !== null && gap < 0) {
      // Clock moved backwards: count the view, keep the existing run.
      current = Math.max(state.current_streak, 1);
    }
  }

  const viewed_dates = state.viewed_dates.includes(today)
    ? state.viewed_dates
    : [...state.viewed_dates, today].sort();

  const next: StreakState = {
    last_view_date: today,
    current_streak: current,
    longest_streak: Math.max(state.longest_streak, current),
    viewed_dates,
  };

  return {
    state: next,
    isNewDay: true,
    milestone: milestoneForStreak(current),
    returnedAfterGap,
  };
}

/** Read the stored streak state. Never throws; corrupt data reads as empty. */
export async function getStreakState(): Promise<StreakState> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_STORAGE_KEY);
    if (!raw) return emptyStreakState();
    return normaliseState(JSON.parse(raw));
  } catch {
    return emptyStreakState();
  }
}

/**
 * Record that the user viewed the daily verse (defaults to now, local).
 * Idempotent within a local day. Never throws.
 */
export async function recordDailyVerseView(
  now: Date = new Date()
): Promise<RecordViewResult> {
  const today = formatLocalDate(now);
  const prev = await getStreakState();
  const result = computeNextStreakState(prev, today);
  if (result.isNewDay) {
    try {
      await AsyncStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(result.state));
    } catch {
      // Streaks are a gentle extra — a storage failure must never
      // break the Today screen. The computed state is still returned.
    }
  }
  return result;
}

/** Short label for buttons/pills, e.g. "1 day with the Quran", "30 days with the Quran". */
export function streakLabel(currentStreak: number): string {
  if (currentStreak <= 0) return 'Start today — the door is always open';
  return currentStreak === 1
    ? '1 day with the Quran'
    : `${currentStreak} days with the Quran`;
}
