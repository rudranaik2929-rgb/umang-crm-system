import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  label: string;
  value: string | number;
  delta?: string;
  icon?: any;
  accent?: string;
  testID?: string;
  onPress?: () => void;
}

export function StatCard({ label, value, delta, icon = 'stats-chart-outline', accent, testID, onPress }: Props) {
  const { colors } = useTheme();
  const c = accent || colors.primary;
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      {...(onPress ? { onPress } : {})}
      style={[
        styles.wrap,
        {
          backgroundColor: `${colors.surface}80`,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 4,
          elevation: 3,
        },
      ]}
      testID={testID}
    >
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <View style={[styles.iconWrap, { backgroundColor: `${c}18` }]}> 
          <Ionicons name={icon} size={16} color={c} />
        </View>
      </View>
      <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
      {delta ? (
        <Text style={[styles.delta, { color: colors.textMuted }]}>{delta}</Text>
      ) : null}
      {onPress && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <Text style={{ color: c, fontSize: 11, fontWeight: '600' }}>Tap for breakdown</Text>
          <Ionicons name="chevron-forward" size={12} color={c} />
        </View>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 220,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  delta: { fontSize: 12 },
});
