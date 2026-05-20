import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Platform } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LeadSourceModal } from '../../src/components/LeadSourceModal';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { LineChart } from '../../src/components/LineChart';
import { canSeeRevenue } from '../../src/lib/constants';

const GOLD = '#D4A843';
const GOLD_DIM = '#D4A84340';
const CARD_BG = '#0D1B2A';
const CARD_BORDER = '#1B2E45';

export default function Dashboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, g, l] = await Promise.all([
        api.get('/stats/dashboard'),
        api.get('/stats/dashboard/graph'),
        api.get('/leads'),
      ]);
      setStats(s.data);
      setGraphData(g.data);
      setLeads(Array.isArray(l.data) ? l.data : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Dashboard" />
        <View style={{ padding: 60, alignItems: 'center' }}><ActivityIndicator color={GOLD} size="large" /></View>
      </View>
    );
  }

  const sd = stats?.stage_distribution || {};
  const totalLeads = stats?.total_leads || 0;
  const hotCount = (sd.positive || 0) + (sd.site_visit || 0) + (sd.booking || 0) + (sd.loan || 0) + (sd.registration || 0) + (sd.closed || 0);
  const warmCount = sd.contacted || 0;
  const coldCount = sd.new || 0;
  const totalTemp = hotCount + warmCount + coldCount || 1;
  const perfScore = totalLeads > 0 ? Math.min(100, Math.round((hotCount / totalLeads) * 100)) : 0;
  const revenue = stats?.revenue_pipeline || 0;

  // Today leads count (simulate — leads created today)
  const todayStr = new Date().toISOString().slice(0, 10);
  const newLeadsToday = leads.filter(l => l.created_at?.slice(0, 10) === todayStr).length || sd.new || 0;
  const followupsToday = sd.contacted || 0;
  const visitsScheduled = stats?.site_visits || 0;

  // Kanban
  const STAGES = ['new', 'contacted', 'positive', 'site_visit', 'booking', 'loan', 'registration', 'closed'];
  const STAGE_LABELS: Record<string, string> = {
    new: 'New', contacted: 'Contacted', positive: 'Positive', site_visit: 'Site Visit',
    booking: 'Booking', loan: 'Loan', registration: 'Registration', closed: 'Closed',
  };
  const STAGE_COLORS: Record<string, string> = {
    new: '#3B82F6', contacted: '#F59E0B', positive: '#10B981', site_visit: '#06B6D4',
    booking: '#8B5CF6', loan: '#EC4899', registration: '#EF4444', closed: '#10B981',
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Dashboard" subtitle="Daily snapshot — what needs your attention right now" />
      <ScrollView contentContainerStyle={s.content}>

        {/* ====== ROW 1: Performance Score | Lead Temperature | Total Revenue ====== */}
        <View style={s.topRow}>
          {/* Performance Score */}
          <View style={[s.card, s.perfCard]}>
            <Text style={s.cardTitle}>Performance Score</Text>
            <View style={s.perfBody}>
              <GaugeChart score={perfScore} />
              <View style={s.perfLegend}>
                <LegendDot color="#EF4444" label="Hot" />
                <LegendDot color="#F59E0B" label="Warm" />
                <LegendDot color="#3B82F6" label="Cold" />
              </View>
            </View>
          </View>

          {/* Lead Temperature */}
          <View style={[s.card, { flex: 1.2 }]}>
            <Text style={s.cardTitle}>Lead Temperature</Text>
            <View style={s.tempBarRow}>
              <Text style={[s.tempLabel, { color: '#EF4444' }]}>Hot</Text>
              <View style={s.tempBarTrack}>
                <View style={[s.tempBarSeg, { flex: hotCount / totalTemp, backgroundColor: '#EF4444' }]} />
                <View style={[s.tempBarSeg, { flex: warmCount / totalTemp, backgroundColor: '#F59E0B' }]} />
                <View style={[s.tempBarSeg, { flex: coldCount / totalTemp, backgroundColor: '#3B82F6' }]} />
              </View>
              <Text style={[s.tempLabel, { color: '#3B82F6' }]}>Cold</Text>
            </View>
            <View style={s.tempNumbers}>
              <View style={s.tempNumItem}>
                <View style={[s.tempDot, { backgroundColor: '#EF4444' }]} />
                <Text style={s.tempNumText}>{hotCount} Hot</Text>
              </View>
              <View style={s.tempNumItem}>
                <View style={[s.tempDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={s.tempNumText}>{warmCount} Warm</Text>
              </View>
              <View style={s.tempNumItem}>
                <View style={[s.tempDot, { backgroundColor: '#3B82F6' }]} />
                <Text style={s.tempNumText}>{coldCount} Cold</Text>
              </View>
            </View>
          </View>

          {/* Total Revenue — hidden for manager */}
          {canSeeRevenue(user?.role) && (
          <View style={[s.card, { flex: 0.7, justifyContent: 'center' }]}>
            <Text style={[s.cardTitle, { fontSize: 11 }]}>Total Revenue</Text>
            <Text style={s.smallLabel}>This month</Text>
            <Text style={s.revenueValue}>₹{revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          </View>
          )}
        </View>

        {/* ====== ROW 2: New Leads | Follow-ups | Site Visits ====== */}
        <View style={s.statRow}>
          <MiniStat label="Total Leads" sub="Source Breakdown" value={totalLeads} color={GOLD} onPress={() => setSourceModalVisible(true)} />
          <MiniStat label="New Leads" sub="Today" value={newLeadsToday} color={GOLD} />
          <MiniStat label="Follow-ups" sub="Today" value={followupsToday} color={GOLD} />
          <MiniStat label="Site Visits" sub="Scheduled" value={visitsScheduled} color={GOLD} />
        </View>

        {/* ====== KANBAN BOARD ====== */}
        <View style={[s.card, { padding: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={s.cardTitle}>Kanban Board</Text>
            <Pressable onPress={() => router.push('/(app)/pipeline' as any)}>
              <Text style={{ color: GOLD, fontSize: 18 }}>⋯</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.kanbanRow}>
              {STAGES.map(stage => {
                const stageLeads = leads.filter(l => l.stage === stage);
                const stageColor = STAGE_COLORS[stage] || '#888';
                return (
                  <View key={stage} style={s.kanbanCol}>
                    <View style={[s.kanbanHeader, { borderBottomColor: stageColor }]}>
                      <Text style={[s.kanbanHeaderText, { color: stageColor }]}>{STAGE_LABELS[stage]}</Text>
                      <Text style={s.kanbanCount}>{stageLeads.length}</Text>
                    </View>
                    {stageLeads.slice(0, 3).map(lead => (
                      <Pressable
                        key={lead.lead_id}
                        style={s.kanbanCard}
                        onPress={() => setOpenLead(lead.lead_id)}
                      >
                        <Text style={s.kanbanName} numberOfLines={1}>{lead.name}</Text>
                        <Text style={s.kanbanDetail} numberOfLines={1}>
                          {lead.property_type} · {lead.budget}
                        </Text>
                        <Text style={s.kanbanDetail} numberOfLines={1}>{lead.location}</Text>
                      </Pressable>
                    ))}
                    {stageLeads.length > 3 && (
                      <Text style={s.kanbanMore}>+{stageLeads.length - 3} more</Text>
                    )}
                    {stageLeads.length === 0 && (
                      <Text style={s.kanbanEmpty}>No leads</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* ====== ROW 3: Charts ====== */}
        <View style={s.chartRow}>
          {graphData?.leads_by_day && (
            <LineChart
              title="Leads per Day"
              subtitle="Last 30 days"
              data={graphData.leads_by_day.map((d: any) => ({ label: d.date.slice(8), value: d.count }))}
              color="#3B82F6"
              testID="leads-chart"
            />
          )}
          {graphData?.revenue_by_month && (
            <LineChart
              title="Revenue per Month"
              subtitle="Past 12 months"
              data={graphData.revenue_by_month.map((d: any) => ({
                label: new Date(d.month + '-01').toLocaleString('en', { month: 'short' }),
                value: d.revenue,
              }))}
              color="#D4A843"
              formatValue={(v: number) => v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${Math.round(v / 1000)}K`}
              testID="revenue-chart"
            />
          )}
        </View>

      </ScrollView>
      <LeadSourceModal visible={sourceModalVisible} onClose={() => setSourceModalVisible(false)} />
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

/* ====== GAUGE CHART COMPONENT ====== */
function GaugeChart({ score }: { score: number }) {
  const angle = (score / 100) * 180;
  const isWeb = Platform.OS === 'web';

  if (!isWeb) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 120, height: 80 }}>
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700' }}>{score}%</Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', width: 140, height: 90 }}>
      <svg viewBox="0 0 200 110" style={{ width: 140, height: 90 } as any}>
        {/* Background arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1B2E45" strokeWidth="14" strokeLinecap="round" />
        {/* Score arc */}
        <path
          d={describeArc(100, 100, 80, 180, 180 + angle)}
          fill="none"
          stroke={GOLD}
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Score text */}
        <text x="100" y="90" textAnchor="middle" fill="#ffffff" fontSize="28" fontWeight="700" fontFamily="sans-serif">
          {score}%
        </text>
        <text x="100" y="106" textAnchor="middle" fill="#ffffff80" fontSize="10" fontFamily="sans-serif">
          {score}%
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

/* ====== LEGEND DOT ====== */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: '#ffffffB0', fontSize: 11 }}>{label}</Text>
    </View>
  );
}

/* ====== MINI STAT CARD ====== */
function MiniStat({ label, sub, value, color, onPress }: { label: string; sub: string; value: number; color: string; onPress?: () => void }) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper 
      onPress={onPress}
      style={[s.card, s.miniCard, onPress && { borderColor: color + '80', borderStyle: 'dashed' }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={[s.miniDot, { backgroundColor: color }]} />
        <View>
          <Text style={s.miniLabel}>{label}</Text>
          <Text style={s.miniSub}>{sub}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.miniValue, { color }]}>{value}</Text>
        {onPress && <Text style={{ color: color, fontSize: 8, fontWeight: '700' }}>VIEW DETAILS</Text>}
      </View>
    </Wrapper>
  );
}


/* ====== STYLES ====== */
const s = StyleSheet.create({
  content: { padding: 20, gap: 16 },

  /* Cards */
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 20,
  },
  cardTitle: { color: '#ffffffE0', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  smallLabel: { color: '#ffffff60', fontSize: 10, marginTop: 2 },

  /* Top row */
  topRow: { flexDirection: 'row', gap: 14 },
  perfCard: { flex: 1 },
  perfBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  perfLegend: { gap: 6 },

  /* Temperature */
  tempBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  tempLabel: { fontSize: 10, fontWeight: '700' },
  tempBarTrack: { flex: 1, height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden' },
  tempBarSeg: { height: '100%' },
  tempNumbers: { flexDirection: 'row', gap: 16, marginTop: 14 },
  tempNumItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tempDot: { width: 8, height: 8, borderRadius: 4 },
  tempNumText: { color: '#ffffffB0', fontSize: 11 },

  /* Revenue */
  revenueValue: { color: GOLD, fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 8 },

  /* Stat row */
  statRow: { flexDirection: 'row', gap: 14 },
  miniCard: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  miniDot: { width: 6, height: 6, borderRadius: 3 },
  miniLabel: { color: '#ffffffD0', fontSize: 12, fontWeight: '600' },
  miniSub: { color: '#ffffff60', fontSize: 9 },
  miniValue: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },

  /* Kanban */
  kanbanRow: { flexDirection: 'row', gap: 10 },
  kanbanCol: { width: 150, minHeight: 160 },
  kanbanHeader: { borderBottomWidth: 2, paddingBottom: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kanbanHeaderText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  kanbanCount: { color: '#ffffff50', fontSize: 10, fontWeight: '600' },
  kanbanCard: {
    backgroundColor: '#0A1628',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1B2E4580',
    padding: 10,
    marginBottom: 6,
  },
  kanbanName: { color: '#ffffffD0', fontSize: 11, fontWeight: '600' },
  kanbanDetail: { color: '#ffffff60', fontSize: 9, marginTop: 2 },
  kanbanMore: { color: GOLD, fontSize: 10, fontWeight: '600', marginTop: 4 },
  kanbanEmpty: { color: '#ffffff30', fontSize: 10, fontStyle: 'italic' },

  /* Charts */
  chartRow: { flexDirection: 'row', gap: 14 },
});
