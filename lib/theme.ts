import { useColorScheme } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Champagne design system (v1.0.6, Saira via Shakeel, 2026-10-24):
// warm ivory #FAF6ED ground, deep champagne #9A7B3F as the primary
// working colour, pale champagne #D8C491 secondary surfaces, bright
// champagne #C3A56A for accents only, warm charcoal #2E2A24 text.
// Dark mode is the same family after dark: deep warm charcoal ground,
// ivory text, champagne accents.
export const lightTheme = {
  bg: '#FAF6ED',
  bgCard: '#FFFFFF',
  bgSoft: '#F3ECDB',
  text: '#2E2A24',
  textSecondary: '#6E6450',
  gold: '#C3A56A',
  // Text-grade champagne: dark enough to read at small sizes on ivory
  // (#C3A56A itself is decorative — ornaments and large headings only).
  goldText: '#86662E',
  bronze: '#9A7B3F',
  primary: '#9A7B3F',
  primarySoft: '#D8C491',
  accent: '#C3A56A',
  border: 'rgba(154,123,63,0.28)',
  barColor: '#C3A56A',
};

export const darkTheme = {
  bg: '#171410',
  bgCard: '#221D16',
  bgSoft: '#2A241B',
  text: '#F3ECDB',
  textSecondary: '#C9BBA0',
  gold: '#C3A56A',
  goldText: '#D8C491',
  bronze: '#C3A56A',
  primary: '#C3A56A',
  primarySoft: '#8A6A34',
  accent: '#C3A56A',
  border: 'rgba(195,165,106,0.3)',
  barColor: '#C3A56A',
};

export type Theme = typeof lightTheme;

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const [manualMode, setManualMode] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    AsyncStorage.getItem('theme_mode').then(val => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setManualMode(val);
      }
    });
  }, []);

  const isDark =
    manualMode === 'dark' ||
    (manualMode === 'system' && systemScheme === 'dark');

  return isDark ? darkTheme : lightTheme;
}
