import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { isAdmin } from '../../src/lib/constants';

function formatClockTime(value?: string | null) {
  if (!value) return '-';
  const [h, m = '0'] = String(value).split(':');
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour)) return String(value);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export default function FollowUpsPage() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const managerView = isAdmin(user?.role) || user?.role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/visit-followups');
      let list = Array.isArray(res.data) ? res.data : [];
      if (!managerView) {
        const myId = (user as any)?.acting_as_employee_id || (user as any)?.employee_id;
        if (myId) {
          const leadsRes = await api.get('/leads', { params: { assigned_to: myId, limit: 300 } });
          const mine = new Set(
            (leadsRes.data || [])
              .filter((l: any) => l.assigned_to === myId)
              .map((l: any) => l.lead_id),
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

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Follow Ups"
        subtitle={managerView ? 'All team follow-ups with employee name' : 'Your scheduled follow-ups'}
        rightAction={
          <Pressable onPress={load} style={[styles.refresh, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : items.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>No follow-ups scheduled yet.</Text>
        ) : (
          items.map((item) => (
            <View
              key={item.followup_id || `${item.visit_id}-${item.follow_up_at}`}
              style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <View style={[styles.icon, { backgroundColor: '#F9731618' }]}>
                <Ionicons name="calendar-outline" size={18} color="#F97316" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.lead, { color: colors.text }]}>{item.lead_name || 'Lead'}</Text>
                {managerView && item.employee_name ? (
                  <Text style={[styles.emp, { color: colors.primary }]}>{item.employee_name}</Text>
                ) : null}
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {item.follow_up_day || '-'} · {item.follow_up_date || '-'} · {formatClockTime(item.follow_up_time)}
                </Text>
                {item.notes ? (
                  <Text style={[styles.notes, { color: colors.textSecondary }]} numberOfLines={3}>{item.notes}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  refresh: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 10, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  lead: { fontSize: 14, fontWeight: '700' },
  emp: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  meta: { fontSize: 12, marginTop: 4, fontWeight: '600' },
  notes: { fontSize: 11, marginTop: 6 },
});
