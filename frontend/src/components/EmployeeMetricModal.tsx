import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { WorkflowStatusBadge } from './Badge';

const METRIC_LABELS: Record<string, string> = {
  total: 'Total Leads (Backlog)',
  new_leads: 'New Leads — Not Yet Updated',
  missed_leads: 'Missed Lead',
  hot: 'Hot',
  cold: 'Cold Leads',
  visited: 'Visited — Mark Visited Only',
  not_interested: 'Not Interested',
  booking_done: 'Booking Done',
  low_budget: 'Low Budget',
  ringing: 'Ringing',
  follow_ups: 'Follow Up',
  today_follow_ups: 'Due Today (subset of Follow Up)',
  today_activity: 'Today Activity — Last 24 Hours',
  login_file: 'Login File',
  sanctioned: 'Sanctioned',
  registration: 'Registration',
  disbursement: 'Disbursement',
  bill_submitted: 'Bill Submitted',
  amount_received: 'Amt Received',
};

type Props = {
  visible: boolean;
  employeeId: string | null;
  employeeName?: string;
  metric: string | null;
  onClose: () => void;
  userRole?: string | null;
  onChanged?: () => void;
  onOpenLead?: (leadId: string) => void;
};

function formatWhen(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

export function EmployeeMetricModal({
  visible,
  employeeId,
  employeeName,
  metric,
  onClose,
  onChanged,
  onOpenLead,
}: Props) {
  const { colors } = useTheme();
  const [leads, setLeads] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [report, setReport] = useState<any[]>([]);
  const [kind, setKind] = useState<'leads' | 'today_report' | 'bookings'>('leads');
  const [total, setTotal] = useState(0);
  const [actionTotal, setActionTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!visible || !employeeId || !metric) return;
    setLoading(true);
    try {
      const res = await api.get(`/leads/employee/${employeeId}/metric/${metric}`, { params: { limit: 500 } });
      const responseKind = res.data?.kind;
      setKind(responseKind === 'today_report' ? 'today_report' : responseKind === 'bookings' ? 'bookings' : 'leads');
      setLeads(res.data?.leads || []);
      setBookings(res.data?.bookings || []);
      setReport(res.data?.report || []);
      setTotal(Number(res.data?.total || 0));
      setActionTotal(Number(res.data?.action_total || 0));
    } finally {
      setLoading(false);
    }
  }, [visible, employeeId, metric]);

  useEffect(() => { load(); }, [load]);

  const openLead = (leadId?: string | null) => {
    if (!leadId) return;
    onChanged?.();
    onOpenLead?.(leadId);
  };

  const metricLabel = METRIC_LABELS[metric || ''] || metric || 'Leads';
  const title = employeeName ? `${employeeName} — ${metricLabel}` : metricLabel;
  const subtitle = kind === 'today_report'
    ? `${total} lead${total === 1 ? '' : 's'} · ${actionTotal} actions (24h)`
    : kind === 'bookings'
      ? `${total} booking${total === 1 ? '' : 's'} · tap to open lead`
      : `${total} lead${total === 1 ? '' : 's'} · tap to open`;

  if (!visible) return null;

  const body = (
    <View style={styles.backdrop} pointerEvents="box-none">
      <Pressable style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]} onPress={onClose} />
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            position: 'relative',
            zIndex: 2,
            elevation: 8,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{subtitle}</Text>
          <Pressable onPress={onClose} style={[styles.close, { borderColor: colors.border }]}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
        ) : kind === 'today_report' ? (
          report.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 32, fontSize: 13 }}>
              No work logged in the last 24 hours.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
              {report.map((row) => (
                <Pressable
                  key={row.lead_id}
                  onPress={() => openLead(row.lead_id)}
                  style={[styles.reportCard, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{row.lead_name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{row.lead_phone || '—'} · {row.workflow_status_label}</Text>
                  {(row.actions || []).map((act: any) => (
                    <Text key={act.activity_id || act.created_at} style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
                      • {act.label} ({formatWhen(act.created_at)})
                    </Text>
                  ))}
                </Pressable>
              ))}
            </ScrollView>
          )
        ) : kind === 'bookings' ? (
          bookings.length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 32, fontSize: 13 }}>
              No bookings in this category.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
              {bookings.map((b) => (
                <Pressable
                  key={b.booking_id}
                  onPress={() => openLead(b.lead_id)}
                  style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{b.lead_name || b.property_name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{b.property_name || '—'} · {(b.status || 'active').toUpperCase()}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </ScrollView>
          )
        ) : leads.length === 0 ? (
          <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 32, fontSize: 13 }}>
            No leads in this category.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
            {leads.map((l) => (
              <Pressable
                key={l.lead_id}
                testID={`emp-metric-lead-${l.lead_id}`}
                onPress={() => openLead(l.lead_id)}
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
      </View>
    </View>
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return createPortal(
      <View
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9000,
          backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
        } as any}
      >
        {body}
      </View>,
      document.body,
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 560, maxHeight: '85%', borderRadius: 12, borderWidth: 1, padding: 18 },
  header: { marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  close: { position: 'absolute', right: 0, top: 0, width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8, alignItems: 'center', gap: 10 },
  reportCard: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
});
