import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, getSnapshot, setSnapshot } from '../../src/lib/api';
import { NewLeadPopup } from '../../src/components/NewLeadPopup';
import { roleLabel } from '../../src/lib/constants';
import { FollowUpsPanel } from '../../src/components/FollowUpsPanel';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { MyActivityModal } from '../../src/components/MyActivityModal';
import { LeadSourceModal } from '../../src/components/LeadSourceModal';

const ROLE_ACCENT: Record<string, string> = {
  admin: '#1E3A8A',
  manager: '#14B8A6',
  telecaller: '#0284C7',
  site_visit: '#0EA5E9',
  sales_executive: '#0EA5E9',
  booking: '#D97706',
  loan: '#7C3AED',
  marketing: '#EC4899',
};

const ROLE_HIGHLIGHT: Record<string, string[]> = {
  telecaller: ['missed_leads', 'hot', 'follow_ups', 'ringing', 'not_interested'],
  site_visit: ['missed_leads', 'visited', 'hot', 'follow_ups'],
  sales_executive: ['missed_leads', 'visited', 'hot', 'booking_done', 'follow_ups'],
  booking: ['booking_done'],
  loan: ['booking_done'],
  marketing: ['not_interested'],
};

const MY_PERFORMANCE_KPIS: Array<{
  label: string;
  metric: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: string;
  valueKey: string;
}> = [
  { label: 'My Queue', metric: 'total', icon: 'list-outline', colorKey: 'primary', valueKey: 'leads_total' },
  { label: 'Missed Lead', metric: 'missed_leads', icon: 'alert-circle', colorKey: 'negative', valueKey: 'emp_missed_leads' },
  { label: 'Hot', metric: 'hot', icon: 'flame', colorKey: 'warning', valueKey: 'emp_hot' },
  { label: 'Visited', metric: 'visited', icon: 'location', colorKey: 'info', valueKey: 'emp_visited' },
  { label: 'Not Interested', metric: 'not_interested', icon: 'close-circle', colorKey: 'negative', valueKey: 'emp_not_interested' },
  { label: 'Booking Done', metric: 'booking_done', icon: 'checkmark-done', colorKey: 'positive', valueKey: 'emp_booking_done' },
  { label: 'Low Budget', metric: 'low_budget', icon: 'wallet', colorKey: 'accent', valueKey: 'emp_low_budget' },
  { label: 'Follow Up', metric: 'follow_ups', icon: 'calendar', colorKey: 'warning', valueKey: 'emp_follow_ups' },
  { label: 'Ringing', metric: 'ringing', icon: 'call', colorKey: 'warning', valueKey: 'emp_ringing' },
];

const ROLE_CTA: Record<string, { label: string; route: string }> = {
  manager: { label: 'Open team dashboard', route: '/(app)/dashboard' },
  telecaller: { label: 'Open my telecaller queue', route: '/(app)/telecaller' },
  site_visit: { label: 'Open sales executive queue', route: '/(app)/sales-executive' },
  sales_executive: { label: 'Open sales executive queue', route: '/(app)/sales-executive' },
  booking: { label: 'Open bookings', route: '/(app)/bookings' },
  loan: { label: 'Open loan applications', route: '/(app)/loans' },
  marketing: { label: 'Not interested leads', route: '/(app)/negative-leads' },
  admin: { label: 'Open owner dashboard', route: '/(app)/dashboard' },
};

