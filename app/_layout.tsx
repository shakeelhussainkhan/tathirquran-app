import { Tabs, router } from 'expo-router';
import { useFonts } from 'expo-font';
import { Amiri_400Regular, Amiri_700Bold } from '@expo-google-fonts/amiri';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { AppState, Text } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Onboarding from './onboarding';
import LaunchIntro from '../components/LaunchIntro';
import { ensureOfflineData } from '../lib/offlineDb';
import { refreshPrayerAlerts } from '../lib/prayerAlerts';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Amiri_400Regular,
    Amiri_700Bold,
  });

  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  // Launch intro: plays once per cold launch, above onboarding or tabs.
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_complete').then(val => {
      setShowOnboarding(val !== 'true');
    });
    // Offline-first: mirror the full Quran corpus locally on first launch
    // (and refresh it when stale). Fire-and-forget — never blocks launch.
    void ensureOfflineData();
    // Wave 3 (#7/#3): keep the rolling window of morning-verse and azan
    // notifications topped up — on launch and every return to foreground.
    void refreshPrayerAlerts();
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshPrayerAlerts();
    });
    return () => appStateSub.remove();
  }, []);

  useEffect(() => {
    // Wave 3: tapping a morning-verse or azan notification opens Today.
    const openToday = (response: Notifications.NotificationResponse | null) => {
      const type = response?.notification.request.content.data?.type;
      if (type === 'morning-verse' || type === 'azan') {
        router.navigate('/');
      }
    };
    void Notifications.getLastNotificationResponseAsync().then(openToday);
    const responseSub = Notifications.addNotificationResponseReceivedListener(openToday);
    return () => responseSub.remove();
  }, []);

  if (!fontsLoaded || showOnboarding === null) return null;

  if (showOnboarding) {
    return (
      <SafeAreaProvider>
        <Onboarding onComplete={() => setShowOnboarding(false)} />
        {!introDone && <LaunchIntro onDone={() => setIntroDone(true)} />}
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.parchment,
            borderTopColor: Colors.bronzeSubtle,
            borderTopWidth: 0.5,
          },
          tabBarActiveTintColor: Colors.bronze,
          tabBarInactiveTintColor: Colors.inkSoft,
          tabBarLabelStyle: {
            fontFamily: 'Amiri_400Regular',
            fontSize: 11,
            letterSpacing: 1,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Today',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 18, color }}>☀</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="archive"
          options={{
            title: 'Archive',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 18, color }}>📜</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="mushaf"
          options={{
            title: 'Mushaf',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 18, color }}>📖</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 18, color }}>🔍</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="circles"
          options={{
            title: 'Circle',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 18, color }}>👥</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="qibla"
          options={{
            title: 'Qibla',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 18, color }}>🧭</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="about"
          options={{
            title: 'About',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 18, color }}>ℹ</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 18, color }}>⚙</Text>
            ),
          }}
        />
        <Tabs.Screen name="onboarding" options={{ href: null }} />
        <Tabs.Screen name="khatmah" options={{ href: null }} />
        <Tabs.Screen name="read" options={{ href: null }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="ayah/[surah]/[ayah]" options={{ href: null }} />
        <Tabs.Screen name="devotional/[slug]" options={{ href: null }} />
      </Tabs>
      {!introDone && <LaunchIntro onDone={() => setIntroDone(true)} />}
    </SafeAreaProvider>
  );
}
