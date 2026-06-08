import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

type EmployeePerformanceProps = {
  employees: any[];
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  telecaller: 'Telecaller',
  site_visit: 'Sales Executive',
  sales_executive: 'Sales Executive',
  booking: 'Booking',
  loan: 'Loan Officer',
  marketing: 'Marketing',
};

const WORKFLOW_METRICS = [
  { key: 'emp_active', label: 'Active', icon: 'flash' as const, colorKey: 'primary' },
  { key: 'emp_hot', label: 'Hot', icon: 'flame' as const, colorKey: 'warning' },
  { key: 'emp_visited', label: 'Visited', icon: 'location' as const, colorKey: 'info' },
  { key: 'emp_not_interested', label: 'Not Interested', icon: 'close-circle' as const, colorKey: 'negative' },
  { key: 'emp_booking_done', label: 'Booking Done', icon: 'checkmark-done' as const, colorKey: 'positive' },
  { key: 'emp_low_budget', label: 'Low Budget', icon: 'wallet' as const, colorKey: 'accent' },
  { key: 'emp_ringing', label: 'Ringing', icon: 'call' as const, colorKey: 'warning' },
];

export function EmployeePerformance({ employees }: EmployeePerformanceProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Employee Performance</Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>Assigned leads by workflow stage — per employee</Text>
        </View>
        <Text style={[styles.cardSub, { color: colors.textMuted }]}>
          {employees.length} {employees.length === 1 ? 'employee' : 'employees'}
        </Text>
      </View>

      {employees.length === 0 ? (
        <View style={[styles.empPlaceholder, { borderColor: colors.border }]}>
          <Ionicons name="people-outline" size={28} color={colors.textMuted} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 8 }}>No employees yet</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' }}>
            Add employees on the Employees page, then assign leads to see performance boxes.
          </Text>
        </View>
      ) : (
        <View style={styles.empGrid}>
          {employees.map((employee: any, idx: number) => {
            const isActive = !!employee.last_activity && (Date.now() - new Date(employee.last_activity).getTime()) < 24 * 3600 * 1000;
            const rank = idx + 1;
            const rankColor = rank === 1 ? '#FBBF24' : rank === 2 ? '#94A3B8' : rank === 3 ? '#B45309' : null;
            const roleColorMap: Record<string, string> = {
              admin: colors.primary,
              manager: colors.accent,
              telecaller: colors.info,
              site_visit: '#0EA5E9',
              booking: colors.warning,
              loan: '#7C3AED',
              marketing: '#EC4899',
            };
            const roleColor = roleColorMap[employee.role] || colors.primary;
            const score = (employee.emp_hot ?? 0) * 3
              + (employee.emp_visited ?? 0) * 2
              + (employee.emp_booking_done ?? 0) * 5
              + (employee.emp_active ?? 0)
              - (employee.emp_not_interested ?? 0);

            return (
              <View
                key={employee.employee_id}
                testID={`emp-perf-${employee.employee_id}`}
                style={[styles.empCard, {
                  backgroundColor: colors.surface,
                  borderColor: rank === 1 ? '#FBBF24' : colors.border,
                  borderWidth: rank === 1 ? 1.5 : 1,
                }]}
              >
                <View style={styles.empCardHead}>
                  <View style={styles.empTitleWrap}>
                    <View style={[styles.empCardAvatar, {
                      backgroundColor: employee.active ? roleColor : colors.textMuted,
                      borderColor: isActive ? colors.positive : 'transparent',
                    }]}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
                        {employee.name?.[0]?.toUpperCase() || '?'}
                      </Text>
                      {isActive && <View style={[styles.activeDot, { backgroundColor: colors.positive, borderColor: colors.surface }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{employee.name}</Text>
                      <View style={[styles.roleChip, { backgroundColor: roleColor + '20', borderColor: roleColor + '50' }]}>
                        <Text style={{ color: roleColor, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
                          {(ROLE_LABELS[employee.role] || employee.role || 'Member').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {rankColor && (
                    <View style={[styles.rankBadge, { backgroundColor: rankColor + '20', borderColor: rankColor }]}>
                      <Ionicons name="trophy" size={11} color={rankColor} />
                      <Text style={{ color: rankColor, fontSize: 10, fontWeight: '800', marginLeft: 3 }}>#{rank}</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.scoreBanner, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <View>
                    <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 }}>PERFORMANCE SCORE</Text>
                    <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: 0 }}>{score}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 }}>ASSIGNED</Text>
                    <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: 0 }}>{employee.assigned_total ?? employee.leads_total ?? 0}</Text>
                  </View>
                </View>

                <View style={styles.statusRow}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isActive ? colors.positive : colors.textMuted }} />
                  <Text style={{ color: isActive ? colors.positive : colors.textMuted, fontSize: 11, fontWeight: '600' }}>
                    {employee.last_activity ? `Last active: ${new Date(employee.last_activity).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : 'No activity yet'}
                  </Text>
                </View>

                <View style={styles.metricPills}>
                  {WORKFLOW_METRICS.map((metric) => {
                    const colorMap: Record<string, string> = {
                      primary: colors.primary,
                      warning: colors.warning,
                      info: colors.info,
                      negative: colors.negative,
                      positive: colors.positive,
                      accent: colors.accent,
                    };
                    const pillColor = colorMap[metric.colorKey] || colors.primary;
                    return (
                      <MetricPill
                        key={metric.key}
                        icon={metric.icon}
                        label={metric.label}
                        value={employee[metric.key] ?? 0}
                        color={pillColor}
                      />
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function MetricPill({ icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <View style={[styles.metricPill, { backgroundColor: color + '10', borderColor: color + '30' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <Ionicons name={icon} size={11} color={color} />
        <Text style={{ color, fontSize: 8, fontWeight: '700', letterSpacing: 0.4 }} numberOfLines={2}>{label.toUpperCase()}</Text>
      </View>
      <Text style={{ color, fontSize: 20, fontWeight: '700', letterSpacing: 0 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  activityCard: { padding: 20, borderRadius: 10, borderWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  empPlaceholder: { marginTop: 14, padding: 22, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center' },
  empGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16 },
  empCard: { width: 360, padding: 18, borderRadius: 10 },
  empCardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  empTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  empCardAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  activeDot: {
    position: 'absolute', bottom: -2, right: -2,
    width: 14, height: 14, borderRadius: 7, borderWidth: 2,
  },
  roleChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 99, borderWidth: 1, marginTop: 4,
  },
  rankBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, height: 24, borderRadius: 12, borderWidth: 1,
  },
  scoreBanner: {
    marginTop: 14, padding: 12, borderRadius: 10, borderWidth: 1,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  metricPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  metricPill: {
    width: 100, paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 8, borderWidth: 1, gap: 4,
  },
});
