import { Tabs } from 'expo-router';
import { useFonts } from 'expo-font';
import { Amiri_400Regular, Amiri_700Bold } from '@expo-google-fonts/amiri';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Text } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Onboarding from './onboarding';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Amiri_400Regular,
    Amiri_700Bold,
  });

  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_complete').then(val => {
      setShowOnboarding(val !== 'true');
    });
  }, []);

  if (!fontsLoaded || showOnboarding === null) return null;

  if (showOnboarding) {
    return (
      <SafeAreaProvider>
        <Onboarding onComplete={() => setShowOnboarding(false)} />
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
            fontSize: 10,
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
      </Tabs>
    </SafeAreaProvider>
  );
}
