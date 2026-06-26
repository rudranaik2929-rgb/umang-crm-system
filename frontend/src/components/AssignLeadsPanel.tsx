import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api, getSnapshot, setSnapshot } from '../lib/api';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { roleLabel } from '../lib/constants';

type Props = { compact?: boolean };

export function AssignLeadsPanel({ compact = false }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const cached = getSnapshot<any>('assign-leads-panel');
  const [stats, setStats] = useState<any>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  const load = useCallback(async (silent = false) => {
    if (!silent && !stats) setLoading(true);
    try {
      const res = await api.get('/stats/assignment');
      setStats(res.data);
      setSnapshot('assign-leads-panel', res.data);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [stats]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true));

  if (loading && !stats) return <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />;

  const employees = stats?.employees || [];
  const unassigned = Number(stats?.unassigned_count || 0);

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={{ color: colors.textSecondary, fontSize: compact ? 12 : 13, flex: 1 }}>
          {unassigned} unassigned · manager assigns from here
        </Text>
        <Pressable
          onPress={() => router.push('/(app)/assign-leads' as any)}
          style={[styles.linkBtn, { borderColor: colors.primary }]}
        >
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Open Assign Leads</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {employees.slice(0, compact ? 6 : 12).map((emp: any) => (
          <View key={emp.employee_id} style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{emp.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 9 }}>{roleLabel(emp.role)}</Text>
            <View style={styles.counts}>
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700' }}>{emp.assigned_queue ?? 0} queue</Text>
              <Text style={{ color: '#F97316', fontSize: 10, fontWeight: '700' }}>{emp.assigned_follow_ups ?? 0} follow-up</Text>
            </View>
          </View>
        ))}
      </View>
      {unassigned > 0 ? (
        <Pressable onPress={() => router.push('/(app)/assign-leads' as any)} style={[styles.alert, { backgroundColor: '#6366F112', borderColor: '#6366F1' }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#6366F1" />
          <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>{unassigned} leads waiting — assign one-by-one or bulk</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  linkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  box: { width: 150, padding: 10, borderRadius: 8, borderWidth: 1, gap: 2 },
  counts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 8, borderWidth: 1 },
});
