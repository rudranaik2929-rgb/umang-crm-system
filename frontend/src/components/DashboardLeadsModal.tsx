import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { LeadDetailModal } from './LeadDetailModal';
import { WorkflowStatusBadge } from './Badge';
import { formatBudgetStringLakhs } from '../lib/leadFormat';
import { platformLabel, roleLabel } from '../lib/constants';
import { SearchableSelect } from './SearchableSelect';
import { parseInquiryStatusFilter, serializeInquiryStatusFilter } from '../lib/inquiryStatusFilter';
import { useMainContentOverlayStyle } from '../layout/SidebarLayoutContext';

const BUCKET_TITLES: Record<string, string> = {
  all: 'Total Leads',
  new_today: 'New Today (Unassigned)',
  positive: 'Positive Leads',
  not_interested: 'Not Interested',
  registration: 'Registration',
  booking: 'Bookings & Loans',
  follow_up: 'Follow Ups Scheduled',
  ringing: 'Ringing Leads',
};

const SOURCE_OPTIONS = [
  { key: 'housing', label: platformLabel('housing'), color: '#00BFA5' },
  { key: 'meta', label: platformLabel('meta'), color: '#1877F2' },
  { key: 'manual', label: platformLabel('manual'), color: '#6366F1' },
  { key: 'other', label: platformLabel('other'), color: '#64748B' },
];

type Props = {
  visible: boolean;
  bucket: string;
  onClose: () => void;
  userRole?: string | null;
  onChanged?: () => void;
  employees?: any[];
};

function formatDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DashboardLeadsModal({ visible, bucket, onClose, userRole, onChanged, employees: employeesProp }: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const overlayStyle = useMainContentOverlayStyle();
  const isWide = windowWidth >= 960;
  const [leads, setLeads] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [employees, setEmployees] = useState<any[]>(employeesProp || []);
  const [assignedTo, setAssignedTo] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const loadRef = useRef(0);

  useEffect(() => {
    if (visible) {
      setAssignedTo('all');
      setSourceFilter('all');
    }
  }, [visible, bucket]);

  useEffect(() => {
    if (employeesProp?.length) setEmployees(employeesProp);
  }, [employeesProp]);

  const employeeOptions = useMemo(
    () => [
      { key: 'all', label: 'All employees' },
      ...employees.map((e) => ({
        key: e.employee_id,
        label: e.name,
        sublabel: roleLabel(e.role),
      })),
    ],
    [employees],
  );

  const selectedSources = useMemo(() => new Set(parseInquiryStatusFilter(sourceFilter)), [sourceFilter]);

  const toggleSource = (key: string) => {
    const next = new Set(selectedSources);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSourceFilter(serializeInquiryStatusFilter(Array.from(next)));
  };

  const load = useCallback(async () => {
    if (!visible || !bucket) return;
    const reqId = ++loadRef.current;
    setLoading(true);
    try {
      const params: Record<string, string> = { bucket, limit: '500' };
      if (assignedTo && assignedTo !== 'all') params.assigned_to = assignedTo;
      if (sourceFilter && sourceFilter !== 'all') params.source = sourceFilter;
      const res = await api.get('/leads/filtered', { params });
      if (reqId !== loadRef.current) return;
      setLeads(res.data?.leads || []);
      setTotal(Number(res.data?.total || 0));
      if (Array.isArray(res.data?.employees) && res.data.employees.length) {
        setEmployees(res.data.employees);
      }
    } finally {
      if (reqId === loadRef.current) setLoading(false);
    }
  }, [visible, bucket, assignedTo, sourceFilter]);

  useEffect(() => { load(); }, [load]);

  if (!visible) return null;

  const title = BUCKET_TITLES[bucket] || 'Leads';
  const sourceSummary = selectedSources.size
    ? SOURCE_OPTIONS.filter((o) => selectedSources.has(o.key)).map((o) => o.label).join(' · ')
    : 'All sources';

  const content = (
    <View style={[overlayStyle, st.fullScreen, { backgroundColor: colors.background }]}>
      <View style={st.contentShell}>
      <View style={[st.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[st.title, { color: colors.text }]}>{title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
            {loading ? 'Loading…' : `${total} leads · ${sourceSummary}`}
          </Text>
        </View>
        <Pressable onPress={onClose} style={[st.closeBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={[st.filtersPanel, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={st.filterBlock}>
          <Text style={[st.filterLabel, { color: colors.textMuted }]}>EMPLOYEE</Text>
          <View style={{ minWidth: 220, maxWidth: 320, flex: 1 }}>
            <SearchableSelect
              label=""
              compact
              value={assignedTo}
              options={employeeOptions}
              onChange={(id) => setAssignedTo(id || 'all')}
              placeholder="All employees"
              testID="dashboard-leads-employee-filter"
            />
          </View>
        </View>
        <View style={[st.filterBlock, { flex: 1 }]}>
          <Text style={[st.filterLabel, { color: colors.textMuted }]}>SOURCE (MULTI)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.sourceRow}>
            <Pressable
              onPress={() => setSourceFilter('all')}
              style={[st.sourceChip, {
                borderColor: selectedSources.size === 0 ? colors.primary : colors.border,
                backgroundColor: selectedSources.size === 0 ? colors.primary + '18' : colors.surfaceAlt,
              }]}
            >
              <Text style={{ color: selectedSources.size === 0 ? colors.primary : colors.text, fontSize: 11, fontWeight: '700' }}>
                All
              </Text>
            </Pressable>
            {SOURCE_OPTIONS.map((opt) => {
              const active = selectedSources.has(opt.key);
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => toggleSource(opt.key)}
                  style={[st.sourceChip, {
                    borderColor: active ? opt.color : colors.border,
                    backgroundColor: active ? opt.color + '18' : colors.surfaceAlt,
                  }]}
                >
                  <Ionicons name={active ? 'checkbox' : 'square-outline'} size={14} color={active ? opt.color : colors.textMuted} />
                  <Text style={{ color: active ? opt.color : colors.text, fontSize: 11, fontWeight: active ? '700' : '500' }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      <View style={st.body}>
        {loading ? (
          <View style={st.centerBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.textMuted, marginTop: 12 }}>Loading leads…</Text>
          </View>
        ) : leads.length === 0 ? (
          <View style={st.centerBox}>
            <Text style={{ color: colors.textMuted }}>No leads match these filters.</Text>
          </View>
        ) : (
          <ScrollView style={st.list} contentContainerStyle={st.listContent} showsVerticalScrollIndicator>
            {isWide ? (
              <View style={[st.tableHeader, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                <Text style={[st.th, st.colName, { color: colors.textMuted }]}>Name</Text>
                <Text style={[st.th, st.colContact, { color: colors.textMuted }]}>Contact</Text>
                <Text style={[st.th, st.colEmployee, { color: colors.textMuted }]}>Employee</Text>
                <Text style={[st.th, st.colSource, { color: colors.textMuted }]}>Source</Text>
                <Text style={[st.th, st.colStatus, { color: colors.textMuted }]}>Status</Text>
                <Text style={[st.th, st.colDate, { color: colors.textMuted }]}>Date</Text>
              </View>
            ) : null}
            {leads.map((l) => {
              const budget = formatBudgetStringLakhs(l.budget);
              if (isWide) {
                return (
                  <Pressable
                    key={l.lead_id}
                    onPress={() => setOpenLead(l.lead_id)}
                    style={({ pressed }) => [st.tableRow, {
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.primary + '08' : colors.surface,
                    }]}
                  >
                    <Text style={[st.td, st.colName, { color: colors.text, fontWeight: '700' }]} numberOfLines={2}>{l.name}</Text>
                    <Text style={[st.td, st.colContact, { color: colors.textSecondary }]} numberOfLines={2}>
                      {l.phone}{l.email ? `\n${l.email}` : ''}
                    </Text>
                    <Text style={[st.td, st.colEmployee, { color: colors.textMuted }]} numberOfLines={2}>
                      {l.employee_name || 'Unassigned'}
                    </Text>
                    <Text style={[st.td, st.colSource, { color: colors.textMuted }]} numberOfLines={2}>
                      {platformLabel(l.platform || l.source)}
                    </Text>
                    <View style={[st.colStatus, st.td]}>
                      <WorkflowStatusBadge lead={l} />
                    </View>
                    <Text style={[st.td, st.colDate, { color: colors.textMuted }]}>
                      {bucket === 'follow_up' && l.follow_up_at
                        ? new Date(l.follow_up_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : formatDate(l.created_at)}
                    </Text>
                  </Pressable>
                );
              }
              return (
                <Pressable
                  key={l.lead_id}
                  onPress={() => setOpenLead(l.lead_id)}
                  style={[st.row, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{l.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{l.phone}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>
                      {l.employee_name ? `Assigned: ${l.employee_name}` : 'Unassigned'}
                      {' · '}{platformLabel(l.platform || l.source)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <WorkflowStatusBadge lead={l} />
                    {bucket === 'follow_up' && l.follow_up_at ? (
                      <Text style={{ color: '#F97316', fontSize: 10, fontWeight: '600' }}>
                        {new Date(l.follow_up_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    ) : null}
                    {budget ? (
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>{budget} L</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
      </View>

      <LeadDetailModal
        leadId={openLead}
        visible={openLead != null}
        onClose={() => setOpenLead(null)}
        onChanged={() => { load(); onChanged?.(); }}
        userRole={userRole}
        overlayZIndex={10050}
      />
    </View>
  );

  if (Platform.OS === 'web') return content;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const st = StyleSheet.create({
  fullScreen: {
    flex: 1,
  },
  contentShell: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  closeBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filtersPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    alignItems: 'flex-end',
  },
  filterBlock: { gap: 6, minWidth: 220 },
  filterLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  sourceRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  body: { flex: 1, minHeight: 0, paddingHorizontal: 20, paddingBottom: 16, width: '100%' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  list: { flex: 1 },
  listContent: { paddingVertical: 12, gap: 8 },
  row: { flexDirection: 'row', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8, alignItems: 'center', gap: 10 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 10,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
    ...Platform.select({ web: { cursor: 'pointer' as any }, default: {} }),
  },
  th: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  td: { fontSize: 12, lineHeight: 17 },
  colName: { flex: 1.1, minWidth: 120 },
  colContact: { flex: 1, minWidth: 110 },
  colEmployee: { flex: 0.9, minWidth: 100 },
  colSource: { flex: 0.8, minWidth: 90 },
  colStatus: { flex: 0.9, minWidth: 100 },
  colDate: { flex: 0.8, minWidth: 90 },
});
