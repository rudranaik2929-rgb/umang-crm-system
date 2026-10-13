import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, clearGetCache, getSnapshot, setSnapshot } from '../../src/lib/api';
import { EmployeeMap } from '../../src/components/EmployeeMap';
import { EmployeeLocationCorrectModal } from '../../src/components/EmployeeLocationCorrectModal';
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

function ago(iso?: string | null) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.floor(hr / 24)} d ago`;
}

/** Location live = GPS ping within the last 5 minutes (matches green marker). */
function isLocationLive(iso?: string | null) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t < 5 * 60 * 1000;
}

function accuracyLabel(value?: number | string | null) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `±${Math.round(n)} m`;
}

function sessionStatusColor(online: boolean, colors: any) {
  return online ? '#16A34A' : colors.textMuted;
}

export default function AdminTracking() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const mapHeight = Math.max(320, Math.min(height * 0.55, 640));
  const cachedTracking = getSnapshot<any[]>('admin-tracking-page');
  const [employees, setEmployees] = useState<any[]>(cachedTracking ?? []);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(!cachedTracking);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!canAccess(user.role, 'tracking', user.email, user.allowed_pages)) {
      router.replace('/(app)/my-dashboard' as any);
    }
  }, [user, router]);

  const load = useCallback(async (force = false) => {
    try {
      if (force) clearGetCache();
      const [locRes, sessRes] = await Promise.allSettled([
        api.get('/employees/locations'),
        api.get('/auth/active-sessions'),
      ]);

      if (locRes.status === 'fulfilled') {
        const sorted = (locRes.value.data || []).sort((a: any, b: any) => {
          const aTs = a.updated_at || a.last_seen_at;
          const bTs = b.updated_at || b.last_seen_at;
          if (!aTs) return 1;
          if (!bTs) return -1;
          return new Date(bTs).getTime() - new Date(aTs).getTime();
        });
        setEmployees(sorted);
        setSnapshot('admin-tracking-page', sorted);
      }
      if (sessRes.status === 'fulfilled') {
        setSessions(sessRes.value.data?.sessions || []);
      }
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

  // employee_id -> active login session (for the "Logged in" pill + device).
  const sessionsByEmployee = useMemo(() => {
    const map: Record<string, any> = {};
    for (const s of sessions) {
      const key = s.employee_id || s.user_id;
      if (key && !map[key]) map[key] = s;
    }
    return map;
  }, [sessions]);

  const enriched = useMemo(
    () => employees.map((e) => {
      const sess = sessionsByEmployee[e.employee_id];
      return {
        ...e,
        logged_in: !!sess,
        session_device: sess?.device ?? null,
        session_last_seen: sess?.last_seen_at ?? null,
      };
    }),
    [employees, sessionsByEmployee],
  );

  const withGps = employees.filter(
    (e) => (e.latitude ?? e.last_lat) != null && (e.longitude ?? e.last_lng) != null,
  );
  const locationLiveCount = employees.filter((e) => isLocationLive(e.updated_at || e.last_seen_at)).length;
  const loggedInCount = sessions.filter((s) => s.logged_in).length;
  const onlineCount = sessions.filter((s) => s.online).length;

  const reload = () => load(true);

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Employee Tracking"
        subtitle={`${loggedInCount} logged in · ${locationLiveCount} location live · ${withGps.length} on map`}
        rightAction={(
          <Pressable
            onPress={reload}
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
        {/* Who's logged in NOW (live session status, independent of GPS) */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.cardHead, { borderBottomColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Who's logged in now</Text>
            <Text style={[styles.countBadge, { color: colors.primary, borderColor: colors.primary }]}>
              {onlineCount} active · {loggedInCount} signed in
            </Text>
          </View>
          {sessions.length === 0 ? (
            <Text style={{ color: colors.textMuted, padding: 16, fontSize: 13 }}>
              No active logins right now.
            </Text>
          ) : (
            sessions.map((s) => (
              <View key={s.user_id || s.email} style={[styles.sessionRow, { borderBottomColor: colors.border }]}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: sessionStatusColor(!!s.online, colors), marginTop: 6 },
                  ]}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.empName, { color: colors.text }]} numberOfLines={1}>
                    {s.name || s.email || s.user_id}
                    {s.role ? <Text style={{ color: colors.textMuted, fontWeight: '600' }}>  ·  {s.role}</Text> : null}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                    <Ionicons name="phone-portrait-outline" size={11} color={colors.textSecondary} /> {s.device || 'Unknown device'}
                    {s.ip ? `  ·  ${s.ip}` : ''}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>
                    Logged in {formatSeen(s.login_at)} · Last seen {ago(s.last_seen_at)}
                  </Text>
                  <View style={styles.pillRow}>
                    <Text
                      style={[
                        styles.pill,
                        { color: s.online ? '#166534' : colors.textMuted, backgroundColor: s.online ? '#DCFCE7' : colors.surfaceAlt },
                      ]}
                    >
                      {s.online ? 'Logged in · active' : 'Logged in · idle'}
                    </Text>
                    <Text
                      style={[
                        styles.pill,
                        { color: s.location_live ? '#1E40AF' : colors.textMuted, backgroundColor: s.location_live ? '#DBEAFE' : colors.surfaceAlt },
                      ]}
                    >
                      {s.location_live ? 'Location live' : 'No live GPS'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Full-width map */}
        <View style={[styles.mapWrap, { height: mapHeight }]}>
          {loading && employees.length === 0 ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
          ) : (
            <EmployeeMap employees={enriched} selectedId={selectedId} />
          )}
        </View>

        {/* Employee list */}
        <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.listTitle, { color: colors.text, borderBottomColor: colors.border }]}>
            Employees
          </Text>
          {employees.length === 0 && !loading ? (
            <Text style={{ color: colors.textMuted, padding: 16, fontSize: 13 }}>
              No live locations yet. Employees must allow GPS after login.
            </Text>
          ) : null}
          {enriched.map((e) => {
            const seen = e.updated_at || e.last_seen_at;
            const locLive = e.online ?? isLocationLive(seen);
            const lead = e.current_lead_name || e.current_lead?.name || '—';
            const active = selectedId === e.employee_id;
            const acc = accuracyLabel(e.accuracy);
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
                      { backgroundColor: locLive ? '#16A34A' : colors.textMuted },
                    ]}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.empName, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
                        {e.name}
                      </Text>
                      {e.logged_in ? (
                        <Text style={[styles.pill, { color: '#166534', backgroundColor: '#DCFCE7' }]}>Logged in</Text>
                      ) : null}
                      {e.source === 'manual' ? (
                        <Text style={[styles.pill, { color: '#3730A3', backgroundColor: '#E0E7FF' }]}>Manual</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                      Current Lead: {lead}
                    </Text>
                    {e.address ? (
                      <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                        <Ionicons name="location-outline" size={11} color={colors.textSecondary} /> {e.address}
                      </Text>
                    ) : null}
                    <Text style={[styles.meta, { color: colors.textMuted }]}>
                      Location: {formatSeen(seen)}{acc ? ` · GPS ${acc}` : ''}
                      {e.session_device ? ` · ${e.session_device}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ color: locLive ? '#16A34A' : colors.textMuted, fontSize: 11, fontWeight: '800' }}>
                      {locLive ? 'Live' : 'Offline'}
                    </Text>
                    <Pressable
                      onPress={() => setCorrecting(e)}
                      hitSlop={8}
                      style={[styles.correctBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                    >
                      <Ionicons name="create-outline" size={13} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700' }}>Fix</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <EmployeeLocationCorrectModal
        visible={!!correcting}
        employee={correcting}
        onClose={() => setCorrecting(null)}
        onSaved={reload}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 32, gap: 16 },
  mapWrap: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, gap: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  countBadge: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  sessionRow: { flexDirection: 'row', gap: 10, padding: 14, borderBottomWidth: 1 },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  pill: { fontSize: 10, fontWeight: '800', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  listCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  listTitle: { fontSize: 14, fontWeight: '700', padding: 16, borderBottomWidth: 1 },
  empItem: { padding: 14, borderBottomWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  empName: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 3 },
  correctBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
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
