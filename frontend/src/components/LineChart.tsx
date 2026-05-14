import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
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

export function LineChart({ title, subtitle, data, color, formatValue, testID }: LineChartProps) {
  const { colors } = useTheme();
  const c = color || '#3B82F6';
  const max = Math.max(1, ...data.map(d => d.value));
  const H = 180;
  const W_PADDING = 40;

  // Build SVG path for web (using smooth cubic curves)
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

  const isWeb = Platform.OS === 'web';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID={testID}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
        </View>
        <View style={[styles.menuDots, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 16 }}>⋯</Text>
        </View>
      </View>

      {/* Y-axis labels + Chart */}
      <View style={{ flexDirection: 'row', marginTop: 16 }}>
        <View style={{ width: W_PADDING, justifyContent: 'space-between', paddingVertical: 4 }}>
          {[max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0].map((v, i) => (
            <Text key={i} style={[styles.yLabel, { color: colors.textMuted }]}>
              {formatValue ? formatValue(v) : v}
            </Text>
          ))}
        </View>

        <View style={{ flex: 1, height: H }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
            <View key={i} style={[styles.gridLine, { top: f * H, borderColor: colors.border + '30' }]} />
          ))}

          {/* SVG Chart (web only) */}
          {isWeb && data.length >= 2 ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' } as any}>
                <defs>
                  <linearGradient id={`grad-${testID}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity="0.4" />
                    <stop offset="60%" stopColor={c} stopOpacity="0.1" />
                    <stop offset="100%" stopColor={c} stopOpacity="0" />
                  </linearGradient>
                  <filter id={`glow-${testID}`}>
                    <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <path d={buildAreaPath()} fill={`url(#grad-${testID})`} style={{ transition: 'all 0.5s ease' } as any} />
                <path d={buildPath()} fill="none" stroke={c} strokeWidth="2.5" filter={`url(#glow-${testID})`} vectorEffect="non-scaling-stroke" style={{ transition: 'all 0.5s ease' } as any} />
              </svg>
              {/* Dots */}
              {data.map((d, i) => {
                const left = `${(i / (data.length - 1)) * 100}%` as any;
                const top = `${(1 - d.value / max) * 85}%` as any;
                return (
                  <View key={i} style={{
                    position: 'absolute', left, top, width: 8, height: 8, borderRadius: 4,
                    backgroundColor: c, borderWidth: 2, borderColor: colors.surface,
                    marginLeft: -4, marginTop: -4, zIndex: 2,
                  }} />
                );
              })}
            </View>
          ) : (
            /* Fallback bar chart for non-web */
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', flex: 1, gap: 2, paddingHorizontal: 2 }}>
              {data.map((d, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ width: '70%', height: (d.value / max) * (H - 10), backgroundColor: c + '40', borderRadius: 3, borderTopWidth: 2, borderTopColor: c }} />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* X-axis labels */}
      <View style={[styles.xRow, { marginLeft: W_PADDING }]}>  
        {data.map((d, i) => {
          const showEvery = data.length > 20 ? 5 : data.length > 10 ? 3 : 2;
          if (i % showEvery !== 0 && i !== data.length - 1) return <View key={i} style={{ flex: 1 }} />;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[styles.xLabel, { color: colors.textMuted }]}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 14, borderWidth: 1, flex: 1, minWidth: 340 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 2 },
  menuDots: { width: 30, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  yLabel: { fontSize: 9, fontWeight: '500', textAlign: 'right' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1 },
  xRow: { flexDirection: 'row', marginTop: 6 },
  xLabel: { fontSize: 9, fontWeight: '500' },
});
