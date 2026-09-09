import { supabase } from './supabase';

export async function getTodayAyah() {
  const today = new Date().toISOString().split('T')[0];

  const { data: schedule } = await supabase
    .from('daily_schedule')
    .select('ayah_id')
    .eq('schedule_date', today)
    .single();

  if (!schedule) return null;

  const { data: ayah } = await supabase
    .from('ayahs')
    .select('*, surahs(*)')
    .eq('ayah_id', schedule.ayah_id)
    .single();

  return ayah;
}

export async function getDefaultTranslation(ayahId: number, languageCode: string = 'en') {
  const { data: translation } = await supabase
    .from('translations')
    .select('translation_id')
    .eq('language_code', languageCode)
    .eq('is_default', true)
    .single();

  if (!translation) return null;

  const { data: ayahTranslation } = await supabase
    .from('ayah_translations')
    .select('text, translations(scholar_name, attribution_text)')
    .eq('ayah_id', ayahId)
    .eq('translation_id', translation.translation_id)
    .single();

  return ayahTranslation;
}

export async function getLiveLanguages() {
  const { data } = await supabase
    .from('languages')
    .select('*')
    .in('launch_status', ['live', 'beta'])
    .order('display_order');
  return data || [];
}

export async function getRecentSchedule(limit = 30) {
  const { data } = await supabase
    .from('daily_schedule')
    .select('schedule_date, ayah_id, ayahs(surah_number, ayah_number, arabic_uthmani, surahs(name_english, name_arabic))')
    .order('schedule_date', { ascending: false })
    .limit(limit);
  return data || [];
}
