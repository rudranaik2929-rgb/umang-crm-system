import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api, clearGetCache, getSnapshot, setSnapshot } from '../../src/lib/api';
import { EmployeeMap } from '../../src/components/EmployeeMap';
import { Ionicons } from '@expo/vector-icons';
import { roleLabel } from '../../src/lib/constants';

function formatSeen(iso?: string | null) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function isLive(iso?: string | null) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 10 * 60 * 1000;
}

export default function AdminTracking() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isNarrow = width < 900;
  const cachedTracking = getSnapshot<any[]>('admin-tracking-page');
  const [employees, setEmployees] = useState<any[]>(cachedTracking ?? []);
  const [loading, setLoading] = useState(!cachedTracking);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      if (force) clearGetCache();
      const r = await api.get('/employees');
      const sorted = (r.data || []).sort((a: any, b: any) => {
        if (!a.last_seen_at) return 1;
        if (!b.last_seen_at) return -1;
        return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
      });
      setEmployees(sorted);
      setSnapshot('admin-tracking-page', sorted);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const withGps = employees.filter((e) => e.last_lat != null && e.last_lng != null);
  const liveCount = employees.filter((e) => isLive(e.last_seen_at)).length;

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Employee Tracking"
        subtitle={`${liveCount} live now · ${withGps.length} with GPS · ${employees.length} total`}
        rightAction={(
          <Pressable
            onPress={() => load(true)}
            style={[styles.refreshBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
          >
            <Ionicons name="refresh" size={16} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>Refresh</Text>
          </Pressable>
        )}
      />

      <View style={[styles.container, isNarrow && styles.containerStack]}>
        <View style={[styles.listCol, isNarrow && styles.listColStack, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.listTitle, { color: colors.text, borderBottomColor: colors.border }]}>
            Employees
          </Text>
          <ScrollView style={{ maxHeight: isNarrow ? 220 : undefined }}>
            {employees.map((e) => {
              const live = isLive(e.last_seen_at);
              const hasGps = e.last_lat != null && e.last_lng != null;
              const active = selectedId === e.employee_id;
              return (
                <Pressable
                  key={e.employee_id}
                  onPress={() => setSelectedId(e.employee_id)}
                  style={[
                    styles.empItem,
                    { borderBottomColor: colors.border },
                    active && { backgroundColor: colors.primary + '10' },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.statusDot, { backgroundColor: live ? colors.positive : colors.textMuted }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.empName, { color: colors.text }]}>{e.name}</Text>
                      <Text style={[styles.empRole, { color: colors.textMuted }]}>
                        {roleLabel(e.role)}{e.department ? ` · ${e.department}` : ''}
                      </Text>
                    </View>
                    {live ? (
                      <Text style={{ color: colors.positive, fontSize: 9, fontWeight: '800' }}>LIVE</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.time, { color: colors.textMuted }]}>
                    Last seen: {formatSeen(e.last_seen_at)}
                  </Text>
                  {hasGps ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 4 }}>
                      GPS: {Number(e.last_lat).toFixed(4)}, {Number(e.last_lng).toFixed(4)}
                    </Text>
                  ) : (
                    <Text style={{ color: colors.warning, fontSize: 10, marginTop: 4 }}>
                      No GPS — employee must allow location after login
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={[styles.mapCol, isNarrow && styles.mapColStack]}>
          {loading && employees.length === 0 ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
          ) : (
            <EmployeeMap employees={employees} selectedId={selectedId} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', padding: 20, gap: 20 },
  containerStack: { flexDirection: 'column' },
  listCol: { width: 320, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  listColStack: { width: '100%', maxHeight: 260 },
  mapCol: { flex: 1, minHeight: 360 },
  mapColStack: { minHeight: 420 },
  listTitle: { fontSize: 14, fontWeight: '700', padding: 16, borderBottomWidth: 1 },
  empItem: { padding: 14, borderBottomWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  empName: { fontSize: 13, fontWeight: '600' },
  empRole: { fontSize: 11, marginTop: 2 },
  time: { fontSize: 10, marginTop: 6 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1 },
});
