import { View, Text, ScrollView, Switch, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useTheme } from '../lib/theme';
import {
  scheduleDailyNotification,
  cancelNotifications,
  getNotificationSettings,
} from '../lib/notifications';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ur', label: 'Urdu (اردو)' },
  { code: 'fa', label: 'Persian (فارسی)' },
  { code: 'ar', label: 'Arabic (عربی)' },
];

const EN_TRANSLATIONS = [
  { code: 'shakir', label: 'M.H. Shakir' },
  { code: 'sarwar', label: 'Muhammad Sarwar' },
];

export default function SettingsScreen() {
  const theme = useTheme();

  const [language, setLanguage] = useState('en');
  const [translation, setTranslation] = useState('shakir');
  const [showTafsir, setShowTafsir] = useState(true);
  const [showBismillah, setShowBismillah] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifHour, setNotifHour] = useState(7);

  useEffect(() => {
    (async () => {
      const [lang, trans, tafsir, bism] = await Promise.all([
        AsyncStorage.getItem('selected_language'),
        AsyncStorage.getItem('selected_translation'),
        AsyncStorage.getItem('show_tafsir'),
        AsyncStorage.getItem('show_bismillah'),
      ]);
      if (lang) setLanguage(lang);
      if (trans) setTranslation(trans);
      setShowTafsir(tafsir !== 'false');
      setShowBismillah(bism !== 'false');
      const notif = await getNotificationSettings();
      setNotifEnabled(notif.enabled);
      setNotifHour(notif.hour);
    })();
  }, []);

  const saveLang = async (code: string) => {
    setLanguage(code);
    await AsyncStorage.setItem('selected_language', code);
  };

  const saveTrans = async (code: string) => {
    setTranslation(code);
    await AsyncStorage.setItem('selected_translation', code);
  };

  const toggleTafsir = async (val: boolean) => {
    setShowTafsir(val);
    await AsyncStorage.setItem('show_tafsir', String(val));
  };

  const toggleBismillah = async (val: boolean) => {
    setShowBismillah(val);
    await AsyncStorage.setItem('show_bismillah', String(val));
  };

  const toggleNotif = async (val: boolean) => {
    setNotifEnabled(val);
    if (val) {
      await scheduleDailyNotification(notifHour, 0);
    } else {
      await cancelNotifications();
    }
  };

  const changeHour = async (delta: number) => {
    const newHour = Math.max(0, Math.min(23, notifHour + delta));
    setNotifHour(newHour);
    if (notifEnabled) {
      await scheduleDailyNotification(newHour, 0);
    }
  };

  const displayHour = notifHour % 12 === 0 ? 12 : notifHour % 12;
  const ampm = notifHour < 12 ? 'AM' : 'PM';
  const version = Constants.expoConfig?.version ?? '1.0.1';

  const s = makeStyles(theme);

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <View style={s.goldBar} />
      <View style={s.header}>
        <Text style={s.headerTitle}>SETTINGS</Text>
      </View>
      <ScrollView>
        {/* DISPLAY */}
        <Text style={s.sectionHeader}>DISPLAY</Text>

        <Text style={s.rowGroupLabel}>Language</Text>
        {LANGUAGES.map(lang => (
          <TouchableOpacity
            key={lang.code}
            style={s.row}
            onPress={() => saveLang(lang.code)}
          >
            <Text style={s.rowLabel}>{lang.label}</Text>
            {language === lang.code && <Text style={s.checkmark}>✓</Text>}
          </TouchableOpacity>
        ))}

        {language === 'en' && (
          <>
            <Text style={s.rowGroupLabel}>Translation</Text>
            {EN_TRANSLATIONS.map(t => (
              <TouchableOpacity
                key={t.code}
                style={s.row}
                onPress={() => saveTrans(t.code)}
              >
                <Text style={s.rowLabel}>{t.label}</Text>
                {translation === t.code && <Text style={s.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={s.row}>
          <Text style={s.rowLabel}>Show tafsir</Text>
          <Switch
            value={showTafsir}
            onValueChange={toggleTafsir}
            trackColor={{ false: 'rgba(139,101,32,0.2)', true: theme.gold }}
            thumbColor={theme.bg}
          />
        </View>

        <View style={s.row}>
          <Text style={s.rowLabel}>Show Bismillah</Text>
          <Switch
            value={showBismillah}
            onValueChange={toggleBismillah}
            trackColor={{ false: 'rgba(139,101,32,0.2)', true: theme.gold }}
            thumbColor={theme.bg}
          />
        </View>

        {/* NOTIFICATIONS */}
        <Text style={s.sectionHeader}>NOTIFICATIONS</Text>

        <View style={s.row}>
          <Text style={s.rowLabel}>Daily reminder</Text>
          <Switch
            value={notifEnabled}
            onValueChange={toggleNotif}
            trackColor={{ false: 'rgba(139,101,32,0.2)', true: theme.gold }}
            thumbColor={theme.bg}
          />
        </View>

        {notifEnabled && (
          <View style={s.row}>
            <Text style={s.rowLabel}>Reminder time</Text>
            <View style={s.timeControl}>
              <TouchableOpacity style={s.timeBtn} onPress={() => changeHour(-1)}>
                <Text style={s.timeBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.timeText}>{displayHour}:00 {ampm}</Text>
              <TouchableOpacity style={s.timeBtn} onPress={() => changeHour(1)}>
                <Text style={s.timeBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ABOUT */}
        <Text style={s.sectionHeader}>ABOUT</Text>

        <View style={s.row}>
          <Text style={s.rowLabel}>Version</Text>
          <Text style={s.rowValue}>{version}</Text>
        </View>

        <TouchableOpacity style={s.row} onPress={() => Linking.openURL('https://tathirquran.com')}>
          <Text style={s.rowLabel}>Website</Text>
          <Text style={s.rowLink}>tathirquran.com ↗</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.row} onPress={() => Linking.openURL('https://tathirquran.com/privacy')}>
          <Text style={s.rowLabel}>Privacy Policy</Text>
          <Text style={s.rowLink}>View ↗</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.row}
          onPress={() => Linking.openURL('https://apps.apple.com/app/tathirquran/id6811745113')}
        >
          <Text style={s.rowLabel}>Rate this app</Text>
          <Text style={s.rowLink}>App Store ↗</Text>
        </TouchableOpacity>

        {/* Credits */}
        <View style={s.credits}>
          <Text style={s.creditsLine}>Shakeel Hussain Khan &amp; Syeda Saira Naqvi · San Jose, California</Text>
          <Text style={s.creditsSmall}>A sadaqah jariyah for all Muslims 🤲</Text>
        </View>
      </ScrollView>
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
    sectionHeader: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 8,
      color: theme.gold,
      letterSpacing: 2,
      textTransform: 'uppercase',
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 8,
    },
    rowGroupLabel: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      color: theme.textSecondary,
      letterSpacing: 1,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 4,
      textTransform: 'uppercase',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: 'rgba(201,162,39,0.12)',
      backgroundColor: theme.bg,
    },
    rowLabel: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      color: theme.text,
    },
    rowValue: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      color: theme.textSecondary,
    },
    rowLink: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      color: theme.gold,
    },
    checkmark: {
      fontSize: 14,
      color: theme.gold,
    },
    timeControl: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    timeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(201,162,39,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    timeBtnText: {
      fontSize: 18,
      color: theme.gold,
      fontWeight: '300',
    },
    timeText: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 14,
      color: theme.text,
      minWidth: 80,
      textAlign: 'center',
    },
    credits: {
      paddingVertical: 32,
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    creditsLine: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 11,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: 6,
    },
    creditsSmall: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 10,
      color: theme.textSecondary,
      textAlign: 'center',
      opacity: 0.7,
    },
  });
}
