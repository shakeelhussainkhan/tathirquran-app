import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../constants/colors';
import Constants from 'expo-constants';
import { useTheme } from '../lib/theme';

const SCHOLARS = [
  { lang: 'English', name: 'M.H. Shakir', school: 'Shia Ithna Ashari', status: 'Live' },
  { lang: 'English', name: 'Muhammad Sarwar', school: 'Shia Ithna Ashari', status: 'Live' },
  { lang: 'Persian', name: 'Mahdi Ilahi Ghomshei', school: 'Iranian Shia', status: 'Live' },
  { lang: 'Urdu', name: 'Allama M.H. Najafi (RA)', school: 'Shia Ithna Ashari', status: 'Pending' },
  { lang: 'Urdu', name: 'Syed Z.H. Jawadi (RA)', school: 'Shia Ithna Ashari', status: 'Pending' },
  { lang: 'Urdu', name: 'Maulana Farman Ali (RA)', school: 'Shia Ithna Ashari', status: 'Pending' },
];

export default function AboutScreen() {
  const theme = useTheme();
  const version = Constants.expoConfig?.version ?? '1.0.1';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={styles.goldBar} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ABOUT</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {/* Description */}
        <Text style={styles.sectionLabel}>TathirQuran</Text>
        <Text style={styles.desc}>
          Daily Quran verses with Shia-verified translations. Start every morning with the Word of Allah.
        </Text>
        <Text style={styles.desc}>
          The name Tathir (تطهير) means purification — from the Ayah of Purification (33:33), the spiritual foundation of this app.
        </Text>

        {/* Surah Al-Fatiha request */}
        <View style={styles.fatihaSection}>
          <Text style={styles.fatihaTitle}>A HUMBLE REQUEST</Text>
          <Text style={styles.fatihaText}>
            We humbly request you to recite Surah Al-Fatiha for our parents,
            grandparents, and all Muslims, Momineen and Mominaats who have
            passed from this world. May Allah (SWT) grant them the highest
            stations in Jannah, alongside the Holy Prophet (SAWW) and his
            blessed Ahlul Bayt (AS). Ameen.
          </Text>
          <Text style={styles.fatihaArabic}>
            اَللّٰهُمَّ اغْفِرْ لِلْمُؤْمِنِيْنَ وَالْمُؤْمِنَاتِ
          </Text>
        </View>

        <View style={styles.divider} />

        {/* Scholars table */}
        <Text style={styles.sectionLabel}>Scholars &amp; Translations</Text>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.headerCell]}>Language</Text>
            <Text style={[styles.tableCell, styles.headerCell, { flex: 2 }]}>Scholar</Text>
            <Text style={[styles.tableCell, styles.headerCell]}>Status</Text>
          </View>
          {SCHOLARS.map((s, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
              <Text style={styles.tableCell}>{s.lang}</Text>
              <Text style={[styles.tableCell, { flex: 2 }]}>{s.name}</Text>
              <Text style={[styles.tableCell, { color: s.status === 'Live' ? Colors.bronze : Colors.inkSoft }]}>
                {s.status === 'Live' ? '✓ Live' : '⏳'}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Built by */}
        <Text style={styles.sectionLabel}>Built By</Text>
        <Text style={styles.name}>Shakeel Hussain Khan</Text>
        <Text style={styles.name}>Syeda Saira Naqvi</Text>
        <Text style={styles.sub}>San Jose, California</Text>

        <View style={styles.divider} />

        {/* Contact */}
        <Text style={styles.sectionLabel}>Contact</Text>
        <TouchableOpacity onPress={() => Linking.openURL('mailto:info@tathirquran.com')}>
          <Text style={styles.email}>info@tathirquran.com</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <Text style={styles.version}>Version {version}</Text>
        <Text style={styles.version}>© 2026 Five S LLC · tathirquran.com</Text>
      </ScrollView>
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
  body: { padding: 24, paddingBottom: 48 },
  sectionLabel: { fontFamily: 'Amiri_400Regular', fontSize: 9, color: Colors.bronze, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12 },
  desc: { fontFamily: 'Amiri_400Regular', fontSize: 16, color: Colors.inkMid, lineHeight: 26, marginBottom: 10 },
  divider: { height: 0.5, backgroundColor: Colors.bronzeSubtle, marginVertical: 24 },
  table: { borderWidth: 0.5, borderColor: Colors.bronzeSubtle, borderRadius: 2, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', backgroundColor: Colors.parchment },
  tableRowAlt: { backgroundColor: 'rgba(201,162,39,0.05)' },
  tableHeader: { backgroundColor: Colors.bronzeDark },
  tableCell: { flex: 1, padding: 8, fontFamily: 'Amiri_400Regular', fontSize: 12, color: Colors.inkMid },
  headerCell: { color: Colors.parchment, fontWeight: '600' },
  name: { fontFamily: 'Amiri_400Regular', fontSize: 18, color: Colors.ink, marginBottom: 2 },
  sub: { fontFamily: 'Amiri_400Regular', fontSize: 13, color: Colors.inkSoft, marginBottom: 12 },
  email: { fontFamily: 'Amiri_400Regular', fontSize: 15, color: Colors.bronze, letterSpacing: 0.5 },
  version: { fontFamily: 'Amiri_400Regular', fontSize: 12, color: Colors.inkSoft, textAlign: 'center', marginTop: 4 },
  fatihaSection: {
    marginVertical: 24, padding: 16,
    borderTopWidth: 0.5, borderBottomWidth: 0.5,
    borderColor: 'rgba(201,162,39,0.25)',
    backgroundColor: 'rgba(201,162,39,0.04)',
  },
  fatihaTitle: {
    fontFamily: 'Amiri_400Regular', fontSize: 10,
    letterSpacing: 3, color: '#c9a227', marginBottom: 12, textAlign: 'center',
  },
  fatihaText: {
    fontFamily: 'Amiri_400Regular', fontSize: 16,
    color: '#2a1f08', lineHeight: 28, textAlign: 'center', fontStyle: 'italic',
  },
  fatihaArabic: {
    fontFamily: 'Amiri_700Bold', fontSize: 18,
    color: '#8b6520', textAlign: 'center', marginTop: 12,
  },
});
