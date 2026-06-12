import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { LineChart } from '../../src/components/LineChart';
import { NewLeadPopup } from '../../src/components/NewLeadPopup';
import { roleLabel } from '../../src/lib/constants';
import { FollowUpsPanel } from '../../src/components/FollowUpsPanel';
import { AssignLeadsPanel } from '../../src/components/AssignLeadsPanel';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { MyActivityModal } from '../../src/components/MyActivityModal';

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
  manager: ['actions_total', 'positives', 'visits', 'bookings_done', 'loans_done'],
  telecaller: ['positives', 'negatives', 'followups', 'call_notes'],
  site_visit: ['visits'],
  booking: ['bookings_done'],
  loan: ['loans_done', 'closed_deals'],
  marketing: ['actions_total'],
};

const MY_ACTIVITY_KPIS: Array<{
  label: string;
  metric: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  valueKey: string;
  highlight?: string;
}> = [
  { label: 'My Queue', metric: 'queue', icon: 'list-outline', color: 'primary', valueKey: 'assigned_queue', highlight: 'queue' },
  { label: 'Follow-ups', metric: 'follow_ups', icon: 'time-outline', color: 'warning', valueKey: 'assigned_follow_ups', highlight: 'followups' },
  { label: 'Completed', metric: 'completed', icon: 'checkmark-circle-outline', color: 'positive', valueKey: 'assigned_completed' },
  { label: 'Positive', metric: 'positive', icon: 'thumbs-up-outline', color: 'positive', valueKey: 'positives', highlight: 'positives' },
  { label: 'Call Notes', metric: 'call_notes', icon: 'document-text-outline', color: 'info', valueKey: 'call_notes', highlight: 'call_notes' },
  { label: 'Bookings', metric: 'bookings_done', icon: 'document-text-outline', color: 'warning', valueKey: 'bookings_done', highlight: 'bookings_done' },
  { label: 'Loans', metric: 'loans_done', icon: 'business-outline', color: 'loan', valueKey: 'loans_done', highlight: 'loans_done' },
  { label: 'Closed Deals', metric: 'closed_deals', icon: 'trophy-outline', color: 'accent', valueKey: 'closed_deals', highlight: 'closed_deals' },
];

const ROLE_CTA: Record<string, { label: string; route: string }> = {
  manager: { label: 'Assign leads to team', route: '/(app)/assign-leads' },
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
  const [data, setData] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [activityMetric, setActivityMetric] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([
        api.get('/stats/me'),
        api.get('/stats/dashboard/graph'),
      ]);
      setData(r.data);
      setGraphData(g.data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds for live feel
  useEffect(() => {
    const interval = setInterval(() => { load(); }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading || !data) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="My Dashboard" />
        <View style={{ padding: 48 }}><ActivityIndicator color={colors.primary} /></View>
      </View>
    );
  }

  const role = data.role || 'admin';
  const accent = ROLE_ACCENT[role] || colors.primary;
  const personal = data.personal;
  const leads = data.leads;
  const score = personal.score_10 || 0;
  const scorePct = (score / 10) * 100;
  const cta = ROLE_CTA[role] || ROLE_CTA.admin;
  const highlight = ROLE_HIGHLIGHT[role] || [];

  return (
    <View style={{ flex: 1 }}>
      <NewLeadPopup enabled={role === 'manager' || role === 'admin'} />
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
                ? 'Monitor team movement, review department queues, and keep the pipeline moving.'
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
        {role !== 'admin' && (
          <View>
            <Text style={[styles.section, { color: colors.textMuted }]}>MY ACTIVITY — TAP A BOX FOR LIST</Text>
            <View style={styles.kpiGrid}>
              {MY_ACTIVITY_KPIS.map((kpi) => {
                const colorMap: Record<string, string> = {
                  primary: colors.primary,
                  warning: colors.warning,
                  positive: colors.positive,
                  info: colors.info,
                  accent: colors.accent,
                  loan: '#7C3AED',
                };
                const c = colorMap[kpi.color] || colors.primary;
                const raw = personal[kpi.valueKey];
                const value = kpi.valueKey === 'assigned_follow_ups' ? (raw ?? personal.followups ?? 0) : (raw ?? 0);
                return (
                  <KPI
                    key={kpi.metric}
                    label={kpi.label}
                    value={value}
                    icon={kpi.icon}
                    color={c}
                    colors={colors}
                    highlight={kpi.highlight ? highlight.includes(kpi.highlight) : false}
                    onPress={() => setActivityMetric(kpi.metric)}
                    testID={`my-activity-${kpi.metric}`}
                  />
                );
              })}
            </View>
          </View>
        )}

        {(role === 'manager' || role === 'admin') && (
          <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border, padding: 16, marginTop: 8 }]}>
            <Text style={[styles.section, { color: colors.textMuted, marginBottom: 10 }]}>TEAM ASSIGNMENTS</Text>
            <AssignLeadsPanel compact />
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

function KPI({ label, value, icon, color, colors, highlight, onPress, testID }: any) {
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
      <Text style={{ color: colors.textMuted, fontSize: 9, marginTop: 2 }}>Tap for list</Text>
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
  kpiCard: { width: 180, padding: 14, borderRadius: 10, gap: 6 },
  kpiLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  kpiVal: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  
  activityCard: { padding: 20, borderRadius: 12, borderWidth: 1 },
  actRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1 },

  livePulseWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 20, paddingVertical: 8 },
  liveDotOuter: { position: 'absolute', left: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E' },
  liveDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', marginLeft: 2 },
  liveText: { fontSize: 10, fontWeight: '800', color: '#22C55E', letterSpacing: 1.5, marginLeft: 10 },
});
