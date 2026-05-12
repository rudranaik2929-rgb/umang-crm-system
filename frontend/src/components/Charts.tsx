import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { STAGES, STAGE_COLORS } from '../lib/constants';

interface Props {
  data: Record<string, number>;
}

export function StagePipelineChart({ data }: Props) {
  const { colors } = useTheme();
  const max = Math.max(1, ...Object.values(data));
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Pipeline Distribution</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>Active leads across each workflow stage</Text>
      <View style={{ marginTop: 18, gap: 12 }}>
        {STAGES.map((s) => {
          const v = data[s.key] || 0;
          const w = (v / max) * 100;
          const c = STAGE_COLORS[s.key] || colors.primary;
          return (
            <View key={s.key}>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{s.label}</Text>
                <Text style={[styles.value, { color: colors.text }]}>{v}</Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
                <View style={[styles.fill, { width: `${w}%`, backgroundColor: c }]} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface DonutProps {
  positive: number;
  negative: number;
  inProgress: number;
}
export function StatusDonut({ positive, negative, inProgress }: DonutProps) {
  const { colors } = useTheme();
  const total = positive + negative + inProgress || 1;
  const segs = [
    { label: 'Positive', value: positive, color: colors.positive },
    { label: 'In Progress', value: inProgress, color: colors.info },
    { label: 'Negative', value: negative, color: colors.negative },
  ];
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Lead Health</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>Overall status of your active database</Text>
      <View style={{ flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', marginTop: 18, backgroundColor: colors.surfaceAlt }}>
        {segs.map((s, i) => (
          <View key={i} style={{ flex: s.value / total, backgroundColor: s.color }} />
        ))}
      </View>
      <View style={{ marginTop: 18, gap: 8 }}>
        {segs.map((s, i) => (
          <View key={i} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={[styles.label, { color: colors.textSecondary, flex: 1 }]}>{s.label}</Text>
            <Text style={[styles.value, { color: colors.text }]}>{s.value}</Text>
            <Text style={[styles.label, { color: colors.textMuted, width: 50, textAlign: 'right' }]}>
              {Math.round((s.value / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, borderRadius: 12, borderWidth: 1, minWidth: 320 },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '500' },
  value: { fontSize: 13, fontWeight: '600' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
