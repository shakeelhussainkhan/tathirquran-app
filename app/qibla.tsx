import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Colors } from '../constants/colors';
import { useTheme } from '../lib/theme';
import {
  qiblaBearing,
  distanceToKaabaKm,
  cardinalDirection,
  relativeBearing,
  formatDistanceKm,
  KAABA_LATITUDE,
  KAABA_LONGITUDE,
} from '../lib/qibla';

type Status = 'loading' | 'denied' | 'error' | 'ready';

const DIAL_SIZE = 288;
const DIAL_RADIUS = DIAL_SIZE / 2;
const ALIGNED_TOLERANCE_DEG = 5;

const CARDINALS = [
  { label: 'N', angle: 0 },
  { label: 'E', angle: 90 },
  { label: 'S', angle: 180 },
  { label: 'W', angle: 270 },
];
const TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

export default function QiblaScreen() {
  const theme = useTheme();

  const [status, setStatus] = useState<Status>('loading');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [headingAccuracy, setHeadingAccuracy] = useState<number | null>(null);
  const [usingMagnetic, setUsingMagnetic] = useState(false);
  const [headingUnavailable, setHeadingUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const headingSub = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus('loading');
      setHeading(null);
      setHeadingUnavailable(false);

      // Same permission flow as the prayer-times code on the Today screen.
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setCanAskAgain(perm.canAskAgain);
      if (perm.status !== 'granted') {
        setStatus('denied');
        return;
      }

      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
        return;
      }

      // Compass heading from expo-location (already a dependency — it is
      // backed by the device magnetometer; no extra sensor package needed).
      try {
        headingSub.current = await Location.watchHeadingAsync(
          (h) => {
            if (cancelled) return;
            if (h.trueHeading >= 0) {
              setHeading(h.trueHeading);
              setUsingMagnetic(false);
            } else {
              setHeading(h.magHeading);
              setUsingMagnetic(true);
            }
            setHeadingAccuracy(h.accuracy);
          },
          () => { if (!cancelled) setHeadingUnavailable(true); },
        );
        if (cancelled) headingSub.current?.remove();
      } catch {
        if (!cancelled) setHeadingUnavailable(true);
      }
    })();

    return () => {
      cancelled = true;
      headingSub.current?.remove();
      headingSub.current = null;
    };
  }, [attempt]);

  const s = makeStyles(theme);

  const bearing = coords ? qiblaBearing(coords.latitude, coords.longitude) : 0;
  const distanceKm = coords ? distanceToKaabaKm(coords.latitude, coords.longitude) : 0;
  const turn = heading !== null ? relativeBearing(bearing, heading) : null;
  const aligned = turn !== null && Math.abs(turn) <= ALIGNED_TOLERANCE_DEG;
  const dialRotation = heading ?? 0;

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.goldBar} />
      <View style={s.header}>
        <Text style={s.headerTitle}>QIBLA</Text>
      </View>

      {status === 'loading' && (
        <View style={s.centered}>
          <ActivityIndicator color={Colors.bronze} />
          <Text style={s.message}>Finding your location…</Text>
        </View>
      )}

      {status === 'denied' && (
        <View style={s.centered}>
          <Text style={s.messageTitle}>Location permission needed</Text>
          <Text style={s.message}>
            The direction to the Kaaba depends on where you are, so TathirQuran
            needs your location to calculate it. No direction is shown without
            your real location.
          </Text>
          {canAskAgain ? (
            <TouchableOpacity style={s.button} onPress={() => setAttempt(a => a + 1)} activeOpacity={0.7}>
              <Text style={s.buttonText}>ALLOW LOCATION</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.button} onPress={() => Linking.openSettings()} activeOpacity={0.7}>
              <Text style={s.buttonText}>OPEN SETTINGS</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {status === 'error' && (
        <View style={s.centered}>
          <Text style={s.messageTitle}>Location not found</Text>
          <Text style={s.message}>
            Your location could not be found. Check that location services are
            turned on, then try again.
          </Text>
          <TouchableOpacity style={s.button} onPress={() => setAttempt(a => a + 1)} activeOpacity={0.7}>
            <Text style={s.buttonText}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'ready' && coords && (
        <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={s.scroll}>
          <Text style={s.intro}>The direction of prayer from where you are now.</Text>

          {/* Compass */}
          <View style={s.compassArea}>
            <Text style={[s.pointer, aligned && s.pointerAligned]}>▼</Text>
            <View
              style={[
                s.dial,
                { transform: [{ rotate: `${-dialRotation}deg` }] },
              ]}
            >
              {TICKS.map(angle => (
                <View
                  key={angle}
                  style={[
                    s.tick,
                    angle % 90 === 0 && s.tickMajor,
                    {
                      transform: [
                        { rotate: `${angle}deg` },
                        { translateY: -DIAL_RADIUS + 10 },
                      ],
                    },
                  ]}
                />
              ))}
              {CARDINALS.map(c => (
                <View
                  key={c.label}
                  style={[
                    s.cardinal,
                    {
                      transform: [
                        { rotate: `${c.angle}deg` },
                        { translateY: -DIAL_RADIUS + 30 },
                        { rotate: `${dialRotation - c.angle}deg` },
                      ],
                    },
                  ]}
                >
                  <Text style={[s.cardinalText, c.label === 'N' && s.cardinalNorth]}>
                    {c.label}
                  </Text>
                </View>
              ))}
              {/* Qibla marker, fixed on the dial at the qibla bearing */}
              <View
                style={[
                  s.qiblaMarkerWrap,
                  {
                    transform: [
                      { rotate: `${bearing}deg` },
                      { translateY: -DIAL_RADIUS + 30 },
                    ],
                  },
                ]}
              >
                <View style={[s.qiblaMarker, aligned && s.qiblaMarkerAligned]}>
                  <Text style={s.qiblaMarkerText}>🕋</Text>
                </View>
              </View>
            </View>
            <View style={s.centerHub}>
              <Text style={s.centerHeading}>
                {heading !== null ? `${Math.round(heading)}°` : '—'}
              </Text>
              <Text style={s.centerLabel}>HEADING</Text>
            </View>
          </View>

          {aligned ? (
            <Text style={s.alignedText}>You are facing the Qibla</Text>
          ) : turn !== null ? (
            <Text style={s.turnText}>
              Turn {turn > 0 ? 'right' : 'left'} {Math.abs(Math.round(turn))}° to face the Qibla
            </Text>
          ) : (
            <Text style={s.turnText}>
              Face {bearing.toFixed(1)}° clockwise from north to face the Qibla
            </Text>
          )}

          {/* Facts */}
          <View style={s.facts}>
            <View style={s.row}>
              <Text style={s.rowLabel}>Qibla bearing</Text>
              <Text style={s.rowValue}>
                {bearing.toFixed(1)}° {cardinalDirection(bearing)}
              </Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowLabel}>From</Text>
              <Text style={s.rowValue}>True north, clockwise</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowLabel}>Distance to the Kaaba</Text>
              <Text style={s.rowValue}>{formatDistanceKm(distanceKm)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowLabel}>Your location</Text>
              <Text style={s.rowValue}>
                {coords.latitude.toFixed(3)}°, {coords.longitude.toFixed(3)}°
              </Text>
            </View>
            <View style={[s.row, s.rowLast]}>
              <Text style={s.rowLabel}>Compass heading</Text>
              <Text style={s.rowValue}>
                {heading !== null ? `${Math.round(heading)}°` : 'Unavailable'}
              </Text>
            </View>
          </View>

          {(headingUnavailable || heading === null) && (
            <Text style={s.note}>
              Compass heading is not available on this device, so the dial cannot
              follow your phone. The bearing above is still exact for your location.
            </Text>
          )}
          {usingMagnetic && (
            <Text style={s.note}>
              This device is reporting magnetic north. The qibla bearing is measured
              from true north, so the dial may differ by your local magnetic declination.
            </Text>
          )}
          {headingAccuracy !== null && headingAccuracy <= 1 && (
            <Text style={s.note}>
              Compass accuracy is low. Move away from metal objects and move your
              phone slowly in a figure-eight motion to calibrate it.
            </Text>
          )}

          <Text style={s.footerNote}>
            Calculated from your location to the Kaaba in Makkah
            ({KAABA_LATITUDE}° N, {KAABA_LONGITUDE}° E) using the great-circle
            bearing — the shortest path over the Earth's surface. Hold your phone
            flat for the most accurate reading. Your location is used on this
            device only, for this calculation.
          </Text>
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
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      letterSpacing: 3,
      color: theme.gold,
      textAlign: 'center',
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      gap: 12,
    },
    messageTitle: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 16,
      color: theme.text,
      textAlign: 'center',
    },
    message: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 14,
      lineHeight: 21,
      color: theme.textSecondary,
      textAlign: 'center',
    },
    button: {
      borderWidth: 0.5,
      borderColor: theme.border,
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 2,
      marginTop: 8,
    },
    buttonText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 11,
      letterSpacing: 2,
      color: theme.bronze,
    },
    scroll: { padding: 24, alignItems: 'center' },
    intro: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 15,
      fontStyle: 'italic',
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: 8,
    },
    compassArea: {
      width: DIAL_SIZE + 32,
      height: DIAL_SIZE + 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 8,
    },
    pointer: {
      position: 'absolute',
      top: 0,
      zIndex: 3,
      fontSize: 16,
      color: theme.bronze,
    },
    pointerAligned: { color: '#2e7d32' },
    dial: {
      width: DIAL_SIZE,
      height: DIAL_SIZE,
      borderRadius: DIAL_RADIUS,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tick: {
      position: 'absolute',
      width: 1,
      height: 8,
      backgroundColor: theme.bronze,
      opacity: 0.45,
    },
    tickMajor: { width: 2, height: 12, opacity: 0.8 },
    cardinal: {
      position: 'absolute',
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardinalText: {
      fontFamily: 'Amiri_700Bold',
      fontSize: 16,
      color: theme.textSecondary,
    },
    cardinalNorth: { color: '#b03a2e' },
    qiblaMarkerWrap: {
      position: 'absolute',
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qiblaMarker: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.gold,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qiblaMarkerAligned: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
    qiblaMarkerText: { fontSize: 20 },
    centerHub: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerHeading: {
      fontFamily: 'Amiri_700Bold',
      fontSize: 26,
      color: theme.text,
    },
    centerLabel: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 8,
      letterSpacing: 2,
      color: theme.textSecondary,
    },
    alignedText: {
      fontFamily: 'Amiri_700Bold',
      fontSize: 16,
      color: '#2e7d32',
      textAlign: 'center',
      marginTop: 4,
      marginBottom: 8,
    },
    turnText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 15,
      color: theme.text,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: 8,
    },
    facts: { width: '100%', marginTop: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: 'rgba(201,162,39,0.12)',
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 14,
      color: theme.text,
    },
    rowValue: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      color: theme.textSecondary,
    },
    note: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 12,
      fontStyle: 'italic',
      lineHeight: 18,
      color: theme.textSecondary,
      textAlign: 'center',
      marginTop: 14,
      paddingHorizontal: 8,
    },
    footerNote: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 11,
      lineHeight: 17,
      color: theme.textSecondary,
      textAlign: 'center',
      marginTop: 20,
      paddingHorizontal: 8,
      opacity: 0.85,
    },
  });
}
