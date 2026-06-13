import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api, getSnapshot, setSnapshot } from '../../src/lib/api';
import { EmployeeMap } from '../../src/components/EmployeeMap';
import { Ionicons } from '@expo/vector-icons';

export default function AdminTracking() {
  const { colors } = useTheme();
  const cachedTracking = getSnapshot<any[]>('admin-tracking-page');
  const [employees, setEmployees] = useState<any[]>(cachedTracking ?? []);
  const [loading, setLoading] = useState(!cachedTracking);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/employees');
      // Sort by last seen
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
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar 
        title="Live Employee Tracking" 
        subtitle="Monitor field staff & telecallers in real-time" 
        rightAction={
          <Pressable onPress={load} style={[styles.refreshBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="refresh" size={16} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>Live Sync</Text>
          </Pressable>
        }
      />
      
      <View style={styles.container}>
        {/* Sidebar List */}
        <View style={[styles.listCol, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.listTitle, { color: colors.text }]}>Active Employees</Text>
          <ScrollView>
            {employees.map((e) => {
              const isLive = e.last_seen_at && (new Date().getTime() - new Date(e.last_seen_at).getTime() < 10 * 60 * 1000);
              return (
                <View key={e.employee_id} style={[styles.empItem, { borderBottomColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.statusDot, { backgroundColor: isLive ? colors.positive : colors.textMuted }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.empName, { color: colors.text }]}>{e.name}</Text>
                      <Text style={[styles.empRole, { color: colors.textMuted }]}>{e.role} · {e.department}</Text>
                    </View>
                  </View>
                  {e.last_seen_at && (
                    <Text style={[styles.time, { color: colors.textMuted }]}>
                      Last seen: {new Date(e.last_seen_at).toLocaleTimeString()}
                    </Text>
                  )}
                  {!e.last_lat && (
                    <Text style={{ color: colors.negative, fontSize: 9, marginTop: 4 }}>No GPS Data</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Map View */}
        <View style={styles.mapCol}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
          ) : (
            <EmployeeMap employees={employees} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', padding: 20, gap: 20 },
  listCol: { width: 300, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  mapCol: { flex: 1 },
  listTitle: { fontSize: 14, fontWeight: '700', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  empItem: { padding: 16, borderBottomWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  empName: { fontSize: 13, fontWeight: '600' },
  empRole: { fontSize: 11, marginTop: 2 },
  time: { fontSize: 10, marginTop: 6 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1 },
});
