import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { LeadDetailModal } from './LeadDetailModal';
import { WorkflowStatusBadge } from './Badge';

const METRIC_LABELS: Record<string, string> = {
  hot: 'Hot',
  visited: 'Visited',
  not_interested: 'Not Interested',
  booking_done: 'Booking Done',
  low_budget: 'Low Budget',
  ringing: 'Ringing',
  follow_ups: 'Follow Up',
};

type Props = {
  visible: boolean;
  employeeId: string | null;
  employeeName?: string;
  metric: string | null;
  onClose: () => void;
  userRole?: string | null;
  onChanged?: () => void;
};

export function EmployeeMetricModal({
  visible,
  employeeId,
  employeeName,
  metric,
  onClose,
  userRole,
  onChanged,
}: Props) {
  const { colors } = useTheme();
  const [leads, setLeads] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!visible || !employeeId || !metric) return;
    setLoading(true);
    try {
      const res = await api.get(`/leads/employee/${employeeId}/metric/${metric}`, { params: { limit: 500 } });
      setLeads(res.data?.leads || []);
      setTotal(Number(res.data?.total || 0));
    } finally {
      setLoading(false);
    }
  }, [visible, employeeId, metric]);

  useEffect(() => { load(); }, [load]);

  const metricLabel = METRIC_LABELS[metric || ''] || metric || 'Leads';
  const title = employeeName ? `${employeeName} — ${metricLabel}` : metricLabel;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{total} lead{total === 1 ? '' : 's'} · tap to open</Text>
            <Pressable onPress={onClose} style={[styles.close, { borderColor: colors.border }]}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : leads.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 32, fontSize: 13 }}>
              No leads in this category.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 480 }}>
              {leads.map((l) => (
                <Pressable
                  key={l.lead_id}
                  testID={`emp-metric-lead-${l.lead_id}`}
                  onPress={() => setOpenLead(l.lead_id)}
                  style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{l.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{l.phone || '—'}</Text>
                  </View>
                  <WorkflowStatusBadge lead={l} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
      <LeadDetailModal
        leadId={openLead}
        visible={openLead !== null}
        onClose={() => setOpenLead(null)}
        onChanged={() => { load(); onChanged?.(); }}
        userRole={userRole}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 560, maxHeight: '85%', borderRadius: 12, borderWidth: 1, padding: 18 },
  header: { marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  close: { position: 'absolute', right: 0, top: 0, width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8, alignItems: 'center', gap: 10 },
});
