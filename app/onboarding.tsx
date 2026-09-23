import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotificationPermission, scheduleDailyNotification } from '../lib/notifications';

interface Props {
  onComplete: () => void;
}

const LANGUAGES = [
  { code: 'en', label: 'English', sublabel: 'M.H. Shakir · Muhammad Sarwar' },
  { code: 'ur', label: 'اردو', sublabel: 'Syed Z.H. Jawadi RA' },
  { code: 'fa', label: 'فارسی', sublabel: 'Mahdi Ilahi Ghomshei' },
  { code: 'ar', label: 'عربی', sublabel: 'Arabic only' },
];

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [selectedLang, setSelectedLang] = useState('en');
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifHour, setNotifHour] = useState(7);

  const completeOnboarding = async () => {
    await AsyncStorage.setItem('selected_language', selectedLang);
    await AsyncStorage.setItem('onboarding_complete', 'true');
    if (notifEnabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        await scheduleDailyNotification(notifHour, 0);
      }
    }
    onComplete();
  };

  const skipOnboarding = async () => {
    await AsyncStorage.setItem('selected_language', 'en');
    await AsyncStorage.setItem('onboarding_complete', 'true');
    onComplete();
  };

  if (step === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.goldBar} />
        <ScrollView contentContainerStyle={styles.centerContent}>
          <View style={styles.iconWrap}>
            <Image
              source={require('../assets/icon.png')}
              style={styles.icon}
            />
          </View>
          <Text style={styles.arabicTitle}>تطهير القرآن</Text>
          <Text style={styles.appSubtitle}>TATHIRQURAN</Text>
          <Text style={styles.tagline}>
            One verse of the Holy Quran every morning, with Shia-verified translations and tafsir.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep(1)}>
            <Text style={styles.primaryBtnText}>Begin Setup →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={skipOnboarding}>
            <Text style={styles.ghostBtnText}>Skip — go to app</Text>
          </TouchableOpacity>
        </ScrollView>
        <View style={styles.goldBar} />
      </SafeAreaView>
    );
  }

  if (step === 1) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.goldBar} />
        <ScrollView contentContainerStyle={styles.stepContent}>
          <Text style={styles.stepIndicator}>Step 1 of 2</Text>
          <Text style={styles.stepTitle}>Choose your language</Text>
          <View style={styles.radioGroup}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.radioRow, selectedLang === lang.code && styles.radioRowSelected]}
                onPress={() => setSelectedLang(lang.code)}
              >
                <View style={styles.radioOuter}>
                  {selectedLang === lang.code && <View style={styles.radioInner} />}
                </View>
                <View style={styles.radioTextWrap}>
                  <Text style={styles.radioLabel}>{lang.label}</Text>
                  <Text style={styles.radioSub}>{lang.sublabel}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep(2)}>
            <Text style={styles.primaryBtnText}>Next →</Text>
          </TouchableOpacity>
        </ScrollView>
        <View style={styles.goldBar} />
      </SafeAreaView>
    );
  }

  // Step 2 — Notifications
  const displayHour = notifHour % 12 === 0 ? 12 : notifHour % 12;
  const ampm = notifHour < 12 ? 'AM' : 'PM';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.goldBar} />
      <ScrollView contentContainerStyle={styles.stepContent}>
        <Text style={styles.stepIndicator}>Step 2 of 2</Text>
        <Text style={styles.stepTitle}>Morning reminder</Text>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Daily notification — remind me each morning</Text>
          <Switch
            value={notifEnabled}
            onValueChange={setNotifEnabled}
            trackColor={{ false: 'rgba(139,101,32,0.2)', true: '#c9a227' }}
            thumbColor="#faf5e9"
          />
        </View>

        {notifEnabled && (
          <View style={styles.timeRow}>
            <TouchableOpacity
              style={styles.timeBtn}
              onPress={() => setNotifHour(h => Math.max(0, h - 1))}
            >
              <Text style={styles.timeBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.timeDisplay}>{displayHour}:00 {ampm}</Text>
            <TouchableOpacity
              style={styles.timeBtn}
              onPress={() => setNotifHour(h => Math.min(23, h + 1))}
            >
              <Text style={styles.timeBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.verseBox}>
          <Text style={styles.verseText}>
            "And remember your Lord morning and evening"
          </Text>
          <Text style={styles.verseRef}>— Al-A'raf 7:205</Text>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={completeOnboarding}>
          <Text style={styles.primaryBtnText}>Start reading →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={skipOnboarding}>
          <Text style={styles.ghostBtnText}>Skip notifications</Text>
        </TouchableOpacity>
      </ScrollView>
      <View style={styles.goldBar} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf5e9' },
  goldBar: { height: 4, backgroundColor: '#8b6520' },
  centerContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  stepContent: {
    flexGrow: 1,
    padding: 28,
    paddingTop: 48,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 24,
  },
  icon: { width: 60, height: 60 },
  arabicTitle: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 32,
    color: '#c9a227',
    textAlign: 'center',
    marginBottom: 4,
  },
  appSubtitle: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 12,
    letterSpacing: 4,
    color: '#8b6520',
    textAlign: 'center',
    marginBottom: 24,
  },
  tagline: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 16,
    color: '#1a1205',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  primaryBtn: {
    backgroundColor: '#c9a227',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  primaryBtnText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 14,
    color: '#faf5e9',
    letterSpacing: 1,
  },
  ghostBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    width: '100%',
  },
  ghostBtnText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 13,
    color: '#8b6520',
    letterSpacing: 0.5,
  },
  stepIndicator: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 10,
    letterSpacing: 2,
    color: '#8b6520',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  stepTitle: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 24,
    color: '#1a1205',
    marginBottom: 28,
  },
  radioGroup: { gap: 10, marginBottom: 32 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(139,101,32,0.3)',
    borderRadius: 4,
    gap: 12,
  },
  radioRowSelected: {
    borderColor: '#c9a227',
    backgroundColor: 'rgba(201,162,39,0.06)',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#c9a227',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#c9a227',
  },
  radioTextWrap: { flex: 1 },
  radioLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 16,
    color: '#1a1205',
    marginBottom: 2,
  },
  radioSub: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    color: '#8b6520',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(201,162,39,0.15)',
    marginBottom: 20,
  },
  toggleLabel: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 14,
    color: '#1a1205',
    flex: 1,
    paddingRight: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 28,
  },
  timeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(201,162,39,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeBtnText: {
    fontSize: 20,
    color: '#c9a227',
    fontWeight: '300',
  },
  timeDisplay: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 22,
    color: '#1a1205',
    minWidth: 100,
    textAlign: 'center',
  },
  verseBox: {
    padding: 16,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(201,162,39,0.4)',
    backgroundColor: 'rgba(201,162,39,0.04)',
    marginBottom: 32,
  },
  verseText: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 15,
    fontStyle: 'italic',
    color: '#1a1205',
    lineHeight: 24,
    marginBottom: 6,
  },
  verseRef: {
    fontFamily: 'Amiri_400Regular',
    fontSize: 11,
    color: '#8b6520',
    letterSpacing: 0.5,
  },
});
