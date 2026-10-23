import { View, Text, ScrollView, Switch, TouchableOpacity, StyleSheet, Linking, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  loadKhatmahState,
  getKhatmahProgress,
  type KhatmahState,
} from '../lib/khatmah';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useTheme } from '../lib/theme';
import {
  scheduleDailyNotification,
  cancelNotifications,
  getNotificationSettings,
} from '../lib/notifications';
import { getOfflineSyncStatus, syncOfflineData, type OfflineSyncStatus } from '../lib/offlineDb';
import ReciterPicker from '../components/ReciterPicker';
import {
  DEFAULT_RECITER,
  clearDownloads,
  formatBytes,
  getDownloadsSizeBytes,
  getSelectedReciter,
  setSelectedReciter,
  type Reciter,
} from '../lib/reciters';
import {
  getStreakState,
  milestoneForStreak,
  streakLabel,
  WELCOME_BACK_MESSAGE,
  type StreakState,
} from '../lib/streaks';

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
  const [showTransliteration, setShowTransliteration] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifHour, setNotifHour] = useState(7);
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system');
  const [reciter, setReciter] = useState<Reciter>(DEFAULT_RECITER);
  const [downloadsSize, setDownloadsSize] = useState(0);
  const [clearingDownloads, setClearingDownloads] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState<OfflineSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState('');
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [khatmahState, setKhatmahState] = useState<KhatmahState | null>(null);

  useEffect(() => {
    (async () => {
      const [lang, trans, tafsir, bism, translit, savedTheme] = await Promise.all([
        AsyncStorage.getItem('selected_language'),
        AsyncStorage.getItem('selected_translation'),
        AsyncStorage.getItem('show_tafsir'),
        AsyncStorage.getItem('show_bismillah'),
        AsyncStorage.getItem('show_transliteration'),
        AsyncStorage.getItem('theme_mode'),
      ]);
      if (lang) setLanguage(lang);
      if (trans) setTranslation(trans);
      setShowTafsir(tafsir !== 'false');
      setShowBismillah(bism !== 'false');
      setShowTransliteration(translit === 'true');
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
        setThemeMode(savedTheme);
      }
      const notif = await getNotificationSettings();
      setNotifEnabled(notif.enabled);
      setNotifHour(notif.hour);
      setStreak(await getStreakState());
      setReciter(await getSelectedReciter());
      setDownloadsSize(await getDownloadsSizeBytes());
    })();
  }, []);

  const refreshOfflineStatus = useCallback(async () => {
    try {
      setOfflineStatus(await getOfflineSyncStatus());
    } catch {
      // Status display is best-effort only.
    }
  }, []);

  const refreshAudioState = useCallback(async () => {
    try {
      setReciter(await getSelectedReciter());
      setDownloadsSize(await getDownloadsSizeBytes());
    } catch {
      // Best-effort display only.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshOfflineStatus();
      void refreshAudioState();
      loadKhatmahState().then(setKhatmahState);
    }, [refreshOfflineStatus, refreshAudioState])
  );

  const handleReciterChange = async (next: Reciter) => {
    setReciter(next);
    await setSelectedReciter(next);
  };

  const handleClearDownloads = () => {
    if (clearingDownloads || downloadsSize === 0) return;
    Alert.alert(
      'Clear downloaded audio?',
      'This removes all downloaded recitation audio from this device. You can download any ayah again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearingDownloads(true);
            try {
              await clearDownloads();
              setDownloadsSize(0);
            } finally {
              setClearingDownloads(false);
              void refreshAudioState();
            }
          },
        },
      ]
    );
  };

  const handleOfflineSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncStage('Starting…');
    try {
      const status = await syncOfflineData({
        force: true,
        onProgress: (stage, rows) => setSyncStage(`${stage} · ${rows.toLocaleString()} rows`),
      });
      setOfflineStatus(status);
    } finally {
      setSyncing(false);
      setSyncStage('');
      void refreshOfflineStatus();
    }
  };

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

  const toggleTransliteration = async (val: boolean) => {
    setShowTransliteration(val);
    await AsyncStorage.setItem('show_transliteration', String(val));
  };

  const handleThemeChange = async (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode);
    await AsyncStorage.setItem('theme_mode', mode);
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
      {/* contentInsetAdjustmentBehavior="never": SafeAreaView above already
          applies the safe-area insets; leaving UIKit's automatic adjustment
          on as well double-manages the top inset and can leave the top of
          the scroll content clipped/unreachable (v1.0.4 fix, suggestion #5). */}
      <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="never">
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

        <View style={s.row}>
          <Text style={s.rowLabel}>Show transliteration</Text>
          <Switch
            value={showTransliteration}
            onValueChange={toggleTransliteration}
            trackColor={{ false: 'rgba(139,101,32,0.2)', true: theme.gold }}
            thumbColor={theme.bg}
          />
        </View>

        <View style={s.row}>
          <Text style={s.rowLabel}>Theme</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['light', 'system', 'dark'] as const).map(mode => (
              <TouchableOpacity
                key={mode}
                onPress={() => handleThemeChange(mode)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 4,
                  borderWidth: 0.5,
                  borderColor: themeMode === mode ? '#c9a227' : 'rgba(201,162,39,0.25)',
                  backgroundColor: themeMode === mode ? '#c9a227' : 'transparent',
                }}
              >
                <Text style={{
                  fontSize: 10,
                  color: themeMode === mode ? '#fff' : '#8b6520',
                  textTransform: 'capitalize',
                }}>
                  {mode}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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

        {/* RECITATION */}
        <Text style={s.sectionHeader}>RECITATION</Text>

        <Text style={s.rowGroupLabel}>Reciter</Text>
        <ReciterPicker selected={reciter} onSelect={handleReciterChange} variant="rows" />

        <View style={s.row}>
          <Text style={s.rowLabel}>Downloaded audio</Text>
          <Text style={s.rowValue}>{downloadsSize > 0 ? formatBytes(downloadsSize) : 'None'}</Text>
        </View>

        <TouchableOpacity
          style={s.row}
          onPress={handleClearDownloads}
          disabled={clearingDownloads || downloadsSize === 0}
        >
          <Text style={[s.rowLabel, downloadsSize === 0 && { opacity: 0.5 }]}>Clear downloads</Text>
          {clearingDownloads ? (
            <ActivityIndicator size="small" color={theme.gold} />
          ) : (
            <Text style={[s.rowLink, downloadsSize === 0 && { opacity: 0.5 }]}>Clear</Text>
          )}
        </TouchableOpacity>

        <Text style={s.syncNote}>
          Downloaded ayahs play offline and are preferred over streaming. Audio is stored only on this device.
        </Text>

        {/* OFFLINE */}
        <Text style={s.sectionHeader}>OFFLINE DATA</Text>

        <View style={s.row}>
          <Text style={s.rowLabel}>Offline data</Text>
          <Text style={s.rowValue}>
            {syncing
              ? 'Syncing…'
              : offlineStatus && offlineStatus.ayahCount > 0
                ? '✓ Ready'
                : 'Not downloaded'}
          </Text>
        </View>

        {offlineStatus?.lastSyncedAt && (
          <View style={s.row}>
            <Text style={s.rowLabel}>Last synced</Text>
            <Text style={s.rowValue}>
              {new Date(offlineStatus.lastSyncedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
        )}

        <TouchableOpacity style={s.row} onPress={handleOfflineSync} disabled={syncing}>
          <Text style={s.rowLabel}>
            {offlineStatus && offlineStatus.ayahCount > 0 ? 'Re-sync offline data' : 'Download offline data'}
          </Text>
          {syncing ? (
            <ActivityIndicator size="small" color={theme.gold} />
          ) : (
            <Text style={s.rowLink}>Sync now</Text>
          )}
        </TouchableOpacity>

        <Text style={s.syncNote}>
          {syncing && syncStage
            ? syncStage
            : 'Downloads the full Quran text, all translations and the daily schedule so the app works without a connection.'}
        </Text>

        {/* YOUR JOURNEY — daily-verse streak (stored on this device only) */}
        <Text style={s.sectionHeader}>YOUR JOURNEY</Text>

        <View style={s.row}>
          <Text style={s.rowLabel}>Days with the Quran</Text>
          <Text style={s.rowValue}>{streakLabel(streak?.current_streak ?? 0)}</Text>
        </View>

        <View style={s.row}>
          <Text style={s.rowLabel}>Current streak</Text>
          <Text style={s.rowValue}>
            {streak?.current_streak
              ? `${streak.current_streak} ${streak.current_streak === 1 ? 'day' : 'days'}`
              : '—'}
          </Text>
        </View>

        <View style={s.row}>
          <Text style={s.rowLabel}>Longest streak</Text>
          <Text style={s.rowValue}>
            {streak?.longest_streak
              ? `${streak.longest_streak} ${streak.longest_streak === 1 ? 'day' : 'days'}`
              : '—'}
          </Text>
        </View>

        <View style={s.row}>
          <Text style={s.rowLabel}>Total days viewed</Text>
          <Text style={s.rowValue}>{streak?.viewed_dates.length ?? 0}</Text>
        </View>

        {streak && milestoneForStreak(streak.longest_streak) && (
          <View style={s.row}>
            <Text style={s.rowLabel}>Milestone reached</Text>
            <Text style={s.rowValue}>{milestoneForStreak(streak.longest_streak)?.title}</Text>
          </View>
        )}

        <Text style={s.streakNote}>
          {streak && streak.current_streak > 0
            ? 'One verse a day, with barakah. Stored only on this device.'
            : `${WELCOME_BACK_MESSAGE} Stored only on this device.`}
        </Text>

        {/* READING PLAN */}
        <Text style={s.sectionHeader}>READING PLAN</Text>

        {(() => {
          const progress = khatmahState ? getKhatmahProgress(khatmahState) : null;
          return (
            <TouchableOpacity style={s.row} onPress={() => router.push('/khatmah' as any)}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.rowLabel}>Khatmah — complete reading of the Quran</Text>
                <Text style={{ fontFamily: 'Amiri_400Regular', fontSize: 12, color: theme.textSecondary, marginTop: 3 }}>
                  {progress
                    ? progress.isComplete
                      ? `${progress.plan.name} · Completed`
                      : `${progress.plan.name} · ${progress.completedCount} of ${progress.totalPortions} portions read`
                    : 'No plan started · Choose a 30-day, 90-day, or one-year pace'}
                </Text>
              </View>
              <Text style={s.rowLink}>Open →</Text>
            </TouchableOpacity>
          );
        })()}
        {/* ISLAMIC CALENDAR */}
        <Text style={s.sectionHeader}>ISLAMIC CALENDAR</Text>

        <TouchableOpacity style={s.row} onPress={() => router.push('/calendar' as any)}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.rowLabel}>Islamic calendar</Text>
            <Text style={{ fontFamily: 'Amiri_400Regular', fontSize: 12, color: theme.textSecondary, marginTop: 3 }}>
              Wiladat, Shahadat and the occasions of the year, by Hijri month
            </Text>
          </View>
          <Text style={s.rowLink}>Open →</Text>
        </TouchableOpacity>

        {/* FAMILY CIRCLE */}
        <Text style={s.sectionHeader}>FAMILY CIRCLE</Text>

        <TouchableOpacity style={s.row} onPress={() => router.push('/circles')}>
          <Text style={s.rowLabel}>Family circle</Text>
          <Text style={s.rowLink}>Open →</Text>
        </TouchableOpacity>

        <Text style={s.streakNote}>
          Read the daily verse together with your family. No account or email —
          your circle is shared with an invite code.
        </Text>

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
      fontSize: 10,
      color: theme.gold,
      letterSpacing: 2,
      textTransform: 'uppercase',
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 8,
    },
    rowGroupLabel: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 11,
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
      paddingVertical: 14,
      borderBottomWidth: 0.5,
      borderBottomColor: 'rgba(201,162,39,0.12)',
      backgroundColor: theme.bg,
    },
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
    rowLink: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 13,
      color: theme.gold,
    },
    checkmark: {
      fontSize: 14,
      color: theme.gold,
    },
    streakNote: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 12,
      fontStyle: 'italic',
      color: theme.textSecondary,
      lineHeight: 18,
      paddingHorizontal: 20,
      paddingTop: 12,
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
    syncNote: {
      fontFamily: 'Amiri_400Regular',
      fontSize: 11,
      color: theme.textSecondary,
      paddingHorizontal: 20,
      paddingTop: 10,
      lineHeight: 16,
      opacity: 0.8,
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
