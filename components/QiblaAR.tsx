import { useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Vibration, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../lib/theme';
import { formatDistanceKm } from '../lib/qibla';

const KAABA_PHOTO = require('../assets/images/kaaba-cube.jpg');

/**
 * Qibla Finder — camera (AR) mode (v1.0.6, after the pattern Shakeel
 * showed from Google's Qibla Finder): the Kaaba marker rides over the
 * live camera, locked to the true qibla bearing by the compass heading.
 * Turn until the marker centres; a ring fills as you approach, and at
 * alignment the screen confirms it. Nothing is photographed or stored —
 * the camera is a viewfinder only.
 */
export default function QiblaAR({
  theme,
  bearing,
  distanceKm,
  heading,
  turn,
  aligned,
  onExit,
}: {
  theme: Theme;
  bearing: number;
  distanceKm: number;
  heading: number | null;
  turn: number | null;
  aligned: boolean;
  onExit: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const { width } = useWindowDimensions();
  const wasAligned = useRef(false);

  // A gentle pulse the moment alignment is reached — once per entry.
  useEffect(() => {
    if (aligned && !wasAligned.current) {
      Vibration.vibrate(40);
    }
    wasAligned.current = aligned;
  }, [aligned]);

  if (!permission) {
    return <View style={styles.fill} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.permissionBox]}>
        <Ionicons name="camera-outline" size={40} color={theme.primary} />
        <Text style={[styles.permissionTitle, { color: theme.text }]}>Camera access</Text>
        <Text style={[styles.permissionText, { color: theme.textSecondary }]}>
          The camera view shows the direction of prayer over your
          surroundings. Nothing is photographed, recorded or sent anywhere.
        </Text>
        <TouchableOpacity
          style={[styles.permissionBtn, { borderColor: theme.border }]}
          onPress={requestPermission}
          activeOpacity={0.7}
        >
          <Text style={[styles.permissionBtnText, { color: theme.primary }]}>ALLOW CAMERA</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onExit} activeOpacity={0.7}>
          <Text style={[styles.permissionLink, { color: theme.textSecondary }]}>Use the compass instead</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Marker x: the bearing sits ~60° of view across the screen width.
  const turnDeg = turn ?? 0;
  const markerX = Math.max(
    64,
    Math.min(width - 64, width / 2 + (turnDeg / 60) * (width / 2)),
  );
  const progress = Math.max(0, Math.min(1, 1 - Math.abs(turnDeg) / 90));
  const RING_R = 55;
  const RING_C = 2 * Math.PI * RING_R;
  const showChevrons = turn !== null && !aligned && Math.abs(turnDeg) > 6;
  const chevronSide = turnDeg > 0 ? 'right' : 'left';

  return (
    <View style={styles.fill}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

      {/* Exit to compass */}
      <TouchableOpacity style={styles.compassChip} onPress={onExit} activeOpacity={0.8}>
        <Ionicons name="compass-outline" size={15} color="#FFFFFF" />
        <Text style={styles.compassChipText}>Compass</Text>
      </TouchableOpacity>

      {/* Aligned wash */}
      {aligned && <View style={[styles.alignedWash, { backgroundColor: theme.primary }]} pointerEvents="none" />}

      {/* Marker: ring + pin + Kaaba photo + distance */}
      <View style={[styles.marker, { left: markerX - 64 }]} pointerEvents="none">
        <Svg width={128} height={128} viewBox="0 0 128 128">
          <Circle
            cx={64} cy={64} r={RING_R}
            stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={3.5} fill="none"
          />
          <Circle
            cx={64} cy={64} r={RING_R}
            stroke="#FFFFFF" strokeWidth={3.5} fill="none"
            strokeLinecap="round"
            strokeDasharray={`${RING_C * progress} ${RING_C}`}
            transform="rotate(-90 64 64)"
          />
        </Svg>
        <View style={styles.pinWrap}>
          <Svg width={72} height={88} viewBox="0 0 72 88">
            <Path
              d="M36 86 C36 86 6 54 6 32 a30 30 0 1 1 60 0 C66 54 36 86 36 86 Z"
              fill={theme.primary}
              stroke="#FFFFFF"
              strokeWidth={2.5}
            />
          </Svg>
          <Image source={KAABA_PHOTO} style={styles.pinPhoto} />
        </View>
        <View style={styles.distanceChip}>
          <Text style={styles.distanceText}>{formatDistanceKm(distanceKm)} to the Kaaba</Text>
        </View>
      </View>

      {/* Turn chevrons */}
      {showChevrons && (
        <View
          style={[
            styles.chevrons,
            chevronSide === 'right' ? { right: 14 } : { left: 14, transform: [{ scaleX: -1 }] },
          ]}
          pointerEvents="none"
        >
          {[0.45, 0.7, 1].map((o, i) => (
            <Ionicons key={i} name="chevron-forward" size={30} color="#FFFFFF" style={{ opacity: o, marginLeft: i === 0 ? 0 : -16 }} />
          ))}
        </View>
      )}

      {/* Bottom sheet: instruction or confirmation */}
      {aligned ? (
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>You're facing the Qibla</Text>
          <Text style={styles.sheetSub}>
            The Kaaba is {formatDistanceKm(distanceKm)} in this direction.
          </Text>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: theme.primary }]}
            onPress={onExit}
            activeOpacity={0.85}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Turn slowly until the Kaaba marker centres</Text>
          <Text style={styles.sheetSub}>
            Qibla bearing {bearing.toFixed(1)}° NE
            {heading !== null ? ` · you are facing ${Math.round(heading)}°` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#14100B', overflow: 'hidden' },
  permissionBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 12,
    backgroundColor: 'transparent',
  },
  permissionTitle: { fontFamily: 'Amiri_700Bold', fontSize: 18 },
  permissionText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  permissionBtn: {
    borderWidth: 0.5,
    borderRadius: 2,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 6,
  },
  permissionBtnText: { fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  permissionLink: { fontSize: 13, textDecorationLine: 'underline', marginTop: 4 },
  compassChip: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(20,16,11,0.55)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    zIndex: 5,
  },
  compassChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  alignedWash: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.22, zIndex: 2,
  },
  marker: {
    position: 'absolute',
    top: '21%',
    width: 128,
    height: 190,
    alignItems: 'center',
    zIndex: 3,
  },
  pinWrap: {
    position: 'absolute',
    top: 20,
    width: 72,
    height: 88,
    alignItems: 'center',
  },
  pinPhoto: {
    position: 'absolute',
    top: 8,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  distanceChip: {
    marginTop: 118,
    backgroundColor: 'rgba(20,16,11,0.78)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  distanceText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  chevrons: {
    position: 'absolute',
    top: '34%',
    flexDirection: 'row',
    zIndex: 3,
  },
  sheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: 'rgba(253,251,244,0.97)',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    zIndex: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  sheetTitle: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 16.5,
    color: '#2E2A24',
    textAlign: 'center',
  },
  sheetSub: { fontSize: 12, color: '#6E6450', marginTop: 4, textAlign: 'center' },
  doneBtn: {
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 34,
  },
  doneBtnText: { color: '#FAF6ED', fontSize: 13.5, fontWeight: '700' },
});
