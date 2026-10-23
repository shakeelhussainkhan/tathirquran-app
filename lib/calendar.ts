import { supabase } from './supabase';
import { HIJRI_MONTHS } from './utils';

/**
 * Islamic calendar — the Shia occasions the app already records in the
 * `islamic_calendar_tags` table (the same rows lib/devotionals.ts matches
 * against today for occasion duas and the Today banner; seeded by
 * tathirquran-web/scripts/seed_calendar.js).
 *
 * HARD RULE: this module only reads that table. It contains no occasion
 * dates of its own — what the table holds is what the calendar shows.
 * Reads are best-effort like lib/devotionals.ts: [] on any failure.
 */

export interface IslamicOccasion {
  occasion: string;
  hijriMonth: number; // 1–12
  hijriDay: number; // 1–30
  priority: number;
  /** Curated ayah linked to the occasion in the table, when resolvable. */
  ayah: { surah: number; ayah: number } | null;
}

export async function getIslamicOccasions(): Promise<IslamicOccasion[]> {
  const mapRows = (rows: any[]): IslamicOccasion[] =>
    rows.map((r) => ({
      occasion: r.occasion,
      hijriMonth: r.hijri_month,
      hijriDay: r.hijri_day,
      priority: r.priority ?? 0,
      ayah: r.ayahs
        ? { surah: r.ayahs.surah_number, ayah: r.ayahs.ayah_number }
        : null,
    }));

  try {
    const { data, error } = await supabase
      .from('islamic_calendar_tags')
      .select('occasion, hijri_month, hijri_day, priority, ayahs(surah_number, ayah_number)')
      .order('hijri_month', { ascending: true })
      .order('hijri_day', { ascending: true })
      .order('priority', { ascending: false });
    if (!error && data) return mapRows(data as any[]);
  } catch {
    // fall through to the plain read below
  }

  // If the ayah embed is unavailable for any reason, still show the
  // occasions themselves rather than an empty calendar.
  try {
    const { data, error } = await supabase
      .from('islamic_calendar_tags')
      .select('occasion, hijri_month, hijri_day, priority')
      .order('hijri_month', { ascending: true })
      .order('hijri_day', { ascending: true })
      .order('priority', { ascending: false });
    if (error || !data) return [];
    return mapRows(data as any[]);
  } catch {
    return [];
  }
}

export interface HijriParts {
  day: number;
  month: number;
  year: number;
}

/**
 * Today's Hijri date via the same Intl islamic-umalqura calendar that
 * lib/devotionals.ts getTodayOccasion matches occasions against — so the
 * calendar screen's "today" always agrees with the occasion banner.
 */
export function getTodayHijriParts(now: Date = new Date()): HijriParts | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(now);
    const day = parseInt(parts.find((p) => p.type === 'day')?.value ?? '0', 10);
    const month = parseInt(parts.find((p) => p.type === 'month')?.value ?? '0', 10);
    const year = parseInt(
      (parts.find((p) => p.type === 'year')?.value ?? '0').replace(/[^0-9]/g, ''),
      10,
    );
    if (!day || !month) return null;
    return { day, month, year };
  } catch {
    return null;
  }
}

export function hijriMonthName(month: number): string {
  return HIJRI_MONTHS[month - 1] ?? '';
}

/** Occasions grouped by Hijri month; months in calendar order (1–12). */
export function groupOccasionsByMonth(
  occasions: IslamicOccasion[],
): { month: number; monthName: string; occasions: IslamicOccasion[] }[] {
  const groups: { month: number; monthName: string; occasions: IslamicOccasion[] }[] = [];
  for (let m = 1; m <= 12; m++) {
    const inMonth = occasions.filter((o) => o.hijriMonth === m);
    if (inMonth.length > 0) {
      groups.push({ month: m, monthName: hijriMonthName(m), occasions: inMonth });
    }
  }
  return groups;
}

/**
 * Position of an occasion in the Hijri year cycle as seen from `today`:
 * 0 = today, positive = later in the cycle (wrapping into next year).
 * Day differences are approximate (Hijri months are 29/30 days) and are
 * used for ORDERING and the "next occasion" highlight only — never shown
 * to the user as a countdown.
 */
export function occasionCycleOffset(o: IslamicOccasion, today: HijriParts): number {
  const MONTH_DAYS = 30; // ordering only; see note above
  const ord = (m: number, d: number) => (m - 1) * MONTH_DAYS + d;
  const diff = ord(o.hijriMonth, o.hijriDay) - ord(today.month, today.day);
  return diff >= 0 ? diff : diff + 12 * MONTH_DAYS;
}
