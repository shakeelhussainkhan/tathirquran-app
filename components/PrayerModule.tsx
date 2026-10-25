import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../lib/theme';
import { cardinalDirection } from '../lib/qibla';

/**
 * The foot of the Today screen (v1.0.6 design round): prayer times no
 * longer headline the page. Two quiet rows close it instead — Prayer
 * Times (opens the premium clock pop-out) and Qibla Finder, which also
 * lives here so it is one tap from the prayer times, where the need
 * for it arises (Shakeel, 2026-10-24).
 */
export default function PrayerModule({
  theme,
  bearing,
  onOpenPrayerTimes,
}: {
  theme: Theme;
  bearing: number | null;
  onOpenPrayerTimes: () => void;
}) {
  const router = useRouter();

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <TouchableOpacity style={styles.row} onPress={onOpenPrayerTimes} activeOpacity={0.7}>
        <View style={[styles.iconWrap, { backgroundColor: theme.bgSoft }]}>
          <Ionicons name="time-outline" size={18} color={theme.primary} />
        </View>
        <Text style={[styles.rowLabel, { color: theme.text }]}>Prayer Times</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
      </TouchableOpacity>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push('/qibla')}
        activeOpacity={0.7}
      >
        <View style={[styles.iconWrap, { backgroundColor: theme.bgSoft }]}>
          <Ionicons name="compass-outline" size={18} color={theme.primary} />
        </View>
        <Text style={[styles.rowLabel, { color: theme.text }]}>Qibla Finder</Text>
        {bearing !== null && (
          <Text style={[styles.rowValue, { color: theme.textSecondary }]}>
            {bearing.toFixed(1)}° {cardinalDirection(bearing)}
          </Text>
        )}
        <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 0.5,
    borderRadius: 14,
    marginTop: 18,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 13.5, fontWeight: '600' },
  rowValue: { fontSize: 11.5 },
  divider: { height: 0.5, marginLeft: 60 },
});
