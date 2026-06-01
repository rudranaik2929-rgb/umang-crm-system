import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Platform } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, getSnapshot, setSnapshot } from '../../src/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LeadSourceModal } from '../../src/components/LeadSourceModal';
import { DashboardLeadsModal } from '../../src/components/DashboardLeadsModal';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { NewLeadPopup } from '../../src/components/NewLeadPopup';
import { LineChart } from '../../src/components/LineChart';
import { EmployeePerformance } from '../../src/components/EmployeePerformance';
import { FollowUpsPanel } from '../../src/components/FollowUpsPanel';
import { STAGES, STAGE_COLORS, canSeeRevenue, stageLabel } from '../../src/lib/constants';

const HOT_STAGES = ['positive', 'site_visit', 'booking', 'loan', 'registration', 'closed'];
const COLD_STAGES = ['new'];

function formatCurrency(value: number) {
  if (!value) return '₹0';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function formatCompact(value: number) {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return `${Math.round(value || 0)}`;
}

export default function Dashboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  // Hydrate from the last snapshot so re-navigating to the dashboard renders
  // instantly while fresh data loads in the background.
  const cached = getSnapshot<any>('dashboard');
  const [stats, setStats] = useState<any>(cached?.stats ?? null);
  const [graphData, setGraphData] = useState<any>(cached?.graphData ?? null);
  const [leads, setLeads] = useState<any[]>(cached?.leads ?? []);
  const [employees, setEmployees] = useState<any[]>(cached?.employees ?? []);
  const [loading, setLoading] = useState(!cached);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [leadsBucket, setLeadsBucket] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, g, l, e] = await Promise.all([
        api.get('/stats/dashboard'),
        api.get('/stats/dashboard/graph'),
        api.get('/leads'),
        api.get('/stats/employees'),
      ]);
      const nextStats = s.data || {};
      const nextGraph = g.data || {};
      const nextLeads = Array.isArray(l.data) ? l.data : [];
      const nextEmployees = Array.isArray(e.data) ? e.data : [];
      setStats(nextStats);
      setGraphData(nextGraph);
      setLeads(nextLeads);
      setEmployees(nextEmployees);
      setSnapshot('dashboard', { stats: nextStats, graphData: nextGraph, leads: nextLeads, employees: nextEmployees });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      const msg =
        status === 401
          ? 'Session expired. Please log in again.'
          : status === 500
            ? 'Dashboard API error on server. Wait for backend redeploy, then tap Retry.'
          : typeof detail === 'string'
            ? detail
            : err?.message === 'Network Error'
              ? 'Could not reach dashboard API (server error or still deploying). Tap Retry in a minute.'
              : err?.message || 'Could not load dashboard. Check your connection and try again.';
      setLoadError(msg);
      console.warn('Dashboard load failed', err?.response?.status, err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const pollMs = 5 * 60 * 1000;
    const interval = setInterval(async () => {
      try {
        await api.post('/integrations/housing/poll', {}).catch(() => {});
      } finally {
        load();
      }
    }, pollMs);
    return () => clearInterval(interval);
  }, [load]);

  const model = useMemo(() => {
    const sd = stats?.stage_distribution || {};
    const activeLeads = leads.filter((l) => l.status !== 'negative');
    const totalLeads = Number(stats?.total_leads ?? 0);
    const todayStr = new Date().toISOString().slice(0, 10);

    const hot = activeLeads.filter((l) => HOT_STAGES.includes(l.stage)).length || HOT_STAGES.reduce((sum, stage) => sum + Number(sd[stage] || 0), 0);
    const cold = activeLeads.filter((l) => COLD_STAGES.includes(l.stage)).length || Number(sd.new || 0);
    const conversionScore = totalLeads ? Math.min(100, Math.round((hot / totalLeads) * 100)) : 0;

    return {
      activeLeads,
      totalLeads,
      hot,
      cold,
      conversionScore,
      newToday: leads.filter((l) => l.created_at?.slice(0, 10) === todayStr).length,
      positiveLeads: Number(stats?.positive_leads || hot || 0),
      negativeLeads: Number(stats?.negative_leads || 0),
      visits: Number(stats?.site_visits || 0),
      completedVisits: Number(stats?.completed_visits || 0),
      bookings: Number(stats?.bookings || 0),
      confirmedBookings: Number(stats?.confirmed_bookings || 0),
      followUps: Number(stats?.follow_ups || 0),
      pendingFollowUps: Number(stats?.pending_follow_ups || 0),
      loans: Number(stats?.loans || 0),
      disbursedLoans: Number(stats?.disbursed_loans || 0),
      employees: Number(stats?.employees || 0),
      campaigns: Number(stats?.campaigns || 0),
      revenue: Number(stats?.revenue_pipeline || 0),
    };
  }, [leads, stats]);

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Dashboard" />
        <View style={[styles.loadingWrap, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Dashboard" />
        <View style={[styles.loadingWrap, { backgroundColor: colors.background }]}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
          <Text style={[styles.errorText, { color: colors.text }]}>{loadError}</Text>
          <Pressable onPress={() => { setLoading(true); load(); }} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const chartLeadData = (graphData?.leads_by_day || []).map((d: any) => ({
    label: String(d.date || '').slice(8) || '-',
    value: Number(d.count || 0),
  }));
  const chartRevenueData = (graphData?.revenue_by_month || []).map((d: any) => ({
    label: new Date(`${d.month}-01`).toLocaleString('en', { month: 'short' }),
    value: Number(d.revenue || 0),
  }));

  const showLeadAlerts = user?.role === 'admin' || user?.role === 'manager';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NewLeadPopup enabled={showLeadAlerts} />
      <TopBar title="Dashboard" subtitle="Pipeline, revenue and team performance snapshot" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroGrid}>
          <ScorePanel score={model.conversionScore} hot={model.hot} cold={model.cold} />

          {canSeeRevenue(user?.role, user?.email) && (
            <RevenuePanel
              revenue={model.revenue}
              bookings={model.bookings}
              confirmedBookings={model.confirmedBookings}
              disbursedLoans={model.disbursedLoans}
            />
          )}
        </View>

        <View style={styles.metricGrid}>
          <MetricCard
            icon="people-outline"
            label="Total Leads"
            value={model.totalLeads}
            accent={colors.info}
            onPress={() => setSourceModalVisible(true)}
            helper={
              stats?.housing_leads
                ? `${stats.housing_leads} Housing · tap for breakdown`
                : 'Tap for platform breakdown'
            }
          />
          <MetricCard icon="flash-outline" label="New Today" value={model.newToday} accent="#6366F1" helper="Tap for full list" onPress={() => setLeadsBucket('new_today')} />
          <MetricCard icon="trending-up-outline" label="Positive Leads" value={model.positiveLeads} accent={colors.positive} helper="Tap for full list" onPress={() => setLeadsBucket('positive')} />
          <MetricCard icon="remove-circle-outline" label="Not Interested" value={model.negativeLeads} accent={colors.negative} helper="Tap for full list" onPress={() => setLeadsBucket('not_interested')} />
          <MetricCard icon="ribbon-outline" label="Registration" value={Number(stats?.registration_leads || 0)} accent="#0891B2" helper="Tap for full list" onPress={() => setLeadsBucket('registration')} />
          <MetricCard icon="document-text-outline" label="Bookings" value={model.bookings} accent={colors.warning} helper="Tap for full list" onPress={() => setLeadsBucket('booking')} />
          <MetricCard icon="calendar-outline" label="Follow Ups" value={model.followUps} accent="#F97316" helper={`${model.pendingFollowUps} pending`} />
          <MetricCard icon="business-outline" label="Loans" value={model.loans} accent="#8B5CF6" helper={`${model.disbursedLoans} disbursed`} onPress={() => router.push('/(app)/loans' as any)} />
          <MetricCard icon="briefcase-outline" label="Employees" value={model.employees} accent="#14B8A6" helper={`${model.campaigns} campaigns`} onPress={() => router.push('/(app)/employees' as any)} />
        </View>

        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Follow Ups</Text>
              <Text style={[styles.panelSub, { color: colors.textMuted }]}>
                {model.pendingFollowUps} pending · {model.followUps} total
              </Text>
            </View>
            <Ionicons name="calendar-outline" size={20} color="#F97316" />
          </View>
          <FollowUpsPanel compact maxItems={12} showEmployeeName onOpenLead={setOpenLead} />
        </View>

        <EmployeePerformance employees={employees} />

        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Pipeline Board</Text>
              <Text style={[styles.panelSub, { color: colors.textMuted }]}>Stage-wise leads with quick open actions</Text>
            </View>
            <Pressable
              onPress={() => router.push('/(app)/pipeline' as any)}
              style={[styles.iconAction, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.kanbanRow}>
              {STAGES.map((stage) => {
                const stageLeads = model.activeLeads.filter((l) => l.stage === stage.key);
                return (
                  <View key={stage.key} style={[styles.kanbanCol, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <View style={styles.kanbanHead}>
                      <View style={[styles.stageDot, { backgroundColor: STAGE_COLORS[stage.key] || colors.primary }]} />
                      <Text style={[styles.kanbanTitle, { color: colors.text }]} numberOfLines={1}>{stageLabel(stage.key)}</Text>
                      <Text style={[styles.kanbanCount, { color: colors.textMuted }]}>{stageLeads.length}</Text>
                    </View>
                    {stageLeads.slice(0, 4).map((lead) => (
                      <Pressable
                        key={lead.lead_id}
                        onPress={() => setOpenLead(lead.lead_id)}
                        style={({ hovered }: any) => [
                          styles.leadCard,
                          {
                            backgroundColor: colors.surface,
                            borderColor: hovered ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.leadName, { color: colors.text }]} numberOfLines={1}>{lead.name}</Text>
                        <Text style={[styles.leadMeta, { color: colors.textMuted }]} numberOfLines={1}>
                          {[lead.property_type, lead.budget].filter(Boolean).join(' | ') || 'Requirement pending'}
                        </Text>
                        <Text style={[styles.leadMeta, { color: colors.textMuted }]} numberOfLines={1}>
                          {lead.location || lead.phone || 'No location'}
                        </Text>
                      </Pressable>
                    ))}
                    {stageLeads.length > 4 ? (
                      <Text style={[styles.moreText, { color: colors.primary }]}>+{stageLeads.length - 4} more</Text>
                    ) : null}
                    {stageLeads.length === 0 ? (
                      <Text style={[styles.emptyText, { color: colors.textMuted }]}>No leads</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={styles.chartRow}>
          <LineChart
            title="Lead Volume"
            subtitle="Daily new leads across the last 30 days"
            data={chartLeadData.length ? chartLeadData : [{ label: '0', value: 0 }]}
            color={colors.info}
            unitLabel="leads"
            defaultType="line"
            testID="leads-chart"
          />
          {canSeeRevenue(user?.role, user?.email) && (
            <LineChart
              title="Brokerage Trend"
              subtitle="Total brokerage collected per month — last 12 months"
              data={chartRevenueData.length ? chartRevenueData : [{ label: '0', value: 0 }]}
              color={colors.warning}
              formatValue={formatCompact}
              defaultType="bar"
              testID="revenue-chart"
            />
          )}
        </View>
      </ScrollView>

      <LeadSourceModal
        visible={sourceModalVisible}
        onClose={() => setSourceModalVisible(false)}
        userRole={user?.role}
        onChanged={load}
      />
      <DashboardLeadsModal
        visible={leadsBucket !== null}
        bucket={leadsBucket || 'all'}
        onClose={() => setLeadsBucket(null)}
        userRole={user?.role}
        onChanged={load}
      />
      <LeadDetailModal
        leadId={openLead}
        visible={openLead !== null}
        onClose={() => setOpenLead(null)}
        onChanged={load}
        userRole={user?.role}
      />
    </View>
  );
}

function ScorePanel({ score, hot, cold }: { score: number; hot: number; cold: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, styles.heroPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.panelHeader}>
        <View>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Performance Score</Text>
          <Text style={[styles.panelSub, { color: colors.textMuted }]}>Hot lead conversion health</Text>
        </View>
        <Ionicons name="speedometer-outline" size={20} color={colors.primary} />
      </View>
      <View style={styles.scoreBody}>
        <GaugeChart score={score} />
        <View style={styles.scoreLegend}>
          <LegendDot color="#EF4444" label={`${hot} Hot`} />
          <LegendDot color="#3B82F6" label={`${cold} Cold`} />
        </View>
      </View>
    </View>
  );
}

function RevenuePanel({ revenue, bookings, confirmedBookings, disbursedLoans }: { revenue: number; bookings: number; confirmedBookings: number; disbursedLoans: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, styles.heroPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.panelHeader}>
        <View>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Total Brokerage</Text>
          <Text style={[styles.panelSub, { color: colors.textMuted }]}>Sum of brokerage entered on all bookings</Text>
        </View>
        <Ionicons name="cash-outline" size={20} color={colors.warning} />
      </View>
      <Text style={[styles.revenueValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(revenue)}
      </Text>
      <View style={styles.revenueStats}>
        <TinyStat label="Bookings" value={bookings} color={colors.warning} />
        <TinyStat label="Confirmed" value={confirmedBookings} color={colors.positive} />
        <TinyStat label="Disbursed Loans" value={disbursedLoans} color="#8B5CF6" />
      </View>
    </View>
  );
}

function MetricCard({ icon, label, value, accent, helper, onPress }: { icon: any; label: string; value: number; accent: string; helper: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const content = (
    <>
      <View style={[styles.metricIcon, { backgroundColor: `${accent}18` }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.metricValue, { color: colors.text }]}>{value.toLocaleString('en-IN')}</Text>
        <Text style={[styles.metricHelper, { color: colors.textMuted }]} numberOfLines={1}>{helper}</Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ hovered }: any) => [
          styles.metricCard,
          {
            backgroundColor: colors.surface,
            borderColor: hovered ? accent : colors.border,
          },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {content}
    </View>
  );
}

function TinyStat({ label, value, color }: { label: string; value: number; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.tinyStat}>
      <View style={[styles.tinyDot, { backgroundColor: color }]} />
      <View>
        <Text style={[styles.tinyValue, { color: colors.text }]}>{value.toLocaleString('en-IN')}</Text>
        <Text style={[styles.tinyLabel, { color: colors.textMuted }]}>{label}</Text>
      </View>
    </View>
  );
}

function GaugeChart({ score }: { score: number }) {
  const { colors } = useTheme();
  const angle = (score / 100) * 180;

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.nativeGauge}>
        <Text style={[styles.nativeGaugeText, { color: colors.text }]}>{score}%</Text>
      </View>
    );
  }

  return (
    <View style={styles.gaugeWrap}>
      <svg viewBox="0 0 200 118" style={{ width: 150, height: 94 } as any}>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={colors.border} strokeWidth="15" strokeLinecap="round" />
        <path
          d={describeArc(100, 100, 80, 180, 180 + angle)}
          fill="none"
          stroke={colors.primary}
          strokeWidth="15"
          strokeLinecap="round"
        />
        <text x="100" y="86" textAnchor="middle" fill={colors.text} fontSize="30" fontWeight="700" fontFamily="sans-serif">
          {score}%
        </text>
        <text x="100" y="106" textAnchor="middle" fill={colors.textMuted} fontSize="11" fontFamily="sans-serif">
          score
        </text>
      </svg>
    </View>
  );
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const rad = (a: number) => (a * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, padding: 60, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 16 },
  heroGrid: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  heroPanel: { flex: 1, minWidth: 280, minHeight: 196 },
  panel: { borderWidth: 1, borderRadius: 10, padding: 18 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  panelSub: { fontSize: 11, marginTop: 3 },
  scoreBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, gap: 14 },
  scoreLegend: { gap: 8, minWidth: 90 },
  gaugeWrap: { width: 154, height: 100, alignItems: 'center', justifyContent: 'center' },
  nativeGauge: { width: 140, height: 86, alignItems: 'center', justifyContent: 'center' },
  nativeGaugeText: { fontSize: 32, fontWeight: '700' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '600' },
  revenueValue: { fontSize: 34, fontWeight: '800', marginTop: 24, letterSpacing: 0 },
  revenueStats: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 18 },
  tempTrack: { height: 14, borderRadius: 7, flexDirection: 'row', overflow: 'hidden', marginTop: 28 },
  tempGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 20 },
  tinyStat: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 72 },
  tinyDot: { width: 8, height: 8, borderRadius: 4 },
  tinyValue: { fontSize: 16, fontWeight: '800' },
  tinyLabel: { fontSize: 10, marginTop: 1 },
  metricGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metricCard: { minWidth: 210, flex: 1, borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricIcon: { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  metricValue: { fontSize: 25, fontWeight: '800', marginTop: 2 },
  metricHelper: { fontSize: 11, marginTop: 1 },
  iconAction: { width: 34, height: 34, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kanbanRow: { flexDirection: 'row', gap: 12, paddingTop: 14 },
  kanbanCol: { width: 178, minHeight: 214, borderWidth: 1, borderRadius: 10, padding: 10 },
  kanbanHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  kanbanTitle: { flex: 1, fontSize: 12, fontWeight: '700' },
  kanbanCount: { fontSize: 11, fontWeight: '800' },
  leadCard: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
  leadName: { fontSize: 12, fontWeight: '700' },
  leadMeta: { fontSize: 10, marginTop: 3 },
  moreText: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  emptyText: { fontSize: 11, fontStyle: 'italic', paddingVertical: 18, textAlign: 'center' },
  chartRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  followModal: { width: '92%', maxWidth: 560, maxHeight: '82%', borderWidth: 1, borderRadius: 12, padding: 18 },
  followModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  closeBtn: { width: 34, height: 34, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  followLoading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  followEmpty: { minHeight: 160, alignItems: 'center', justifyContent: 'center' },
  followList: { maxHeight: 420 },
  followRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 8, padding: 12 },
  followIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  followLead: { fontSize: 13, fontWeight: '700' },
  followMeta: { fontSize: 12, marginTop: 3, fontWeight: '600' },
  followNotes: { fontSize: 11, marginTop: 5 },
  errorText: { fontSize: 14, textAlign: 'center', marginTop: 16, marginBottom: 20, maxWidth: 320 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
