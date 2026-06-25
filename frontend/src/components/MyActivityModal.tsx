import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { LeadDetailModal } from './LeadDetailModal';
import { WorkflowStatusBadge } from './Badge';
import { formatBudgetStringLakhs } from '../lib/leadFormat';
import { openPhoneCall, openWhatsApp } from '../lib/leadContact';
import { PanelRefreshButton } from './PanelRefreshButton';

type Props = {
  visible: boolean;
  metric: string | null;
  onClose: () => void;
  userRole?: string | null;
  onChanged?: () => void;
};

function formatWhen(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

export function MyActivityModal({ visible, metric, onClose, userRole, onChanged }: Props) {
  const { colors } = useTheme();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'leads' | 'activities' | 'today_report'>('leads');
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [actionTotal, setActionTotal] = useState(0);
  const [periodHours, setPeriodHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!visible || !metric) return;
    setLoading(true);
    try {
      const res = await api.get(`/stats/me/activity/${metric}`, { params: { limit: 500 } });
      setLabel(res.data?.label || metric);
      const k = res.data?.kind;
      setKind(k === 'today_report' ? 'today_report' : k === 'activities' ? 'activities' : 'leads');
      setItems(res.data?.items || []);
      setTotal(Number(res.data?.total || 0));
      setActionTotal(Number(res.data?.action_total || 0));
      setPeriodHours(Number(res.data?.period_hours || 24));
    } finally {
      setLoading(false);
    }
  }, [visible, metric]);

  useEffect(() => { load(); }, [load]);

  const subtitle = kind === 'today_report'
    ? `${total} lead${total === 1 ? '' : 's'} · ${actionTotal} action${actionTotal === 1 ? '' : 's'} in last ${periodHours}h`
    : `${total} lead${total === 1 ? '' : 's'} · tap to open`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>{label || 'My Activity'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{subtitle}</Text>
            </View>
            <PanelRefreshButton onPress={load} loading={loading} testID="my-activity-refresh" />
            <Pressable onPress={onClose} style={[styles.close, { borderColor: colors.border }]}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : items.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 32, fontSize: 13 }}>
              {kind === 'today_report' ? 'No work logged in the last 24 hours yet.' : 'No items in this category yet.'}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 520 }}>
              {kind === 'today_report' ? items.map((row) => (
                <Pressable
                  key={row.lead_id}
                  testID={`my-today-lead-${row.lead_id}`}
                  onPress={() => setOpenLead(row.lead_id)}
                  style={[styles.reportCard, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{row.lead_name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{row.lead_phone || '—'}</Text>
                      <Text style={{ color: colors.primary, fontSize: 10, marginTop: 4, fontWeight: '600' }}>
                        {row.workflow_status_label || 'Updated'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: colors.positive, fontWeight: '800', fontSize: 16 }}>{row.action_count}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 9 }}>actions</Text>
                    </View>
                  </View>
                  <View style={[styles.actionsList, { borderTopColor: colors.border }]}>
                    {(row.actions || []).map((act: any) => (
                      <View key={act.activity_id || act.created_at} style={styles.actionRow}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.positive} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{act.label}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{formatWhen(act.created_at)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 8 }}>Tap card to open lead</Text>
                </Pressable>
              )) : kind === 'leads' ? items.map((l) => (
                <Pressable
                  key={l.lead_id}
                  testID={`my-activity-lead-${l.lead_id}`}
                  onPress={() => setOpenLead(l.lead_id)}
                  style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{l.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{l.phone || '—'}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 2 }}>
                      {[l.property_type, l.location].filter(Boolean).join(' · ') || l.source || '—'}
                    </Text>
                    {l.budget ? (
                      <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                        {formatBudgetStringLakhs(l.budget) ? `${formatBudgetStringLakhs(l.budget)} L` : l.budget}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <WorkflowStatusBadge lead={l} />
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable onPress={() => openPhoneCall(l.phone)} style={[styles.actionBtn, { borderColor: colors.primary }]}>
                        <Ionicons name="call" size={14} color={colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => openWhatsApp(l.phone)} style={[styles.actionBtn, { borderColor: '#25D366' }]}>
                        <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
                      </Pressable>
                    </View>
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
                      {formatWhen(a.created_at)}
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
  card: { width: '100%', maxWidth: 600, maxHeight: '88%', borderRadius: 12, borderWidth: 1, padding: 18 },
  header: { marginBottom: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  close: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8, alignItems: 'center', gap: 10 },
  reportCard: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  actionsList: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, gap: 6 },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
