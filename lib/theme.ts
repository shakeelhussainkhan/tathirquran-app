import { useColorScheme } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const lightTheme = {
  bg: '#faf5e9',
  bgCard: '#f5edd8',
  text: '#1a1205',
  textSecondary: '#5a3a10',
  gold: '#c9a227',
  bronze: '#8b6520',
  border: 'rgba(201,162,39,0.2)',
  barColor: '#c9a227',
};

export const darkTheme = {
  bg: '#0d0a04',
  bgCard: '#1a1205',
  text: '#f5e8c8',
  textSecondary: '#c9a227',
  gold: '#e8c96a',
  bronze: '#c9a227',
  border: 'rgba(201,162,39,0.2)',
  barColor: '#c9a227',
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
