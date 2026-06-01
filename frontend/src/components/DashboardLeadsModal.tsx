import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { LeadDetailModal } from './LeadDetailModal';
import { StageBadge } from './Badge';
import { formatBudgetStringLakhs } from '../lib/leadFormat';

const BUCKET_TITLES: Record<string, string> = {
  all: 'All Leads',
  new_today: 'New Today',
  positive: 'Positive Leads',
  not_interested: 'Not Interested',
  registration: 'Registration',
  booking: 'Bookings & Loans',
  follow_up: 'Follow Ups Scheduled',
};

type Props = {
  visible: boolean;
  bucket: string;
  onClose: () => void;
  userRole?: string | null;
  onChanged?: () => void;
};

export function DashboardLeadsModal({ visible, bucket, onClose, userRole, onChanged }: Props) {
  const { colors } = useTheme();
  const [leads, setLeads] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!visible || !bucket) return;
    setLoading(true);
    try {
      const res = await api.get('/leads/filtered', { params: { bucket, limit: 500 } });
      setLeads(res.data?.leads || []);
      setTotal(Number(res.data?.total || 0));
    } finally {
      setLoading(false);
    }
  }, [visible, bucket]);

  useEffect(() => { load(); }, [load]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{BUCKET_TITLES[bucket] || 'Leads'}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{total} leads · tap to open</Text>
            <Pressable onPress={onClose} style={[styles.close, { borderColor: colors.border }]}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView style={{ maxHeight: 480 }}>
              {leads.map((l) => (
                <Pressable
                  key={l.lead_id}
                  onPress={() => setOpenLead(l.lead_id)}
                  style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{l.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{l.phone}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <StageBadge stage={l.stage} />
                    {l.budget ? (
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                        {formatBudgetStringLakhs(l.budget) ? `${formatBudgetStringLakhs(l.budget)} L` : l.budget}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
      <LeadDetailModal
        leadId={openLead}
        visible={openLead != null}
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
