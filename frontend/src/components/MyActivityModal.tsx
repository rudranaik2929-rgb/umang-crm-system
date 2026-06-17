import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { LeadDetailModal } from './LeadDetailModal';
import { WorkflowStatusBadge } from './Badge';
import { formatBudgetStringLakhs } from '../lib/leadFormat';

type Props = {
  visible: boolean;
  metric: string | null;
  onClose: () => void;
  userRole?: string | null;
  onChanged?: () => void;
};

export function MyActivityModal({ visible, metric, onClose, userRole, onChanged }: Props) {
  const { colors } = useTheme();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'leads' | 'activities'>('leads');
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!visible || !metric) return;
    setLoading(true);
    try {
      const res = await api.get(`/stats/me/activity/${metric}`, { params: { limit: 500 } });
      setLabel(res.data?.label || metric);
      setKind(res.data?.kind === 'activities' ? 'activities' : 'leads');
      setItems(res.data?.items || []);
      setTotal(Number(res.data?.total || 0));
    } finally {
      setLoading(false);
    }
  }, [visible, metric]);

  useEffect(() => { load(); }, [load]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{label || 'My Activity'}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{total} item{total === 1 ? '' : 's'} · tap to open lead</Text>
            <Pressable onPress={onClose} style={[styles.close, { borderColor: colors.border }]}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : items.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 32, fontSize: 13 }}>
              No items in this category yet.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 480 }}>
              {kind === 'leads' ? items.map((l) => (
                <Pressable
                  key={l.lead_id}
                  testID={`my-activity-lead-${l.lead_id}`}
                  onPress={() => setOpenLead(l.lead_id)}
                  style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{l.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{l.phone || '—'}</Text>
                    {l.source ? <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{l.source}</Text> : null}
                    {l.location ? <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{l.location}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <WorkflowStatusBadge lead={l} />
                    {l.follow_up_at ? (
                      <Text style={{ color: colors.warning, fontSize: 10, fontWeight: '600' }}>
                        FU: {new Date(l.follow_up_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    ) : null}
                    {l.budget ? (
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                        {formatBudgetStringLakhs(l.budget) ? `${formatBudgetStringLakhs(l.budget)} L` : l.budget}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              )) : items.map((a) => (
                <Pressable
                  key={a.activity_id}
                  testID={`my-activity-act-${a.activity_id}`}
                  onPress={() => a.lead_id ? setOpenLead(a.lead_id) : undefined}
                  style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: a.lead_id ? 1 : 0.85 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 13 }}>{a.text}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                      {new Date(a.created_at).toLocaleString('en-IN')}
                      {a.lead_name ? ` · ${a.lead_name}` : ''}
                    </Text>
                  </View>
                  {a.lead_id ? <Ionicons name="chevron-forward" size={16} color={colors.primary} /> : null}
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
