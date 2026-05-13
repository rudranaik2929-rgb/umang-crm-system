import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Platform, Dimensions } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LeadSourceModal } from '../../src/components/LeadSourceModal';

const GOLD = '#D4A843';
const CARD_BG = '#0D1B2A';
const CARD_BORDER = '#1B2E45';

export default function Dashboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);

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
  const perfScore = totalLeads > 0 ? Math.min(100, Math.round((hotCount / totalLeads) * 100)) : 0;
  const revenue = stats?.revenue_pipeline || 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const newLeadsToday = leads.filter(l => l.created_at?.slice(0, 10) === todayStr).length || sd.new || 0;
  const followupsToday = sd.contacted || 0;
  const visitsScheduled = stats?.site_visits || 0;

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
      <TopBar title="Admin Control Center" subtitle="Full visibility across every department and pipeline" />
      <View style={{ backgroundColor: CARD_BG, paddingHorizontal: 24, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: CARD_BORDER, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
        <Text style={{ color: '#ffffff40', fontSize: 10, fontWeight: '600' }}>LIVE SYSTEM SYNC: {new Date().toLocaleTimeString()}</Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>

        {/* ====== HERO: System Overview ====== */}
        <View style={[s.hero, { backgroundColor: '#0D1B2A', borderColor: GOLD + '40' }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>REAL-TIME OPERATIONS</Text>
            <Text style={s.heroTitle}>Command Dashboard</Text>
            <View style={s.heroPills}>
              <View style={s.heroPill}><Text style={s.heroPillText}>{stats?.employees || 0} Employees Active</Text></View>
              <View style={s.heroPill}><Text style={s.heroPillText}>{stats?.campaigns || 0} Campaigns Live</Text></View>
            </View>
            <Text style={s.heroDesc}>
              You are viewing real-time data from all departments. Monitor performance, track lead flow, and oversee revenue growth from this cockpit.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <Pressable onPress={() => router.push('/(app)/admin-analytics' as any)} style={[s.ctaBtn, { backgroundColor: GOLD }]}>
                <Text style={s.ctaText}>View Deep Analytics</Text>
                <Ionicons name="analytics" size={14} color="#000" />
              </Pressable>
              <Pressable onPress={() => router.push('/(app)/employees' as any)} style={[s.ctaBtn, { backgroundColor: '#1B2E45' }]}>
                <Text style={[s.ctaText, { color: '#fff' }]}>Manage Team</Text>
              </Pressable>
            </View>
          </View>

          <View style={s.gaugeWrap}>
            <GaugeChart score={perfScore} />
            <Text style={s.gaugeLabel}>CONVERSION EFFICIENCY</Text>
            <Text style={s.gaugeSub}>{perfScore >= 70 ? 'Optimal Performance' : 'Action Required'}</Text>
          </View>
        </View>

        {/* ====== LEAD TEMPERATURE CARDS ====== */}
        <View>
          <Text style={s.sectionTitle}>LEAD TEMPERATURE</Text>
          <View style={s.tempGrid}>
            <TempCard icon="flame" label="Hot Leads" value={hotCount} color="#EF4444" desc="Booking Potential" />
            <TempCard icon="sunny" label="Warm Leads" value={warmCount} color="#F59E0B" desc="Follow-up Queue" />
            <TempCard icon="snow" label="Cold Leads" value={coldCount} color="#3B82F6" desc="New Enquiries" />
            <TempCard icon="trophy" label="Revenue" value={`₹${(revenue / 100000).toFixed(1)}L`} color={GOLD} desc="This Month" />
          </View>
        </View>

        {/* ====== MINI STATS ====== */}
        <View style={s.statRow}>
          <MiniStat label="Total Leads" sub="Source Breakdown" value={totalLeads} color={GOLD} onPress={() => setSourceModalVisible(true)} />
          <MiniStat label="New Leads" sub="Today" value={newLeadsToday} color="#3B82F6" />
          <MiniStat label="Follow-ups" sub="In Progress" value={followupsToday} color="#F59E0B" />
          <MiniStat label="Site Visits" sub="Scheduled" value={visitsScheduled} color="#06B6D4" />
        </View>

        {/* ====== CHARTS ====== */}
        <View style={s.chartRow}>
          {graphData?.leads_by_day && (
            <View style={[s.card, { flex: 1.2 }]}>
              <Text style={s.cardTitle}>Acquisition Flow (30D)</Text>
              <SVGLineChart
                data={graphData.leads_by_day.map((d: any) => ({ label: d.date.slice(8), value: d.count }))}
                color="#3B82F6"
                height={180}
              />
            </View>
          )}
          {graphData?.revenue_by_month && (
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.cardTitle}>Revenue Growth (12M)</Text>
              <SVGLineChart
                data={graphData.revenue_by_month.map((d: any) => ({
                  label: new Date(d.month + '-01').toLocaleString('en', { month: 'short' }),
                  value: d.revenue,
                }))}
                color={GOLD}
                height={180}
                formatY={(v: number) => `${Math.round(v / 100000)}L`}
              />
            </View>
          )}
        </View>

        {/* ====== KANBAN PREVIEW ====== */}
        <View style={[s.card, { padding: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={s.cardTitle}>Global Pipeline Preview</Text>
            <Pressable onPress={() => router.push('/(app)/pipeline' as any)}>
              <Text style={{ color: GOLD, fontSize: 13, fontWeight: '700' }}>VIEW FULL BOARD →</Text>
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
                    {stageLeads.slice(0, 2).map(lead => (
                      <Pressable
                        key={lead.lead_id}
                        style={s.kanbanCard}
                        onPress={() => router.push(`/(app)/lead/${lead.lead_id}` as any)}
                      >
                        <Text style={s.kanbanName} numberOfLines={1}>{lead.name}</Text>
                        <Text style={s.kanbanDetail} numberOfLines={1}>{lead.property_type}</Text>
                      </Pressable>
                    ))}
                    {stageLeads.length > 2 && (
                      <Text style={s.kanbanMore}>+{stageLeads.length - 2} more</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

      </ScrollView>
      <LeadSourceModal visible={sourceModalVisible} onClose={() => setSourceModalVisible(false)} />
    </View>
  );
}

function TempCard({ icon, label, value, color, desc }: any) {
  return (
    <View style={[s.tempCard, { borderColor: CARD_BORDER }]}>
      <View style={[s.tempIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View>
        <Text style={s.tempLabel}>{label.toUpperCase()}</Text>
        <Text style={[s.tempVal, { color }]}>{value}</Text>
        <Text style={s.tempDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function GaugeChart({ score }: { score: number }) {
  const angle = (score / 100) * 180;
  const isWeb = Platform.OS === 'web';
  if (!isWeb) return <View style={{ height: 80, justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>{score}%</Text></View>;
  return (
    <View style={{ alignItems: 'center', width: 140, height: 90 }}>
      <svg viewBox="0 0 200 110" style={{ width: 140, height: 90 } as any}>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1B2E45" strokeWidth="14" strokeLinecap="round" />
        <path d={describeArc(100, 100, 80, 180, 180 + angle)} fill="none" stroke={GOLD} strokeWidth="14" strokeLinecap="round" />
        <text x="100" y="90" textAnchor="middle" fill="#ffffff" fontSize="28" fontWeight="700">{score}%</text>
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
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

function MiniStat({ label, sub, value, color, onPress }: any) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={[s.card, s.miniCard, onPress && { borderColor: color + '80', borderStyle: 'dashed' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={[s.miniDot, { backgroundColor: color }]} />
        <View><Text style={s.miniLabel}>{label}</Text><Text style={s.miniSub}>{sub}</Text></View>
      </View>
      <View style={{ alignItems: 'flex-end' }}><Text style={[s.miniValue, { color }]}>{value}</Text></View>
    </Wrapper>
  );
}

function SVGLineChart({ data, color, height, formatY }: any) {
  const isWeb = Platform.OS === 'web';
  if (!isWeb || data.length < 2) return <View style={{ height, backgroundColor: '#ffffff05', borderRadius: 8 }} />;
  const max = Math.max(1, ...data.map((d: any) => d.value));
  const yTicks = 4;
  const yVals = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((max / yTicks) * i));
  const buildPath = () => {
    let p = `M 0 ${100 - (data[0].value / max) * 90}`;
    const step = 100 / (data.length - 1);
    for (let i = 0; i < data.length - 1; i++) {
      const x1 = i * step, y1 = 100 - (data[i].value / max) * 90;
      const x2 = (i + 1) * step, y2 = 100 - (data[i+1].value / max) * 90;
      p += ` C ${x1 + step/2} ${y1}, ${x2 - step/2} ${y2}, ${x2} ${y2}`;
    }
    return p;
  };
  const linePath = buildPath();
  const areaPath = linePath + ` L 100 100 L 0 100 Z`;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 40, justifyContent: 'space-between', height }}>
          {[...yVals].reverse().map((v, i) => <Text key={i} style={{ color: '#ffffff40', fontSize: 8, textAlign: 'right', paddingRight: 4 }}>{formatY ? formatY(v) : v}</Text>)}
        </View>
        <View style={{ flex: 1, height }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' } as any}>
            <defs><linearGradient id={`a-${color}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
            <path d={areaPath} fill={`url(#a-${color})`} /><path d={linePath} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </svg>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: 24, gap: 24 },
  card: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, padding: 24 },
  cardTitle: { color: '#ffffffE0', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionTitle: { color: '#ffffff60', fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 12 },
  hero: { flexDirection: 'row', padding: 32, borderRadius: 20, borderWidth: 1, alignItems: 'center', gap: 32 },
  kicker: { color: GOLD, fontSize: 9, fontWeight: '700', letterSpacing: 2 },
  heroTitle: { color: '#fff', fontSize: 32, fontWeight: '700', letterSpacing: -1, marginTop: 8 },
  heroPills: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroPill: { backgroundColor: '#1B2E45', paddingHorizontal: 10, height: 24, borderRadius: 99, justifyContent: 'center' },
  heroPillText: { color: '#ffffffB0', fontSize: 10, fontWeight: '600' },
  heroDesc: { color: '#ffffff80', fontSize: 14, lineHeight: 22, marginTop: 20, maxWidth: 500 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, height: 44, borderRadius: 12 },
  ctaText: { fontSize: 13, fontWeight: '700' },
  gaugeWrap: { alignItems: 'center', width: 200 },
  gaugeLabel: { color: '#ffffff60', fontSize: 9, fontWeight: '700', marginTop: 12 },
  gaugeSub: { color: GOLD, fontSize: 11, fontWeight: '600', marginTop: 4 },
  tempGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  tempCard: { flex: 1, minWidth: 200, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, padding: 20, flexDirection: 'row', gap: 16, alignItems: 'center' },
  tempIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tempLabel: { color: '#ffffff60', fontSize: 9, fontWeight: '700' },
  tempVal: { fontSize: 26, fontWeight: '700', color: '#fff' },
  tempDesc: { color: '#ffffff40', fontSize: 10 },
  statRow: { flexDirection: 'row', gap: 16 },
  miniCard: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  miniDot: { width: 6, height: 6, borderRadius: 3 },
  miniLabel: { color: '#ffffffD0', fontSize: 12, fontWeight: '600' },
  miniSub: { color: '#ffffff60', fontSize: 9 },
  miniValue: { fontSize: 30, fontWeight: '700' },
  chartRow: { flexDirection: 'row', gap: 16 },
  kanbanRow: { flexDirection: 'row', gap: 12 },
  kanbanCol: { width: 180 },
  kanbanHeader: { borderBottomWidth: 2, paddingBottom: 10, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' },
  kanbanHeaderText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  kanbanCount: { color: '#ffffff40', fontSize: 10 },
  kanbanCard: { backgroundColor: '#0A1628', borderRadius: 10, borderWidth: 1, borderColor: '#1B2E4580', padding: 12, marginBottom: 8 },
  kanbanName: { color: '#ffffffD0', fontSize: 11, fontWeight: '600' },
  kanbanDetail: { color: '#ffffff50', fontSize: 9, marginTop: 4 },
  kanbanMore: { color: GOLD, fontSize: 10, fontWeight: '600' },
});
