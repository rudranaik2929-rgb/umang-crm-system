import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { STAGES, STAGE_COLORS, stageLabel } from '../../src/lib/constants';
import { EmptyState } from '../../src/components/EmptyState';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { Ionicons } from '@expo/vector-icons';

export default function Pipeline() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/leads');
      setLeads(r.data.filter((l: any) => l.status !== 'negative'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = STAGES.reduce<Record<string, any[]>>((acc, s) => {
    acc[s.key] = leads.filter((l) => l.stage === s.key);
    return acc;
  }, {});

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Lead Pipeline" subtitle="Kanban view of every active lead by stage" />
      {loading ? (
        <View style={{ padding: 48 }}><ActivityIndicator color={colors.primary} /></View>
      ) : leads.length === 0 ? (
        <View style={{ padding: 24, flex: 1 }}>
          <EmptyState
            variant="leads"
            title="The pipeline is silent — for now."
            description="No active leads in the workflow. Once an enquiry arrives, it will land in the New Lead column and you can drive it across stages."
          />
        </View>
      ) : (
        <ScrollView horizontal contentContainerStyle={styles.board}>
          {STAGES.map((s) => (
            <View key={s.key} style={[styles.col, { backgroundColor: colors.surfaceAlt + '60' }]}>
              <View style={styles.colHead}>
                <View style={[styles.colDot, { backgroundColor: STAGE_COLORS[s.key] }]} />
                <Text style={[styles.colTitle, { color: colors.text }]}>{stageLabel(s.key)}</Text>
                <View style={[styles.colCount, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>
                    {grouped[s.key].length}
                  </Text>
                </View>
              </View>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 10 }}>
                {grouped[s.key].map((l) => (
                  <KanbanCard key={l.lead_id} lead={l} colors={colors} onPress={() => setOpenLead(l.lead_id)} />
                ))}
                {grouped[s.key].length === 0 && (
                  <Text style={{ color: colors.textMuted, fontSize: 11, padding: 14, textAlign: 'center' }}>
                    No leads
                  </Text>
                )}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}
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

function KanbanCard({ lead, colors, onPress }: any) {
  const [hovered, setHovered] = useState(false);
  
  return (
    <Pressable
      testID={`kanban-card-${lead.lead_id}`}
      onPress={onPress}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={[
        styles.card, 
        { 
          backgroundColor: colors.surface, 
          borderColor: hovered ? colors.primary : colors.border,
          transform: [{ translateY: hovered ? -3 : 0 }],
          boxShadow: hovered ? `0 6px 16px ${colors.primary}20` : 'none'
        } as any
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{lead.name}</Text>
        {hovered && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
             <Pressable style={styles.miniBtn} onPress={() => {}}>
               <Ionicons name="call-outline" size={10} color={colors.primary} />
             </Pressable>
             <Pressable style={styles.miniBtn} onPress={() => {}}>
               <Ionicons name="logo-whatsapp" size={10} color="#25D366" />
             </Pressable>
          </View>
        )}
      </View>
      <View style={styles.cardMeta}>
        <Ionicons name="call-outline" size={11} color={colors.textMuted} />
        <Text style={[styles.cardMetaText, { color: colors.textMuted }]} numberOfLines={1}>{lead.phone}</Text>
      </View>
      {lead.location ? (
        <View style={styles.cardMeta}>
          <Ionicons name="location-outline" size={11} color={colors.textMuted} />
          <Text style={[styles.cardMetaText, { color: colors.textMuted }]} numberOfLines={1}>{lead.location}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        {lead.budget ? (
          <View style={[styles.budget, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontSize: 10, fontWeight: '600' }}>{lead.budget}</Text>
          </View>
        ) : <View />}
        <Text style={{ fontSize: 9, color: colors.textMuted }}>{lead.source}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  board: { padding: 16, gap: 12, flexDirection: 'row', alignItems: 'stretch', height: '100%' },
  col: { width: 280, padding: 12, borderRadius: 12, height: '100%', flexDirection: 'column' },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  colCount: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  card: { padding: 12, borderRadius: 10, borderWidth: 1, gap: 4, transitionDuration: '150ms' } as any,
  cardName: { fontSize: 13, fontWeight: '600', flex: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText: { fontSize: 11 },
  budget: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  miniBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#f1f5f910', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f030' },
});