export default function MyDashboard() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const cached = getSnapshot<any>('my-dashboard');
  const [data, setData] = useState<any>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [activityMetric, setActivityMetric] = useState<string | null>(null);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/stats/me-bundle');
      const bundle = res.data || {};
      setData(bundle.me);
      setSnapshot('my-dashboard', { data: bundle.me });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Refresh when tab is visible — pause polling in background tabs.
  useEffect(() => {
    if (typeof document === 'undefined') {
      const interval = setInterval(() => { load(); }, 90000);
      return () => clearInterval(interval);
    }
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') load();
      }, 90000);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  if (loading && !data) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="My Dashboard" />
        <View style={{ padding: 48 }}><ActivityIndicator color={colors.primary} /></View>
      </View>
    );
  }

  const role = user?.role || data?.role || 'telecaller';
  const accent = ROLE_ACCENT[role] || colors.primary;
  const personal = data.personal;
  const leads = data.leads;
  const score = personal.score_10 || 0;
  const scorePct = (score / 10) * 100;
  const cta = ROLE_CTA[role] || ROLE_CTA.admin;
  const queuePlatformHelper = personal.housing_leads != null
    ? `${personal.manual_leads ?? 0} Database · ${personal.housing_leads ?? 0} Housing · ${personal.meta_leads ?? 0} Meta`
    : 'Tap for platform breakdown';

  const handleKpiPress = (metric: string) => {
    if (metric === 'total') {
      setSourceModalVisible(true);
      return;
    }
    setActivityMetric(metric);
  };

  return (
    <View style={{ flex: 1 }}>
      <NewLeadPopup enabled={false} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <TopBar title="My Dashboard" subtitle={`${roleLabel(role)} workspace`} />
        </View>
        <LivePulse />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero score card */}
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: accent + '40' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>WELCOME BACK</Text>
            <Text style={[styles.heroName, { color: colors.text }]}>{user?.name || data.employee?.name || 'You'}</Text>
            <View style={[styles.heroRoleChip, { backgroundColor: accent + '20', borderColor: accent + '50' }]}>
              <Ionicons name="briefcase-outline" size={12} color={accent} />
              <Text style={{ color: accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
                {roleLabel(role).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.heroDesc, { color: colors.textSecondary }]}>
              {role === 'admin'
                ? 'You can see and control every department from the owner dashboard.'
                : role === 'manager'
                ? 'Your personal workspace. Use Dashboard in the sidebar for team pipeline, assignments and performance.'
                : role === 'telecaller'
                ? 'Use the Follow Ups tab inside Telecaller. Cold lead opens that tab automatically.'
                : role === 'site_visit' || role === 'sales_executive'
                ? 'Use Leads and Follow Ups tabs in Sales Executive. Cold lead jumps to Follow Ups.'
                : role === 'booking'
                ? 'Confirm bookings, collect tokens, get agreements signed, and hand over to the loan department.'
                : role === 'loan'
                ? 'Process applications, track bank stages, and close the deal when documents are complete.'
                : 'Re-engage not interested leads when needed.'}
            </Text>
            <Pressable
              testID="my-dashboard-cta"
              onPress={() => router.push(cta.route as any)}
              style={[styles.ctaBtn, { backgroundColor: accent }]}
            >
              <Text style={styles.ctaText}>{cta.label}</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </Pressable>
          </View>

          {/* Score ring */}
          <View style={styles.scoreWrap}>
            <View style={[styles.scoreRing, { borderColor: colors.border }]}>
              <View style={[styles.scoreFill, { backgroundColor: accent + '14', borderColor: accent, transform: [{ rotate: `${(scorePct / 100) * 360}deg` }] }]} />
              <View style={[styles.scoreInner, { backgroundColor: colors.surface }]}>
                <Text style={[styles.scoreVal, { color: accent }]}>{score}</Text>
                <Text style={[styles.scoreMax, { color: colors.textMuted }]}>/ 10</Text>
              </View>
            </View>
            <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>PERFORMANCE SCORE</Text>
            <Text style={[styles.scoreSub, { color: colors.text }]}>
              {score >= 8 ? 'Outstanding 🔥' : score >= 5 ? 'Doing well 👍' : score >= 2 ? 'Getting started' : 'Make your first move'}
            </Text>
          </View>
        </View>

        {/* Personal KPIs */}
        {role !== 'admin' && role !== 'manager' && (
          <View>
            <Text style={[styles.section, { color: colors.textMuted }]}>MY PERFORMANCE — TAP A BOX FOR LIST</Text>
            <View style={styles.kpiGrid}>
              {MY_PERFORMANCE_KPIS.map((kpi) => {
                const colorMap: Record<string, string> = {
                  primary: colors.primary,
                  warning: colors.warning,
                  positive: colors.positive,
                  info: colors.info,
                  accent: colors.accent,
                  negative: colors.negative,
                };
                const c = colorMap[kpi.colorKey] || colors.primary;
                const value = personal[kpi.valueKey] ?? 0;
                const roleHighlights = ROLE_HIGHLIGHT[role] || [];
                const helper = kpi.metric === 'total' ? queuePlatformHelper : undefined;
                return (
                  <KPI
                    key={kpi.metric}
                    label={kpi.label}
                    value={value}
                    icon={kpi.icon}
                    color={c}
                    colors={colors}
                    highlight={roleHighlights.includes(kpi.metric)}
                    onPress={() => handleKpiPress(kpi.metric)}
                    helper={helper}
                    testID={`my-performance-${kpi.metric}`}
                  />
                );
              })}
            </View>
          </View>
        )}

        {(role === 'telecaller' || role === 'site_visit' || role === 'sales_executive') && (
          <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border, padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.section, { color: colors.textMuted, marginBottom: 0 }]}>MY FOLLOW UPS</Text>
              <Pressable onPress={() => router.push((role === 'telecaller' ? '/(app)/telecaller?tab=followups' : '/(app)/sales-executive?tab=followups') as any)}>
                <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>Open all →</Text>
              </Pressable>
            </View>
            <FollowUpsPanel compact maxItems={6} onOpenLead={setOpenLead} />
          </View>
        )}
        
        {/* Live Activity Feed */}
        <View style={{ marginTop: 32 }}>
          <Text style={[styles.section, { color: colors.textMuted }]}>
            {role === 'admin' ? 'CRM LIVE ACTIVITY FEED' : 'MY RECENT ACTIONS'}
          </Text>
          <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(!data.recent_activities || data.recent_activities.length === 0) ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {role === 'admin' ? 'No recent global CRM actions.' : 'No activity yet.'}
              </Text>
            ) : data.recent_activities.map((a: any) => (
              <View key={a.activity_id} style={[styles.actRow, { borderBottomColor: colors.border }]}>
                <Ionicons 
                  name={role === 'admin' ? 'flash' : 'ellipse'} 
                  size={role === 'admin' ? 14 : 6} 
                  color={role === 'admin' ? colors.warning : accent} 
                  style={{ marginRight: 10, marginTop: role === 'admin' ? 3 : 7 }} 
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: role === 'admin' ? '500' : '400' }}>
                    {a.text}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {new Date(a.created_at).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <MyActivityModal
        visible={activityMetric !== null}
        metric={activityMetric}
        onClose={() => setActivityMetric(null)}
        userRole={role}
        onChanged={load}
      />
      <LeadSourceModal
        visible={sourceModalVisible}
        onClose={() => setSourceModalVisible(false)}
        userRole={role}
        scope="mine"
        onChanged={load}
      />
      <LeadDetailModal
        leadId={openLead}
        visible={openLead !== null}
        onClose={() => setOpenLead(null)}
        onChanged={load}
        userRole={role}
        onGoFollowUps={() => router.push((role === 'telecaller' ? '/(app)/telecaller?tab=followups' : '/(app)/sales-executive?tab=followups') as any)}
      />
    </View>
  );
}

