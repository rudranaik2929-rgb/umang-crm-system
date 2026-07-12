import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, getSnapshot, setSnapshot, warmUpBackend, isTransientApiError } from '../../src/lib/api';
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

const ASSIGN_PAGE_SIZE = 1000;

/** Bulk bar only — means “do not assign to any employee”. */
export const BULK_ASSIGN_NA = '__na__';

/** Mirror backend inquiry_preset_to_patch for instant UI updates. */
function statusActionPatch(action: string | null | undefined): Record<string, any> {
  const key = (action || '').trim().toLowerCase();
  if (!key) return {};
  if (key === 'new') {
    return { status: 'active', stage: 'new', priority: null, call_status: null, follow_up_at: null };
  }
  if (key === 'active') {
    return { status: 'active', stage: 'assigned', call_status: null, follow_up_at: null };
  }
  if (key === 'visited') {
    return { status: 'active', stage: 'site_visit' };
  }
  if (key === 'booked') {
    return { status: 'active', stage: 'booking' };
  }
  if (key === 'ringing') {
    return { status: 'active', stage: 'assigned', call_status: 'ringing' };
  }
  if (key === 'hot') {
    return { status: 'active', stage: 'positive', priority: 'hot' };
  }
  if (key === 'not_interested') {
    return { status: 'negative', call_status: null, follow_up_at: null };
  }
  if (['low_budget', 'other_location', 'already_purchased', 'not_searching'].includes(key)) {
    return { status: 'negative', priority: key, call_status: null, follow_up_at: null };
  }
  return {};
}

