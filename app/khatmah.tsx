import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  KHATMAH_PLANS,
  KhatmahState,
  loadKhatmahState,
  startKhatmahPlan,
  clearKhatmahPlan,
  markPortionDone,
  markPortionNotDone,
  getKhatmahProgress,
  getPortion,
  formatPortionRange,
  SURAH_NAMES_ENGLISH,
} from '../lib/khatmah';
import { getSurahNames } from '../lib/queries';
import { Colors } from '../constants/colors';
import { useTheme } from '../lib/theme';

// Khatmah / reading plans screen.
//
// Pick a plan, read the portions in order, mark each portion read when
// you finish it. There are no streaks and no penalties: if a day is
// missed, nothing is lost — the next portion simply waits. All copy on
// this screen is original, neutral UI text written for this app; it is
// not a quotation from any source.
export default function KhatmahScreen() {
  const theme = useTheme();
  const [state, setState] = useState<KhatmahState | null>(null);
  const [surahNames, setSurahNames] = useState<string[]>(SURAH_NAMES_ENGLISH);
  const [loading, setLoading] = useState(true);
  const [showAllPortions, setShowAllPortions] = useState(false);

  const refresh = useCallback(async () => {
    const [saved, names] = await Promise.all([loadKhatmahState(), getSurahNames()]);
    setState(saved);
    if (names.length > 0) setSurahNames(names);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleStart = async (planId: string) => {
    const next = await startKhatmahPlan(planId);
    setState(next);
    setShowAllPortions(false);
  };

  const confirmEndPlan = () => {
    Alert.alert(
      'End this plan?',
      'Your progress for this plan will be cleared. You can start a plan again at any time.',
      [
        { text: 'Keep plan', style: 'cancel' },
        {
          text: 'End plan',
          style: 'destructive',
          onPress: async () => {
            await clearKhatmahPlan();
            setState(null);
            setShowAllPortions(false);
          },
        },
      ],
    );
  };

  const togglePortion = async (index: number, done: boolean) => {
    if (!state) return;
    const next = done
      ? await markPortionNotDone(state, index)
      : await markPortionDone(state, index);
    setState(next);
  };

  const s = makeStyles(theme);

  if (loading) {
    return (
      <View style={[{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.bronze} />
      </View>
    );
  }

  const progress = state ? getKhatmahProgress(state) : null;

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.goldBar} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.title}>READING PLAN</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={s.scroll}>
        {!state || !progress ? (
          <>
            <Text style={s.intro}>
              A khatmah is a complete reading of the Quran, from beginning to end.
              Choose a pace below and the Quran is divided into equal daily
              portions, in order. There is no account and nothing is tracked
              anywhere but on this device.
            </Text>
            <Text style={s.gentle}>
              Read at your own pace. If a day is missed, nothing is lost —
              your place is kept and you simply continue when you return.
            </Text>

            {KHATMAH_PLANS.map((plan) => (
              <View key={plan.id} style={s.planCard}>
                <Text style={s.planName}>{plan.name}</Text>
                <Text style={s.planDesc}>{plan.description}</Text>
                <TouchableOpacity
                  style={s.startBtn}
                  onPress={() => handleStart(plan.id)}
                  activeOpacity={0.7}
                >
                  <Text style={s.startBtnText}>START THIS PLAN</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={s.planName}>{progress.plan.name}</Text>
            <Text style={s.planMeta}>
              Started {state.startDate} · Portions are read in order, from 1:1.
            </Text>

            {progress.isComplete ? (
              <>
                <Text style={s.body}>
                  You have completed this reading plan — all {progress.totalPortions} portions.
                </Text>
                <Text style={s.gentle}>
                  You can start a new plan below whenever you wish.
                </Text>
              </>
            ) : progress.nextPortion ? (
              <>
                <Text style={s.label}>YOUR NEXT PORTION</Text>
                <Text style={s.range}>
                  {formatPortionRange(progress.nextPortion, surahNames)}
                </Text>
                <Text style={s.planMeta}>
                  Portion {progress.nextPortion.index + 1} of {progress.totalPortions} ·{' '}
                  {progress.nextPortion.ayahCount} verses
                </Text>
                <Text style={s.gentle}>
                  Read at your own pace — your place is kept if a day is missed.
                </Text>
                <TouchableOpacity
                  style={s.readBtn}
                  onPress={() =>
                    router.push(
                      `/read?mode=portion&plan=${progress.plan.days}&portion=${progress.nextPortion!.index}` as any,
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Text style={s.readBtnText}>📖 READ THIS PORTION</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.doneBtn}
                  onPress={() => togglePortion(progress.nextPortion!.index, false)}
                  activeOpacity={0.7}
                >
                  <Text style={s.doneBtnText}>✓ MARK THIS PORTION READ</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {/* Progress bar */}
            <View style={s.barTrack}>
              <View
                style={[
                  s.barFill,
                  { width: `${Math.round(progress.fraction * 100)}%` },
                ]}
              />
            </View>
            <Text style={s.progressText}>
              {progress.completedCount} of {progress.totalPortions} portions read ·{' '}
              {progress.ayahsRead} of 6,236 verses · {Math.round(progress.fraction * 100)}%
            </Text>

            <TouchableOpacity
              style={s.listToggle}
              onPress={() => setShowAllPortions((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={s.listToggleText}>
                {showAllPortions ? 'HIDE ALL PORTIONS ↑' : 'VIEW ALL PORTIONS ↓'}
              </Text>
            </TouchableOpacity>

            {showAllPortions && (
              <View style={s.portionList}>
                {Array.from({ length: progress.totalPortions }, (_, i) => {
                  const portion = getPortion(progress.plan.days, i);
                  const done = state.completedPortions.includes(i);
                  const isNext = progress.nextPortion?.index === i;
                  return (
                    <View
                      key={i}
                      style={[s.portionRow, isNext && s.portionRowNext]}
                    >
                      <TouchableOpacity
                        onPress={() => togglePortion(i, done)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel={done ? 'Mark portion as not read' : 'Mark portion as read'}
                      >
                        <Text style={[s.portionCheck, { color: done ? theme.gold : theme.textSecondary }]}>
                          {done ? '✓' : '○'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() =>
                          router.push(
                            `/read?mode=portion&plan=${progress.plan.days}&portion=${i}` as any,
                          )
                        }
                        activeOpacity={0.7}
                      >
                        <Text style={[s.portionRange, { color: theme.text }]}>
                          {formatPortionRange(portion, surahNames)}
                        </Text>
                        <Text style={s.portionMeta}>
                          Portion {i + 1} · {portion.ayahCount} verses
                          {isNext ? ' · up next' : ''}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={s.gentle}>
              Tap a portion to read its verses here in the app. Tap the circle
              to mark it read, or tap again to undo.
            </Text>

            <TouchableOpacity style={s.endBtn} onPress={confirmEndPlan} activeOpacity={0.7}>
              <Text style={s.endBtnText}>END THIS PLAN</Text>
            </TouchableOpacity>

            {progress.isComplete && (
              <>
                <Text style={s.label}>START A NEW PLAN</Text>
                {KHATMAH_PLANS.map((plan) => (
                  <View key={plan.id} style={s.planCard}>
                    <Text style={s.planName}>{plan.name}</Text>
                    <Text style={s.planDesc}>{plan.description}</Text>
                    <TouchableOpacity
                      style={s.startBtn}
                      onPress={() => handleStart(plan.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.startBtnText}>START THIS PLAN</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
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
    scroll: { padding: 24 },
    intro: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 15,
      lineHeight: 24,
      color: theme.text,
      textAlign: 'center',
      marginBottom: 10,
    },
    gentle: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      fontStyle: 'italic',
      lineHeight: 20,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: 18,
    },
    planCard: {
      borderWidth: 0.5,
      borderColor: theme.border,
      backgroundColor: theme.bgCard,
      borderRadius: 4,
      padding: 16,
      marginBottom: 12,
    },
    planName: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 18,
      color: theme.text,
      textAlign: 'center',
      marginBottom: 6,
    },
    planDesc: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      lineHeight: 20,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: 12,
    },
    planMeta: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 12,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: 10,
    },
    startBtn: {
      backgroundColor: theme.bronze,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 2,
      alignSelf: 'center',
    },
    startBtnText: {
      color: '#fff',
      fontSize: 10,
      letterSpacing: 1.5,
      fontFamily: 'Amiri_400Regular',
    },
    label: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      letterSpacing: 2,
      color: theme.bronze,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 6,
    },
    range: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 19,
      lineHeight: 28,
      color: theme.text,
      textAlign: 'center',
      marginBottom: 4,
    },
    body: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 15,
      lineHeight: 24,
      color: theme.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    readBtn: {
      borderWidth: 0.5,
      borderColor: theme.bronze,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 10,
    },
    readBtnText: {
      color: theme.bronze,
      fontSize: 11,
      letterSpacing: 1.5,
      fontFamily: 'Amiri_400Regular',
    },
    doneBtn: {
      backgroundColor: theme.bronze,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 18,
    },
    doneBtnText: {
      color: '#fff',
      fontSize: 11,
      letterSpacing: 1.5,
      fontFamily: 'Amiri_400Regular',
    },
    barTrack: {
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: theme.border,
      marginBottom: 6,
    },
    barFill: { height: '100%', borderRadius: 3, backgroundColor: theme.gold },
    progressText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 12,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: 16,
    },
    listToggle: { alignSelf: 'center', paddingVertical: 8, marginBottom: 8 },
    listToggleText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      letterSpacing: 2,
      color: theme.bronze,
    },
    portionList: { marginBottom: 12 },
    portionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    portionRowNext: { backgroundColor: 'rgba(201,162,39,0.06)' },
    portionCheck: { fontSize: 16, width: 20, textAlign: 'center' },
    portionRange: { fontFamily: 'Amiri_400Regular', fontSize: 14, lineHeight: 20 },
    portionMeta: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 11,
      color: theme.textSecondary,
      marginTop: 2,
    },
    endBtn: {
      borderWidth: 0.5,
      borderColor: theme.border,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 8,
    },
    endBtnText: {
      fontSize: 10,
      letterSpacing: 1.5,
      fontFamily: 'Amiri_400Regular',
      color: theme.textSecondary,
    },
  });
}
