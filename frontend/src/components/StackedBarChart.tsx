import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export type StackedSeries = {
  key: string;
  label: string;
  color: string;
};

export type StackedMonthRow = {
  label: string;
  total: number;
  segments: Record<string, number>;
};

interface StackedBarChartProps {
  title: string;
  subtitle?: string;
  series: StackedSeries[];
  data: StackedMonthRow[];
  yAxisLabel?: string;
  testID?: string;
}

const CHART_H = 220;
const Y_PAD = 44;

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const step = value <= 50 ? 10 : value <= 200 ? 25 : 50;
  return Math.ceil(value / step) * step;
}

export function StackedBarChart({
  title,
  subtitle,
  series,
  data,
  yAxisLabel = 'Leads',
  testID,
}: StackedBarChartProps) {
  const { colors } = useTheme();
  const maxTotal = useMemo(() => niceMax(Math.max(1, ...data.map((d) => d.total))), [data]);
  const yTicks = useMemo(() => {
    const steps = 5;
    return Array.from({ length: steps + 1 }, (_, i) => Math.round((maxTotal / steps) * (steps - i)));
  }, [maxTotal]);
  const isWeb = Platform.OS === 'web';

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}

      <View style={styles.plotWrap}>
        <View style={styles.yAxisCol}>
          <Text style={[styles.yAxisTitle, { color: colors.textMuted }]}>{yAxisLabel}</Text>
          {yTicks.map((tick) => (
            <Text key={tick} style={[styles.yTick, { color: colors.textMuted }]}>{tick}</Text>
          ))}
        </View>

        <View style={[styles.plotArea, { height: CHART_H }]}>
          {yTicks.slice(0, -1).map((tick) => {
            const top = ((maxTotal - tick) / maxTotal) * CHART_H;
            return (
              <View
                key={`grid-${tick}`}
                style={[styles.gridLine, { top, borderColor: colors.border + '55' }]}
              />
            );
          })}

          {isWeb ? (
            <View style={styles.barsRow}>
              {data.map((row, i) => {
                const barSlot = 100 / Math.max(data.length, 1);
                const barW = barSlot * 0.62;
                const x = i * barSlot + (barSlot - barW) / 2;
                const segments = series
                  .map((s) => ({ ...s, value: row.segments[s.key] || 0 }))
                  .filter((s) => s.value > 0);
                let stackY = 100;
                const stackedRects = segments.map((seg) => {
                  const h = (seg.value / maxTotal) * 92;
                  stackY -= h;
                  return { ...seg, y: stackY, h };
                });

                return (
                  <View key={row.label} style={styles.barSlot}>
                    {row.total > 0 ? (
                      <Text style={[styles.barTopLabel, { color: colors.textSecondary }]}>{row.total}</Text>
                    ) : null}
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: CHART_H, display: 'block' } as any}>
                      {stackedRects.map((seg) => (
                        <rect
                          key={seg.key}
                          x={x}
                          y={seg.y}
                          width={barW}
                          height={seg.h}
                          fill={seg.color}
                        >
                          <title>{`${row.label} · ${seg.label}: ${seg.value}`}</title>
                        </rect>
                      ))}
                    </svg>
                    <Text style={[styles.xLabel, { color: colors.textMuted }]} numberOfLines={1}>{row.label}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.barsRow}>
              {data.map((row) => (
                <View key={row.label} style={styles.barSlot}>
                  {row.total > 0 ? (
                    <Text style={[styles.barTopLabel, { color: colors.textSecondary }]}>{row.total}</Text>
                  ) : null}
                  <View style={[styles.nativeBar, { height: CHART_H }]}>
                    {series.map((s) => {
                      const v = row.segments[s.key] || 0;
                      if (!v) return null;
                      return (
                        <View
                          key={s.key}
                          style={{
                            width: '68%',
                            height: (v / maxTotal) * CHART_H,
                            backgroundColor: s.color,
                          }}
                        />
                      );
                    })}
                  </View>
                  <Text style={[styles.xLabel, { color: colors.textMuted }]} numberOfLines={1}>{row.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.legendRow}>
        {series.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  plotWrap: { flexDirection: 'row', marginTop: 20, gap: 8 },
  yAxisCol: { width: Y_PAD, justifyContent: 'space-between', paddingBottom: 22, paddingTop: 8 },
  yAxisTitle: {
    fontSize: 9,
    fontWeight: '600',
    transform: [{ rotate: '-90deg' }],
    width: 60,
    position: 'absolute',
    left: -24,
    top: 88,
  },
  yTick: { fontSize: 10, fontWeight: '500', textAlign: 'right' },
  plotArea: { flex: 1, position: 'relative' },
  gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', flex: 1, gap: 2 },
  barSlot: { flex: 1, alignItems: 'center', minWidth: 28 },
  barTopLabel: { fontSize: 9, fontWeight: '700', marginBottom: 4 },
  xLabel: { fontSize: 9, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  nativeBar: { alignItems: 'center', justifyContent: 'flex-end', width: '100%' },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, fontWeight: '600' },
});
