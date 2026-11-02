import { useState, useSyncExternalStore } from 'react';
import { Alert, Platform, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import {
  getSpeakingSectionId,
  speakSection,
  stopSpeech,
  subscribeSpeech,
} from '../lib/speech';
import {
  getNarrationState,
  isNarrationMissing,
  narrationAssetName,
  getNarrationGender,
  pauseNarration,
  playNarration,
  resumeNarration,
  stopNarration,
  subscribeNarration,
  type NarrationDescriptor,
} from '../lib/narration';

/**
 * Listen button for one text section (1.0.8).
 *
 * Hybrid playback: when the caller passes a `narration` descriptor the
 * button first tries the streamed narration audio for the section
 * (lib/narration.ts) and shows the player state while it plays
 * (pause/resume/stop + position). When the narration asset does not
 * exist yet, it falls back to device TTS — but ONLY through the voice
 * guard: a device voice matching the section's language must actually
 * be installed, otherwise nothing is spoken (a wrong-language voice
 * reading Arabic/Urdu text aloud is worse than silence) and the user
 * is told exactly how to install the voice.
 *
 * While device speech plays, the classic Listen/Stop behaviour stays.
 */

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ur: 'Urdu',
  ar: 'Arabic',
  fa: 'Persian',
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function showVoiceNotInstalledAlert(language: string): void {
  const name = LANGUAGE_NAMES[language] ?? language;
  const steps =
    Platform.OS === 'ios'
      ? `To hear this read aloud, install the ${name} voice: Settings → Accessibility → Spoken Content → Voices → ${name} → download a voice.`
      : `To hear this read aloud, install the ${name} voice: Settings → General management → Text-to-speech output → Preferred engine settings → Install voice data → ${name} → download a voice.`;
  Alert.alert('Voice not installed', steps);
}

/**
 * Guarded device-TTS fallback. Resolves an installed voice whose
 * language matches the section's language and speaks with that exact
 * voice; when no matching voice exists, speaks nothing and alerts.
 */
async function speakWithGuard(
  sectionId: string,
  text: string,
  language: string,
): Promise<void> {
  let voiceIdentifier: string | undefined;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const code = language.toLowerCase();
    const match = voices.find((v) =>
      (v.language ?? '').toLowerCase().replace('_', '-').startsWith(code),
    );
    voiceIdentifier = match?.identifier;
  } catch {
    voiceIdentifier = undefined;
  }
  if (!voiceIdentifier) {
    showVoiceNotInstalledAlert(language);
    return;
  }
  speakSection(sectionId, text, language, voiceIdentifier);
}

export default function ListenButton({
  sectionId,
  text,
  language,
  narration,
}: {
  /** Unique id of the section this button speaks (one speaker at a time). */
  sectionId: string;
  /** The section's full text, verbatim — chunked by the controller. */
  text: string;
  /** App language code of the text (en/ur/ar/fa). */
  language: string;
  /** Streamed-narration descriptor for this section, when one exists. */
  narration?: NarrationDescriptor;
}) {
  const theme = useTheme();
  const speakingId = useSyncExternalStore(
    subscribeSpeech,
    getSpeakingSectionId,
    getSpeakingSectionId,
  );
  const narrationState = useSyncExternalStore(
    subscribeNarration,
    getNarrationState,
    getNarrationState,
  );
  const [starting, setStarting] = useState(false);

  const isSpeaking = speakingId === sectionId;
  const isNarrating = narrationState.sectionId === sectionId;
  const isLoadingNarration = isNarrating && (narrationState.loading || starting);
  const active = isSpeaking || isNarrating;

  const startFallback = async () => {
    stopNarration();
    await speakWithGuard(sectionId, text, language);
  };

  const onPress = async () => {
    if (isSpeaking) {
      stopSpeech();
      return;
    }
    if (isNarrating) {
      if (narrationState.loading) return;
      if (narrationState.playing) {
        pauseNarration();
      } else {
        resumeNarration();
      }
      return;
    }
    // Starting this section: narration first (when a descriptor was
    // given and the asset is not already known-missing this session),
    // guarded device TTS as the fallback.
    if (narration) {
      setStarting(true);
      try {
        const gender = await getNarrationGender();
        const assetName = narrationAssetName(narration, gender);
        if (!isNarrationMissing(assetName)) {
          const started = await playNarration(sectionId, narration);
          if (started) return;
        }
      } finally {
        setStarting(false);
      }
    }
    await startFallback();
  };

  const label = isSpeaking
    ? 'Stop'
    : isNarrating
      ? narrationState.loading || starting
        ? 'Loading'
        : narrationState.playing
          ? 'Pause'
          : 'Resume'
      : 'Listen';

  const icon = isSpeaking
    ? 'stop'
    : isNarrating && narrationState.playing
      ? 'pause'
      : isNarrating
        ? 'play'
        : 'volume-high-outline';

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => void onPress()}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          isSpeaking
            ? 'Stop listening'
            : isNarrating
              ? narrationState.playing
                ? 'Pause narration'
                : 'Resume narration'
              : 'Listen to this section'
        }
        style={[
          styles.chip,
          {
            borderColor: active ? theme.gold : theme.border,
            backgroundColor: active ? theme.gold + '2E' : 'transparent',
          },
        ]}
      >
        <Ionicons name={icon} size={14} color={theme.goldText} />
        <Text style={[styles.label, { color: theme.goldText }]}>{label}</Text>
      </TouchableOpacity>
      {isNarrating && !narrationState.loading && narrationState.duration > 0 ? (
        <Text style={[styles.position, { color: theme.textSecondary }]}>
          {formatTime(narrationState.position)} / {formatTime(narrationState.duration)}
        </Text>
      ) : null}
      {isNarrating ? (
        <TouchableOpacity
          onPress={stopNarration}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Stop narration"
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: 'transparent' },
          ]}
        >
          <Ionicons name="stop" size={14} color={theme.goldText} />
          <Text style={[styles.label, { color: theme.goldText }]}>Stop</Text>
        </TouchableOpacity>
      ) : null}
      {isLoadingNarration && !isNarrating ? (
        <Text style={[styles.position, { color: theme.textSecondary }]}>…</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
  },
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
  position: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
