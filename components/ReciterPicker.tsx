import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RECITERS, type Reciter } from '../lib/reciters';
import { useTheme } from '../lib/theme';

/**
 * Reciter picker — one component, two shapes:
 *  - variant="chips": compact pill row, used near the Today audio controls.
 *  - variant="rows": full-width rows with a checkmark, used in Settings.
 * The caller owns the selected state and persistence (lib/reciters).
 */
export default function ReciterPicker({
  selected,
  onSelect,
  variant = 'chips',
}: {
  selected: Reciter;
  onSelect: (reciter: Reciter) => void;
  variant?: 'chips' | 'rows';
}) {
  const theme = useTheme();

  if (variant === 'rows') {
    return (
      <View>
        {RECITERS.map((reciter) => (
          <TouchableOpacity
            key={reciter.id}
            style={[styles.row, { borderBottomColor: 'rgba(201,162,39,0.12)', backgroundColor: theme.bg }]}
            onPress={() => onSelect(reciter)}
            activeOpacity={0.7}
          >
            <Text style={[styles.rowLabel, { color: theme.text }]}>{reciter.name}</Text>
            {selected.id === reciter.id && <Text style={[styles.checkmark, { color: theme.gold }]}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.chipsWrap}>
      <Text style={[styles.chipsLabel, { color: theme.bronze }]}>RECITER</Text>
      <View style={styles.pillRow}>
        {RECITERS.map((reciter) => {
          const isActive = selected.id === reciter.id;
          return (
            <TouchableOpacity
              key={reciter.id}
              style={
                isActive
                  ? [styles.pillActive, { backgroundColor: theme.bronze }]
                  : [styles.pillInactive, { borderColor: theme.border }]
              }
              onPress={() => onSelect(reciter)}
              activeOpacity={0.7}
            >
              <Text
                style={
                  isActive
                    ? styles.pillTextActive
                    : [styles.pillTextInactive, { color: theme.textSecondary }]
                }
              >
                {reciter.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipsWrap: { width: '100%', alignItems: 'center', marginBottom: 16 },
  chipsLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  pillActive: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 2 },
  pillInactive: { borderWidth: 0.5, paddingVertical: 5, paddingHorizontal: 14, borderRadius: 2 },
  pillTextActive: { color: '#fff', fontSize: 9, letterSpacing: 1 },
  pillTextInactive: { fontSize: 9, letterSpacing: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  rowLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 14,
  },
  checkmark: { fontSize: 14 },
});