function leadStillMatchesAssignFilters(lead: any, filters: AssignWorkspaceFilters): boolean {
  const assignee = (filters.assigned_to || 'all').trim().toLowerCase();
  if (assignee === 'unassigned') {
    const stage = lead?.stage;
    const pr = String(lead?.priority || '').toLowerCase();
    if (['booking', 'loan', 'registration'].includes(stage) || ['handoff_booking', 'handoff_loan'].includes(pr)) {
      return false;
    }
    return !String(lead?.assigned_to || '').trim();
  }
  if (assignee && assignee !== 'all') {
    return String(lead?.assigned_to || '') === assignee;
  }
  const inquiry = (filters.inquiry_status || 'all').trim().toLowerCase();
  if (!inquiry || inquiry === 'all') return true;
  if (inquiry === 'unassigned') return !String(lead?.assigned_to || '').trim();
  if (inquiry === 'not_interested') {
    return lead?.status === 'negative'
      && !['low_budget', 'other_location', 'already_purchased', 'not_searching'].includes(String(lead?.priority || ''));
  }
  if (inquiry === 'ringing') return Boolean(String(lead?.call_status || '').trim());
  if (inquiry === 'visited') return lead?.stage === 'site_visit';
  if (inquiry === 'booked') return ['booking', 'loan', 'registration'].includes(lead?.stage);
  if (inquiry === 'hot') return String(lead?.priority || '') === 'hot';
  if (inquiry === 'new') return !String(lead?.assigned_to || '').trim() && lead?.stage === 'new';
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatLoadError(e: any): string {
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail;
  if (status === 403) {
    return typeof detail === 'string'
      ? detail
      : 'You do not have permission for Assign Leads. Log in as manager or admin.';
  }
  if (status === 401) {
    return 'Session expired. Please sign out and log in again.';
  }
  if (isTransientApiError(e)) {
    return 'Could not reach the server. Tap refresh and try again.';
  }
  return typeof detail === 'string' ? detail : 'Could not load leads. Check connection and retry.';
}

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
  const { user, loading: authLoading } = useAuth();
  const params = useLocalSearchParams<{ openLead?: string }>();
  const cachedAssign = getSnapshot<any>('assign-leads-page');
  const [leads, setLeads] = useState<any[]>(cachedAssign?.leads ?? []);
  const [employees, setEmployees] = useState<any[]>(cachedAssign?.employees ?? []);
  const [assignmentStats, setAssignmentStats] = useState<any[]>(cachedAssign?.assignmentStats ?? []);
  const [total, setTotal] = useState(cachedAssign?.total ?? 0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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

  const selectedRef = React.useRef(selected);
  selectedRef.current = selected;
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;
  const bulkEmployeeIdRef = React.useRef(bulkEmployeeId);
  bulkEmployeeIdRef.current = bulkEmployeeId;
  const bulkStatusActionRef = React.useRef(bulkStatusAction);
  bulkStatusActionRef.current = bulkStatusAction;
  const operationBusyRef = React.useRef(false);
  const leadsCountRef = React.useRef(leads.length);
  leadsCountRef.current = leads.length;
  const leadsRef = React.useRef(leads);
  leadsRef.current = leads;
  const employeesRef = React.useRef(employees);
  employeesRef.current = employees;
  const assignmentStatsRef = React.useRef(assignmentStats);
  assignmentStatsRef.current = assignmentStats;

  const canAccessAssign = isAdmin(user?.role)
    || user?.email === 'htshpatil13@gmail.com'
    || user?.email === 'umang@admin'
    || user?.email === 'rohitsingh241993@gmail.com';

  const canDeleteLeads = isAdmin(user?.role);

  useEffect(() => {
    if (params.openLead) setOpenLead(String(params.openLead));
  }, [params.openLead]);

  const loadRequestRef = React.useRef(0);

  const load = useCallback(async (
    activeFilters: AssignWorkspaceFilters,
    options?: { preserveSelection?: boolean; clearBulk?: boolean; append?: boolean; offset?: number; silent?: boolean },
  ) => {
    const preserveSelection = options?.preserveSelection === true;
    const clearBulk = options?.clearBulk !== false;
    const append = options?.append === true;
    const silent = options?.silent === true;
    const reqOffset = append ? (options?.offset ?? 0) : 0;
    const keptSelection = preserveSelection ? new Set(selectedRef.current) : null;
    const reqId = ++loadRequestRef.current;
    if (append) setLoadingMore(true);
    else if (!silent) setLoading(true);
    if (!append && !preserveSelection && !silent) {
      setLeads([]);
      setHasMore(false);
    }
    const params = {
      inquiry_status: activeFilters.inquiry_status || 'all',
      source: activeFilters.source || 'all',
      assigned_to: activeFilters.assigned_to || 'all',
      q: activeFilters.q?.trim() || '',
      location: activeFilters.location?.trim() || '',
      limit: ASSIGN_PAGE_SIZE,
      offset: reqOffset,
    };

    const fetchWorkspace = async () => {
      let lastErr: any;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          if (attempt > 0) await warmUpBackend(attempt > 1);
          return await api.get('/leads/assign-workspace', { params, bypassCache: true });
        } catch (e: any) {
          lastErr = e;
          if (!isTransientApiError(e) || attempt >= 3) throw e;
          await sleep(900 + attempt * 1500);
        }
      }
      throw lastErr;
    };

    try {
      const ws = await fetchWorkspace();
      let statsRes: any = null;
      if (!append) {
        try {
          statsRes = await api.get('/stats/assignment', { bypassCache: true });
        } catch {
          // Team snapshot is optional — keep leads even if stats fail on slow reload.
        }
      }
      if (reqId !== loadRequestRef.current) return;
      const nextLeads = ws.data?.leads || [];
      const nextEmployees = ws.data?.employees || [];
      const nextTotal = Number(ws.data?.total ?? 0);
      const nextFacets = ws.data?.facets || null;
      const nextHasMore = Boolean(ws.data?.has_more);
      if (append) {
        setLeads((prev) => {
          const ids = new Set(prev.map((l) => l.lead_id));
          return [...prev, ...nextLeads.filter((l: any) => !ids.has(l.lead_id))];
        });
      } else {
        setLeads(nextLeads);
        setEmployees(nextEmployees);
        setFacets(nextFacets);
        if (statsRes) setAssignmentStats(statsRes.data?.employees || []);
      }
      setTotal(nextTotal);
      setHasMore(nextHasMore);
      if (!silent) setMessage(null);
      if (!append && preserveSelection && keptSelection) {
        const visible = new Set(nextLeads.map((l: any) => l.lead_id));
        setSelected(new Set([...keptSelection].filter((id) => visible.has(id))));
      } else if (!append && !preserveSelection) {
        setSelected(new Set());
        if (clearBulk) {
          setBulkEmployeeId(null);
          setBulkStatusAction(null);
        }
      }
      const isDefault = params.inquiry_status === 'all' && params.source === 'all'
        && params.assigned_to === 'all' && !params.q && !params.location;
      if (isDefault && !append) {
        setSnapshot('assign-leads-page', {
          leads: nextLeads,
          employees: nextEmployees.length ? nextEmployees : employeesRef.current,
          total: nextTotal,
          facets: nextFacets,
          assignmentStats: statsRes ? (statsRes.data?.employees || []) : assignmentStatsRef.current,
        });
      }
    } catch (e: any) {
      if (reqId !== loadRequestRef.current) return;
      if (silent && leadsCountRef.current > 0) return;
      setMessage(formatLoadError(e));
    } finally {
      if (reqId === loadRequestRef.current) {
        if (append) setLoadingMore(false);
        else if (!silent) setLoading(false);
      }
    }
  }, []);

  const loadRef = React.useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!canAccessAssign) {
      setLoading(false);
      setMessage('Assign Leads is for managers and admins only. Switch role or log in with a manager account.');
      return;
    }
    void warmUpBackend().finally(() => loadRef.current(filters));
  }, [filters, authLoading, user, canAccessAssign]);

  const employeeOptions = useMemo(
    () => employees.map((e) => ({
      key: e.employee_id,
      label: e.name,
      sublabel: roleLabel(e.role),
    })),
    [employees],
  );

  const bulkEmployeeOptions = useMemo(
    () => [
      { key: BULK_ASSIGN_NA, label: 'N/A', sublabel: 'Do not assign to anyone' },
      ...employeeOptions,
    ],
    [employeeOptions],
  );

  const bulkCanApply = Boolean(
    bulkStatusAction
    || (bulkEmployeeId && bulkEmployeeId !== BULK_ASSIGN_NA)
    || bulkEmployeeId === BULK_ASSIGN_NA,
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
    setMessage(null);
    setShowAdvanced(false);
    setFilters({
      inquiry_status: next.inquiry_status || 'all',
      source: next.source || 'all',
      assigned_to: next.assigned_to || 'all',
      q: next.q?.trim() || '',
      location: next.location?.trim() || '',
    });
  };

  const showUnassignedLeads = () => {
    applyFilters(UNASSIGNED_FILTERS);
  };

  const showAllLeads = () => {
    applyFilters(DEFAULT_FILTERS);
  };

  const applyOptimisticLeadPatch = (
    leadIds: string[],
    patchForLead: (lead: any) => Record<string, any>,
  ) => {
    const idSet = new Set(leadIds);
    const filtersNow = filtersRef.current;
    let removed = 0;
    const next: any[] = [];
    for (const lead of leadsRef.current) {
      if (!idSet.has(lead.lead_id)) {
        next.push(lead);
        continue;
      }
      const patched = { ...lead, ...patchForLead(lead) };
      if (leadStillMatchesAssignFilters(patched, filtersNow)) {
        next.push(patched);
      } else {
        removed += 1;
      }
    }
    leadsRef.current = next;
    setLeads(next);
    if (removed > 0) {
      setTotal((t) => Math.max(0, Number(t) - removed));
    }
  };

  const assignLead = async (leadId: string, employeeId: string) => {
    const emp = employeesRef.current.find((e) => e.employee_id === employeeId);
    const snapshot = leadsRef.current.filter((l) => l.lead_id === leadId);
    setBusyId(leadId);
    setMessage(null);
    operationBusyRef.current = true;
    applyOptimisticLeadPatch([leadId], (lead) => ({
      assigned_to: employeeId,
      assigned_at: new Date().toISOString(),
      employee_name: emp?.name || lead.employee_name,
      stage: lead.stage === 'new' ? 'assigned' : lead.stage,
      status: lead.status === 'negative' ? 'active' : lead.status,
    }));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(leadId);
      return next;
    });
    try {
      await api.post('/leads/bulk-manage', {
        lead_ids: [leadId],
        assigned_to: employeeId,
        reactivate: true,
      }, { timeout: 120000 });
      void load(filtersRef.current, { preserveSelection: true, clearBulk: false, silent: true });
    } catch (e: any) {
      if (snapshot.length) {
        setLeads((prev) => {
          const others = prev.filter((l) => l.lead_id !== leadId);
          return [...snapshot, ...others];
        });
        setTotal((t) => Math.max(Number(t), snapshot.length));
      }
      setMessage(e?.response?.data?.detail || 'Assign failed.');
    } finally {
      operationBusyRef.current = false;
      setBusyId(null);
    }
  };

  const bulkApply = async (overrides?: { employeeId?: string | null; statusAction?: string | null }) => {
    const leadIds = Array.from(selectedRef.current);
    const employeeId = overrides?.employeeId !== undefined ? overrides.employeeId : bulkEmployeeIdRef.current;
    const statusAction = overrides?.statusAction !== undefined ? overrides.statusAction : bulkStatusActionRef.current;
    if (leadIds.length < 1) {
      setMessage('Select at least one lead.');
      return;
    }
    const isNa = employeeId === BULK_ASSIGN_NA;
    if (!employeeId && !statusAction) {
      setMessage('Choose an employee, N/A, and/or status action, then tap Apply.');
      return;
    }

    const unassignOnly = isNa && !statusAction;
    const assignTo = !isNa && employeeId ? employeeId : undefined;
    const emp = assignTo ? employeesRef.current.find((e) => e.employee_id === assignTo) : null;
    const statusPatch = statusActionPatch(statusAction);
    const snapshot = leadsRef.current.filter((l) => leadIds.includes(l.lead_id));
    const count = leadIds.length;

    // Instant UI: update list + clear selection before waiting on network.
    operationBusyRef.current = true;
    applyOptimisticLeadPatch(leadIds, (lead) => {
      const next: Record<string, any> = { ...statusPatch };
      if (unassignOnly) {
        next.assigned_to = null;
        next.assigned_at = null;
        next.assigned_by = null;
        next.employee_name = null;
      } else if (assignTo) {
        next.assigned_to = assignTo;
        next.assigned_at = new Date().toISOString();
        next.employee_name = emp?.name || lead.employee_name;
        if ((lead.stage === 'new' || !lead.stage) && !statusPatch.stage) {
          next.stage = 'assigned';
        }
        if (lead.status === 'negative' && !statusPatch.status) {
          next.status = 'active';
        }
      }
      return next;
    });
    setSelected(new Set());
    setBulkEmployeeId(null);
    setBulkStatusAction(null);
    setBulkBusy(false);
    setMessage(
      unassignOnly
        ? `Cleared assignment for ${count} lead(s).`
        : assignTo
          ? `Assigned ${count} lead(s)${statusAction ? ' · status updated' : ''}.`
          : `Updated status for ${count} lead(s).`,
    );

    const payload = unassignOnly
      ? { lead_ids: leadIds, unassign: true, reactivate: true }
      : {
          lead_ids: leadIds,
          assigned_to: assignTo,
          inquiry_action: statusAction || undefined,
          reactivate: true,
        };

    void (async () => {
      try {
        const r = await api.post('/leads/bulk-manage', payload, { timeout: 120000 });
        const n = Number(r.data?.updated_count ?? count);
        const skipped = (r.data?.skipped || []).length;
        if (skipped > 0) {
          setMessage(n > 0 ? `Updated ${n} lead(s). ${skipped} skipped.` : `No leads updated. ${skipped} skipped.`);
        }
        void load(filtersRef.current, { preserveSelection: false, clearBulk: true, silent: true });
      } catch (e: any) {
        setLeads((prev) => {
          const ids = new Set(snapshot.map((l) => l.lead_id));
          const others = prev.filter((l) => !ids.has(l.lead_id));
          return [...snapshot, ...others];
        });
        leadsRef.current = [...snapshot, ...leadsRef.current.filter((l) => !leadIds.includes(l.lead_id))];
        setTotal((t) => Math.max(Number(t), snapshot.length));
        setMessage(e?.response?.data?.detail || e?.message || 'Bulk update failed — list restored.');
      } finally {
        operationBusyRef.current = false;
      }
    })();
  };

  const quickAssignTo = async (employeeId: string) => {
    setBulkEmployeeId(employeeId);
    if (selectedRef.current.size < 1) return;
    if (bulkStatusActionRef.current) {
      setMessage('Status action selected — use Apply to update employee + status together.');
      return;
    }
    await bulkApply({ employeeId });
  };

  const loadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    load(filtersRef.current, { append: true, offset: leads.length, preserveSelection: true, clearBulk: false });
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
    operationBusyRef.current = true;
    try {
      const r = await api.post('/leads/bulk-delete', { lead_ids: leadIds });
      const n = Number(r.data?.deleted_count ?? 0);
      const skipped = (r.data?.skipped || []).length;
      setMessage(skipped > 0 ? `Deleted ${n} lead(s). ${skipped} skipped (not found).` : `Deleted ${n} lead(s).`);
      setSelected(new Set());
      await load(filtersRef.current, { preserveSelection: false });
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Delete failed.');
    } finally {
      operationBusyRef.current = false;
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
            onPress={() => { setLoading(true); load(filtersRef.current, { preserveSelection: true, clearBulk: false }); }}
            disabled={loading}
            style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: loading ? 0.6 : 1 }]}
          >
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        }
      />
      {loading && leads.length === 0 && !message ? (
        <View style={{ padding: 48, alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Loading leads…</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.content, selectedIds.length > 0 ? { paddingBottom: 140 } : null]}>
            {message ? (
              <View style={[styles.msgBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' }]}>
                <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>{message}</Text>
                <Pressable
                  onPress={() => load(filtersRef.current, { preserveSelection: true, clearBulk: false })}
                  style={[styles.retryInline, { borderColor: colors.primary }]}
                >
                  <Ionicons name="refresh" size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Retry</Text>
                </Pressable>
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
                {isUnassignedView ? 'Unassigned leads' : 'Filtered leads'}
              </Text>
              <Text style={[styles.panelSub, { color: colors.textMuted }]}>
                {loading && leads.length === 0
                  ? 'Loading leads from server…'
                  : total > 0
                    ? `Showing ${leads.length} of ${total} matching lead${total === 1 ? '' : 's'}`
                    : isUnassignedView
                      ? 'Leads with no employee assigned — pick telecaller from dropdown or use bulk assign below.'
                      : 'No leads match these filters — try Advanced Search or Clear filters.'}
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
              {hasMore ? (
                <Pressable
                  testID="assign-load-more"
                  onPress={loadMore}
                  disabled={loadingMore}
                  style={[styles.loadMoreBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '10', opacity: loadingMore ? 0.7 : 1 }]}
                >
                  {loadingMore ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                      Load more ({total - leads.length} remaining)
                    </Text>
                  )}
                </Pressable>
              ) : null}
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
                    options={bulkEmployeeOptions}
                    onChange={(id) => setBulkEmployeeId(id || null)}
                    placeholder="Choose employee or N/A…"
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
              <View style={styles.bulkEmpRow}>
                {employeeOptions.slice(0, 12).map((emp) => (
                  <Pressable
                    key={emp.key}
                    testID={`bulk-assign-chip-${emp.key}`}
                    disabled={bulkBusy || deleteBusy}
                    onPress={() => quickAssignTo(emp.key)}
                    style={[styles.bulkEmpChip, {
                      borderColor: bulkEmployeeId === emp.key ? colors.primary : colors.border,
                      backgroundColor: bulkEmployeeId === emp.key ? colors.primary + '14' : colors.surfaceAlt,
                      opacity: bulkBusy || deleteBusy ? 0.6 : 1,
                    }]}
                  >
                    <Text style={{
                      color: bulkEmployeeId === emp.key ? colors.primary : colors.text,
                      fontSize: 11,
                      fontWeight: '700',
                    }} numberOfLines={1}>
                      {emp.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                Pick N/A to change status only or clear assignment. Tap a chip to assign instantly, or pick options and Apply.
              </Text>
              <View style={styles.bulkActionsRow}>
                <Pressable
                  onPress={() => bulkApply()}
                  disabled={bulkBusy || deleteBusy || !bulkCanApply}
                  style={[styles.bulkGoBtn, {
                    backgroundColor: bulkCanApply ? colors.primary : colors.textMuted,
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
        onChanged={() => load(filtersRef.current, { preserveSelection: true, clearBulk: false })}
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
  msgBanner: { padding: 12, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  retryInline: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
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
    zIndex: 50,
    elevation: 12,
  },
  bulkFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  bulkActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  bulkSection: { marginBottom: 4 },
  bulkLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  bulkEmpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bulkEmpChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  bulkGoBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  loadMoreBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  bulkDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1,
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
