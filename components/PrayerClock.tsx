import { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, {
  Circle, Line, Polygon, Text as SvgText, Defs, G,
  RadialGradient, LinearGradient, Stop, Ellipse,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../lib/theme';
import { formatTime } from '../lib/prayerTimes';

/**
 * The premium prayer clock (v1.0.6 design round, Saira via Shakeel):
 * a watchmaker's dial — deep espresso face, champagne-gold bezel and
 * hands, baton indices, a stepping second hand — with the day's six
 * prayers as quiet glowing gold dots at their hour positions. No words
 * inside the dial beyond the wordmark; names and times live in the
 * grid beneath it (Shakeel: the in-dial names were "jumbled up").
 */

export interface PrayerTimeEntry {
  name: string;
  time: Date;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function handPoints(deg: number, length: number, wBase: number, wTip: number): string {
  const a = (deg * Math.PI) / 180;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  const [tx, ty] = polar(120, 120, length, deg);
  return [
    `${120 + nx * wBase},${120 + ny * wBase}`,
    `${tx + nx * wTip},${ty + ny * wTip}`,
    `${tx - nx * wTip},${ty - ny * wTip}`,
    `${120 - nx * wBase},${120 - ny * wBase}`,
  ].join(' ');
}

export function PremiumDial({
  size,
  prayers,
  now,
}: {
  size: number;
  prayers: PrayerTimeEntry[];
  now: Date;
}) {
  const ticks = [];
  for (let k = 0; k < 60; k++) {
    const hour = k % 5 === 0;
    const [x1, y1] = polar(120, 120, hour ? 97 : 100, k * 6);
    const [x2, y2] = polar(120, 120, 105, k * 6);
    ticks.push(
      <Line
        key={k}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#F3ECDB"
        strokeOpacity={hour ? 0.75 : 0.3}
        strokeWidth={hour ? 2.2 : 1}
      />,
    );
  }

  const batons = [0, 90, 180, 270].map((deg) => {
    const [x, y] = polar(120, 120, 88, deg);
    return (
      <Polygon
        key={deg}
        points={`${x - 3.2},${y - 10} ${x + 3.2},${y - 10} ${x + 3.2},${y + 10} ${x - 3.2},${y + 10}`}
        fill="url(#pcGold)"
        transform={`rotate(${deg} ${x} ${y})`}
      />
    );
  });

  const dots = prayers.map((p) => {
    const deg = ((p.time.getHours() % 12) + p.time.getMinutes() / 60) * 30;
    const [x, y] = polar(120, 120, 74, deg);
    return (
      <G key={p.name}>
        <Circle cx={x} cy={y} r={8.5} fill="#C3A56A" opacity={0.28} />
        <Circle cx={x} cy={y} r={3.8} fill="#EFDBA4" stroke="#8A6A34" strokeWidth={0.8} />
      </G>
    );
  });

  const hourDeg = ((now.getHours() % 12) + now.getMinutes() / 60) * 30;
  const minuteDeg = (now.getMinutes() + now.getSeconds() / 60) * 6;
  const secondDeg = now.getSeconds() * 6;
  const [sx, sy] = polar(120, 120, 88, secondDeg);
  const [stx, sty] = polar(120, 120, -24, secondDeg);

  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      <Defs>
        <RadialGradient id="pcDial" cx="42%" cy="36%" r="80%">
          <Stop offset="0%" stopColor="#33291B" />
          <Stop offset="55%" stopColor="#241C12" />
          <Stop offset="100%" stopColor="#120E08" />
        </RadialGradient>
        <LinearGradient id="pcGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#EFDBA4" />
          <Stop offset="48%" stopColor="#C3A56A" />
          <Stop offset="100%" stopColor="#8A6A34" />
        </LinearGradient>
      </Defs>
      <Circle cx={120} cy={120} r={118} fill="url(#pcGold)" />
      <Circle cx={120} cy={120} r={113} fill="#0D0A06" />
      <Circle cx={120} cy={120} r={109} fill="url(#pcDial)" />
      {ticks}
      {batons}
      {dots}
      <SvgText
        x={120} y={82}
        textAnchor="middle"
        fontFamily="Georgia"
        fontSize={11.5}
        fontWeight="600"
        letterSpacing={3.5}
        fill="#D8C491"
      >
        TATHIRQURAN
      </SvgText>
      <Polygon points={handPoints(hourDeg, 54, 4.6, 1.2)} fill="url(#pcGold)" />
      <Polygon points={handPoints(minuteDeg, 80, 3.4, 0.9)} fill="url(#pcGold)" />
      <Line x1={stx} y1={sty} x2={sx} y2={sy} stroke="#E9D9A6" strokeWidth={1.5} />
      <Circle cx={stx} cy={sty} r={3.4} fill="none" stroke="#E9D9A6" strokeWidth={1.4} />
      <Circle cx={120} cy={120} r={6.4} fill="url(#pcGold)" />
      <Circle cx={120} cy={120} r={2.1} fill="#120E08" />
      <Ellipse cx={88} cy={58} rx={118} ry={58} fill="#FFFFFF" opacity={0.05} transform="rotate(-16 88 58)" />
    </Svg>
  );
}

export default function PrayerTimesModal({
  visible,
  onClose,
  times,
  theme,
  onQibla,
}: {
  visible: boolean;
  onClose: () => void;
  times: {
    fajr: Date; sunrise: Date; dhuhr: Date; asr: Date; maghrib: Date; isha: Date;
  } | null;
  theme: Theme;
  onQibla: () => void;
}) {
  const [now, setNow] = useState(() => new Date());

  // The dial is live while the pop-out is open (quartz-step seconds).
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  const entries: PrayerTimeEntry[] = times
    ? [
        { name: 'Fajr', time: times.fajr },
        { name: 'Sunrise', time: times.sunrise },
        { name: 'Dhuhr', time: times.dhuhr },
        { name: 'Asr', time: times.asr },
        { name: 'Maghrib', time: times.maghrib },
        { name: 'Isha', time: times.isha },
      ]
    : [];

  const dateLine = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
          onPress={() => {}}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.primary }]}>PRAYER TIMES</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close prayer times">
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {times ? (
            <>
              <View style={styles.dialWrap}>
                <PremiumDial size={248} prayers={entries} now={now} />
              </View>
              <Text style={[styles.caption, { color: theme.textSecondary }]}>
                The gold dots are today's prayers · the hands show now
              </Text>
              <View style={styles.grid}>
                {entries.map((e) => (
                  <View key={e.name} style={styles.gridItem}>
                    <Text style={[styles.gridName, { color: theme.textSecondary }]}>{e.name}</Text>
                    <Text style={[styles.gridTime, { color: theme.text }]}>{formatTime(e.time)}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.qiblaRow, { borderTopColor: theme.border }]}
                onPress={onQibla}
                activeOpacity={0.7}
              >
                <Ionicons name="compass-outline" size={16} color={theme.primary} />
                <Text style={[styles.qiblaText, { color: theme.primary }]}>Qibla Finder</Text>
                <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.dateLine, { color: theme.textSecondary }]}>{dateLine}</Text>
            </>
          ) : (
            <Text style={[styles.unavailable, { color: theme.textSecondary }]}>
              Prayer times need your location. Allow location access and the
              clock will show today's times for where you are.
            </Text>
          )}
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
    paddingVertical: 18,
    paddingHorizontal: 20,
    shadowColor: '#171208',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
    letterSpacing: 2.5,
  },
  dialWrap: { alignItems: 'center' },
  caption: { fontSize: 10.5, textAlign: 'center', marginTop: 4 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  gridItem: { width: '33.33%', alignItems: 'center', marginBottom: 10 },
  gridName: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  gridTime: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  qiblaRow: {
    borderTopWidth: 0.5,
    marginTop: 4,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  qiblaText: { fontSize: 12.5, fontWeight: '700' },
  dateLine: { fontSize: 10.5, textAlign: 'center', marginTop: 8 },
  unavailable: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
});
