import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { isAdmin } from '../lib/constants';

function formatClockTime(value?: string | null) {
  if (!value) return '';
  const [h, m = '0'] = String(value).split(':');
  const hour = Number(h);
  if (!Number.isFinite(hour)) return String(value);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(Number(m)).padStart(2, '0')} ${suffix}`;
}

type Props = {
  compact?: boolean;
  maxItems?: number;
  showEmployeeName?: boolean;
  onOpenLead?: (leadId: string) => void;
};

export function FollowUpsPanel({ compact = false, maxItems, showEmployeeName, onOpenLead }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const managerView = showEmployeeName ?? (isAdmin(user?.role) || user?.role === 'manager');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/visit-followups');
      let list = Array.isArray(res.data) ? res.data : [];
      if (!managerView) {
        const myId = (user as any)?.acting_as_employee_id || (user as any)?.employee_id;
        if (myId) {
          const leadsRes = await api.get('/leads');
          const mine = new Set(
            (leadsRes.data || []).filter((l: any) => l.assigned_to === myId).map((l: any) => l.lead_id),
          );
          list = list.filter((f: any) => mine.has(f.lead_id));
        }
      }
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [managerView, user]);

  useEffect(() => { load(); }, [load]);

  const shown = maxItems ? items.slice(0, maxItems) : items;

  if (loading) {
    return <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />;
  }

  if (items.length === 0) {
    return (
      <Text style={{ color: colors.textMuted, fontSize: compact ? 12 : 13, paddingVertical: 8 }}>
        No follow-ups scheduled yet.
      </Text>
    );
  }

  return (
    <View>
      {!compact ? (
        <View style={styles.toolbar}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
            {managerView ? 'Team follow-ups' : 'Your scheduled follow-ups'}
          </Text>
          <Pressable onPress={load} style={[styles.refresh, { borderColor: colors.border }]}>
            <Ionicons name="refresh" size={16} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.grid}>
        {shown.map((item) => (
          <Pressable
            key={item.followup_id || `${item.visit_id}-${item.follow_up_at}`}
            onPress={() => item.lead_id && onOpenLead?.(item.lead_id)}
            style={({ pressed }: any) => [
              styles.box,
              compact ? styles.boxCompact : null,
              {
                borderColor: colors.border,
                backgroundColor: pressed ? '#F9731610' : colors.surfaceAlt,
              },
            ]}
          >
            <View style={styles.boxTop}>
              <Ionicons name="calendar" size={compact ? 14 : 16} color="#F97316" />
              <Text style={[styles.boxDate, { color: colors.textMuted }]} numberOfLines={1}>
                {item.follow_up_date || '—'}
              </Text>
            </View>
            <Text style={[styles.boxName, { color: colors.text }]} numberOfLines={1}>
              {item.lead_name || 'Lead'}
            </Text>
            {managerView && item.employee_name ? (
              <Text style={[styles.boxEmp, { color: colors.primary }]} numberOfLines={1}>
                {item.employee_name}
              </Text>
            ) : null}
            <Text style={[styles.boxTime, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.follow_up_day ? `${item.follow_up_day} · ` : ''}
              {formatClockTime(item.follow_up_time)}
            </Text>
          </Pressable>
        ))}
      </View>
      {maxItems && items.length > maxItems ? (
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
          +{items.length - maxItems} more follow-ups
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  refresh: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  box: {
    width: 168,
    minHeight: 96,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  boxCompact: { width: 150, minHeight: 88, padding: 10 },
  boxTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  boxDate: { fontSize: 10, fontWeight: '600', flex: 1 },
  boxName: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  boxEmp: { fontSize: 10, fontWeight: '600' },
  boxTime: { fontSize: 11, marginTop: 2 },
});
