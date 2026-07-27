import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, clearGetCache, getSnapshot, setSnapshot } from '../../src/lib/api';
import { EmployeeMap } from '../../src/components/EmployeeMap';
import { Ionicons } from '@expo/vector-icons';
import { canAccess } from '../../src/lib/constants';

function formatSeen(iso?: string | null) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/** Online = GPS updated within last 5 minutes (matches green marker). */
function isOnline(iso?: string | null) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 5 * 60 * 1000;
}

export default function AdminTracking() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const mapHeight = Math.max(320, Math.min(height * 0.55, 640));
  const cachedTracking = getSnapshot<any[]>('admin-tracking-page');
  const [employees, setEmployees] = useState<any[]>(cachedTracking ?? []);
  const [loading, setLoading] = useState(!cachedTracking);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!canAccess(user.role, 'tracking', user.email, user.allowed_pages)) {
      router.replace('/(app)/my-dashboard' as any);
    }
  }, [user, router]);

  const load = useCallback(async (force = false) => {
    try {
      if (force) clearGetCache();
      const r = await api.get('/employees/locations');
      const sorted = (r.data || []).sort((a: any, b: any) => {
        const aTs = a.updated_at || a.last_seen_at;
        const bTs = b.updated_at || b.last_seen_at;
        if (!aTs) return 1;
        if (!bTs) return -1;
        return new Date(bTs).getTime() - new Date(aTs).getTime();
      });
      setEmployees(sorted);
      setSnapshot('admin-tracking-page', sorted);
    } catch {
      // Keep previous snapshot on transient errors.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !canAccess(user.role, 'tracking', user.email, user.allowed_pages)) return;
    load();
    const interval = setInterval(() => load(true), 60_000);
    return () => clearInterval(interval);
  }, [load, user]);

  const withGps = employees.filter(
    (e) => (e.latitude ?? e.last_lat) != null && (e.longitude ?? e.last_lng) != null,
  );
  const onlineCount = employees.filter((e) => isOnline(e.updated_at || e.last_seen_at)).length;

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Employee Tracking"
        subtitle={`${onlineCount} online · ${withGps.length} on map`}
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.page}
        nestedScrollEnabled
      >
        {/* Full-width map first */}
        <View style={[styles.mapWrap, { height: mapHeight }]}>
          {loading && employees.length === 0 ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
          ) : (
            <EmployeeMap employees={employees} selectedId={selectedId} />
          )}
        </View>

        {/* Employee list below the map */}
        <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.listTitle, { color: colors.text, borderBottomColor: colors.border }]}>
            Employees
          </Text>
          {employees.length === 0 && !loading ? (
            <Text style={{ color: colors.textMuted, padding: 16, fontSize: 13 }}>
              No live locations yet. Employees must allow GPS after login.
            </Text>
          ) : null}
          {employees.map((e) => {
            const seen = e.updated_at || e.last_seen_at;
            const online = e.online ?? isOnline(seen);
            const lead = e.current_lead_name || e.current_lead?.name || '—';
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
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: online ? '#16A34A' : colors.textMuted },
                    ]}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.empName, { color: colors.text }]} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                      Current Lead: {lead}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]}>
                      Last Updated: {formatSeen(seen)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: online ? '#16A34A' : colors.textMuted,
                      fontSize: 11,
                      fontWeight: '800',
                    }}
                  >
                    {online ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 32, gap: 16 },
  mapWrap: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  listCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  listTitle: { fontSize: 14, fontWeight: '700', padding: 16, borderBottomWidth: 1 },
  empItem: { padding: 14, borderBottomWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  empName: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 3 },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
  },
});
