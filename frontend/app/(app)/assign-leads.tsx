import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { roleLabel } from '../../src/lib/constants';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { formatBudgetStringLakhs } from '../../src/lib/leadFormat';
import {
  AssignLeadsAdvancedModal,
  AssignWorkspaceFilters,
  STATUS_ACTIONS,
  inquiryStatusLabel,
} from '../../src/components/AssignLeadsAdvancedModal';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_FILTERS: AssignWorkspaceFilters = {
  inquiry_status: 'all',
  source: 'all',
  assigned_to: 'all',
  q: '',
};

function formatDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

const INQUIRY_COLORS: Record<string, string> = {
  active: '#0EA5E9',
  new: '#6366F1',
  unassigned: '#6366F1',
  visited: '#14B8A6',
  booked: '#22C55E',
  ringing: '#F97316',
  not_interested: '#E11D48',
  hot: '#EF4444',
  low_budget: '#A855F7',
};

export default function AssignLeads() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [assignmentStats, setAssignmentStats] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<any>(null);
  const [filters, setFilters] = useState<AssignWorkspaceFilters>(DEFAULT_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEmployeeId, setBulkEmployeeId] = useState<string | null>(null);
  const [bulkStatusAction, setBulkStatusAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (activeFilters = filters) => {
    setLoading(true);
    try {
      const [ws, s] = await Promise.all([
        api.get('/leads/assign-workspace', { params: activeFilters }),
        api.get('/stats/assignment'),
      ]);
      setLeads(ws.data?.leads || []);
      setEmployees(ws.data?.employees || []);
      setTotal(Number(ws.data?.total ?? 0));
      setFacets(ws.data?.facets || null);
      setAssignmentStats(s.data?.employees || []);
      setSelected(new Set());
      setBulkEmployeeId(null);
      setBulkStatusAction(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = leads.length > 0 && selected.size === leads.length;
  const unassignedCount = facets?.inquiry_status?.unassigned ?? 0;

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (filters.inquiry_status !== 'all') chips.push(inquiryStatusLabel(filters.inquiry_status));
    if (filters.source !== 'all') chips.push(filters.source === 'meta' ? 'Facebook' : filters.source);
    if (filters.assigned_to === 'unassigned') chips.push('Unassigned');
    else if (filters.assigned_to !== 'all') {
      const emp = employees.find((e) => e.employee_id === filters.assigned_to);
      chips.push(emp?.name || 'Employee');
    }
    if (filters.q.trim()) chips.push(`"${filters.q.trim()}"`);
    return chips;
  }, [filters, employees]);

  const toggleLead = (leadId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(leads.map((l) => l.lead_id)));
  };

  const applyFilters = (next: AssignWorkspaceFilters) => {
    setFilters(next);
    setShowAdvanced(false);
    load(next);
  };

  const assignLead = async (leadId: string, employeeId: string) => {
    setBusyId(leadId);
    setMessage(null);
    try {
      await api.post('/leads/bulk-manage', {
        lead_ids: [leadId],
        assigned_to: employeeId,
        reactivate: true,
      });
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Assign failed.');
    } finally {
      setBusyId(null);
    }
  };

  const bulkApply = async () => {
    if (selectedIds.length < 1) {
      setMessage('Select at least one lead.');
      return;
    }
    if (!bulkEmployeeId && !bulkStatusAction) {
      setMessage('Choose an employee and/or status action.');
      return;
    }
    setBulkBusy(true);
    setMessage(null);
    try {
      const r = await api.post('/leads/bulk-manage', {
        lead_ids: selectedIds,
        assigned_to: bulkEmployeeId || undefined,
        inquiry_action: bulkStatusAction || undefined,
        reactivate: true,
      });
      const n = Number(r.data?.updated_count ?? 0);
      setMessage(`Updated ${n} lead(s).`);
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Bulk update failed.');
    } finally {
      setBulkBusy(false);
    }
  };

  const autoAssignAll = async () => {
    setBulkBusy(true);
    setMessage(null);
    try {
      const r = await api.post('/leads/assign-queue/auto', {});
      const n = Number(r.data?.assigned_count ?? 0);
      setMessage(n > 0 ? `Distributed ${n} unassigned lead(s).` : 'No unassigned leads.');
      await load({ ...filters, inquiry_status: 'unassigned', assigned_to: 'unassigned' });
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Distribute failed.');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Assign Leads"
        subtitle="Advanced search · all leads · reassign not-interested · bulk status change"
      />
      {loading ? (
        <View style={{ padding: 48 }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.content, selectedIds.length > 0 ? { paddingBottom: 140 } : null]}>
            {message ? (
              <View style={[styles.msgBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' }]}>
                <Text style={{ color: colors.text, fontSize: 12 }}>{message}</Text>
              </View>
            ) : null}

            <View style={styles.toolbar}>
              <Pressable
                onPress={() => setShowAdvanced(true)}
                style={[styles.advancedBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}
              >
                <Ionicons name="options-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Advanced Search</Text>
              </Pressable>
              {unassignedCount > 0 ? (
                <Pressable
                  onPress={autoAssignAll}
                  disabled={bulkBusy}
                  style={[styles.distributeBtn, { borderColor: colors.positive, backgroundColor: colors.positive + '10' }]}
                >
                  <Ionicons name="flash-outline" size={16} color={colors.positive} />
                  <Text style={{ color: colors.positive, fontSize: 12, fontWeight: '700' }}>Distribute ({unassignedCount})</Text>
                </Pressable>
              ) : null}
            </View>

            {activeFilterChips.length > 0 ? (
              <View style={styles.filterRow}>
                {activeFilterChips.map((chip) => (
                  <View key={chip} style={[styles.filterChip, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '35' }]}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>{chip}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.summaryRow}>
              <SummaryBox colors={colors} label="Showing" value={total} accent={colors.primary} icon="list-outline" />
              <SummaryBox colors={colors} label="Unassigned" value={unassignedCount} accent="#6366F1" icon="time-outline" />
              <SummaryBox colors={colors} label="Team" value={employees.length} accent="#14B8A6" icon="people-outline" />
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>All leads</Text>
              <Text style={[styles.panelSub, { color: colors.textMuted }]}>
                Filter not-interested → select → assign to another telecaller. Manager can change status in bulk.
              </Text>

              {leads.length > 0 ? (
                <Pressable onPress={toggleSelectAll} style={styles.selectAllRow}>
                  <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={20} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                    {allSelected ? 'Clear selection' : `Select all on screen (${leads.length})`}
                  </Text>
                </Pressable>
              ) : null}

              {leads.length === 0 ? (
                <Text style={{ color: colors.textMuted, paddingVertical: 24, textAlign: 'center' }}>
                  No leads match these filters. Try Advanced Search or reset filters.
                </Text>
              ) : (
                <View style={{ gap: 10, marginTop: 8 }}>
                  {leads.map((lead) => {
                    const isSelected = selected.has(lead.lead_id);
                    const badgeKey = lead.inquiry_status || 'active';
                    const badgeColor = INQUIRY_COLORS[badgeKey] || colors.primary;
                    return (
                      <View
                        key={lead.lead_id}
                        style={[styles.leadRow, {
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? colors.primary + '08' : colors.surfaceAlt,
                        }]}
                      >
                        <Pressable onPress={() => toggleLead(lead.lead_id)} style={styles.checkHit}>
                          <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={22} color={isSelected ? colors.primary : colors.textMuted} />
                        </Pressable>
                        <View style={{ flex: 1, minWidth: 160 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={[styles.leadName, { color: colors.text }]}>{lead.name}</Text>
                            <View style={[styles.badge, { backgroundColor: badgeColor + '18', borderColor: badgeColor + '44' }]}>
                              <Text style={{ color: badgeColor, fontSize: 9, fontWeight: '700' }}>
                                {inquiryStatusLabel(badgeKey).toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{lead.phone}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                            {lead.source} · {formatBudgetStringLakhs(lead.budget) || '—'}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>
                            {lead.employee_name ? `Assigned: ${lead.employee_name}` : 'Unassigned'}
                            {lead.assigned_at ? ` · ${formatDt(lead.assigned_at)}` : ''}
                          </Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assignChips}>
                          {employees.map((emp) => (
                            <Pressable
                              key={emp.employee_id}
                              disabled={busyId === lead.lead_id || bulkBusy}
                              onPress={() => assignLead(lead.lead_id, emp.employee_id)}
                              style={[styles.assignChip, {
                                borderColor: lead.assigned_to === emp.employee_id ? colors.positive : colors.primary,
                                backgroundColor: (lead.assigned_to === emp.employee_id ? colors.positive : colors.primary) + '12',
                              }]}
                            >
                              <Text style={{
                                color: lead.assigned_to === emp.employee_id ? colors.positive : colors.primary,
                                fontSize: 11,
                                fontWeight: '600',
                              }}>
                                {emp.name?.split(' ')[0]}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                        <Pressable
                          onPress={() => setOpenLead(lead.lead_id)}
                          style={[styles.openBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                        >
                          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Open</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {assignmentStats.length > 0 ? (
              <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>Team snapshot</Text>
                <View style={styles.empGrid}>
                  {assignmentStats.slice(0, 8).map((emp) => (
                    <Pressable
                      key={emp.employee_id}
                      onPress={() => applyFilters({ ...filters, assigned_to: emp.employee_id })}
                      style={[styles.empCard, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                    >
                      <Text style={[styles.empName, { color: colors.text }]} numberOfLines={1}>{emp.name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>{roleLabel(emp.role)}</Text>
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 6 }}>
                        {emp.assigned_total ?? 0} leads
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>

          {selectedIds.length > 0 ? (
            <View style={[styles.bulkBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{selectedIds.length} selected</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 72 }}>
                <View style={styles.bulkSection}>
                  <Text style={[styles.bulkLabel, { color: colors.textMuted }]}>ASSIGN TO</Text>
                  <View style={styles.bulkEmpRow}>
                    {employees.map((emp) => {
                      const active = bulkEmployeeId === emp.employee_id;
                      return (
                        <Pressable
                          key={emp.employee_id}
                          onPress={() => setBulkEmployeeId(active ? null : emp.employee_id)}
                          style={[styles.bulkEmpChip, {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? colors.primary + '18' : colors.surfaceAlt,
                          }]}
                        >
                          <Text style={{ color: active ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>
                            {emp.name?.split(' ')[0]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={[styles.bulkSection, { marginLeft: 12 }]}>
                  <Text style={[styles.bulkLabel, { color: colors.textMuted }]}>CHANGE STATUS</Text>
                  <View style={styles.bulkEmpRow}>
                    {STATUS_ACTIONS.map((act) => {
                      const active = bulkStatusAction === act.key;
                      return (
                        <Pressable
                          key={act.key}
                          onPress={() => setBulkStatusAction(active ? null : act.key)}
                          style={[styles.bulkEmpChip, {
                            borderColor: active ? colors.warning : colors.border,
                            backgroundColor: active ? colors.warning + '18' : colors.surfaceAlt,
                          }]}
                        >
                          <Text style={{ color: active ? colors.warning : colors.text, fontSize: 10, fontWeight: '600' }}>
                            {act.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
              <Pressable
                onPress={bulkApply}
                disabled={bulkBusy || (!bulkEmployeeId && !bulkStatusAction)}
                style={[styles.bulkGoBtn, {
                  backgroundColor: (bulkEmployeeId || bulkStatusAction) ? colors.primary : colors.textMuted,
                  opacity: bulkBusy ? 0.7 : 1,
                }]}
              >
                {bulkBusy ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Apply</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      )}

      <AssignLeadsAdvancedModal
        visible={showAdvanced}
        filters={filters}
        facets={facets}
        employees={employees}
        onClose={() => setShowAdvanced(false)}
        onApply={applyFilters}
      />

      <LeadDetailModal
        leadId={openLead}
        visible={openLead !== null}
        onClose={() => setOpenLead(null)}
        onChanged={() => load()}
        userRole={user?.role}
      />
    </View>
  );
}

function SummaryBox({ label, value, accent, icon, colors }: any) {
  return (
    <View style={[styles.summaryBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Ionicons name={icon} size={16} color={accent} />
      <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginTop: 6 }}>{label.toUpperCase()}</Text>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  msgBanner: { padding: 12, borderRadius: 8, borderWidth: 1 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  advancedBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  distributeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryBox: { flex: 1, minWidth: 100, padding: 12, borderRadius: 10, borderWidth: 1 },
  panel: { padding: 16, borderRadius: 12, borderWidth: 1 },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  panelSub: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  leadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, flexWrap: 'wrap' },
  checkHit: { padding: 2, marginTop: 2 },
  leadName: { fontSize: 14, fontWeight: '700' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  assignChips: { flexDirection: 'row', gap: 6, alignItems: 'center', maxWidth: 300 },
  assignChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  openBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  empGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  empCard: { width: 140, padding: 10, borderRadius: 8, borderWidth: 1 },
  empName: { fontSize: 12, fontWeight: '700' },
  bulkBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  bulkSection: { marginBottom: 4 },
  bulkLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  bulkEmpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bulkEmpChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  bulkGoBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, alignItems: 'center', alignSelf: 'flex-end' },
});
