import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ThemeName, lightColors, darkColors, ThemeColors } from './tokens';

interface ThemeContextType {
  themeName: ThemeName;
  colors: ThemeColors;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  themeName: 'dark',
  colors: darkColors,
  toggle: () => {},
});

const STORAGE_KEY = 'umang_theme';

async function getStored(): Promise<ThemeName | null> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const v = window.localStorage.getItem(STORAGE_KEY);
      return (v === 'light' || v === 'dark') ? v : null;
    }
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return (v === 'light' || v === 'dark') ? v : null;
  } catch {
    return null;
  }
}

async function setStored(t: ThemeName) {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, t);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, t);
  } catch {}
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('dark');

  useEffect(() => {
    getStored().then((stored) => {
      if (stored) setThemeName(stored);
    });
  }, []);

  const toggle = useCallback(() => {
    setThemeName((prev) => {
      const next: ThemeName = prev === 'dark' ? 'light' : 'dark';
      setStored(next);
      return next;
    });
  }, []);

  const colors = themeName === 'dark' ? darkColors : lightColors;
  return (
    <ThemeContext.Provider value={{ themeName, colors, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
