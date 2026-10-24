import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import {
  KhatmahProgress,
  formatPortionRange,
  SURAH_NAMES_ENGLISH,
} from '../lib/khatmah';
import { useTheme } from '../lib/theme';

// Card shown on the Today screen while a Khatmah plan is active.
// Gentle by design: it shows the reader's next portion and overall
// progress only — no streaks, no day counts owed, nothing that turns a
// missed day into a failure. Copy is original, neutral UI text.
export default function KhatmahCard({
  progress,
  surahNames,
  onMarkDone,
}: {
  progress: KhatmahProgress;
  surahNames?: string[];
  onMarkDone: (portionIndex: number) => void;
}) {
  const theme = useTheme();
  const names = surahNames && surahNames.length > 0 ? surahNames : SURAH_NAMES_ENGLISH;
  const pct = Math.round(progress.fraction * 100);
  const next = progress.nextPortion;

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgCard }]}>
      <Text style={[styles.eyebrow, { color: theme.bronze }]}>READING PLAN</Text>
      <Text style={[styles.planName, { color: theme.text }]}>{progress.plan.name}</Text>

      {progress.isComplete || !next ? (
        <>
          <Text style={[styles.body, { color: theme.text }]}>
            You have completed this reading plan.
          </Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            You can start a new plan whenever you wish.
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: theme.textSecondary }]}>YOUR NEXT PORTION</Text>
          <Text style={[styles.range, { color: theme.text }]}>
            {formatPortionRange(next, names)}
          </Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            Portion {next.index + 1} of {progress.totalPortions} · {next.ayahCount} verses
          </Text>
          <Text style={[styles.gentle, { color: theme.textSecondary }]}>
            Read at your own pace — your place is kept if a day is missed.
          </Text>
        </>
      )}

      {/* Progress bar */}
      <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.barFill,
            { backgroundColor: theme.gold, width: `${Math.max(0, Math.min(100, pct))}%` },
          ]}
        />
      </View>
      <Text style={[styles.progressText, { color: theme.textSecondary }]}>
        {progress.completedCount} of {progress.totalPortions} portions · {pct}% of the Quran
      </Text>

      <View style={styles.actions}>
        {!progress.isComplete && next && (
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: theme.bronze }]}
            onPress={() => onMarkDone(next.index)}
            activeOpacity={0.7}
          >
            <Text style={styles.doneBtnText}>✓ MARK PORTION READ</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.openBtn, { borderColor: theme.border }]}
          onPress={() => router.push('/khatmah' as any)}
          activeOpacity={0.7}
        >
          <Text style={[styles.openBtnText, { color: theme.bronze }]}>OPEN PLAN →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 0.5,
    borderRadius: 4,
    padding: 16,
    marginTop: 4,
    marginBottom: 16,
  },
  eyebrow: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 4,
  },
  planName: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 10,
  },
  label: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  range: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 4,
  },
  body: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 4,
  },
  sub: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 6,
  },
  gentle: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 10,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 6,
  },
  barFill: { height: '100%', borderRadius: 3 },
  progressText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  doneBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 2 },
  doneBtnText: {
    color: '#fff',
    fontSize: 11,
    letterSpacing: 1.5,
    fontFamily: 'Amiri_400Regular',
  },
  openBtn: { borderWidth: 0.5, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 2 },
  openBtnText: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontFamily: 'Amiri_400Regular',
  },
});
