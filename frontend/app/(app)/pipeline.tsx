import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Animated, Easing } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { STAGES, STAGE_COLORS, stageLabel } from '../../src/lib/constants';
import { EmptyState } from '../../src/components/EmptyState';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { CardActionMenu } from '../../src/components/CardActionMenu';
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
      setLeads(r.data.filter((l: any) => l.status !== 'negative' && l.stage !== 'broker' && l.lead_type !== 'brokerage'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = STAGES.reduce<Record<string, any[]>>((acc, s) => {
    acc[s.key] = leads.filter((l) => l.stage === s.key);
    return acc;
  }, {});

  const deleteLead = async (lead: any) => {
    const ok = typeof window === 'undefined' || window.confirm(`Delete lead ${lead.name}?`);
    if (!ok) return;
    await api.delete(`/leads/${lead.lead_id}`);
    await load();
  };

  const toggleStar = async (lead: any) => {
    await api.patch(`/leads/${lead.lead_id}`, { starred: !lead.starred });
    await load();
  };

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
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 10 }}>
                {grouped[s.key].map((l) => (
                  <KanbanCard
                    key={l.lead_id}
                    lead={l}
                    colors={colors}
                    onPress={() => setOpenLead(l.lead_id)}
                    onEdit={() => setOpenLead(l.lead_id)}
                    onToggleStar={() => toggleStar(l)}
                    onDelete={() => deleteLead(l)}
                  />
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

function KanbanCard({ lead, colors, onPress, onEdit, onToggleStar, onDelete }: any) {
  const [hovered, setHovered] = useState(false);
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  // Only show badge if telecaller has explicitly marked it as "Hot Lead"
  const isHot = lead.priority === 'hot';

  React.useEffect(() => {
    if (isHot) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      ).start();
    }
  }, [isHot]);

  const glowColor = '#EF4444';
  const glowShadow = isHot
    ? pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [`0 0 0px ${glowColor}00`, `0 0 14px ${glowColor}80`] })
    : 'none';

  return (
    <Animated.View style={[{ boxShadow: glowShadow }] as any}>
      <Pressable
        testID={`kanban-card-${lead.lead_id}`}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={[
          styles.card, 
          { 
            backgroundColor: colors.surface, 
            borderColor: isHot ? glowColor + '60' : (hovered ? colors.primary : colors.border),
            transform: [{ translateY: hovered ? -3 : 0 }],
            boxShadow: hovered ? `0 6px 16px ${colors.primary}20` : undefined
          } as any
        ]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            {lead.starred ? <Ionicons name="star" size={13} color={colors.warning} /> : null}
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{lead.name}</Text>
            {isHot && (
              <Animated.View style={[
                styles.hotBadge,
                { backgroundColor: '#EF4444',
                  opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
                  transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }) }]
                }
              ]}>
                <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 }}>
                  🔥 HOT
                </Text>
              </Animated.View>
            )}
          </View>
          <CardActionMenu
            colors={colors}
            isStarred={!!lead.starred}
            onEdit={onEdit}
            onToggleStar={onToggleStar}
            onDelete={onDelete}
            testIDPrefix={`lead-${lead.lead_id}`}
          />
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
    </Animated.View>
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
  hotBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
