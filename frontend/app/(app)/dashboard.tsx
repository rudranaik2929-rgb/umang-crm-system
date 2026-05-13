import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
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
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        api.get('/stats/dashboard'),
        api.get('/leads'),
      ]);
      setStats(s.data);
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
      <TopBar title="Dashboard" subtitle="Overview of your current pipeline" />
      <ScrollView contentContainerStyle={s.content}>

        {/* ====== BASIC STATS ====== */}
        <View style={s.statRow}>
          <MiniStat label="Total Leads" sub="Full Database" value={totalLeads} color={GOLD} onPress={() => setSourceModalVisible(true)} />
          <MiniStat label="New Leads" sub="Today" value={newLeadsToday} color="#3B82F6" />
          <MiniStat label="Follow-ups" sub="Pending" value={followupsToday} color="#F59E0B" />
          <MiniStat label="Site Visits" sub="Today" value={visitsScheduled} color="#06B6D4" />
        </View>

        {/* ====== LEADS BREAKDOWN ====== */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Leads Breakdown</Text>
          <View style={{ marginTop: 16, gap: 12 }}>
            {STAGES.map(stage => {
              const count = sd[stage] || 0;
              const pct = totalLeads > 0 ? (count / totalLeads) * 100 : 0;
              const color = STAGE_COLORS[stage] || '#888';
              return (
                <View key={stage} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{STAGE_LABELS[stage]}</Text>
                    <Text style={{ color: '#ffffff60', fontSize: 11 }}>{count} leads ({Math.round(pct)}%)</Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: '#1B2E45', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ====== KANBAN PREVIEW ====== */}
        <View style={[s.card, { padding: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={s.cardTitle}>Recent Lead Activity</Text>
            <Pressable onPress={() => router.push('/(app)/pipeline' as any)}>
              <Text style={{ color: GOLD, fontSize: 12, fontWeight: '700' }}>VIEW FULL PIPELINE →</Text>
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

        {/* CTA TO ANALYTICS */}
        <Pressable 
          onPress={() => router.push('/(app)/admin-analytics' as any)}
          style={{ backgroundColor: GOLD + '15', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: GOLD + '40', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: GOLD, fontSize: 14, fontWeight: '700' }}>Open Admin Analytics</Text>
            <Text style={{ color: '#ffffff60', fontSize: 12 }}>View revenue, performance scores, and detailed charts</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={GOLD} />
        </Pressable>

      </ScrollView>
      <LeadSourceModal visible={sourceModalVisible} onClose={() => setSourceModalVisible(false)} />
    </View>
  );
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

const s = StyleSheet.create({
  content: { padding: 24, gap: 20 },
  card: { backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, padding: 20 },
  cardTitle: { color: '#ffffffE0', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  statRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  miniCard: { flex: 1, minWidth: 160, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  miniDot: { width: 6, height: 6, borderRadius: 3 },
  miniLabel: { color: '#ffffffD0', fontSize: 12, fontWeight: '600' },
  miniSub: { color: '#ffffff60', fontSize: 9 },
  miniValue: { fontSize: 26, fontWeight: '700' },
  kanbanRow: { flexDirection: 'row', gap: 12 },
  kanbanCol: { width: 150 },
  kanbanHeader: { borderBottomWidth: 2, paddingBottom: 8, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' },
  kanbanHeaderText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  kanbanCount: { color: '#ffffff40', fontSize: 10 },
  kanbanCard: { backgroundColor: '#0A1628', borderRadius: 8, borderWidth: 1, borderColor: '#1B2E4580', padding: 10, marginBottom: 6 },
  kanbanName: { color: '#ffffffD0', fontSize: 11, fontWeight: '600' },
  kanbanDetail: { color: '#ffffff50', fontSize: 9, marginTop: 4 },
  kanbanMore: { color: GOLD, fontSize: 10, fontWeight: '600' },
});
