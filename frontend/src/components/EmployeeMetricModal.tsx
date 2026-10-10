import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { WorkflowStatusBadge } from './Badge';
import { formatPhoneDisplay } from '../lib/leadContact';
import { platformLabel } from '../lib/constants';

const METRIC_LABELS: Record<string, string> = {
  total: 'Total Leads (Backlog)',
  new_leads: 'New Leads — Not Yet Updated',
  missed_leads: 'Missed Lead',
  hot: 'Hot',
  cold: 'Cold Leads',
  site_visit_assigned: 'Site Visit Assigned',
  assigned_for_visit: 'Site Visit Assigned',
  visited: 'Visited — Mark Visited Only',
  not_interested: 'Not Interested',
  booking_done: 'Booking Done',
  low_budget: 'Low Budget',
  ringing: 'Ringing',
  follow_ups: 'Follow Up',
  today_follow_ups: 'Due Today (subset of Follow Up)',
  today_activity: 'Today Activity',
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

function formatDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const [leads, setLeads] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [report, setReport] = useState<any[]>([]);
  const [kind, setKind] = useState<'leads' | 'today_report' | 'bookings'>('leads');
  const [total, setTotal] = useState(0);
  const [actionTotal, setActionTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!visible || !employeeId || !metric) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/leads/employee/${employeeId}/metric/${metric}`, { params: { limit: 500 } });
      const responseKind = res.data?.kind;
      setKind(responseKind === 'today_report' ? 'today_report' : responseKind === 'bookings' ? 'bookings' : 'leads');
      setLeads(res.data?.leads || []);
      setBookings(res.data?.bookings || []);
      setReport(res.data?.report || []);
      setTotal(Number(res.data?.total || 0));
      setActionTotal(Number(res.data?.action_total || 0));
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      setLoadError(
        status === 403 || status === 400
          ? (typeof detail === 'string' ? detail : 'This box could not be loaded.')
          : 'Could not reach the server. Tap Retry to try again.'
      );
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
        ) : loadError ? (
          <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.negative} />
            <Text style={{ color: colors.textMuted, textAlign: 'center', fontSize: 13, maxWidth: 280 }}>
              {loadError}
            </Text>
            <Pressable
              onPress={load}
              style={({ pressed }) => [
                styles.retryBtn,
                { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Retry</Text>
            </Pressable>
          </View>
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
        ) : isWide ? (
          <>
            <View style={[styles.tableHeader, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.th, styles.colIndex, { color: colors.textMuted }]}>#</Text>
              <Text style={[styles.th, styles.colName, { color: colors.textMuted }]}>Name</Text>
              <Text style={[styles.th, styles.colContact, { color: colors.textMuted }]}>Contact</Text>
              <Text style={[styles.th, styles.colSource, { color: colors.textMuted }]}>Source</Text>
              <Text style={[styles.th, styles.colStatus, { color: colors.textMuted }]}>Status</Text>
              <Text style={[styles.th, styles.colDate, { color: colors.textMuted }]}>Date</Text>
              <Text style={[styles.th, styles.colLocation, { color: colors.textMuted }]}>Location</Text>
            </View>
            <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
              {leads.map((l, index) => (
                <Pressable
                  key={l.lead_id}
                  testID={`emp-metric-lead-${l.lead_id}`}
                  onPress={() => openLead(l.lead_id)}
                  style={({ pressed }) => [styles.tableRow, {
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.primary + '08' : colors.surfaceAlt,
                  }]}
                >
                  <Text style={[styles.td, styles.colIndex, { color: colors.textMuted }]}>{index + 1}</Text>
                  <Text style={[styles.td, styles.colName, { color: colors.text, fontWeight: '700' }]} numberOfLines={2}>{l.name}</Text>
                  <Text style={[styles.td, styles.colContact, { color: colors.textSecondary }]} numberOfLines={2}>
                    {formatPhoneDisplay(l.phone) || '—'}{l.email ? `\n${l.email}` : ''}
                    {l.budget ? `\n${l.budget} L` : ''}
                  </Text>
                  <Text style={[styles.td, styles.colSource, { color: colors.textMuted }]} numberOfLines={2}>
                    {platformLabel(l.platform || l.source)}
                  </Text>
                  <View style={styles.colStatus}>
                    <WorkflowStatusBadge lead={l} />
                  </View>
                  <Text style={[styles.td, styles.colDate, { color: colors.textMuted }]}>{formatDate(l.created_at)}</Text>
                  <Text style={[styles.td, styles.colLocation, { color: colors.textSecondary }]} numberOfLines={2}>
                    {l.location || '—'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : (
          <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
            {leads.map((l) => (
              <Pressable
                key={l.lead_id}
                testID={`emp-metric-lead-${l.lead_id}`}
                onPress={() => openLead(l.lead_id)}
                style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{l.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatPhoneDisplay(l.phone) || '—'}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>
                    {platformLabel(l.platform || l.source)}
                    {' · '}{formatDate(l.created_at)}
                    {l.location ? ` · ${l.location}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <WorkflowStatusBadge lead={l} />
                  {l.budget ? <Text style={{ color: colors.textMuted, fontSize: 10 }}>{l.budget} L</Text> : null}
                </View>
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
  card: { width: '100%', maxWidth: 920, maxHeight: '85%', borderRadius: 12, borderWidth: 1, padding: 18 },
  header: { marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  close: { position: 'absolute', right: 0, top: 0, width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8, alignItems: 'center', gap: 10 },
  reportCard: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 10,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
    ...Platform.select({ web: { cursor: 'pointer' as any }, default: {} }),
  },
  th: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  td: { fontSize: 12, lineHeight: 17 },
  colIndex: { width: 30, minWidth: 30, flexGrow: 0, flexShrink: 0, textAlign: 'right' },
  colName: { flex: 1.2, minWidth: 120 },
  colContact: { flex: 1, minWidth: 120 },
  colSource: { flex: 0.7, minWidth: 80 },
  colStatus: { flex: 0.9, minWidth: 96 },
  colDate: { flex: 0.8, minWidth: 88 },
  colLocation: { flex: 0.9, minWidth: 100 },
});
