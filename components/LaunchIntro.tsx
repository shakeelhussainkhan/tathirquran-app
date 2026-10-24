import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

/**
 * Launch intro — the animated Tathir emblem with the spoken name
 * (assets/videos/tathir-intro.mp4, ~5s, Shakeel's chosen cut 2026-10-23).
 *
 * Plays once per cold launch, overlaid above whichever screen comes first
 * (onboarding or Today). Tap anywhere to skip. Any playback error — or a
 * hard 6.5s safety timeout — dismisses it immediately, so it can never
 * trap the user on a dead screen.
 */
const INTRO_SOURCE = require('../assets/videos/tathir-intro.mp4');

export default function LaunchIntro({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  const player = useVideoPlayer(INTRO_SOURCE, p => {
    p.loop = false;
    p.play();
  });

  useEventListener(player, 'playToEnd', finish);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') finish();
  });

  useEffect(() => {
    const t = setTimeout(finish, 6500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Pressable
      style={styles.overlay}
      onPress={finish}
      accessibilityLabel="Skip intro"
    >
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Matches the portrait intro asset's own backdrop colour exactly, so
    // the contain letterbox is invisible.
    backgroundColor: '#f3efe1',
    zIndex: 999,
  },
  video: {
    flex: 1,
  },
});
