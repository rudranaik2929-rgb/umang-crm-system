import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ThemeName, lightColors, darkColors, ThemeColors } from './tokens';

export type AccentColor = 'sky' | 'forest' | 'lavender' | 'sunset' | 'rose';

export const ACCENT_THEMES = {
  sky: {
    light: {
      ...lightColors,
      background: '#F0F8FF', // Soft Alice Blue wash
      surface: '#FFFFFF',
      surfaceAlt: '#E0F2FE',
      sidebar: '#FFFFFF',
      primary: '#0284C7',
      primaryHover: '#0369A1',
      accent: '#0369A1',
      text: '#0F172A',
      textSecondary: '#334155',
      textMuted: '#64748B',
      border: '#BAE6FD',
      borderSoft: '#E0F2FE',
      shadow: 'rgba(14,165,233,0.06)',
    },
    dark: {
      ...darkColors,
      background: '#0B0F19', // Soothing deep midnight slate
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
      shadow: 'rgba(0,0,0,0.3)',
    }
  },
  forest: {
    light: {
      ...lightColors,
      background: '#F4FBF7', // Soothing Mint-Leaf wash
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
      shadow: 'rgba(16,185,129,0.06)',
    },
    dark: {
      ...darkColors,
      background: '#0A0E0C', // Soothing forest charcoal
      surface: '#15201B',
      surfaceAlt: '#22332B',
      sidebar: '#0E1412',
      primary: '#34D399',
      primaryHover: '#6EE7B7',
      accent: '#10B981',
      text: '#F0FDF4',
      textSecondary: '#A7F3D0',
      textMuted: '#71717A',
      border: '#22332B',
      borderSoft: '#15201B',
      shadow: 'rgba(0,0,0,0.3)',
    }
  },
  lavender: {
    light: {
      ...lightColors,
      background: '#FAF5FF', // Soft Lavender Mist wash
      surface: '#FFFFFF',
      surfaceAlt: '#F3E8FF',
      sidebar: '#FFFFFF',
      primary: '#8B5CF6',
      primaryHover: '#7C3AED',
      accent: '#6D28D9',
      text: '#2E083E',
      textSecondary: '#4A044E',
      textMuted: '#701A75',
      border: '#E9D5FF',
      borderSoft: '#F3E8FF',
      shadow: 'rgba(139,92,246,0.06)',
    },
    dark: {
      ...darkColors,
      background: '#0E0A14', // Elegant deep amethyst dark slate
      surface: '#1B1326',
      surfaceAlt: '#2B1F3D',
      sidebar: '#120D1A',
      primary: '#A78BFA',
      primaryHover: '#C084FC',
      accent: '#8B5CF6',
      text: '#F9F5FF',
      textSecondary: '#E9D5FF',
      textMuted: '#A78BFA',
      border: '#2B1F3D',
      borderSoft: '#1B1326',
      shadow: 'rgba(0,0,0,0.3)',
    }
  },
  sunset: {
    light: {
      ...lightColors,
      background: '#FFFDF9', // Warm Ivory Sand wash
      surface: '#FFFFFF',
      surfaceAlt: '#FEF3C7',
      sidebar: '#FFFFFF',
      primary: '#D97706',
      primaryHover: '#B45309',
      accent: '#92400E',
      text: '#451A03',
      textSecondary: '#78350F',
      textMuted: '#A16207',
      border: '#FDE68A',
      borderSoft: '#FEF3C7',
      shadow: 'rgba(217,119,6,0.06)',
    },
    dark: {
      ...darkColors,
      background: '#110E0C', // Warm luxurious chocolate amber
      surface: '#221A16',
      surfaceAlt: '#332822',
      sidebar: '#171311',
      primary: '#F59E0B',
      primaryHover: '#FBBF24',
      accent: '#D97706',
      text: '#FFFBEB',
      textSecondary: '#FDE68A',
      textMuted: '#F59E0B',
      border: '#332822',
      borderSoft: '#221A16',
      shadow: 'rgba(0,0,0,0.3)',
    }
  },
  rose: {
    light: {
      ...lightColors,
      background: '#FFF5F7', // Soft Quartz-Pink wash
      surface: '#FFFFFF',
      surfaceAlt: '#FCE7F3',
      sidebar: '#FFFFFF',
      primary: '#EC4899',
      primaryHover: '#DB2777',
      accent: '#C11574',
      text: '#4C0519',
      textSecondary: '#831843',
      textMuted: '#9D174D',
      border: '#FBCFE8',
      borderSoft: '#FCE7F3',
      shadow: 'rgba(236,72,153,0.06)',
    },
    dark: {
      ...darkColors,
      background: '#140B10', // Deep elegant burgundy cherry
      surface: '#271420',
      surfaceAlt: '#3B1E30',
      sidebar: '#1A0E15',
      primary: '#F472B6',
      primaryHover: '#FBCFE8',
      accent: '#EC4899',
      text: '#FFF1F2',
      textSecondary: '#FBCFE8',
      textMuted: '#F472B6',
      border: '#3B1E30',
      borderSoft: '#271420',
      shadow: 'rgba(0,0,0,0.3)',
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
  themeName: 'light',
  colors: ACCENT_THEMES.sky.light,
  toggle: () => {},
  accentColor: 'sky',
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
  const [themeName, setThemeName] = useState<ThemeName>('light');
  const [accentColor, setAccentColorState] = useState<AccentColor>('sky');

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

