import { useSyncExternalStore } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import {
  getSpeakingSectionId,
  speakSection,
  stopSpeech,
  subscribeSpeech,
} from '../lib/speech';

/**
 * Listen-aloud button for one text section (1.0.8, device TTS via
 * lib/speech.ts). Shows "Listen" with a speaker icon; while THIS section
 * is the one speaking it shows "Stop" instead, and tapping toggles.
 * State comes from the shared speech controller, so starting any other
 * section's button turns this one back to "Listen" automatically.
 */
export default function ListenButton({
  sectionId,
  text,
  language,
}: {
  /** Unique id of the section this button speaks (one speaker at a time). */
  sectionId: string;
  /** The section's full text, verbatim — chunked by the controller. */
  text: string;
  /** App language code of the text (en/ur/ar/fa). */
  language: string;
}) {
  const theme = useTheme();
  const speakingId = useSyncExternalStore(
    subscribeSpeech,
    getSpeakingSectionId,
    getSpeakingSectionId,
  );
  const isSpeaking = speakingId === sectionId;

  const onPress = () => {
    if (isSpeaking) {
      stopSpeech();
    } else {
      speakSection(sectionId, text, language);
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={isSpeaking ? 'Stop listening' : 'Listen to this section'}
      style={[
        styles.chip,
        {
          borderColor: isSpeaking ? theme.gold : theme.border,
          backgroundColor: isSpeaking ? theme.gold + '2E' : 'transparent',
        },
      ]}
    >
      <Ionicons
        name={isSpeaking ? 'stop' : 'volume-high-outline'}
        size={14}
        color={theme.goldText}
      />
      <Text style={[styles.label, { color: theme.goldText }]}>
        {isSpeaking ? 'Stop' : 'Listen'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  label: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
