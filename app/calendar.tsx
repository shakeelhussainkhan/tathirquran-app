import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  getIslamicOccasions,
  getTodayHijriParts,
  groupOccasionsByMonth,
  hijriMonthName,
  occasionCycleOffset,
  type HijriParts,
  type IslamicOccasion,
} from '../lib/calendar';
import { Colors } from '../constants/colors';
import { useTheme } from '../lib/theme';

/**
 * Islamic calendar (v1.0.4, suggestion #2) — the Shia occasions the app
 * already records in `islamic_calendar_tags` (Wiladat, Shahadat and the
 * major occasions used for the daily-verse schedule and occasion
 * devotionals), browsable by Hijri month with today and the next
 * occasion highlighted.
 *
 * The screen shows exactly the rows in that table — no dates are added
 * here. Each occasion links to its curated ayah when the table has one.
 */
export default function CalendarScreen() {
  const theme = useTheme();
  const [occasions, setOccasions] = useState<IslamicOccasion[]>([]);
  const [today, setToday] = useState<HijriParts | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await getIslamicOccasions();
    setOccasions(rows);
    setFailed(rows.length === 0);
    setToday(getTodayHijriParts());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const s = makeStyles(theme);

  const isToday = (o: IslamicOccasion) =>
    !!today && o.hijriMonth === today.month && o.hijriDay === today.day;

  // The next occasion strictly after today (cycle order); today's own
  // occasions are highlighted as TODAY instead.
  const nextOccasion =
    today && occasions.length > 0
      ? occasions
          .filter((o) => !isToday(o))
          .sort((a, b) => occasionCycleOffset(a, today) - occasionCycleOffset(b, today))[0]
      : undefined;

  const groups = groupOccasionsByMonth(occasions);
  const todaysOccasions = occasions.filter(isToday);

  const renderOccasion = (o: IslamicOccasion) => {
    const todayRow = isToday(o);
    const nextRow = nextOccasion === o;
    const body = (
      <>
        <Text style={[s.dayNumber, { color: todayRow ? theme.gold : theme.text }]}>
          {o.hijriDay}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.occasionName, { color: theme.text }]}>{o.occasion}</Text>
          <Text style={[s.occasionMeta, { color: theme.textSecondary }]}>
            {o.hijriDay} {hijriMonthName(o.hijriMonth)}
            {o.ayah ? ` · Quran ${o.ayah.surah}:${o.ayah.ayah}` : ''}
          </Text>
        </View>
        {todayRow ? (
          <Text style={[s.tag, { color: theme.gold }]}>TODAY</Text>
        ) : nextRow ? (
          <Text style={[s.tag, { color: theme.bronze }]}>NEXT</Text>
        ) : o.ayah ? (
          <Text style={[s.tag, { color: theme.textSecondary }]}>→</Text>
        ) : null}
      </>
    );
    const rowStyle = [
      s.occasionRow,
      { borderBottomColor: theme.border },
      todayRow && { backgroundColor: 'rgba(201,162,39,0.08)' },
    ];
    return o.ayah ? (
      <TouchableOpacity
        key={`${o.hijriMonth}-${o.hijriDay}-${o.occasion}`}
        style={rowStyle}
        activeOpacity={0.7}
        onPress={() => router.push(`/ayah/${o.ayah!.surah}/${o.ayah!.ayah}` as any)}
      >
        {body}
      </TouchableOpacity>
    ) : (
      <View key={`${o.hijriMonth}-${o.hijriDay}-${o.occasion}`} style={rowStyle}>
        {body}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.goldBar} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>ISLAMIC CALENDAR</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={Colors.bronze} />
        </View>
      ) : failed ? (
        <View style={s.center}>
          <Text style={[s.emptyTitle, { color: theme.text }]}>Calendar unavailable</Text>
          <Text style={[s.emptyText, { color: theme.textSecondary }]}>
            The calendar could not be loaded. Please check your connection and
            try again.
          </Text>
          <TouchableOpacity onPress={() => void refresh()} activeOpacity={0.7}>
            <Text style={[s.retry, { color: theme.gold }]}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={s.scroll}>
          {today && (
            <Text style={[s.todayLine, { color: theme.textSecondary }]}>
              Today · {today.day} {hijriMonthName(today.month)} {today.year} AH
            </Text>
          )}

          {todaysOccasions.map((o) => (
            <View
              key={`banner-${o.hijriMonth}-${o.hijriDay}-${o.occasion}`}
              style={[s.todayBanner, { borderColor: theme.gold }]}
            >
              <Text style={[s.todayBannerLabel, { color: theme.gold }]}>TODAY</Text>
              <Text style={[s.todayBannerText, { color: theme.text }]}>{o.occasion}</Text>
            </View>
          ))}

          {groups.map((group) => (
            <View key={group.month}>
              <Text style={s.monthHeader}>{group.monthName.toUpperCase()}</Text>
              {group.occasions.map(renderOccasion)}
            </View>
          ))}

          <Text style={[s.footnote, { color: theme.textSecondary }]}>
            Occasions recorded in the app&apos;s calendar. Tap an occasion to
            open its verse.
          </Text>
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
      <View style={s.goldBar} />
    </SafeAreaView>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    goldBar: { height: 4, backgroundColor: theme.bronze },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    back: { fontFamily: 'Amiri_400Regular', fontSize: 14, width: 60, color: theme.gold },
    title: { fontFamily: 'Amiri_400Regular', fontSize: 10, letterSpacing: 3, color: theme.gold },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 10,
    },
    emptyTitle: { fontFamily: 'Amiri_400Regular', fontSize: 17 },
    emptyText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 20,
    },
    retry: { fontFamily: 'Amiri_400Regular', fontSize: 11, letterSpacing: 2, marginTop: 6 },
    scroll: { paddingHorizontal: 20, paddingTop: 16 },
    todayLine: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 12,
    },
    todayBanner: {
      borderWidth: 0.5,
      borderRadius: 4,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginBottom: 8,
      backgroundColor: 'rgba(201,162,39,0.06)',
    },
    todayBannerLabel: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 9,
      letterSpacing: 2,
      marginBottom: 4,
    },
    todayBannerText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 16,
      textAlign: 'center',
    },
    monthHeader: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      color: theme.gold,
      letterSpacing: 2,
      paddingTop: 22,
      paddingBottom: 6,
    },
    occasionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 11,
      paddingHorizontal: 6,
      borderBottomWidth: 0.5,
    },
    dayNumber: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 17,
      width: 30,
      textAlign: 'center',
    },
    occasionName: { fontFamily: 'Amiri_400Regular', fontSize: 14, lineHeight: 19 },
    occasionMeta: { fontFamily: 'Amiri_400Regular', fontSize: 11, marginTop: 2 },
    tag: { fontFamily: 'Amiri_400Regular', fontSize: 9, letterSpacing: 1.5 },
    footnote: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 11,
      fontStyle: 'italic',
      textAlign: 'center',
      lineHeight: 16,
      paddingTop: 20,
    },
  });
}
