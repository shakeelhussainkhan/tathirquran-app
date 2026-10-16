import { supabase } from './supabase';

/**
 * Devotionals — occasion duas & ziyarat (Wave C).
 *
 * Content rule (Shakeel, standing): rows in devotional_texts are VERBATIM
 * texts from Shia (Ithna Ashari) sources, cited in source_note. No
 * Sunni-sourced content, no AI-written text, no invented translations.
 * This module only READS rows that Shakeel has seeded via
 * tathirquran-web/scripts/load_devotional_texts.js — it bundles none.
 *
 * Every read is best-effort: if migration 012 has not been run yet (table
 * missing), the device is offline, or the seed is empty, the functions
 * return null and NO devotional cards are shown. Never placeholder content.
 */

export interface DevotionalText {
  id: number;
  slug: string;
  title: string;
  /** Matches islamic_calendar_tags.occasion, or null if not occasion-bound. */
  occasion_tag: string | null;
  arabic_text: string;
  translation_text: string | null;
  source_note: string;
}

export const KUMAYL_SLUG = 'dua-kumayl';

export async function getDevotionalBySlug(slug: string): Promise<DevotionalText | null> {
  try {
    const { data, error } = await supabase
      .from('devotional_texts')
      .select('*')
      .eq('slug', slug)
      .limit(1);
    if (error) return null;
    return (data?.[0] as DevotionalText) ?? null;
  } catch {
    return null;
  }
}

export async function getDevotionalByOccasionTag(
  occasionTag: string,
): Promise<DevotionalText | null> {
  try {
    const { data, error } = await supabase
      .from('devotional_texts')
      .select('*')
      .eq('occasion_tag', occasionTag)
      .order('id')
      .limit(1);
    if (error) return null;
    return (data?.[0] as DevotionalText) ?? null;
  } catch {
    return null;
  }
}

/**
 * Today's Islamic occasion string from islamic_calendar_tags, using the
 * same Intl islamic-umalqura month/day matching as the web
 * (lib/queries.ts getTodayIslamicOccasion). Null on non-occasion days.
 */
export async function getTodayOccasion(): Promise<string | null> {
  try {
    const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
    });
    const parts = formatter.formatToParts(new Date());
    const hijriDay = parseInt(parts.find((p) => p.type === 'day')?.value ?? '0', 10);
    const hijriMonth = parseInt(parts.find((p) => p.type === 'month')?.value ?? '0', 10);
    if (!hijriDay || !hijriMonth) return null;

    const { data, error } = await supabase
      .from('islamic_calendar_tags')
      .select('occasion, priority')
      .eq('hijri_month', hijriMonth)
      .eq('hijri_day', hijriDay)
      .order('priority', { ascending: false })
      .limit(1);
    if (error) return null;
    return (data?.[0]?.occasion as string) ?? null;
  } catch {
    return null;
  }
}

export interface TodayDevotionals {
  occasionDevotional: DevotionalText | null;
  kumayl: DevotionalText | null;
}

/** The devotionals Today may surface: occasion-paired row + Dua Kumayl. */
export async function getTodayDevotionals(): Promise<TodayDevotionals> {
  const occasion = await getTodayOccasion();
  const [occasionDevotional, kumayl] = await Promise.all([
    occasion ? getDevotionalByOccasionTag(occasion) : Promise.resolve(null),
    getDevotionalBySlug(KUMAYL_SLUG),
  ]);
  // If today's occasion devotional IS Dua Kumayl, don't surface it twice.
  return {
    occasionDevotional,
    kumayl: kumayl && kumayl.slug !== occasionDevotional?.slug ? kumayl : null,
  };
}

/**
 * Dua Kumayl is recited on the eve of Friday — Thursday from Maghrib.
 * Uses the app's calculated Maghrib time (lib/prayerTimes.ts, adhan
 * Tehran/Jafari method) when location is available. When Maghrib is
 * unknown (location not granted), falls back to 18:00 local so the card
 * is not hidden from users who declined location permission.
 */
export function isThursdayEvening(now: Date, maghrib: Date | null): boolean {
  if (now.getDay() !== 4) return false; // Thursday only
  if (maghrib) return now.getTime() >= maghrib.getTime();
  return now.getHours() >= 18;
}
