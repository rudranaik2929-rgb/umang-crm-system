import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { STAGES, STAGE_COLORS, stageLabel } from '../../src/lib/constants';
import { EmptyState } from '../../src/components/EmptyState';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { Ionicons } from '@expo/vector-icons';

export default function Pipeline() {
  const { colors } = useTheme();
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
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
                {grouped[s.key].map((l) => (
                  <Pressable
                    key={l.lead_id}
                    testID={`kanban-card-${l.lead_id}`}
                    onPress={() => setOpenLead(l.lead_id)}
                    style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{l.name}</Text>
                    <View style={styles.cardMeta}>
                      <Ionicons name="call-outline" size={11} color={colors.textMuted} />
                      <Text style={[styles.cardMetaText, { color: colors.textMuted }]} numberOfLines={1}>{l.phone}</Text>
                    </View>
                    {l.location ? (
                      <View style={styles.cardMeta}>
                        <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                        <Text style={[styles.cardMetaText, { color: colors.textMuted }]} numberOfLines={1}>{l.location}</Text>
                      </View>
                    ) : null}
                    {l.budget ? (
                      <View style={[styles.budget, { borderColor: colors.border }]}>
                        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>{l.budget}</Text>
                      </View>
                    ) : null}
                  </Pressable>
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  board: { padding: 16, gap: 12, flexDirection: 'row', alignItems: 'stretch', height: '100%' },
  col: { width: 280, padding: 12, borderRadius: 12, height: '100%', flexDirection: 'column' },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  colDot: { width: 8, height: 8, borderRadius: 4 },
  colTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  colCount: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, borderWidth: 1 },
  card: { padding: 12, borderRadius: 8, borderWidth: 1, gap: 4 },
  cardName: { fontSize: 13, fontWeight: '600' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText: { fontSize: 11 },
  budget: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
});
