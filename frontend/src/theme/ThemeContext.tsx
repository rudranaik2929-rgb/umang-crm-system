import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ThemeName, lightColors, darkColors, ThemeColors } from './tokens';

export type AccentColor = 'orange' | 'sky' | 'emerald' | 'royal' | 'orchid';

export const ACCENT_COLORS = {
  orange: {
    light: { primary: '#E88B35', hover: '#D97A28', shadow: 'rgba(232,139,53,0.12)' },
    dark: { primary: '#E88B35', hover: '#F9A867', shadow: 'rgba(0,0,0,0.5)' }
  },
  sky: {
    light: { primary: '#0EA5E9', hover: '#0284C7', shadow: 'rgba(14,165,233,0.12)' },
    dark: { primary: '#0EA5E9', hover: '#38BDF8', shadow: 'rgba(0,0,0,0.5)' }
  },
  emerald: {
    light: { primary: '#10B981', hover: '#059669', shadow: 'rgba(16,185,129,0.12)' },
    dark: { primary: '#10B981', hover: '#34D399', shadow: 'rgba(0,0,0,0.5)' }
  },
  royal: {
    light: { primary: '#2563EB', hover: '#1D4ED8', shadow: 'rgba(37,99,235,0.12)' },
    dark: { primary: '#3B82F6', hover: '#60A5FA', shadow: 'rgba(0,0,0,0.5)' }
  },
  orchid: {
    light: { primary: '#D946EF', hover: '#C084FC', shadow: 'rgba(217,70,239,0.12)' },
    dark: { primary: '#D946EF', hover: '#E879F9', shadow: 'rgba(0,0,0,0.5)' }
  }
};

interface ThemeContextType {
  themeName: ThemeName;
  colors: ThemeColors;
  toggle: () => void;
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  themeName: 'dark',
  colors: darkColors,
  toggle: () => {},
  accentColor: 'orange',
  setAccentColor: () => {},
});

const STORAGE_KEY = 'umang_theme';
const ACCENT_STORAGE_KEY = 'umang_accent_color';

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
  const [accentColor, setAccentColorState] = useState<AccentColor>('orange');

  useEffect(() => {
    getStored().then((stored) => {
      if (stored) setThemeName(stored);
    });

    // Load persisted accent color
    const getAccent = async () => {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const val = window.localStorage.getItem(ACCENT_STORAGE_KEY) as AccentColor;
          if (val && ACCENT_COLORS[val]) setAccentColorState(val);
        } else {
          const val = await AsyncStorage.getItem(ACCENT_STORAGE_KEY) as AccentColor;
          if (val && ACCENT_COLORS[val]) setAccentColorState(val);
        }
      } catch {}
    };
    getAccent();
  }, []);

  const toggle = useCallback(() => {
    setThemeName((prev) => {
      const next: ThemeName = prev === 'dark' ? 'light' : 'dark';
      setStored(next);
      return next;
    });
  }, []);

  const setAccentColor = useCallback((color: AccentColor) => {
    setAccentColorState(color);
    const saveAccent = async () => {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.localStorage.setItem(ACCENT_STORAGE_KEY, color);
        } else {
          await AsyncStorage.setItem(ACCENT_STORAGE_KEY, color);
        }
      } catch {}
    };
    saveAccent();
  }, []);

  const baseColors = themeName === 'dark' ? darkColors : lightColors;
  const overrides = ACCENT_COLORS[accentColor][themeName];
  const colors: ThemeColors = {
    ...baseColors,
    primary: overrides.primary,
    primaryHover: overrides.hover,
    shadow: overrides.shadow
  };

  return (
    <ThemeContext.Provider value={{ themeName, colors, toggle, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

