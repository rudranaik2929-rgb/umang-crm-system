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
  background: '#FDFBF9',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF7ED',
  sidebar: '#FFFFFF',
  primary: '#E88B35',
  primaryHover: '#D97A28',
  accent: '#7B301A',
  text: '#1E140C',
  textSecondary: '#634A3C',
  textMuted: '#A38B7D',
  border: '#FED7AA',
  borderSoft: '#FFEDD5',
  positive: '#059669',
  negative: '#E11D48',
  warning: '#D97706',
  info: '#0284C7',
  shadow: 'rgba(232,139,53,0.12)',
};

export const darkColors: ThemeColors = {
  background: '#140C07',
  surface: '#29180E',
  surfaceAlt: '#3A2416',
  sidebar: '#110A06',
  primary: '#E88B35',
  primaryHover: '#F9A867',
  accent: '#EF4444',
  text: '#FDFBF9',
  textSecondary: '#D1BCAE',
  textMuted: '#A38B7D',
  border: '#4A2F1D',
  borderSoft: '#29180E',
  positive: '#10B981',
  negative: '#FB7185',
  warning: '#F59E0B',
  info: '#38BDF8',
  shadow: 'rgba(0,0,0,0.5)',
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
