import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { StageBadge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';

const QUEUE_STAGES = ['new', 'assigned'];

export default function Telecaller() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('queue');

  const load = useCallback(async () => {
    try {
      const r = await api.get('/leads');
      setLeads(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = leads.filter((l) => {
    if (l.status !== 'active') return false;
    if (!QUEUE_STAGES.includes(l.stage)) return false;
    // Non-admin employees only see leads assigned to them
    if (user?.role !== 'admin' && l.assigned_to && (user as any)?.acting_as_employee_id) {
      return l.assigned_to === (user as any).acting_as_employee_id;
    }
    return true;
  });

  return (
    <View style={{ flex: 1 }}>
      <TopBar 
        title="Telecaller Workspace" 
        subtitle="Incoming enquiries & follow-ups" 
        rightAction={
          <Pressable 
            onPress={load} 
            disabled={loading}
            style={({ pressed }) => [
              styles.iconBtn, 
              { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: pressed || loading ? 0.6 : 1 }
            ]}
          >
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Queue instructions */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            Showing only <Text style={{ fontWeight: '700', color: colors.primary }}>New Enquiries</Text>. Once you take an action, the lead will move to the next department.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="leads"
            title={filter === 'queue' ? 'No leads in your queue' : 'Nothing matches this filter'}
            description={filter === 'queue'
              ? 'New enquiries land here automatically. Try submitting one from the public enquiry form.'
              : 'Try a different filter or wait for new leads to arrive.'}
          />
        ) : (
          <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.tHead, { borderBottomColor: colors.border }]}>
              <Text style={[styles.th, { color: colors.textMuted, flex: 2 }]}>CUSTOMER</Text>
              <Text style={[styles.th, { color: colors.textMuted, flex: 1.5 }]}>BUDGET / TYPE</Text>
              <Text style={[styles.th, { color: colors.textMuted, flex: 1.5 }]}>LOCATION</Text>
              <Text style={[styles.th, { color: colors.textMuted, flex: 1 }]}>STAGE</Text>
              <Text style={[styles.th, { color: colors.textMuted, width: 110, textAlign: 'right' }]}>ACTION</Text>
            </View>
            {filtered.map((l) => (
              <Pressable
                key={l.lead_id}
                testID={`telecaller-row-${l.lead_id}`}
                onPress={() => setOpenLead(l.lead_id)}
                style={({ hovered }: any) => [
                  styles.tRow,
                  { borderBottomColor: colors.border, backgroundColor: hovered ? colors.surfaceAlt : 'transparent' },
                ]}
              >
                <View style={{ flex: 2 }}>
                  <Text style={[styles.cellPrimary, { color: colors.text }]}>{l.name}</Text>
                  <Text style={[styles.cellSecondary, { color: colors.textMuted }]}>{l.phone}</Text>
                </View>
                <View style={{ flex: 1.5 }}>
                  <Text style={[styles.cellPrimary, { color: colors.text }]}>{l.budget || '—'}</Text>
                  <Text style={[styles.cellSecondary, { color: colors.textMuted }]}>{l.property_type || '—'}</Text>
                </View>
                <Text style={[styles.cellPrimary, { color: colors.text, flex: 1.5 }]}>{l.location || '—'}</Text>
                <View style={{ flex: 1 }}>
                  <StageBadge stage={l.stage} />
                </View>
                <View style={{ width: 110, alignItems: 'flex-end' }}>
                  <View style={[styles.openBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '14' }]}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Open</Text>
                    <Ionicons name="arrow-forward" size={11} color={colors.primary} />
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

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

const styles = StyleSheet.create({
  content: { padding: 24, gap: 20 },
  filters: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, height: 32, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tableCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tHead: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  th: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  cellPrimary: { fontSize: 13, fontWeight: '500' },
  cellSecondary: { fontSize: 11, marginTop: 2 },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, paddingHorizontal: 10, height: 26, borderRadius: 6,
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