function TempCard({ icon, label, value, color, desc, colors, testID }: any) {
  return (
    <View testID={testID} style={[styles.tempCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.tempIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.tempLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.tempVal, { color }]}>{value}</Text>
      <Text style={[styles.tempDesc, { color: colors.textMuted }]}>{desc}</Text>
    </View>
  );
}

function KPI({ label, value, icon, color, colors, highlight, onPress, testID, helper }: any) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.kpiCard, {
        backgroundColor: colors.surface,
        borderColor: highlight ? color + '60' : colors.border,
        borderWidth: highlight ? 1.5 : 1,
      }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Ionicons name={icon} size={13} color={color} />
          <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
      <Text style={[styles.kpiVal, { color: highlight ? color : colors.text }]}>{value}</Text>
      {helper ? (
        <Text style={{ color: colors.textMuted, fontSize: 9, marginTop: 2 }} numberOfLines={2}>{helper}</Text>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: 9, marginTop: 2 }}>Tap for list</Text>
      )}
    </Pressable>
  );
}

function LivePulse() {
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <View style={styles.livePulseWrap}>
      <Animated.View style={[
        styles.liveDotOuter,
        { opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] }),
          transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }]
        }
      ]} />
      <View style={styles.liveDotInner} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 24 },
  hero: {
    flexDirection: 'row', gap: 24,
    padding: 28, borderRadius: 16, borderWidth: 1,
    alignItems: 'center',
  },
  greeting: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  heroName: { fontSize: 32, fontWeight: '700', letterSpacing: -0.6, marginTop: 6 },
  heroRoleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 10, height: 26,
    borderRadius: 99, borderWidth: 1, marginTop: 10,
  },
  heroDesc: { fontSize: 13, lineHeight: 20, marginTop: 14, maxWidth: 520 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 18, height: 42, borderRadius: 10, marginTop: 18,
  },
  ctaText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  scoreWrap: { alignItems: 'center', gap: 8, width: 200 },
  scoreRing: {
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 8, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  scoreFill: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    borderWidth: 8,
  },
  scoreInner: {
    width: 130, height: 130, borderRadius: 65,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreVal: { fontSize: 48, fontWeight: '700', letterSpacing: -1 },
  scoreMax: { fontSize: 12, marginTop: -6 },
  scoreLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginTop: 4 },
  scoreSub: { fontSize: 13, fontWeight: '600' },

  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 12 },

  tempGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tempCard: {
    width: 220, padding: 18, borderRadius: 12, borderWidth: 1, gap: 6,
  },
  tempIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tempLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 4 },
  tempVal: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  tempDesc: { fontSize: 11 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: { width: 160, minWidth: 140, flexGrow: 1, maxWidth: 200, padding: 14, borderRadius: 10, gap: 6 },
  kpiLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  kpiVal: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  
  activityCard: { padding: 20, borderRadius: 12, borderWidth: 1 },
  actRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1 },

  livePulseWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 20, paddingVertical: 8 },
  liveDotOuter: { position: 'absolute', left: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E' },
  liveDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', marginLeft: 2 },
  liveText: { fontSize: 10, fontWeight: '800', color: '#22C55E', letterSpacing: 1.5, marginLeft: 10 },
});
