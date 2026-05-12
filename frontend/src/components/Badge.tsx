import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { STAGE_COLORS, stageLabel } from '../lib/constants';

interface Props {
  text: string;
  color?: string;
  size?: 'sm' | 'md';
}

export function Badge({ text, color, size = 'sm' }: Props) {
  const { colors } = useTheme();
  const c = color || colors.primary;
  return (
    <View style={[styles.wrap, {
      backgroundColor: c + '1A',
      borderColor: c + '40',
      paddingHorizontal: size === 'sm' ? 8 : 10,
      paddingVertical: size === 'sm' ? 2 : 4,
    }]}>
      <Text style={[styles.text, { color: c, fontSize: size === 'sm' ? 10 : 11 }]}>{text}</Text>
    </View>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  return <Badge text={stageLabel(stage).toUpperCase()} color={STAGE_COLORS[stage] || '#475569'} />;
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
  },
  text: { fontWeight: '700', letterSpacing: 0.6 },
});
