import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { getRecentSchedule } from '../lib/queries';
import { Colors } from '../constants/colors';

export default function ArchiveScreen() {
  const [schedule, setSchedule] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecentSchedule(60).then(data => { setSchedule(data); setLoading(false); });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.goldBar} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Today</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ARCHIVE</Text>
        <View style={{ width: 60 }} />
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.bronze} />
        </View>
      ) : (
        <ScrollView>
          {schedule.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.row}
              onPress={() => router.push(`/ayah/${item.ayahs?.surah_number}/${item.ayahs?.ayah_number}` as any)}
            >
              <Text style={styles.rowDate}>{item.schedule_date}</Text>
              <Text style={styles.rowSurah}>{item.ayahs?.surahs?.name_english} {item.ayahs?.surah_number}:{item.ayahs?.ayah_number}</Text>
              <Text style={styles.rowArabic} numberOfLines={1}>{item.ayahs?.arabic_uthmani}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <View style={styles.goldBar} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.parchment },
  goldBar: { height: 4, backgroundColor: Colors.bronzeDark },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.bronzeSubtle },
  back: { fontFamily: 'Amiri_400Regular', fontSize: 14, color: Colors.bronze, width: 60 },
  title: { fontFamily: 'Amiri_400Regular', fontSize: 10, letterSpacing: 3, color: Colors.bronze },
  row: { padding: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.bronzeSubtle },
  rowDate: { fontFamily: 'Amiri_400Regular', fontSize: 10, color: Colors.inkSoft, letterSpacing: 1, marginBottom: 3 },
  rowSurah: { fontFamily: 'Amiri_400Regular', fontSize: 12, color: Colors.bronze, letterSpacing: 0.5, marginBottom: 3 },
  rowArabic: { fontFamily: 'Amiri_700Bold', fontSize: 18, color: Colors.ink, textAlign: 'right', writingDirection: 'rtl' },
});
