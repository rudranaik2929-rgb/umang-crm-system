import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { LineChart } from '../../src/components/LineChart';
import { roleLabel } from '../../src/lib/constants';

const ROLE_ACCENT: Record<string, string> = {
  admin: '#1E3A8A',
  manager: '#14B8A6',
  telecaller: '#0284C7',
  site_visit: '#0EA5E9',
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

const ROLE_CTA: Record<string, { label: string; route: string }> = {
  manager: { label: 'Review lead pipeline', route: '/(app)/pipeline' },
  telecaller: { label: 'Open my telecaller queue', route: '/(app)/telecaller' },
  site_visit: { label: 'View my site visits', route: '/(app)/visits' },
  booking: { label: 'Open bookings', route: '/(app)/bookings' },
  loan: { label: 'Open loan applications', route: '/(app)/loans' },
  marketing: { label: 'Negative leads', route: '/(app)/negative-leads' },
  admin: { label: 'Open owner dashboard', route: '/(app)/dashboard' },
};

export default function MyDashboard() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
                ? 'Every new enquiry lands in your queue. Mark hot leads positive, schedule follow-ups, send the rest to site visits.'
                : role === 'site_visit'
                ? 'Schedule visits, capture feedback, and pass booking-ready customers to the booking team.'
                : role === 'booking'
                ? 'Confirm bookings, collect tokens, get agreements signed, and hand over to the loan department.'
                : role === 'loan'
                ? 'Process applications, track bank stages, and close the deal when documents are complete.'
                : 'Analyze lead temperatures and re-engage negative leads.'}
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

        {/* Lead temperature */}
        <View>
          <Text style={[styles.section, { color: colors.textMuted }]}>LEAD TEMPERATURE</Text>
          <View style={styles.tempGrid}>
            <TempCard testID="temp-hot" icon="flame" label="Hot Leads" value={leads.hot} color="#EF4444" desc="Positive · Visit · Booking · Loan" colors={colors} />
            <TempCard testID="temp-warm" icon="sunny" label="Warm Leads" value={leads.warm} color="#F59E0B" desc="Contacted, awaiting follow-up" colors={colors} />
            <TempCard testID="temp-cold" icon="snow" label="Cold Leads" value={leads.cold} color="#0EA5E9" desc="New enquiries in queue" colors={colors} />
            <TempCard testID="temp-neg" icon="close-circle" label="Negative" value={leads.negative} color={colors.negative} desc="Reservoir for re-engagement" colors={colors} />
            <TempCard testID="temp-closed" icon="trophy" label="Closed Won" value={leads.closed} color="#10B981" desc="Customers onboarded" colors={colors} />
          </View>
        </View>

        {/* Analytics Charts */}
        <View>
          <Text style={[styles.section, { color: colors.textMuted }]}>ANALYTICS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {graphData?.leads_by_day && (
              <LineChart
                title="Leads Per Day"
                subtitle="New leads acquired daily — last 30 days"
                data={graphData.leads_by_day.map((d: any) => ({ label: d.date.slice(5), value: d.count }))}
                color="#3B82F6"
                testID="my-chart-leads"
              />
            )}
            {graphData?.revenue_by_month && (
              <LineChart
                title="Revenue Pipeline"
                subtitle="Monthly booking revenue — last 12 months"
                data={graphData.revenue_by_month.map((d: any) => ({ label: d.month.slice(5), value: d.revenue }))}
                color="#10B981"
                formatValue={(v: number) => `₹${(v / 100000).toFixed(1)}L`}
                testID="my-chart-revenue"
              />
            )}
          </View>
        </View>

        {/* Personal KPIs */}
        {role !== 'admin' && (
          <View>
            <Text style={[styles.section, { color: colors.textMuted }]}>MY ACTIVITY</Text>
            <View style={styles.kpiGrid}>
              <KPI label="Total Actions" value={personal.actions_total} icon="pulse-outline" color={accent} colors={colors} />
              <KPI label="Positive" value={personal.positives} icon="thumbs-up-outline" color={colors.positive} colors={colors} highlight={highlight.includes('positives')} />
              <KPI label="Negative" value={personal.negatives} icon="thumbs-down-outline" color={colors.negative} colors={colors} highlight={highlight.includes('negatives')} />
              <KPI label="Follow-ups" value={personal.followups} icon="time-outline" color={colors.warning} colors={colors} highlight={highlight.includes('followups')} />
              <KPI label="Call Notes" value={personal.call_notes} icon="document-text-outline" color={colors.info} colors={colors} highlight={highlight.includes('call_notes')} />
              <KPI label="Visits" value={personal.visits} icon="location-outline" color={'#0EA5E9'} colors={colors} highlight={highlight.includes('visits')} />
              <KPI label="Bookings" value={personal.bookings_done} icon="document-text-outline" color={colors.warning} colors={colors} highlight={highlight.includes('bookings_done')} />
              <KPI label="Loans" value={personal.loans_done} icon="business-outline" color={'#7C3AED'} colors={colors} highlight={highlight.includes('loans_done')} />
              <KPI label="Closed Deals" value={personal.closed_deals} icon="trophy-outline" color={colors.accent} colors={colors} highlight={highlight.includes('closed_deals')} />
            </View>
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

function KPI({ label, value, icon, color, colors, highlight }: any) {
  return (
    <View style={[styles.kpiCard, {
      backgroundColor: colors.surface,
      borderColor: highlight ? color + '60' : colors.border,
      borderWidth: highlight ? 1.5 : 1,
    }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={13} color={color} />
        <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
      </View>
      <Text style={[styles.kpiVal, { color: highlight ? color : colors.text }]}>{value}</Text>
    </View>
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
