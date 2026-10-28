import { useEffect, useState } from 'react';
import {
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import {
  checkForUpdate,
  dismissUpdateForVersion,
  type StoreUpdateInfo,
} from '../lib/updateCheck';

/**
 * "A new version is available" soft prompt.
 *
 * Mounted once in the root layout (app/_layout.tsx). On mount it asks
 * lib/updateCheck.ts whether a newer App Store version exists (iOS;
 * throttled to one lookup per 24h) and, if so, shows this modal once.
 * It is NEVER a forced update: the backdrop tap, the Android back
 * button (onRequestClose) and the "Later" button all dismiss it, and
 * dismissing silences that version for good — the prompt returns only
 * when a still-newer version ships. "Update" opens the App Store page
 * via Linking; it deliberately does NOT record a dismissal, so a user
 * who tapped Update but didn't complete it is reminded on a later
 * launch (subject to the same 24h throttle).
 *
 * Styling follows the app's Champagne modal language (PrayerClock):
 * dimmed backdrop, centred card in the theme's card surface with a
 * hairline champagne border, Amiri headings, champagne primary button.
 * Renders nothing at all when no update is available or the check
 * failed — the app is never blocked or disturbed by this component.
 */
export default function UpdatePrompt() {
  const theme = useTheme();
  const [update, setUpdate] = useState<StoreUpdateInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((info) => {
      if (!cancelled) setUpdate(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  const later = () => {
    void dismissUpdateForVersion(update.latestVersion);
    setUpdate(null);
  };

  const openStore = () => {
    void Linking.openURL(update.storeUrl).catch(() => {
      /* store page couldn't open — the prompt just closes */
    });
    setUpdate(null);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={later}>
      <Pressable style={styles.backdrop} onPress={later}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: theme.bgCard, borderColor: theme.border },
          ]}
          onPress={() => {}}
        >
          <Ionicons
            name="arrow-up-circle-outline"
            size={36}
            color={theme.primary}
            style={styles.icon}
          />
          <Text style={[styles.title, { color: theme.text }]}>
            A new version of TathirQuran is available
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            Version {update.latestVersion} is ready in the App Store.
            Update for the latest features and improvements — it only
            takes a moment.
          </Text>
          <TouchableOpacity
            style={[styles.updateButton, { backgroundColor: theme.primary }]}
            onPress={openStore}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Update in the App Store"
          >
            <Text style={styles.updateButtonText}>Update</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={later}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remind me later"
          >
            <Text style={[styles.laterText, { color: theme.textSecondary }]}>
              Later
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23,18,10,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderWidth: 0.5,
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#171208',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 10,
  },
  icon: {
    marginBottom: 10,
  },
  title: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 19,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  updateButton: {
    borderRadius: 6,
    paddingVertical: 11,
    paddingHorizontal: 40,
    marginBottom: 12,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  laterText: {
    fontSize: 14,
    paddingVertical: 4,
  },
});
