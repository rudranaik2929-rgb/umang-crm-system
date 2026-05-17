import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ThemeName, lightColors, darkColors, ThemeColors } from './tokens';

export type AccentColor = 'orange' | 'sky' | 'emerald' | 'royal' | 'orchid';

export const ACCENT_THEMES = {
  orange: {
    light: lightColors,
    dark: darkColors
  },
  sky: {
    light: {
      ...lightColors,
      background: '#F0F9FF',
      surface: '#FFFFFF',
      surfaceAlt: '#E0F2FE',
      sidebar: '#FFFFFF',
      primary: '#0EA5E9',
      primaryHover: '#0284C7',
      accent: '#0369A1',
      text: '#0F172A',
      textSecondary: '#334155',
      textMuted: '#64748B',
      border: '#BAE6FD',
      borderSoft: '#E0F2FE',
      shadow: 'rgba(14,165,233,0.08)',
    },
    dark: {
      ...darkColors,
      background: '#0B0F19',
      surface: '#1E293B',
      surfaceAlt: '#334155',
      sidebar: '#0F172A',
      primary: '#38BDF8',
      primaryHover: '#7DD3FC',
      accent: '#0EA5E9',
      text: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textMuted: '#64748B',
      border: '#334155',
      borderSoft: '#1E293B',
    }
  },
  emerald: {
    light: {
      ...lightColors,
      background: '#F0FDF4',
      surface: '#FFFFFF',
      surfaceAlt: '#DCFCE7',
      sidebar: '#FFFFFF',
      primary: '#10B981',
      primaryHover: '#059669',
      accent: '#15803D',
      text: '#062F17',
      textSecondary: '#166534',
      textMuted: '#71717A',
      border: '#BBF7D0',
      borderSoft: '#DCFCE7',
      shadow: 'rgba(16,185,129,0.08)',
    },
    dark: {
      ...darkColors,
      background: '#06100B',
      surface: '#0F2A1D',
      surfaceAlt: '#1B4D36',
      sidebar: '#091E14',
      primary: '#34D399',
      primaryHover: '#6EE7B7',
      accent: '#10B981',
      text: '#F0FDF4',
      textSecondary: '#A7F3D0',
      textMuted: '#71717A',
      border: '#1B4D36',
      borderSoft: '#0F2A1D',
    }
  },
  royal: {
    light: {
      ...lightColors,
      background: '#F5F7FF',
      surface: '#FFFFFF',
      surfaceAlt: '#EEF2FF',
      sidebar: '#FFFFFF',
      primary: '#2563EB',
      primaryHover: '#1D4ED8',
      accent: '#1E40AF',
      text: '#0F172A',
      textSecondary: '#1E293B',
      textMuted: '#64748B',
      border: '#C7D2FE',
      borderSoft: '#E0E7FF',
      shadow: 'rgba(37,99,235,0.08)',
    },
    dark: {
      ...darkColors,
      background: '#0A0D1A',
      surface: '#181E36',
      surfaceAlt: '#252E54',
      sidebar: '#0F1322',
      primary: '#3B82F6',
      primaryHover: '#60A5FA',
      accent: '#2563EB',
      text: '#F8FAFC',
      textSecondary: '#C7D2FE',
      textMuted: '#64748B',
      border: '#252E54',
      borderSoft: '#181E36',
    }
  },
  orchid: {
    light: {
      ...lightColors,
      background: '#FDF4FF',
      surface: '#FFFFFF',
      surfaceAlt: '#F5D0FE',
      sidebar: '#FFFFFF',
      primary: '#D946EF',
      primaryHover: '#C084FC',
      accent: '#A21CAF',
      text: '#2E083E',
      textSecondary: '#4A044E',
      textMuted: '#701A75',
      border: '#F5D0FE',
      borderSoft: '#FAE8FF',
      shadow: 'rgba(217,70,239,0.08)',
    },
    dark: {
      ...darkColors,
      background: '#140718',
      surface: '#290F33',
      surfaceAlt: '#3E184D',
      sidebar: '#110614',
      primary: '#E879F9',
      primaryHover: '#F5D0FE',
      accent: '#D946EF',
      text: '#FDF4FF',
      textSecondary: '#F5D0FE',
      textMuted: '#A21CAF',
      border: '#3E184D',
      borderSoft: '#290F33',
    }
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
          if (val && ACCENT_THEMES[val]) setAccentColorState(val);
        } else {
          const val = await AsyncStorage.getItem(ACCENT_STORAGE_KEY) as AccentColor;
          if (val && ACCENT_THEMES[val]) setAccentColorState(val);
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

  const colors = ACCENT_THEMES[accentColor][themeName];

  return (
    <ThemeContext.Provider value={{ themeName, colors, toggle, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

