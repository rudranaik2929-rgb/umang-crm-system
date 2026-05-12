import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, TextInput, Platform } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { StatCard } from '../../src/components/StatCard';
import { StagePipelineChart, StatusDonut } from '../../src/components/Charts';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LeadSourceModal } from '../../src/components/LeadSourceModal';

const ADMIN_PIN = '9999';
const SESSION_KEY = 'umang_admin_unlocked';


function isUnlocked(): boolean {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.sessionStorage.getItem(SESSION_KEY) === '1';
    }
  } catch {}
  return false;
}

function setUnlocked(v: boolean) {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (v) window.sessionStorage.setItem(SESSION_KEY, '1');
      else window.sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {}
}

export default function AdminAnalytics() {
  const { colors } = useTheme();
  const router = useRouter();
  const [unlocked, setUnlockedState] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);

  useEffect(() => {
    setUnlockedState(isUnlocked());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a, e] = await Promise.all([
        api.get('/stats/dashboard'),
        api.get('/activities?limit=20'),
        api.get('/stats/employees'),
      ]);
      setStats(s.data);
      setActivities(a.data || []);
      setEmployees(e.data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (unlocked) load(); }, [unlocked, load]);

  const submitPin = () => {
    setError(null);
    if (pin.trim() === ADMIN_PIN) {
      setUnlocked(true);
      setUnlockedState(true);
      setPin('');
    } else {
      setError('Incorrect PIN. Try again.');
    }
  };

  const lock = () => {
    setUnlocked(false);
    setUnlockedState(false);
  };

  if (!unlocked) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Admin Analytics" subtitle="Restricted — enter administrator PIN" />
        <View style={styles.gateWrap}>
          <View style={[styles.gateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.lockCircle, { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}>
              <Ionicons name="lock-closed" size={28} color={colors.accent} />
            </View>
            <Text style={[styles.gateTitle, { color: colors.text }]}>Admin-only Analytics</Text>
            <Text style={[styles.gateDesc, { color: colors.textSecondary }]}>
              Pipeline analytics, charts, revenue and live activity feed are available to administrators with the company PIN.
            </Text>
            <Text style={[styles.label, { color: colors.textMuted, marginTop: 22 }]}>4-DIGIT PIN</Text>
            <TextInput
              testID="admin-pin-input"
              value={pin}
              onChangeText={(v) => setPin(v.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={4}
              onSubmitEditing={submitPin}
              style={{
                height: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
                paddingHorizontal: 16, color: colors.text, backgroundColor: colors.surfaceAlt,
                fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 8,
              }}
            />
            {error ? (
              <View style={{ marginTop: 12, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.negative, backgroundColor: colors.negative + '14' }}>
                <Text style={{ color: colors.negative, fontSize: 12 }}>{error}</Text>
              </View>
            ) : null}
            <Pressable
              testID="admin-pin-submit"
              onPress={submitPin}
              disabled={pin.length !== 4}
              style={[styles.unlockBtn, { backgroundColor: colors.primary, opacity: pin.length === 4 ? 1 : 0.5 }]}
            >
              <Ionicons name="lock-open-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Unlock Analytics</Text>
            </Pressable>
            <Pressable
              testID="admin-pin-back"
              onPress={() => router.replace('/(app)/dashboard' as any)}
              style={{ marginTop: 14, alignItems: 'center' }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Back to Dashboard</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Admin Analytics"
        subtitle="Pipeline, revenue & live activity"
        rightAction={
          <Pressable testID="admin-lock-btn" onPress={lock} style={[styles.lockBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>Lock</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {loading || !stats ? (
          <View style={{ padding: 48 }}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <>
            <View style={styles.row}>
              <StatCard label="Total Leads" value={stats.total_leads} icon="people-outline" accent={colors.primary} testID="stat-total-leads" onPress={() => setSourceModalVisible(true)} />
              <StatCard label="Positive" value={stats.positive_leads} icon="trending-up-outline" accent={colors.positive} testID="stat-positive" />
              <StatCard label="Negative" value={stats.negative_leads} icon="trending-down-outline" accent={colors.negative} testID="stat-negative" />
              <StatCard label="Site Visits" value={stats.site_visits} icon="location-outline" accent={colors.info} testID="stat-visits" />
            </View>
            <View style={styles.row}>
              <StatCard label="Bookings" value={stats.bookings} icon="document-text-outline" accent={colors.warning} testID="stat-bookings" />
              <StatCard label="Loans" value={stats.loans} icon="business-outline" accent={'#7C3AED'} testID="stat-loans" />
              <StatCard label="Employees" value={stats.employees} icon="people-circle-outline" accent={colors.accent} testID="stat-employees" />
              <StatCard
                label="Pipeline Revenue"
                value={`₹${(stats.revenue_pipeline / 100000).toFixed(1)}L`}
                icon="cash-outline"
                accent={colors.positive}
                testID="stat-revenue"
              />
            </View>

            <View style={styles.row}>
              <StagePipelineChart data={stats.stage_distribution} />
              <StatusDonut
                positive={stats.positive_leads}
                negative={stats.negative_leads}
                inProgress={stats.total_leads - stats.positive_leads - stats.negative_leads}
              />
            </View>

            {/* Employee Performance */}
            <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Employee Performance</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>Per-employee credit for every action taken</Text>
                </View>
                <Text style={[styles.cardSub, { color: colors.textMuted }]}>{employees.length} {employees.length === 1 ? 'employee' : 'employees'}</Text>
              </View>
              {employees.length === 0 ? (
                <View style={[styles.empPlaceholder, { borderColor: colors.border }]}>
                  <Ionicons name="people-outline" size={28} color={colors.textMuted} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 8 }}>No employees yet</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center' }}>
                    Add employees on the Employees page, then use Act-as in the top bar to credit their work.
                  </Text>
                </View>
              ) : (
                <View style={styles.empGrid}>
                  {employees.map((e: any, idx: number) => {
                    const isActive = !!e.last_activity && (Date.now() - new Date(e.last_activity).getTime()) < 24 * 3600 * 1000;
                    const rank = idx + 1;
                    const rankColor = rank === 1 ? '#FBBF24' : rank === 2 ? '#94A3B8' : rank === 3 ? '#B45309' : null;
                    const roleLabelMap: Record<string, string> = {
                      admin: 'Admin', telecaller: 'Telecaller', site_visit: 'Site Visit',
                      booking: 'Booking', loan: 'Loan Officer', marketing: 'Marketing',
                    };
                    const roleColorMap: Record<string, string> = {
                      admin: colors.primary, telecaller: colors.info, site_visit: '#0EA5E9',
                      booking: colors.warning, loan: '#7C3AED', marketing: '#EC4899',
                    };
                    const roleColor = roleColorMap[e.role] || colors.primary;
                    // simple performance score
                    const score = e.positives * 3 + e.visits * 2 + e.bookings_done * 5 + e.loans_done * 4 + e.closed_deals * 10;
                    return (
                      <View
                        key={e.employee_id}
                        testID={`emp-perf-${e.employee_id}`}
                        style={[styles.empCard, {
                          backgroundColor: colors.surface,
                          borderColor: rank === 1 ? '#FBBF24' : colors.border,
                          borderWidth: rank === 1 ? 1.5 : 1,
                        }]}
                      >
                        {/* Header */}
                        <View style={styles.empCardHead}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                            <View style={[styles.empCardAvatar, {
                              backgroundColor: e.active ? roleColor : colors.textMuted,
                              borderColor: isActive ? colors.positive : 'transparent',
                            }]}>
                              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
                                {e.name?.[0]?.toUpperCase() || '?'}
                              </Text>
                              {isActive && <View style={[styles.activeDot, { backgroundColor: colors.positive, borderColor: colors.surface }]} />}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{e.name}</Text>
                              <View style={[styles.roleChip, { backgroundColor: roleColor + '20', borderColor: roleColor + '50' }]}>
                                <Text style={{ color: roleColor, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 }}>
                                  {(roleLabelMap[e.role] || e.role).toUpperCase()}
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

                        {/* Score banner */}
                        <View style={[styles.scoreBanner, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                          <View>
                            <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 }}>PERFORMANCE SCORE</Text>
                            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }}>{score}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 }}>TOTAL ACTIONS</Text>
                            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 }}>{e.actions_total}</Text>
                          </View>
                        </View>

                        {/* Status line */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isActive ? colors.positive : colors.textMuted }} />
                          <Text style={{ color: isActive ? colors.positive : colors.textMuted, fontSize: 11, fontWeight: '600' }}>
                            {e.last_activity ? `Last active: ${new Date(e.last_activity).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : 'No activity yet'}
                          </Text>
                        </View>

                        {/* Metric pills grid */}
                        <View style={styles.metricPills}>
                          <MetricPill icon="thumbs-up" label="Positive" value={e.positives} color={colors.positive} />
                          <MetricPill icon="thumbs-down" label="Negative" value={e.negatives} color={colors.negative} />
                          <MetricPill icon="location" label="Visits" value={e.visits} color={colors.info} />
                          <MetricPill icon="document-text" label="Bookings" value={e.bookings_done} color={colors.warning} />
                          <MetricPill icon="business" label="Loans" value={e.loans_done} color={'#7C3AED'} />
                          <MetricPill icon="trophy" label="Closed" value={e.closed_deals} color={colors.accent} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>


            <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Live Activity Feed</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>Every department, every action</Text>
                </View>
                <View style={[styles.dotLive, { backgroundColor: colors.positive }]} />
              </View>
              <View style={{ marginTop: 14 }}>
                {activities.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>No activity yet.</Text>
                ) : activities.map((a) => (
                  <View key={a.entry_id} style={[styles.actRow, { borderBottomColor: colors.border }]}>
                    <Ionicons name="ellipse" size={6} color={colors.primary} style={{ marginRight: 10, marginTop: 7 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 13 }}>{a.text}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                        {a.actor_name || 'System'} · {new Date(a.created_at).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
      <LeadSourceModal visible={sourceModalVisible} onClose={() => setSourceModalVisible(false)} />
    </View>
  );
}

function MetricPill({ icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <View style={[styles.metricPill, { backgroundColor: color + '10', borderColor: color + '30' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Ionicons name={icon} size={11} color={color} />
        <Text style={{ color, fontSize: 9, fontWeight: '700', letterSpacing: 0.6 }}>{label.toUpperCase()}</Text>
      </View>
      <Text style={{ color, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }}>{value}</Text>
    </View>
  );
}


const styles = StyleSheet.create({
  content: { padding: 24, gap: 20 },
  row: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  activityCard: { padding: 20, borderRadius: 12, borderWidth: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  actRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1 },
  dotLive: { width: 8, height: 8, borderRadius: 4 },
  // gate
  gateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  gateCard: { width: '100%', maxWidth: 440, padding: 32, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  lockCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  gateTitle: { fontSize: 22, fontWeight: '700', marginTop: 18, letterSpacing: -0.4 },
  gateDesc: { fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, alignSelf: 'flex-start' },
  unlockBtn: { marginTop: 18, height: 46, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch' },
  lockBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1 },
  empPlaceholder: { marginTop: 14, padding: 22, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center' },
  // Employee Performance card grid
  empGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16 },
  empCard: { width: 340, padding: 18, borderRadius: 14 },
  empCardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
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
  metricPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  metricPill: {
    width: 92, paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1, gap: 4,
  },
});
