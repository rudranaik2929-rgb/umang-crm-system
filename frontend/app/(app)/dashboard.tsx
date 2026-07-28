import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Platform } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, getSnapshot, setSnapshot, clearGetCache } from '../../src/lib/api';
import { useLiveRefresh } from '../../src/hooks/useLiveRefresh';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { DashboardLeadsModal } from '../../src/components/DashboardLeadsModal';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { NewLeadPopup } from '../../src/components/NewLeadPopup';
import { StackedBarChart } from '../../src/components/StackedBarChart';
import { EmployeePerformance } from '../../src/components/EmployeePerformance';
import { EmployeeMetricModal } from '../../src/components/EmployeeMetricModal';
import { FollowUpsPanel } from '../../src/components/FollowUpsPanel';
import { AssignLeadsPanel } from '../../src/components/AssignLeadsPanel';
import { STAGES, STAGE_COLORS, canSeeRevenue, canAccessOwnerDashboard, canAccessMainDashboard, stageLabel, platformLabel } from '../../src/lib/constants';
import { pipelineStageMatch } from '../../src/lib/leadFormat';
import { BOOKING_TASKS, DASHBOARD_BOOKING_TASK_KEYS } from '../../src/lib/bookingTasks';

const HOT_STAGES = ['positive', 'site_visit', 'booking', 'loan', 'registration', 'closed'];

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
  const [buckets, setBuckets] = useState<any>(cached?.buckets ?? null);
  const [loading, setLoading] = useState(!cached);
  const [leadsBucket, setLeadsBucket] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [empMetric, setEmpMetric] = useState<{ employeeId: string; employeeName: string; metric: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelsReady, setPanelsReady] = useState(!!cached);
  const loadInFlight = React.useRef<Promise<void> | null>(null);
  const isManager = user?.role === 'manager';
  const canLoadDashboard = canAccessMainDashboard(user?.role, user?.email);
  /** Soft = SWR (keep UI, use short GET cache). Force = explicit Refresh (bypass + optional server flush). */
  const load = useCallback(async (opts?: { force?: boolean }) => {
    const force = !!opts?.force;
    if (loadInFlight.current && !force) return loadInFlight.current;
    setLoadError(null);
    const run = (async () => {
      try {
        if (force) clearGetCache();
        const res = await api.get('/stats/dashboard-bundle', {
          bypassCache: force,
          timeout: 90000,
        });
        const bundle = res.data || {};
        const nextStats = bundle.stats || {};
        const nextGraph = bundle.graph || {};
        const nextLeads = Array.isArray(bundle.leads) ? bundle.leads : [];
        const nextEmployees = Array.isArray(bundle.employees) ? bundle.employees : [];
        const nextBuckets = nextStats.lead_buckets || {};
        setStats(nextStats);
        setGraphData(nextGraph);
        setLeads(nextLeads);
        setEmployees(nextEmployees);
        setBuckets(nextBuckets);
        setSnapshot('dashboard', { stats: nextStats, graphData: nextGraph, leads: nextLeads, employees: nextEmployees, buckets: nextBuckets });
        setPanelsReady(true);
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
        loadInFlight.current = null;
      }
    })();
    loadInFlight.current = run;
    return run;
  }, []);

  useEffect(() => {
    if (!user?.role) return;
    if (!canAccessMainDashboard(user.role, user.email)) {
      router.replace('/(app)/my-dashboard' as any);
    }
  }, [user?.role, user?.email, router]);

  useEffect(() => {
    if (!canLoadDashboard) return;
    // Snapshot paints immediately; soft refresh fills gaps without blocking UI.
    load({ force: false });
  }, [load, canLoadDashboard]);

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    clearGetCache();
    try {
      await api.post('/admin/flush-caches', {}, { timeout: 20000 });
    } catch {
      // Safe if route not deployed yet.
    }
    await load({ force: true });
  }, [load]);

  useLiveRefresh(() => {
    if (canLoadDashboard) void load({ force: false });
  });

  const model = useMemo(() => {
    const sd = stats?.stage_distribution || {};
    const activeLeads = leads.filter((l) => l.status !== 'negative');
    const bucketSource = stats?.lead_buckets || buckets || {};
    const totalLeads = Number(bucketSource?.all ?? stats?.total_leads ?? 0);

    const hot = activeLeads.filter((l) => HOT_STAGES.includes(l.stage)).length || HOT_STAGES.reduce((sum, stage) => sum + Number(sd[stage] || 0), 0);
    const cold = activeLeads.filter((l) => pipelineStageMatch(l, 'new')).length
      || Number(stats?.stage_distribution?.new ?? 0);
    const conversionScore = totalLeads ? Math.min(100, Math.round((hot / totalLeads) * 100)) : 0;

    return {
      activeLeads,
      totalLeads,
      hot,
      cold,
      conversionScore,
      newToday: Number(bucketSource?.new_today ?? 0),
      openLeads: Number(bucketSource?.open_leads ?? 0),
      positiveLeads: Number(bucketSource?.positive ?? 0),
      coldLeads: Number(bucketSource?.cold_leads ?? 0),
      negativeLeads: Number(bucketSource?.not_interested ?? 0),
      missedLeads: Number(bucketSource?.missed_leads ?? 0),
      registrationLeads: Number(bucketSource?.registration ?? 0),
      visitedLeads: Number(bucketSource?.visited ?? 0),
      bookingLeads: Number(bucketSource?.booking ?? 0),
      ringingLeads: Number(bucketSource?.ringing ?? 0),
      bookings: Number(stats?.bookings || 0),
      confirmedBookings: Number(stats?.confirmed_bookings || 0),
      followUps: Number(bucketSource?.follow_up ?? 0),
      pendingFollowUps: Number(stats?.pending_follow_ups ?? 0),
      partitionSum: Number(
        bucketSource?.partition_sum
        ?? (
          Number(bucketSource?.open_leads ?? 0)
          + Number(bucketSource?.missed_leads ?? 0)
          + Number(bucketSource?.ringing ?? 0)
          + Number(bucketSource?.follow_up ?? 0)
          + Number(bucketSource?.positive ?? 0)
          + Number(bucketSource?.cold_leads ?? 0)
          + Number(bucketSource?.visited ?? 0)
          + Number(bucketSource?.not_interested ?? 0)
        ),
      ),
      bookingPartitionSum: Number(
        bucketSource?.booking_partition_sum
        ?? (
          Number(bucketSource?.booking ?? 0)
          + Number(bucketSource?.registration ?? 0)
        ),
      ),
      loans: Number(stats?.loans || 0),
      disbursedLoans: Number(stats?.disbursed_loans || 0),
      employees: Number(stats?.employees || 0),
      campaigns: Number(stats?.campaigns || 0),
      revenue: Number(stats?.revenue_pipeline || 0),
      brokerageReceived: Number(stats?.brokerage_received || 0),
      brokeragePending: Number(stats?.brokerage_pending || 0),
      bookingTaskBuckets: stats?.booking_task_buckets || {},
      activeBookings: Number(stats?.active_bookings || stats?.bookings || 0),
    };
  }, [leads, stats, buckets]);

  // Only block the whole screen when there is no cached data yet.
  const hasData = !!stats || leads.length > 0;

  if (loading && !hasData) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Dashboard" />
        <View style={[styles.loadingWrap, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (loadError && !hasData) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Dashboard" />
        <View style={[styles.loadingWrap, { backgroundColor: colors.background }]}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
          <Text style={[styles.errorText, { color: colors.text }]}>{loadError}</Text>
          <Pressable onPress={() => { setLoading(true); refreshDashboard(); }} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const LEAD_SOURCE_SERIES = [
    { key: 'housing', label: platformLabel('housing'), color: '#1B3A5C' },
    { key: 'meta', label: platformLabel('meta'), color: '#2563EB' },
    { key: 'manual', label: platformLabel('manual'), color: '#93C5FD' },
  ] as const;

  const chartLeadsBySourceMonth = (graphData?.leads_by_month_platform || []).map((d: any) => {
    const mk = String(d.month || '');
    const label = mk
      ? new Date(`${mk}-01T12:00:00`).toLocaleString('en-IN', { month: 'short', year: '2-digit' })
      : '-';
    return {
      label,
      total: Number(d.total || 0),
      segments: {
        housing: Number(d.housing || 0),
        meta: Number(d.meta || 0),
        manual: Number(d.manual || 0),
      },
    };
  });

  const showLeadAlerts = isManager || canAccessOwnerDashboard(user?.role, user?.email);
  const showAssignPanel = isManager || canAccessOwnerDashboard(user?.role, user?.email);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NewLeadPopup enabled={showLeadAlerts} />
      <TopBar
        title="Dashboard"
        subtitle={isManager ? 'Team pipeline, assignments and performance' : 'Pipeline, revenue and team performance snapshot'}
        rightAction={
          <Pressable
            onPress={refreshDashboard}
            disabled={loading}
            style={[styles.refreshBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: loading ? 0.6 : 1 }]}
          >
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroGrid}>
          <ScorePanel score={model.conversionScore} hot={model.hot} cold={model.cold} />

          {canSeeRevenue(user?.role, user?.email) && (
            <RevenuePanel
              revenue={model.revenue}
              brokerageReceived={model.brokerageReceived}
              brokeragePending={model.brokeragePending}
              bookings={model.bookings}
              confirmedBookings={model.confirmedBookings}
              disbursedLoans={model.disbursedLoans}
            />
          )}
        </View>

        <View style={styles.metricSection}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Lead Overview</Text>
          <View style={styles.metricGrid}>
            <MetricCard
              icon="people-outline"
              label="Total Leads"
              value={model.totalLeads}
              accent={colors.info}
              onPress={() => setLeadsBucket('all')}
              helper={
                stats?.housing_leads != null
                  ? `${stats.housing_leads} Housing · ${stats.meta_leads ?? 0} Meta · Lead Overview = ${model.partitionSum}`
                  : `Lead Overview boxes = ${model.partitionSum} (excl. Booking dept)`
              }
            />
            <MetricCard icon="flash-outline" label="New Today" value={model.newToday} accent="#6366F1" helper="Today's unassigned · subset of Open Leads" onPress={() => setLeadsBucket('new_today')} />
            <MetricCard icon="mail-unread-outline" label="Open Leads" value={model.openLeads} accent="#6366F1" helper="Unassigned or fresh assigned · part of Total" onPress={() => setLeadsBucket('open_leads')} />
            <MetricCard icon="alert-circle-outline" label="Missed Leads" value={model.missedLeads} accent={colors.negative} helper="Assigned 24h+ with no action · exclusive" onPress={() => setLeadsBucket('missed_leads')} />
            <MetricCard icon="trending-up-outline" label="Positive Leads" value={model.positiveLeads} accent={colors.positive} helper="Hot / positive only · exclusive" onPress={() => setLeadsBucket('positive')} />
            <MetricCard icon="snow-outline" label="Cold Leads" value={model.coldLeads} accent="#64748B" helper="Positive → Cold Lead · exclusive" onPress={() => setLeadsBucket('cold_leads')} />
            <MetricCard icon="call-outline" label="Ringing" value={model.ringingLeads} accent="#F97316" helper="Exclusive status · part of Total" onPress={() => setLeadsBucket('ringing')} />
            <MetricCard icon="remove-circle-outline" label="Not Interested" value={model.negativeLeads} accent={colors.negative} helper="Exclusive status · part of Total" onPress={() => setLeadsBucket('not_interested')} />
            <MetricCard icon="location-outline" label="Visited" value={model.visitedLeads} accent="#14B8A6" helper="Exclusive stage · part of Total" onPress={() => setLeadsBucket('visited')} />
            <MetricCard icon="calendar-outline" label="Follow Ups" value={model.followUps} accent="#F97316" helper={`${model.pendingFollowUps} pending · exclusive`} onPress={() => setLeadsBucket('follow_up')} />
          </View>
        </View>

        <View style={styles.metricSection}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Booking Overview</Text>
          <View style={styles.metricGrid}>
            <MetricCard icon="document-text-outline" label="Bookings" value={model.bookingLeads} accent={colors.warning} helper="Booking department · not in Total Leads" onPress={() => setLeadsBucket('booking')} />
            <MetricCard icon="ribbon-outline" label="Registration" value={model.registrationLeads} accent="#0891B2" helper="Booking department · not in Total Leads" onPress={() => setLeadsBucket('registration')} />
            {DASHBOARD_BOOKING_TASK_KEYS.map((taskKey) => {
              const task = BOOKING_TASKS.find((t) => t.key === taskKey)!;
              return (
                <MetricCard
                  key={task.key}
                  icon={task.icon}
                  label={task.label}
                  value={Number(model.bookingTaskBuckets?.[task.key] ?? 0)}
                  accent={task.color}
                  helper="Booking pipeline · tap to open"
                  onPress={() => router.push(`/(app)/bookings?task=${task.key}` as any)}
                />
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => setLeadsBucket('follow_up')}
          style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.panelHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Follow Ups</Text>
              <Text style={[styles.panelSub, { color: colors.textMuted }]}>
                {model.pendingFollowUps} pending · {model.followUps} scheduled · tap for full list
              </Text>
            </View>
            <View style={styles.followUpMiniRow}>
              <Pressable
                onPress={() => setLeadsBucket('new_today')}
                style={[styles.followUpMiniBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              >
                <Text style={[styles.followUpMiniLabel, { color: colors.textMuted }]}>NEW TODAY</Text>
                <Text style={[styles.followUpMiniValue, { color: colors.primary }]}>{model.newToday}</Text>
              </Pressable>
              <Pressable
                onPress={() => setLeadsBucket('all')}
                style={[styles.followUpMiniBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              >
                <Text style={[styles.followUpMiniLabel, { color: colors.textMuted }]}>TOTAL LEADS</Text>
                <Text style={[styles.followUpMiniValue, { color: colors.text }]}>{model.totalLeads}</Text>
              </Pressable>
            </View>
            <Ionicons name="calendar-outline" size={20} color="#F97316" />
          </View>
          {panelsReady ? (
            <FollowUpsPanel compact maxItems={12} showEmployeeName onOpenLead={setOpenLead} />
          ) : (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          )}
        </Pressable>

        <EmployeePerformance
          employees={employees}
          onMetricPress={(employee, metricKey) => setEmpMetric({
            employeeId: employee.employee_id,
            employeeName: employee.name,
            metric: metricKey,
          })}
        />

        {showAssignPanel && (
          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={[styles.panelTitle, { color: colors.text }]}>Assign Leads</Text>
                <Text style={[styles.panelSub, { color: colors.textMuted }]}>
                  {isManager ? 'Assign enquiries to your team · open full workspace' : 'Team assignment snapshot · open full workspace'}
                </Text>
              </View>
              <Pressable onPress={() => router.push('/(app)/assign-leads' as any)}>
                <Ionicons name="person-add-outline" size={20} color={colors.primary} />
              </Pressable>
            </View>
            {panelsReady ? <AssignLeadsPanel compact /> : null}
          </View>
        )}

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
                const stageLeads = model.activeLeads.filter((l) => pipelineStageMatch(l, stage.key));
                const stageCount = stage.key === 'new'
                  ? stageLeads.length
                  : Number(stats?.stage_distribution?.[stage.key] ?? stageLeads.length);
                return (
                  <View key={stage.key} style={[styles.kanbanCol, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                    <View style={styles.kanbanHead}>
                      <View style={[styles.stageDot, { backgroundColor: STAGE_COLORS[stage.key] || colors.primary }]} />
                      <Text style={[styles.kanbanTitle, { color: colors.text }]} numberOfLines={1}>{stageLabel(stage.key)}</Text>
                      <Text style={[styles.kanbanCount, { color: colors.textMuted }]}>{stageCount}</Text>
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

        <StackedBarChart
          title="Leads by Source"
          subtitle="Size, by platform — last 12 months (Housing.com · Meta · Database)"
          series={[...LEAD_SOURCE_SERIES]}
          data={chartLeadsBySourceMonth.length ? chartLeadsBySourceMonth : [{ label: '-', total: 0, segments: { housing: 0, meta: 0, manual: 0 } }]}
          yAxisLabel="Leads"
          testID="leads-by-source-stacked-chart"
        />

      </ScrollView>

      <DashboardLeadsModal
        visible={leadsBucket !== null}
        bucket={leadsBucket || 'all'}
        onClose={() => setLeadsBucket(null)}
        userRole={user?.role}
        onChanged={() => load({ force: true })}
        employees={employees}
      />
      <LeadDetailModal
        leadId={openLead}
        visible={openLead !== null}
        onClose={() => setOpenLead(null)}
        onChanged={() => load({ force: true })}
        userRole={user?.role}
        overlayZIndex={12000}
      />
      <EmployeeMetricModal
        visible={empMetric !== null}
        employeeId={empMetric?.employeeId ?? null}
        employeeName={empMetric?.employeeName}
        metric={empMetric?.metric ?? null}
        onClose={() => setEmpMetric(null)}
        userRole={user?.role}
        onChanged={() => load({ force: true })}
        onOpenLead={(leadId) => {
          setEmpMetric(null);
          setOpenLead(leadId);
        }}
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

function RevenuePanel({
  revenue,
  brokerageReceived,
  brokeragePending,
  bookings,
  confirmedBookings,
  disbursedLoans,
}: {
  revenue: number;
  brokerageReceived: number;
  brokeragePending: number;
  bookings: number;
  confirmedBookings: number;
  disbursedLoans: number;
}) {
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
      <View style={[styles.revenueStats, { marginBottom: 10 }]}>
        <View style={styles.tinyStat}>
          <View style={[styles.tinyDot, { backgroundColor: colors.positive }]} />
          <View>
            <Text style={[styles.tinyValue, { color: colors.text }]}>{formatCurrency(brokerageReceived)}</Text>
            <Text style={[styles.tinyLabel, { color: colors.textMuted }]}>Received</Text>
          </View>
        </View>
        <View style={styles.tinyStat}>
          <View style={[styles.tinyDot, { backgroundColor: colors.warning }]} />
          <View>
            <Text style={[styles.tinyValue, { color: colors.text }]}>{formatCurrency(brokeragePending)}</Text>
            <Text style={[styles.tinyLabel, { color: colors.textMuted }]}>Pending</Text>
          </View>
        </View>
      </View>
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
  metricSection: { gap: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  metricGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  followUpMiniRow: { flexDirection: 'row', gap: 8, marginRight: 8 },
  followUpMiniBox: { minWidth: 88, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  followUpMiniLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  followUpMiniValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
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
  chartFull: { flex: 1, minWidth: 320 },
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
  refreshBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
