import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, getSnapshot, setSnapshot, broadcastDataChanged } from '../../src/lib/api';
import { useLiveRefresh } from '../../src/hooks/useLiveRefresh';
import { roleLabel, isAdmin } from '../../src/lib/constants';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { formatBudgetStringLakhs, workflowStatusColor, workflowStatusLabel } from '../../src/lib/leadFormat';
import {
  AssignLeadsAdvancedModal,
  AssignWorkspaceFilters,
  STATUS_ACTIONS,
  inquiryStatusLabel,
} from '../../src/components/AssignLeadsAdvancedModal';
import { parseInquiryStatusFilter } from '../../src/lib/inquiryStatusFilter';
import { Ionicons } from '@expo/vector-icons';
import { SearchableSelect } from '../../src/components/SearchableSelect';
import { leadIdsFromSelectionIndices, parseCustomLeadSelection } from '../../src/lib/assignLeadSelection';

const DEFAULT_FILTERS: AssignWorkspaceFilters = {
  inquiry_status: 'all',
  source: 'all',
  assigned_to: 'all',
  q: '',
  location: '',
};

const UNASSIGNED_FILTERS: AssignWorkspaceFilters = {
  inquiry_status: 'all',
  source: 'all',
  assigned_to: 'unassigned',
  q: '',
  location: '',
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
  const cachedAssign = getSnapshot<any>('assign-leads-page');
  const [leads, setLeads] = useState<any[]>(cachedAssign?.leads ?? []);
  const [employees, setEmployees] = useState<any[]>(cachedAssign?.employees ?? []);
  const [assignmentStats, setAssignmentStats] = useState<any[]>(cachedAssign?.assignmentStats ?? []);
  const [total, setTotal] = useState(cachedAssign?.total ?? 0);
  const [facets, setFacets] = useState<any>(cachedAssign?.facets ?? null);
  const [filters, setFilters] = useState<AssignWorkspaceFilters>(DEFAULT_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(!cachedAssign);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEmployeeId, setBulkEmployeeId] = useState<string | null>(null);
  const [bulkStatusAction, setBulkStatusAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [customSelectInput, setCustomSelectInput] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canDeleteLeads = isAdmin(user?.role);

  const load = useCallback(async (activeFilters = filters) => {
    try {
      const [ws, s] = await Promise.all([
        api.get('/leads/assign-workspace', { params: activeFilters }),
        api.get('/stats/assignment'),
      ]);
      const nextLeads = ws.data?.leads || [];
      const nextEmployees = ws.data?.employees || [];
      const nextTotal = Number(ws.data?.total ?? 0);
      const nextFacets = ws.data?.facets || null;
      const nextStats = s.data?.employees || [];
      setLeads(nextLeads);
      setEmployees(nextEmployees);
      setTotal(nextTotal);
      setFacets(nextFacets);
      setAssignmentStats(nextStats);
      setSelected(new Set());
      setBulkEmployeeId(null);
      setBulkStatusAction(null);
      const isDefault = activeFilters.inquiry_status === 'all' && activeFilters.source === 'all'
        && activeFilters.assigned_to === 'all' && !activeFilters.q && !activeFilters.location;
      if (isDefault) {
        setSnapshot('assign-leads-page', {
          leads: nextLeads, employees: nextEmployees, total: nextTotal, facets: nextFacets, assignmentStats: nextStats,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const employeeOptions = useMemo(
    () => employees.map((e) => ({
      key: e.employee_id,
      label: e.name,
      sublabel: roleLabel(e.role),
    })),
    [employees],
  );

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = leads.length > 0 && selected.size === leads.length;
  const unassignedCount = facets?.inquiry_status?.unassigned ?? 0;

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    parseInquiryStatusFilter(filters.inquiry_status).forEach((key) => {
      chips.push(inquiryStatusLabel(key));
    });
    if (filters.source !== 'all') chips.push(filters.source === 'meta' ? 'Facebook' : filters.source);
    if (filters.assigned_to === 'unassigned') chips.push('Unassigned');
    else if (filters.assigned_to !== 'all') {
      const emp = employees.find((e) => e.employee_id === filters.assigned_to);
      chips.push(emp?.name || 'Employee');
    }
    if (filters.q.trim()) chips.push(`Search: "${filters.q.trim()}"`);
    if (filters.location.trim()) chips.push(`Location: ${filters.location.trim()}`);
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

  const applyCustomSelection = (merge: boolean) => {
    const { indices, error } = parseCustomLeadSelection(customSelectInput, leads.length);
    if (error) {
      setMessage(error);
      return;
    }
    const ids = leadIdsFromSelectionIndices(leads, indices);
    if (ids.length === 0) {
      setMessage('No leads matched that selection.');
      return;
    }
    setSelected((prev) => {
      if (!merge) return new Set(ids);
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    const first = indices[0] + 1;
    const last = indices[indices.length - 1] + 1;
    const rangeLabel = indices.length === 1
      ? `#${first}`
      : first === 1 && last === indices.length
        ? `first ${indices.length}`
        : `#${first}–#${last}`;
    setMessage(merge
      ? `Added ${ids.length} lead(s) (${rangeLabel}) to selection.`
      : `Selected ${ids.length} lead(s) (${rangeLabel}).`);
  };

  const applyFilters = (next: AssignWorkspaceFilters) => {
    setFilters(next);
    setShowAdvanced(false);
    if (leads.length === 0) setLoading(true);
    load(next);
  };

  const showUnassignedLeads = () => {
    applyFilters(UNASSIGNED_FILTERS);
  };

  const showAllLeads = () => {
    applyFilters(DEFAULT_FILTERS);
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

  const confirmDelete = (count: number, nameHint?: string) => {
    const label = count === 1 && nameHint ? `"${nameHint}"` : `${count} lead(s)`;
    const msg = `Permanently delete ${label}? This removes visits, bookings, loans, and activity history. This cannot be undone.`;
    if (typeof window !== 'undefined' && window.confirm) {
      return window.confirm(msg);
    }
    return true;
  };

  const deleteLeads = async (leadIds: string[], nameHint?: string) => {
    if (!canDeleteLeads || leadIds.length < 1) return;
    if (!confirmDelete(leadIds.length, nameHint)) return;
    setDeleteBusy(true);
    setMessage(null);
    try {
      const r = await api.post('/leads/bulk-delete', { lead_ids: leadIds });
      const n = Number(r.data?.deleted_count ?? 0);
      const skipped = (r.data?.skipped || []).length;
      setMessage(skipped > 0 ? `Deleted ${n} lead(s). ${skipped} skipped (not found).` : `Deleted ${n} lead(s).`);
      setSelected(new Set());
      broadcastDataChanged();
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Delete failed.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const isUnassignedView = filters.assigned_to === 'unassigned';

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Assign Leads"
        subtitle="Advanced search · all leads · reassign not-interested · bulk status change"
        rightAction={
          <Pressable
            onPress={() => { setLoading(true); load(); }}
            disabled={loading}
            style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: loading ? 0.6 : 1 }]}
          >
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        }
      />
      {loading && leads.length === 0 ? (
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
              {isUnassignedView ? (
                <Pressable
                  onPress={showAllLeads}
                  style={[styles.advancedBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                >
                  <Ionicons name="close-circle-outline" size={16} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontWeight: '600', fontSize: 12 }}>Show all leads</Text>
                </Pressable>
              ) : null}
              {activeFilterChips.length > 0 ? (
                <Pressable
                  onPress={showAllLeads}
                  style={[styles.advancedBtn, { borderColor: colors.negative + '55', backgroundColor: colors.negative + '10' }]}
                >
                  <Ionicons name="close-circle" size={16} color={colors.negative} />
                  <Text style={{ color: colors.negative, fontWeight: '700', fontSize: 12 }}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>

            {activeFilterChips.length > 0 ? (
              <View style={styles.filterRow}>
                {activeFilterChips.map((chip) => (
                  <Pressable key={chip} onPress={showAllLeads}>
                    <View style={[styles.filterChip, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '35' }]}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>{chip}</Text>
                      <Ionicons name="close" size={12} color={colors.primary} style={{ marginLeft: 4 }} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.summaryRow}>
              <SummaryBox
                colors={colors}
                label="Showing"
                value={total}
                accent={colors.primary}
                icon="list-outline"
                active={!isUnassignedView && filters.inquiry_status === 'all' && filters.source === 'all' && !filters.q.trim() && !filters.location.trim()}
                onPress={showAllLeads}
              />
              <SummaryBox
                colors={colors}
                label="Unassigned"
                value={unassignedCount}
                accent="#6366F1"
                icon="time-outline"
                active={isUnassignedView}
                onPress={showUnassignedLeads}
              />
              <SummaryBox colors={colors} label="Team" value={employees.length} accent="#14B8A6" icon="people-outline" />
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>
                {isUnassignedView ? 'Unassigned leads' : 'All leads'}
              </Text>
              <Text style={[styles.panelSub, { color: colors.textMuted }]}>
                {isUnassignedView
                  ? 'Leads with no employee assigned — pick telecaller from dropdown or use bulk assign below.'
                  : 'Filter not-interested → select → assign to another telecaller. Manager can change status in bulk.'}
              </Text>

              {leads.length > 0 ? (
                <View style={styles.selectToolbar}>
                  <View style={styles.selectToolbarTop}>
                    <Pressable onPress={toggleSelectAll} style={styles.selectAllRow}>
                      <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={20} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                        {allSelected ? 'Clear selection' : `Select all on screen (${leads.length})`}
                      </Text>
                    </Pressable>
                    {canDeleteLeads ? (
                      <Pressable
                        testID="delete-selected-leads-toolbar"
                        onPress={() => {
                          const ids = selectedIds.length > 0 ? selectedIds : leads.map((l) => l.lead_id);
                          deleteLeads(ids);
                        }}
                        disabled={deleteBusy}
                        style={[styles.deleteBtn, {
                          borderColor: colors.negative + '55',
                          backgroundColor: colors.negative + '12',
                          opacity: deleteBusy ? 0.6 : 1,
                        }]}
                      >
                        {deleteBusy ? (
                          <ActivityIndicator color={colors.negative} size="small" />
                        ) : (
                          <>
                            <Ionicons name="trash-outline" size={16} color={colors.negative} />
                            <Text style={{ color: colors.negative, fontSize: 12, fontWeight: '700' }}>
                              {selectedIds.length > 0 ? `Delete (${selectedIds.length})` : 'Delete all on screen'}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={[styles.customSelectRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons name="filter-outline" size={16} color={colors.textMuted} />
                    <TextInput
                      testID="custom-lead-selection-input"
                      value={customSelectInput}
                      onChangeText={setCustomSelectInput}
                      placeholder="10 or 40-50"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="default"
                      style={[styles.customSelectInput, { color: colors.text, borderColor: colors.border }]}
                    />
                    <Pressable
                      testID="custom-lead-selection-apply"
                      onPress={() => applyCustomSelection(false)}
                      style={[styles.customSelectBtn, { backgroundColor: colors.primary }]}
                    >
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Select</Text>
                    </Pressable>
                    <Pressable
                      testID="custom-lead-selection-add"
                      onPress={() => applyCustomSelection(true)}
                      style={[styles.customSelectBtnOutline, { borderColor: colors.primary }]}
                    >
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Add</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>
                    Custom: type 10 for first 10 leads, or 40-50 for leads #40 to #50 on this screen. Use Add to keep current picks.
                  </Text>
                </View>
              ) : null}

              {leads.length === 0 ? (
                <Text style={{ color: colors.textMuted, paddingVertical: 24, textAlign: 'center' }}>
                  {isUnassignedView
                    ? 'No unassigned leads right now.'
                    : 'No leads match these filters. Try Advanced Search or reset filters.'}
                </Text>
              ) : (
                <View style={{ gap: 10, marginTop: 8 }}>
                  {leads.map((lead, index) => {
                    const isSelected = selected.has(lead.lead_id);
                    const statusLabel = workflowStatusLabel(lead);
                    const badgeColor = workflowStatusColor(lead);
                    return (
                      <View
                        key={lead.lead_id}
                        style={[styles.leadRow, {
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? colors.primary + '08' : colors.surfaceAlt,
                        }]}
                      >
                        <Text style={[styles.rowIndex, { color: colors.textMuted }]}>#{index + 1}</Text>
                        <Pressable onPress={() => toggleLead(lead.lead_id)} style={styles.checkHit}>
                          <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={22} color={isSelected ? colors.primary : colors.textMuted} />
                        </Pressable>
                        <View style={{ flex: 1, minWidth: 160 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={[styles.leadName, { color: colors.text }]}>{lead.name}</Text>
                            <View style={[styles.badge, { backgroundColor: badgeColor + '18', borderColor: badgeColor + '44' }]}>
                              <Text style={{ color: badgeColor, fontSize: 9, fontWeight: '700' }}>
                                {statusLabel.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{lead.phone}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                            {[lead.property_type, formatBudgetStringLakhs(lead.budget) ? `${formatBudgetStringLakhs(lead.budget)} L` : null].filter(Boolean).join(' · ') || 'Requirement pending'}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 }}>
                            <Ionicons name="location-outline" size={11} color={colors.textMuted} style={{ marginTop: 1 }} />
                            <Text style={{ color: colors.textSecondary, fontSize: 11, flex: 1 }} numberOfLines={2}>
                              {lead.location || 'Location not set'}
                            </Text>
                          </View>
                          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>
                            {lead.source || '—'} · {lead.employee_name ? `Assigned: ${lead.employee_name}` : 'Unassigned'}
                            {lead.assigned_at ? ` · ${formatDt(lead.assigned_at)}` : ''}
                          </Text>
                        </View>
                        <View style={{ width: 200 }}>
                          <SearchableSelect
                            label=""
                            compact
                            value={lead.assigned_to || ''}
                            options={employeeOptions}
                            onChange={(employeeId) => assignLead(lead.lead_id, employeeId)}
                            placeholder="Assign to…"
                            testID={`assign-lead-${lead.lead_id}`}
                          />
                        </View>
                        <Pressable
                          onPress={() => setOpenLead(lead.lead_id)}
                          style={[styles.openBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                        >
                          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Open</Text>
                        </Pressable>
                        {canDeleteLeads ? (
                          <Pressable
                            testID={`delete-lead-${lead.lead_id}`}
                            onPress={() => deleteLeads([lead.lead_id], lead.name)}
                            disabled={deleteBusy}
                            style={[styles.deleteIconBtn, { borderColor: colors.negative + '44', opacity: deleteBusy ? 0.5 : 1 }]}
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.negative} />
                          </Pressable>
                        ) : null}
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
              <View style={styles.bulkFilters}>
                <View style={{ flex: 1, minWidth: 180 }}>
                  <SearchableSelect
                    label="ASSIGN TO"
                    value={bulkEmployeeId || ''}
                    options={employeeOptions}
                    onChange={(id) => setBulkEmployeeId(id || null)}
                    placeholder="Choose employee…"
                    testID="bulk-assign-employee"
                  />
                </View>
                <View style={{ flex: 1, minWidth: 180 }}>
                  <SearchableSelect
                    label="CHANGE STATUS"
                    value={bulkStatusAction || ''}
                    options={STATUS_ACTIONS.map((a) => ({ key: a.key, label: a.label }))}
                    onChange={(id) => setBulkStatusAction(id || null)}
                    placeholder="Choose status…"
                    testID="bulk-status-action"
                  />
                </View>
              </View>
              <View style={styles.bulkActionsRow}>
                <Pressable
                  onPress={bulkApply}
                  disabled={bulkBusy || deleteBusy || (!bulkEmployeeId && !bulkStatusAction)}
                  style={[styles.bulkGoBtn, {
                    backgroundColor: (bulkEmployeeId || bulkStatusAction) ? colors.primary : colors.textMuted,
                    opacity: bulkBusy || deleteBusy ? 0.7 : 1,
                  }]}
                >
                  {bulkBusy ? <ActivityIndicator color="#fff" size="small" /> : (
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Apply</Text>
                  )}
                </Pressable>
                {canDeleteLeads ? (
                  <Pressable
                    testID="bulk-delete-selected-leads"
                    onPress={() => deleteLeads(selectedIds)}
                    disabled={deleteBusy || bulkBusy}
                    style={[styles.bulkDeleteBtn, {
                      borderColor: colors.negative + '55',
                      backgroundColor: colors.negative + '10',
                      opacity: deleteBusy || bulkBusy ? 0.6 : 1,
                    }]}
                  >
                    {deleteBusy ? <ActivityIndicator color={colors.negative} size="small" /> : (
                      <>
                        <Ionicons name="trash-outline" size={16} color={colors.negative} />
                        <Text style={{ color: colors.negative, fontSize: 12, fontWeight: '700' }}>Delete</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
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

function SummaryBox({ label, value, accent, icon, colors, onPress, active }: any) {
  const box = (
    <>
      <Ionicons name={icon} size={16} color={accent} />
      <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginTop: 6 }}>{label.toUpperCase()}</Text>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{value}</Text>
    </>
  );
  if (!onPress) {
    return (
      <View style={[styles.summaryBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {box}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.summaryBox,
        {
          borderColor: active ? accent : colors.border,
          backgroundColor: active ? accent + '12' : colors.surface,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {box}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  msgBanner: { padding: 12, borderRadius: 8, borderWidth: 1 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  advancedBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryBox: { flex: 1, minWidth: 100, padding: 12, borderRadius: 10, borderWidth: 1 },
  panel: { padding: 16, borderRadius: 12, borderWidth: 1 },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  panelSub: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectToolbar: { marginTop: 12, gap: 8 },
  selectToolbarTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  deleteIconBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  customSelectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, flexWrap: 'wrap',
  },
  customSelectInput: {
    flex: 1, minWidth: 100, height: 36, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 10, fontSize: 13,
  },
  customSelectBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  customSelectBtnOutline: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  rowIndex: { fontSize: 10, fontWeight: '700', width: 28, marginTop: 4, textAlign: 'right' },
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
  bulkFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  bulkActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  bulkSection: { marginBottom: 4 },
  bulkLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  bulkEmpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bulkEmpChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  bulkGoBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  bulkDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1,
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
