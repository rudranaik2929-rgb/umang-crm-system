import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface DataPoint { label: string; value: number; }
interface LineChartProps {
  title: string;
  subtitle?: string;
  data: DataPoint[];
  color?: string;
  formatValue?: (v: number) => string;
  testID?: string;
}

const PIE_COLORS = [
  '#3B82F6', // Sky Blue
  '#10B981', // Sage Emerald
  '#F59E0B', // Amber Gold
  '#8B5CF6', // Royal Purple
  '#EC4899', // Elegant Pink
  '#06B6D4', // Calm Cyan
  '#EF4444', // Crimson Red
  '#14B8A6', // Teal Mint
  '#6366F1', // Royal Indigo
  '#F97316', // Vibrant Orange
];

export function LineChart({ title, subtitle, data, color, formatValue, testID }: LineChartProps) {
  const { colors } = useTheme();
  const [chartType, setChartType] = useState<'line' | 'bar' | 'pie'>('line');
  
  const c = color || '#3B82F6';
  const cleanColor = c.replace('#', '');
  const max = Math.max(1, ...data.map(d => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const H = 180;
  const W_PADDING = 40;
  const isWeb = Platform.OS === 'web';

  // 1. Line Path builder (smooth curves)
  const buildPath = () => {
    if (data.length < 2) return '';
    const stepX = 100 / (data.length - 1);
    let path = `M 0 ${100 - (data[0].value / max) * 85}`;
    
    for (let i = 0; i < data.length - 1; i++) {
      const x1 = i * stepX;
      const y1 = 100 - (data[i].value / max) * 85;
      const x2 = (i + 1) * stepX;
      const y2 = 100 - (data[i+1].value / max) * 85;
      
      const cx1 = x1 + stepX / 2;
      const cy1 = y1;
      const cx2 = x2 - stepX / 2;
      const cy2 = y2;
      
      path += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    }
    return path;
  };

  const buildAreaPath = () => {
    if (data.length < 2) return '';
    let path = buildPath();
    path += ` L 100 100 L 0 100 Z`;
    return path;
  };

  // 2. Pie Path Builder
  const getCoordinatesForPercent = (percent: number) => {
    // 12 o'clock start position
    const x = 50 + 38 * Math.cos(2 * Math.PI * percent - Math.PI / 2);
    const y = 50 + 38 * Math.sin(2 * Math.PI * percent - Math.PI / 2);
    return [x, y];
  };

  const activePieData = data.filter(d => d.value > 0);
  let accumulatedPercent = 0;
  
  const pieSlices = activePieData.map((d, index) => {
    const percent = total > 0 ? d.value / total : 0;
    const [startX, startY] = getCoordinatesForPercent(accumulatedPercent);
    accumulatedPercent += percent;
    const [endX, endY] = getCoordinatesForPercent(accumulatedPercent);
    const largeArcFlag = percent > 0.5 ? 1 : 0;
    const sliceColor = PIE_COLORS[index % PIE_COLORS.length];
    
    // Draw perfect pie wedge path
    const pathData = percent === 1 
      ? `M 50 12 A 38 38 0 1 1 49.99 12 Z` // Perfect circle fallback
      : [
          `M 50 50`,
          `L ${startX} ${startY}`,
          `A 38 38 0 ${largeArcFlag} 1 ${endX} ${endY}`,
          `Z`
        ].join(' ');
        
    return {
      pathData,
      label: d.label,
      value: d.value,
      percent: (percent * 100).toFixed(1) + '%',
      color: sliceColor
    };
  });

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={testID}>
      {/* Header with Title & Segments */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
        </View>
        <View style={[styles.toggleRow, { backgroundColor: colors.surfaceAlt }]}>
          {(['line', 'bar', 'pie'] as const).map((type) => (
            <TouchableOpacity
              key={type}
              onPress={() => setChartType(type)}
              style={[
                styles.toggleButton,
                chartType === type && { backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1 }
              ]}
            >
              <Text style={[
                styles.toggleText,
                { color: chartType === type ? colors.text : colors.textMuted },
                chartType === type && { fontWeight: '700' }
              ]}>
                {type.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Graph Area */}
      <View style={{ flexDirection: 'row', marginTop: 24 }}>
        {/* Y-Axis Label (Only for Line/Bar charts) */}
        {chartType !== 'pie' && (
          <View style={{ width: W_PADDING, justifyContent: 'space-between', paddingVertical: 4 }}>
            {[max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0].map((v, i) => (
              <Text key={i} style={[styles.yLabel, { color: colors.textMuted }]}>
                {formatValue ? formatValue(v) : v}
              </Text>
            ))}
          </View>
        )}

        <View style={{ flex: 1, height: H, justifyContent: 'center' }}>
          {/* Background grid lines for linear charts */}
          {chartType !== 'pie' && [0, 0.25, 0.5, 0.75, 1].map((f, i) => (
            <View key={i} style={[styles.gridLine, { top: f * H, borderColor: colors.border + '25' }]} />
          ))}

          {/* SVG Canvas (Web Only) */}
          {isWeb ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' } as any}>
                {/* 1. LINE / POLYGON CHART */}
                {chartType === 'line' && data.length >= 2 && (
                  <>
                    <defs>
                      <linearGradient id={`grad-${cleanColor}-${testID}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity="0.4" />
                        <stop offset="60%" stopColor={c} stopOpacity="0.1" />
                        <stop offset="100%" stopColor={c} stopOpacity="0" />
                      </linearGradient>
                      <filter id={`glow-${cleanColor}-${testID}`}>
                        <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                        <feMerge>
                          <feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    <path d={buildAreaPath()} fill={`url(#grad-${cleanColor}-${testID})`} />
                    <path d={buildPath()} fill="none" stroke={c} strokeWidth="2.5" filter={`url(#glow-${cleanColor}-${testID})`} vectorEffect="non-scaling-stroke" />
                  </>
                )}

                {/* 2. BAR GRAPH CHART */}
                {chartType === 'bar' && (
                  <>
                    {data.map((d, i) => {
                      const barWidth = 100 / data.length;
                      const width = barWidth * 0.7;
                      const x = i * barWidth + barWidth * 0.15;
                      const heightPercent = (d.value / max) * 85;
                      const y = 100 - heightPercent;
                      return (
                        <rect
                          key={i}
                          x={x}
                          y={y}
                          width={width}
                          height={heightPercent}
                          rx={Math.min(2, width / 4)}
                          fill={c}
                          style={{ transition: 'all 0.3s ease' } as any}
                        >
                          <title>{d.label}: {d.value}</title>
                        </rect>
                      );
                    })}
                  </>
                )}

                {/* 3. PIE CHART */}
                {chartType === 'pie' && (
                  total > 0 ? (
                    <>
                      {pieSlices.map((slice, i) => (
                        <path
                          key={i}
                          d={slice.pathData}
                          fill={slice.color}
                          style={{ transition: 'all 0.3s ease', cursor: 'pointer' } as any}
                        >
                          <title>{slice.label}: {slice.value} ({slice.percent})</title>
                        </path>
                      ))}
                    </>
                  ) : (
                    /* Elegant placeholder circle for empty data state */
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke={colors.border} strokeWidth="1.5" strokeDasharray="3 3" />
                  )
                )}
              </svg>

              {/* Data points dots overlay for smooth Line Chart */}
              {chartType === 'line' && data.length >= 2 && data.map((d, i) => {
                const left = `${(i / (data.length - 1)) * 100}%` as any;
                const top = `${(1 - d.value / max) * 85}%` as any;
                return (
                  <View key={i} style={[styles.dot, { left, top, backgroundColor: c, borderColor: colors.surface }]} />
                );
              })}
            </View>
          ) : (
            /* Native Fallback bars */
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', flex: 1, gap: 2, paddingHorizontal: 2 }}>
              {data.map((d, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ width: '70%', height: (d.value / max) * (H - 20), backgroundColor: c + '40', borderRadius: 3, borderTopWidth: 2, borderTopColor: c }} />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* X-Axis labels (Line/Bar) OR Color Legend (Pie) */}
      {chartType !== 'pie' ? (
        <View style={[styles.xRow, { marginLeft: W_PADDING }]}>  
          {data.map((d, i) => {
            const showEvery = data.length > 20 ? 5 : data.length > 10 ? 3 : 2;
            if (i % showEvery !== 0 && i !== data.length - 1) return <View key={i} style={{ flex: 1 }} />;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[styles.xLabel, { color: colors.textMuted }]} numberOfLines={1}>{d.label}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        /* Highly Polished Color Legend for Pie Chart (Only for non-zero items) */
        <View style={styles.legendGrid}>
          {total > 0 ? (
            pieSlices.map((slice, i) => (
              <View key={i} style={styles.legendItem}>
                <View style={[styles.colorBlock, { backgroundColor: slice.color }]} />
                <Text style={[styles.legendText, { color: colors.text }]} numberOfLines={1}>
                  {slice.label} ({slice.percent})
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>No active revenue / metrics recorded yet.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 14, borderWidth: 1, flex: 1, minWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 2 },
  toggleRow: { flexDirection: 'row', padding: 3, borderRadius: 8, alignItems: 'center' },
  toggleButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'transparent' },
  toggleText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
  yLabel: { fontSize: 9, fontWeight: '500', textAlign: 'right' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1 },
  xRow: { flexDirection: 'row', marginTop: 8 },
  xLabel: { fontSize: 9, fontWeight: '500' },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 2, marginLeft: -4, marginTop: -4, zIndex: 2 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', minWidth: 100 },
  colorBlock: { width: 10, height: 10, borderRadius: 3, marginRight: 6 },
  legendText: { fontSize: 10, fontWeight: '500' }
});
