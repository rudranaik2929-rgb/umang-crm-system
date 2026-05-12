import { Platform } from 'react-native';

export type ThemeName = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  sidebar: string;
  primary: string;
  primaryHover: string;
  accent: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSoft: string;
  positive: string;
  negative: string;
  warning: string;
  info: string;
  shadow: string;
}

export const lightColors: ThemeColors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  sidebar: '#FFFFFF',
  primary: '#1E3A8A',
  primaryHover: '#1E40AF',
  accent: '#D4AF37',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderSoft: '#F1F5F9',
  positive: '#059669',
  negative: '#E11D48',
  warning: '#D97706',
  info: '#0284C7',
  shadow: 'rgba(15,23,42,0.06)',
};

export const darkColors: ThemeColors = {
  background: '#020617',
  surface: '#0F172A',
  surfaceAlt: '#1E293B',
  sidebar: '#070B14',
  primary: '#3B82F6',
  primaryHover: '#60A5FA',
  accent: '#FBBF24',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  border: '#1E293B',
  borderSoft: '#0F172A',
  positive: '#10B981',
  negative: '#FB7185',
  warning: '#F59E0B',
  info: '#38BDF8',
  shadow: 'rgba(0,0,0,0.4)',
};

export const fonts = {
  heading: Platform.select({
    web: '"Outfit", system-ui, -apple-system, "Segoe UI", sans-serif',
    default: 'Outfit_600SemiBold',
  }) as string,
  body: Platform.select({
    web: '"Manrope", system-ui, -apple-system, "Segoe UI", sans-serif',
    default: 'Manrope_400Regular',
  }) as string,
};

export const radii = { sm: 6, md: 10, lg: 14, xl: 20 };
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
