import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, getSnapshot, setSnapshot, warmUpBackend, isTransientApiError } from '../../src/lib/api';
import {
  roleLabel,
  regionsLabel,
  isAdminRole,
  isSupervisor,
  canDeleteLeads as canDeleteLeadsFor,
} from '../../src/lib/constants';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { formatBudgetStringLakhs, workflowStatusColor, workflowStatusLabel, isMissedLead } from '../../src/lib/leadFormat';
import { formatPhoneDisplay } from '../../src/lib/leadContact';
import {
  AssignLeadsAdvancedModal,
  AssignWorkspaceFilters,
  STATUS_ACTIONS,
  inquiryStatusLabel,
  DEFAULT_ASSIGN_FILTERS,
  normalizeAssignFilters,
  isDefaultAssignFilters,
  teamViewLabel,
} from '../../src/components/AssignLeadsAdvancedModal';
import { parseInquiryStatusFilter } from '../../src/lib/inquiryStatusFilter';
import { Ionicons } from '@expo/vector-icons';
import { SearchableSelect } from '../../src/components/SearchableSelect';
import { leadIdsFromSelectionIndices, parseCustomLeadSelection } from '../../src/lib/assignLeadSelection';

const DEFAULT_FILTERS: AssignWorkspaceFilters = DEFAULT_ASSIGN_FILTERS;

const UNASSIGNED_FILTERS: AssignWorkspaceFilters = {
  ...DEFAULT_ASSIGN_FILTERS,
  assigned_to: 'unassigned',
};

const SNAPSHOT_KEY = 'assign-leads-page';

const ASSIGN_PAGE_SIZE = 1000;

/** Bulk bar only — means “do not assign to any employee”. */
export const BULK_ASSIGN_NA = '__na__';

/** Select values that mean "send to this Team Lead's pool" (admin only), so they
 *  can never be confused with an employee id. */
const TEAM_LEAD_KEY_PREFIX = 'tl:';

function teamLeadKey(teamLeadId: string) {
  return `${TEAM_LEAD_KEY_PREFIX}${teamLeadId}`;
}

function teamLeadIdFromKey(key?: string | null): string | null {
  if (!key || !key.startsWith(TEAM_LEAD_KEY_PREFIX)) return null;
  return key.slice(TEAM_LEAD_KEY_PREFIX.length) || null;
}

type SkippedLead = { lead_id: string; reason?: string };

type ManageResult = {
  updated: Set<string>;
  skipped: SkippedLead[];
  /** Leads worth retrying (database rejected them, or the server never answered for them). */
  retryIds: string[];
};

/** Read a /leads/bulk-manage response. Only ids in `updated` are treated as done —
 *  a lead in `skipped` (not_found / not_in_team / save_failed) was NOT changed. */
function readManageResult(data: any, requested: string[]): ManageResult {
  const skipped: SkippedLead[] = Array.isArray(data?.skipped)
    ? data.skipped.filter((s: any) => s && s.lead_id).map((s: any) => ({ lead_id: String(s.lead_id), reason: s.reason }))
    : [];
  const skippedIds = new Set(skipped.map((s) => s.lead_id));
  const updated = new Set<string>(
    Array.isArray(data?.updated)
      ? data.updated.map((id: any) => String(id))
      // Older backend without `updated`: everything not skipped went through.
      : requested.filter((id) => !skippedIds.has(id)),
  );
  const retryIds = requested.filter((id) => {
    if (updated.has(id)) return false;
    const reason = skipped.find((s) => s.lead_id === id)?.reason;
    return !reason || reason === 'save_failed';
  });
  return { updated, skipped, retryIds };
}

function skipReasonText(reason?: string): string {
  if (reason === 'save_failed') return 'NOT saved (database error)';
  if (reason === 'not_in_team') return 'not in your team';
  if (reason === 'not_found') return 'lead no longer exists';
  if (reason === 'already_assigned') return 'already with that person';
  return reason ? `skipped (${reason})` : 'not saved';
}

/** "Assigned 48 · 2 NOT saved (database error) — they are still selected, press Apply again". */
function describeManageResult(result: ManageResult, doneText: string, retryHint: string): string {
  const parts = [doneText];
  const byReason = new Map<string, number>();
  result.skipped.forEach((s) => {
    if (result.updated.has(s.lead_id)) return;
    const key = s.reason || 'unknown';
    byReason.set(key, (byReason.get(key) || 0) + 1);
  });
  const failed = byReason.get('save_failed') || 0;
  if (failed > 0) parts.push(`${failed} ${skipReasonText('save_failed')}${retryHint ? ` — ${retryHint}` : ''}`);
  byReason.forEach((n, reason) => {
    if (reason === 'save_failed') return;
    parts.push(`${n} skipped — ${skipReasonText(reason === 'unknown' ? undefined : reason)}`);
  });
  return parts.join(' · ');
}

function confirmAction(msg: string): boolean {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(msg);
  }
  return true;
}

/** Team / Show filters the list can check locally (region needs the server). */
function leadMatchesTeamFilters(lead: any, filters: AssignWorkspaceFilters, adminView: boolean): boolean {
  const teamLeadId = String(lead?.team_lead_id || '');
  // A Team Lead only ever sees their own team: a lead sent back to the admin pool leaves their list.
  if (!adminView && !teamLeadId) return false;
  const team = (filters.team || 'all').trim();
  if (adminView && team && team !== 'all') {
    if (team === 'admin_pool') {
      if (teamLeadId) return false;
    } else if (teamLeadId !== team) {
      return false;
    }
  }
  const hasEmployee = Boolean(String(lead?.assigned_to || '').trim());
  if (filters.team_view === 'pool' && hasEmployee) return false;
  if (filters.team_view === 'assigned' && !hasEmployee) return false;
  return true;
}

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
  if (key === 'cold') {
    return { status: 'active', stage: 'positive', priority: 'cold', call_status: null, follow_up_at: null };
  }
  if (key === 'not_interested') {
    return { status: 'negative', call_status: null, follow_up_at: null };
  }
  if (['low_budget', 'other_location', 'already_purchased', 'not_searching'].includes(key)) {
    return { status: 'negative', priority: key, call_status: null, follow_up_at: null };
  }
  return {};
}

// Mirrors backend classify_company_dashboard_bucket → "open_leads": pipeline leads
// (unassigned, freshly assigned, or in-progress) that have not been worked into a
// classified bucket yet — i.e. not negative/closed, not missed, no ringing/visited/
// follow-up/booking/cold/hot marker.
function isOpenLeadMatch(lead: any): boolean {
  if (!lead || lead?.status === 'negative' || lead?.stage === 'closed') return false;
  if (isMissedLead(lead)) return false;
  const priority = String(lead?.priority || '').toLowerCase();
  if (['hot', 'cold', 'handoff_booking', 'handoff_loan'].includes(priority)) return false;
  if (['booking', 'loan', 'registration', 'site_visit', 'positive'].includes(lead?.stage)) return false;
  if (String(lead?.call_status || '').trim()) return false;
  if (lead?.follow_up_at) return false;
  return true;
}

function leadStillMatchesAssignFilters(lead: any, filters: AssignWorkspaceFilters, adminView: boolean): boolean {
  if (!leadMatchesTeamFilters(lead, filters, adminView)) return false;
  const assignee = (filters.assigned_to || 'all').trim().toLowerCase();
  if (assignee === 'unassigned') {
    // Same shared rule as the box, the list and the Dashboard Open Leads box.
    return isOpenLeadMatch(lead);
  }
  if (assignee && assignee !== 'all') {
    return String(lead?.assigned_to || '') === assignee;
  }
  const inquiryRaw = (filters.inquiry_status || 'all').trim().toLowerCase();
  if (!inquiryRaw || inquiryRaw === 'all') return true;
  const keys = inquiryRaw.split(',').map((s) => s.trim()).filter((s) => s && s !== 'all');
  if (!keys.length) return true;
  return keys.some((inquiry) => {
    // "Unassigned" and "Open Leads" are the SAME box on purpose: both count the
    // open pipeline leads the Dashboard calls Open Leads, so the Assign Leads
    // box, this list, and the Dashboard box can never disagree by a lead.
    if (inquiry === 'unassigned') return isOpenLeadMatch(lead);
    if (inquiry === 'not_interested') {
      return lead?.status === 'negative'
        && !['low_budget', 'other_location', 'already_purchased', 'not_searching'].includes(String(lead?.priority || ''));
    }
    if (inquiry === 'ringing') return Boolean(String(lead?.call_status || '').trim());
    if (inquiry === 'visited') return lead?.stage === 'site_visit';
    if (inquiry === 'booked') return ['booking', 'loan', 'registration'].includes(lead?.stage);
    if (inquiry === 'hot') return String(lead?.priority || '') === 'hot';
    if (inquiry === 'cold') return String(lead?.priority || '') === 'cold';
    if (inquiry === 'missed_leads') return isMissedLead(lead);
    if (inquiry === 'open_leads') return isOpenLeadMatch(lead);
    if (inquiry === 'follow_up') {
      return Boolean(lead?.follow_up_at)
        && !String(lead?.call_status || '').trim()
        && !['hot', 'cold'].includes(String(lead?.priority || '').toLowerCase());
    }
    // `new` = still waiting for an owner, in the new/assigned stage — the same
    // rule the backend classifies with, so a booking flow never re-labels it.
    if (inquiry === 'new') {
      return !String(lead?.assigned_to || '').trim()
        && ['new', 'assigned'].includes(String(lead?.stage || ''));
    }
    // Trust the server's classification when present: it is the single source of
    // truth the box counts are built from, so the list can never drift from the box.
    if (lead?.inquiry_status) return String(lead.inquiry_status).toLowerCase() === inquiry;
    if (inquiry === 'active') return lead?.status !== 'negative' && lead?.stage !== 'closed';
    return true;
  });
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
      : 'You do not have permission for Assign Leads. Log in as a Team Lead or admin.';
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
  open_leads: '#6366F1',
  unassigned: '#6366F1',
  visited: '#14B8A6',
  booked: '#22C55E',
  ringing: '#F97316',
  follow_up: '#F59E0B',
  not_interested: '#E11D48',
  hot: '#EF4444',
  cold: '#64748B',
  missed_leads: '#DC2626',
  low_budget: '#A855F7',
};

export default function AssignLeads() {
  const { colors } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const params = useLocalSearchParams<{ openLead?: string; team?: string; team_view?: string }>();
  // Admin and Team Lead see different leads — never show one's cached list to the other.
  const snapshotKey = `${SNAPSHOT_KEY}:${String(user?.email || '').toLowerCase()}`;
  const snapshotKeyRef = React.useRef(snapshotKey);
  snapshotKeyRef.current = snapshotKey;
  const routeTeam = typeof params.team === 'string' ? params.team.trim() : '';
  const routeTeamView = typeof params.team_view === 'string' ? params.team_view.trim() : '';
  const routeHasFilters = Boolean(routeTeam || routeTeamView);
  const cachedAssign = routeHasFilters ? undefined : getSnapshot<any>(snapshotKey);
  const [leads, setLeads] = useState<any[]>(cachedAssign?.leads ?? []);
  const [employees, setEmployees] = useState<any[]>(cachedAssign?.employees ?? []);
  const [assignmentStats, setAssignmentStats] = useState<any[]>(cachedAssign?.assignmentStats ?? []);
  const [total, setTotal] = useState(cachedAssign?.total ?? 0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [facets, setFacets] = useState<any>(cachedAssign?.facets ?? null);
  const [filters, setFilters] = useState<AssignWorkspaceFilters>(() => normalizeAssignFilters({
    ...DEFAULT_FILTERS,
    team: routeTeam || 'all',
    team_view: ['pool', 'assigned'].includes(routeTeamView) ? routeTeamView : 'all',
  }));
  const [teamLeads, setTeamLeads] = useState<any[]>(cachedAssign?.teamLeads ?? []);
  const [viewer, setViewer] = useState<any>(cachedAssign?.viewer ?? null);
  const [regions, setRegions] = useState<any[]>([]);
  const [autoBusy, setAutoBusy] = useState(false);
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
  const teamLeadsRef = React.useRef(teamLeads);
  teamLeadsRef.current = teamLeads;

  // Admin or Team Lead (the backend limits a Team Lead to their own team).
  const canAccessAssign = isSupervisor(user?.role, user?.email);
  // Admin = company-wide routing (Team Lead pools, admin pool). Prefer what the
  // server says about this session, fall back to the role before the first load.
  const adminView = viewer && typeof viewer.is_admin === 'boolean'
    ? Boolean(viewer.is_admin)
    : isAdminRole(user?.role, user?.email);
  const adminViewRef = React.useRef(adminView);
  adminViewRef.current = adminView;
  // Deleting is permanent — administrators only. Team Leads mark leads not-interested instead.
  const canDeleteLeads = canDeleteLeadsFor(user?.role, user?.email);
  const myTeamId: string | null = viewer?.team_lead_id || user?.team_lead_id || null;
  const teamColumnsReady = viewer?.team_columns_ready !== false;

  useEffect(() => {
    if (params.openLead) setOpenLead(String(params.openLead));
  }, [params.openLead]);

  // Teams page links here with ?team=<team lead id> (or admin_pool). Apply it
  // when the param changes while this screen is already open.
  const appliedRouteRef = React.useRef(`${routeTeam}|${routeTeamView}`);
  useEffect(() => {
    const sig = `${routeTeam}|${routeTeamView}`;
    if (sig === appliedRouteRef.current) return;
    appliedRouteRef.current = sig;
    if (!routeTeam && !routeTeamView) return;
    setMessage(null);
    setFilters(normalizeAssignFilters({
      ...DEFAULT_FILTERS,
      team: routeTeam || 'all',
      team_view: ['pool', 'assigned'].includes(routeTeamView) ? routeTeamView : 'all',
    }));
  }, [routeTeam, routeTeamView]);

  const loadRequestRef = React.useRef(0);
  // Latest request that turned on the full-screen spinner; only it may turn it off
  // (a newer silent reload must not leave the spinner stuck on).
  const spinnerRequestRef = React.useRef(0);

  const load = useCallback(async (
    activeFilters: AssignWorkspaceFilters,
    options?: {
      preserveSelection?: boolean;
      clearBulk?: boolean;
      append?: boolean;
      offset?: number;
      silent?: boolean;
      /** Stay selected even when not on the reloaded first page (e.g. failed bulk ids kept for retry). */
      keepSelectedIds?: string[];
    },
  ) => {
    const preserveSelection = options?.preserveSelection === true;
    const clearBulk = options?.clearBulk !== false;
    const append = options?.append === true;
    const silent = options?.silent === true;
    const reqOffset = append ? (options?.offset ?? 0) : 0;
    const keptSelection = preserveSelection ? new Set(selectedRef.current) : null;
    const alwaysKeep = new Set(options?.keepSelectedIds || []);
    const reqId = ++loadRequestRef.current;
    if (append) setLoadingMore(true);
    else if (!silent) {
      spinnerRequestRef.current = reqId;
      setLoading(true);
    }
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
      team: activeFilters.team || 'all',
      team_view: activeFilters.team_view || 'all',
      region: activeFilters.region?.trim() || '',
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
      const nextAssignable = ws.data?.assignable || [];
      const nextTotal = Number(ws.data?.total ?? 0);
      const nextFacets = ws.data?.facets || null;
      const nextHasMore = Boolean(ws.data?.has_more);
      const nextTeamLeads = Array.isArray(ws.data?.team_leads) ? ws.data.team_leads : null;
      const nextViewer = ws.data?.viewer || null;
      if (append) {
        setLeads((prev) => {
          const ids = new Set(prev.map((l) => l.lead_id));
          return [...prev, ...nextLeads.filter((l: any) => !ids.has(l.lead_id))];
        });
      } else {
        setLeads(nextLeads);
        setEmployees(nextAssignable.length ? nextAssignable : nextEmployees);
        setFacets(nextFacets);
        if (nextTeamLeads) setTeamLeads(nextTeamLeads);
        if (nextViewer) setViewer(nextViewer);
        if (statsRes) setAssignmentStats(statsRes.data?.employees || []);
      }
      setTotal(nextTotal);
      setHasMore(nextHasMore);
      if (!silent) setMessage(null);
      if (!append && preserveSelection && keptSelection) {
        const visible = new Set(nextLeads.map((l: any) => l.lead_id));
        setSelected(new Set([...keptSelection].filter((id) => visible.has(id) || alwaysKeep.has(id))));
      } else if (!append && !preserveSelection) {
        setSelected(new Set());
        if (clearBulk) {
          setBulkEmployeeId(null);
          setBulkStatusAction(null);
        }
      }
      const isDefault = isDefaultAssignFilters(normalizeAssignFilters(activeFilters));
      if (isDefault && !append) {
        setSnapshot(snapshotKeyRef.current, {
          leads: nextLeads,
          employees: (nextAssignable.length ? nextAssignable : nextEmployees).length
            ? (nextAssignable.length ? nextAssignable : nextEmployees)
            : employeesRef.current,
          total: nextTotal,
          facets: nextFacets,
          assignmentStats: statsRes ? (statsRes.data?.employees || []) : assignmentStatsRef.current,
          teamLeads: nextTeamLeads ?? teamLeadsRef.current,
          viewer: nextViewer,
        });
      }
    } catch (e: any) {
      if (reqId !== loadRequestRef.current) return;
      if (silent && leadsCountRef.current > 0) return;
      setMessage(formatLoadError(e));
    } finally {
      // Always clear the flag THIS request set, even if a newer reload superseded it —
      // otherwise Load more / the spinner can stay stuck forever.
      if (append) setLoadingMore(false);
      else if (!silent && reqId === spinnerRequestRef.current) setLoading(false);
    }
  }, []);

  const loadRef = React.useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!canAccessAssign) {
      setLoading(false);
      setMessage('Assign Leads is for Team Leads and admins only. Log in with a Team Lead or admin account.');
      return;
    }
    void warmUpBackend().finally(() => loadRef.current(filters));
  }, [filters, authLoading, user, canAccessAssign]);

  // Regions for the quick area chips and the Advanced Search region filter.
  useEffect(() => {
    if (authLoading || !user || !canAccessAssign) return;
    let cancelled = false;
    api.get('/regions')
      .then((r) => {
        if (!cancelled) setRegions(Array.isArray(r.data?.regions) ? r.data.regions : []);
      })
      .catch(() => { /* region chips are optional */ });
    return () => { cancelled = true; };
  }, [authLoading, user, canAccessAssign]);

  const teamLeadName = useCallback((teamLeadId?: string | null) => {
    if (!teamLeadId) return '';
    const tl = teamLeads.find((t) => t.employee_id === teamLeadId);
    if (tl?.name) return String(tl.name);
    const member = employees.find((e) => e.team_lead_id === teamLeadId && e.team_lead_name);
    return String(member?.team_lead_name || 'Team Lead');
  }, [teamLeads, employees]);

  /** Quick-assign chips and the Advanced Search list: just the person's name. */
  const employeeOptions = useMemo(
    () => employees
      .filter((e) => e && e.employee_id)
      .map((e) => ({
        key: String(e.employee_id),
        label: e.name || e.email || 'Employee',
        sublabel: roleLabel(e.role),
      })),
    [employees],
  );

  /** Admin only: "send to this Team Lead's pool" targets, listed before the employees. */
  const teamLeadOptions = useMemo(
    () => (adminView ? teamLeads : [])
      .filter((tl) => tl && tl.employee_id)
      .map((tl) => {
        const regionsText = Array.isArray(tl.regions) && tl.regions.length ? ` (${regionsLabel(tl.regions)})` : '';
        const members = Number(tl.member_count ?? 0);
        return {
          key: teamLeadKey(String(tl.employee_id)),
          label: `Team Lead · ${tl.name || tl.email || 'Team Lead'}${regionsText}`,
          sublabel: `Send to their team pool · ${members} member${members === 1 ? '' : 's'}`,
        };
      }),
    [adminView, teamLeads],
  );

  /** Per-row "Assign to…" and bulk ASSIGN TO: Team Leads (admin) first, then employees. */
  const assignTargetOptions = useMemo(
    () => [
      ...teamLeadOptions,
      ...employees
        .filter((e) => e && e.employee_id)
        .map((e) => {
          const name = e.name || e.email || 'Employee';
          const team = adminView ? (e.team_lead_name ? `Team ${e.team_lead_name}` : 'No team') : null;
          return {
            key: String(e.employee_id),
            label: [name, roleLabel(e.role), team].filter(Boolean).join(' · '),
            sublabel: adminView ? 'Assign to this person' : undefined,
          };
        }),
    ],
    [teamLeadOptions, employees, adminView],
  );

  const bulkEmployeeOptions = useMemo(
    () => [
      { key: BULK_ASSIGN_NA, label: 'N/A', sublabel: 'Do not assign to anyone (lead stays with its team)' },
      ...assignTargetOptions,
    ],
    [assignTargetOptions],
  );

  const bulkCanApply = Boolean(
    bulkStatusAction
    || (bulkEmployeeId && bulkEmployeeId !== BULK_ASSIGN_NA)
    || bulkEmployeeId === BULK_ASSIGN_NA,
  );

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = leads.length > 0 && selected.size === leads.length;
  const unassignedCount = facets?.inquiry_status?.unassigned ?? 0;
  const teamFacets = facets?.team || null;
  const myTeamFacet = myTeamId ? teamFacets?.teams?.[myTeamId] : null;
  // admin_pool includes not-interested leads auto-distribute never moves; admin_pool_active is what is waiting.
  const adminPoolTotal = Number(teamFacets?.admin_pool ?? 0);
  const adminPoolActive = teamFacets?.admin_pool_active != null
    ? Number(teamFacets.admin_pool_active || 0)
    : adminPoolTotal;
  // Boxes are scoped to this employee when one is picked in Advanced Search.
  const employeeScoped = Boolean(filters.assigned_to)
    && filters.assigned_to !== 'all' && filters.assigned_to !== 'unassigned';
  const selectedEmployeeName = useMemo(() => {
    if (filters.assigned_to === 'all' || filters.assigned_to === 'unassigned') return '';
    const emp = employees.find((e) => e.employee_id === filters.assigned_to);
    return emp?.name || '';
  }, [filters.assigned_to, employees]);
  // Admin: the team picked in Advanced Search / the boxes.
  const selectedTeamName = useMemo(() => {
    if (!adminView) return '';
    if (filters.team === 'admin_pool') return 'Admin pool';
    if (!filters.team || filters.team === 'all') return '';
    return teamLeadName(filters.team);
  }, [adminView, filters.team, teamLeadName]);

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
    if (selectedTeamName) chips.push(filters.team === 'admin_pool' ? 'Admin pool' : `Team: ${selectedTeamName}`);
    if (filters.team_view && filters.team_view !== 'all') chips.push(teamViewLabel(filters.team_view));
    if (filters.region.trim()) chips.push(`Region: ${filters.region.trim()}`);
    if (filters.q.trim()) chips.push(`Search: "${filters.q.trim()}"`);
    if (filters.location.trim()) chips.push(`Location: ${filters.location.trim()}`);
    return chips;
  }, [filters, employees, selectedTeamName]);

  /** Employee cards grouped by team (admin). null = flat list. */
  const snapshotGroups = useMemo(() => {
    if (!adminView || !assignmentStats.some((e) => e?.team_lead_id)) return null;
    const groups = new Map<string, { key: string; name: string; rows: any[] }>();
    for (const emp of assignmentStats) {
      if (!emp?.employee_id) continue;
      const key = emp.team_lead_id ? String(emp.team_lead_id) : '__none__';
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: key === '__none__' ? 'No team' : String(emp.team_lead_name || teamLeadName(key)),
          rows: [],
        });
      }
      groups.get(key)!.rows.push(emp);
    }
    const list = Array.from(groups.values());
    list.forEach((g) => {
      // The Team Lead first, then their people.
      g.rows.sort((a, b) => (a.employee_id === g.key ? -1 : b.employee_id === g.key ? 1 : 0));
    });
    return list.sort((a, b) => {
      if (a.key === '__none__') return 1;
      if (b.key === '__none__') return -1;
      return a.name.localeCompare(b.name);
    });
  }, [adminView, assignmentStats, teamLeadName]);

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

  const applyFilters = (next: Partial<AssignWorkspaceFilters>) => {
    setMessage(null);
    setShowAdvanced(false);
    setFilters(normalizeAssignFilters(next));
  };

  const showUnassignedLeads = () => {
    // With an employee picked, the box counts THAT employee's open leads — open the same list.
    if (employeeScoped) {
      applyFilters({ ...filters, inquiry_status: 'open_leads' });
      return;
    }
    // Keep the team / area scope: the Unassigned count is computed inside it.
    applyFilters({
      ...UNASSIGNED_FILTERS,
      team: filters.team,
      team_view: filters.team_view,
      region: filters.region,
    });
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
      if (leadStillMatchesAssignFilters(patched, filtersNow, adminViewRef.current)) {
        next.push(patched);
      } else {
        removed += 1;
      }
    }
    leadsRef.current = next;
    setLeads(next);
    if (removed > 0) {
      setTotal((t: number) => Math.max(0, Number(t) - removed));
    }
  };

  /** Undo the optimistic change for leads the server did not save, keeping their
   *  original place in the list. */
  const restoreLeadRows = (before: any[], ids: Set<string>) => {
    if (ids.size === 0) return;
    const current = leadsRef.current;
    const currentById = new Map(current.map((l) => [l.lead_id, l]));
    const seen = new Set<string>();
    const next: any[] = [];
    let readded = 0;
    for (const lead of before) {
      if (ids.has(lead.lead_id)) {
        if (!currentById.has(lead.lead_id)) readded += 1;
        next.push(lead);
        seen.add(lead.lead_id);
      } else if (currentById.has(lead.lead_id)) {
        next.push(currentById.get(lead.lead_id));
        seen.add(lead.lead_id);
      }
    }
    for (const lead of current) {
      if (!seen.has(lead.lead_id)) next.push(lead);
    }
    leadsRef.current = next;
    setLeads(next);
    if (readded > 0) setTotal((t: number) => Number(t) + readded);
  };

  /** Optimistic row change for "assign to this employee". */
  const employeeAssignPatch = (lead: any, employeeId: string) => {
    const emp = employeesRef.current.find((e) => e.employee_id === employeeId);
    const patch: Record<string, any> = {
      assigned_to: employeeId,
      assigned_at: new Date().toISOString(),
      employee_name: emp?.name || lead.employee_name,
    };
    if (emp && 'team_lead_id' in emp) {
      // The lead belongs to that employee's team from now on.
      patch.team_lead_id = emp.team_lead_id || null;
      patch.team_lead_name = emp.team_lead_name || null;
    }
    return patch;
  };

  /** Optimistic row change for "send to this Team Lead's pool" (admin). */
  const teamLeadRoutePatch = (lead: any, teamLeadId: string) => {
    const patch: Record<string, any> = {
      team_lead_id: teamLeadId,
      team_lead_name: teamLeadName(teamLeadId),
    };
    const currentEmp = lead.assigned_to
      ? employeesRef.current.find((e) => e.employee_id === lead.assigned_to)
      : null;
    // Backend: an employee from another team is taken off so the lead lands in the new pool.
    if (lead.assigned_to && currentEmp?.team_lead_id !== teamLeadId && lead.assigned_to !== teamLeadId) {
      patch.assigned_to = null;
      patch.assigned_at = null;
      patch.employee_name = null;
      if (lead.stage === 'assigned') patch.stage = 'new';
    }
    return patch;
  };

  const returnToAdminPatch = (lead: any) => ({
    team_lead_id: null,
    team_lead_name: null,
    assigned_to: null,
    assigned_at: null,
    assigned_by: null,
    employee_name: null,
    stage: lead.stage === 'assigned' ? 'new' : lead.stage,
  });

  /** Per-row "Assign to…": an employee id, or `tl:<id>` for a Team Lead's pool. */
  const assignLead = async (leadId: string, targetKey: string) => {
    if (!targetKey) return;
    const tlId = teamLeadIdFromKey(targetKey);
    const before = leadsRef.current;
    setBusyId(leadId);
    setMessage(null);
    operationBusyRef.current = true;
    applyOptimisticLeadPatch([leadId], (lead) => {
      if (tlId) return { ...teamLeadRoutePatch(lead, tlId), status: lead.status === 'negative' ? 'active' : lead.status };
      return {
        ...employeeAssignPatch(lead, targetKey),
        stage: lead.stage === 'new' ? 'assigned' : lead.stage,
        status: lead.status === 'negative' ? 'active' : lead.status,
      };
    });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(leadId);
      return next;
    });
    try {
      const r = await api.post('/leads/bulk-manage', tlId
        ? { lead_ids: [leadId], team_lead_id: tlId, reactivate: true }
        : { lead_ids: [leadId], assigned_to: targetKey, reactivate: true },
      { timeout: 120000 });
      const result = readManageResult(r.data, [leadId]);
      if (!result.updated.has(leadId)) {
        restoreLeadRows(before, new Set([leadId]));
        const reason = result.skipped.find((s) => s.lead_id === leadId)?.reason;
        setMessage(
          reason === 'save_failed'
            ? 'Lead NOT saved (database error) — nothing changed. Pick the person again to retry.'
            : `Lead not changed — ${skipReasonText(reason)}.`,
        );
      } else if (tlId) {
        setMessage(`Sent to ${teamLeadName(tlId)}'s team pool.`);
      }
      void load(filtersRef.current, { preserveSelection: true, clearBulk: false, silent: true });
    } catch (e: any) {
      restoreLeadRows(before, new Set([leadId]));
      setMessage(e?.response?.data?.detail || 'Assign failed — nothing changed.');
    } finally {
      operationBusyRef.current = false;
      setBusyId(null);
    }
  };

  /** Shared bulk path: optimistic update, then trust only the `updated` ids the server returns.
   *  Leads that were not saved go back to how they were and stay selected for a retry. */
  const runBulkManage = (opts: {
    leadIds: string[];
    payload: Record<string, any>;
    patchForLead: (lead: any) => Record<string, any>;
    doneText: (n: number) => string;
    keepBulk?: { employeeId: string | null; statusAction: string | null };
  }) => {
    const { leadIds, payload, patchForLead, doneText, keepBulk } = opts;
    const before = leadsRef.current;
    const count = leadIds.length;

    // Instant UI: update list + clear selection before waiting on network.
    operationBusyRef.current = true;
    applyOptimisticLeadPatch(leadIds, patchForLead);
    setSelected(new Set());
    setBulkEmployeeId(null);
    setBulkStatusAction(null);
    setBulkBusy(false);
    setMessage(`Saving ${count} lead(s)…`);

    const keepForRetry = (ids: string[]) => {
      const next = new Set(ids);
      selectedRef.current = next;
      setSelected(next);
      if (keepBulk && ids.length) {
        setBulkEmployeeId(keepBulk.employeeId);
        setBulkStatusAction(keepBulk.statusAction);
        bulkEmployeeIdRef.current = keepBulk.employeeId;
        bulkStatusActionRef.current = keepBulk.statusAction;
      }
    };

    void (async () => {
      try {
        const r = await api.post('/leads/bulk-manage', payload, { timeout: 120000 });
        const result = readManageResult(r.data, leadIds);
        const notDone = new Set(leadIds.filter((id) => !result.updated.has(id)));
        restoreLeadRows(before, notDone);
        keepForRetry(result.retryIds);
        setMessage(describeManageResult(
          result,
          doneText(result.updated.size),
          'they are still selected, press Apply again',
        ));
        const retrying = result.retryIds.length > 0;
        // Failed ids stay selected even if the reload only shows page 1, so "still selected" stays true.
        void load(filtersRef.current, {
          preserveSelection: retrying,
          clearBulk: !retrying,
          silent: true,
          keepSelectedIds: result.retryIds,
        });
      } catch (e: any) {
        restoreLeadRows(before, new Set(leadIds));
        keepForRetry(leadIds);
        const detail = e?.response?.data?.detail;
        setMessage(
          `${typeof detail === 'string' ? detail : e?.message || 'Bulk update failed'} — nothing was saved; `
          + `the ${count} lead(s) are still selected, press Apply again.`,
        );
      } finally {
        operationBusyRef.current = false;
      }
    })();
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
      setMessage('Choose a Team Lead / employee, N/A, and/or status action, then tap Apply.');
      return;
    }

    const unassignOnly = isNa && !statusAction;
    const tlId = !isNa ? teamLeadIdFromKey(employeeId) : null;
    const assignTo = !isNa && employeeId && !tlId ? employeeId : undefined;
    const emp = assignTo ? employeesRef.current.find((e) => e.employee_id === assignTo) : null;
    const statusPatch = statusActionPatch(statusAction);
    const statusNote = statusAction ? ' · status updated' : '';

    const payload = unassignOnly
      ? { lead_ids: leadIds, unassign: true, reactivate: true }
      : tlId
        ? {
            lead_ids: leadIds,
            team_lead_id: tlId,
            inquiry_action: statusAction || undefined,
            reactivate: true,
          }
        : {
            lead_ids: leadIds,
            assigned_to: assignTo,
            inquiry_action: statusAction || undefined,
            reactivate: true,
          };

    runBulkManage({
      leadIds,
      payload,
      keepBulk: { employeeId: employeeId || null, statusAction: statusAction || null },
      patchForLead: (lead) => {
        const next: Record<string, any> = { ...statusPatch };
        if (unassignOnly) {
          next.assigned_to = null;
          next.assigned_at = null;
          next.assigned_by = null;
          next.employee_name = null;
          if (lead.stage === 'assigned') next.stage = 'new';
        } else if (tlId) {
          Object.assign(next, teamLeadRoutePatch(lead, tlId));
          if (lead.status === 'negative' && !statusPatch.status) next.status = 'active';
        } else if (assignTo) {
          Object.assign(next, employeeAssignPatch(lead, assignTo));
          if ((lead.stage === 'new' || !lead.stage) && !statusPatch.stage) {
            next.stage = 'assigned';
          }
          if (lead.status === 'negative' && !statusPatch.status) {
            next.status = 'active';
          }
        }
        return next;
      },
      doneText: (n) => (unassignOnly
        ? `Cleared assignment for ${n} lead(s)`
        : tlId
          ? `Sent ${n} lead(s) to ${teamLeadName(tlId)}'s team pool${statusNote}`
          : assignTo
            ? `Assigned ${n} lead(s)${emp?.name ? ` to ${emp.name}` : ''}${statusNote}`
            : `Updated status for ${n} lead(s)`),
    });
  };

  const returnToAdminPool = () => {
    const leadIds = Array.from(selectedRef.current);
    if (leadIds.length < 1) {
      setMessage('Select at least one lead.');
      return;
    }
    const ok = confirmAction(
      `Return ${leadIds.length} lead(s) to the admin pool?\n\n`
      + (adminView
        ? 'They are taken off their Team Lead and employee and wait in the admin pool to be routed again.'
        : 'They leave your team (and any employee working them) and go back to the admin, e.g. wrong area.'),
    );
    if (!ok) return;
    runBulkManage({
      leadIds,
      payload: { lead_ids: leadIds, return_to_admin: true },
      patchForLead: returnToAdminPatch,
      doneText: (n) => `Returned ${n} lead(s) to the admin pool`,
    });
  };

  const quickAssignTo = async (targetKey: string) => {
    setBulkEmployeeId(targetKey);
    if (selectedRef.current.size < 1) return;
    if (bulkStatusActionRef.current) {
      setMessage('Status action selected — use Apply to update the assignment + status together.');
      return;
    }
    await bulkApply({ employeeId: targetKey });
  };

  /** POST /leads/assign-queue/auto — admin: admin pool → Team Leads by region;
   *  Team Lead: their pool round-robin across their team. */
  const autoDistribute = async () => {
    if (autoBusy) return;
    const ok = confirmAction(adminView
      ? 'Auto-distribute the admin pool to Team Leads?\n\n'
        + 'Every new lead waiting in the admin pool goes to a Team Lead: a lead whose location matches a '
        + 'Team Lead\'s region goes to that Team Lead, the rest are shared round-robin across Team Leads. '
        + 'Each Team Lead then assigns them to their own employees.'
      : 'Auto-distribute your team pool?\n\n'
        + 'Every new lead waiting in your team pool is shared round-robin across your telecallers and sales executives.');
    if (!ok) return;
    setAutoBusy(true);
    setMessage(null);
    operationBusyRef.current = true;
    try {
      const r = await api.post('/leads/assign-queue/auto', {}, { timeout: 180000 });
      const n = Number(r.data?.assigned_count ?? 0);
      const failed = Number(r.data?.failed_count ?? 0);
      const perTarget: Record<string, number> = r.data?.per_target || {};
      const nameOf = (id: string) => {
        const tl = teamLeadsRef.current.find((t) => t.employee_id === id);
        if (tl?.name) return String(tl.name);
        const emp = employeesRef.current.find((e) => e.employee_id === id)
          || assignmentStatsRef.current.find((e) => e.employee_id === id);
        return String(emp?.name || id);
      };
      const breakdown = Object.entries(perTarget)
        .filter(([, c]) => Number(c) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([id, c]) => `${nameOf(id)} ${c}`)
        .join(' · ');
      let text = n > 0
        ? `Auto-distributed ${n} lead(s)${breakdown ? ` — ${breakdown}` : ''}.`
        : `Nothing to distribute — no new leads are waiting in ${adminView ? 'the admin pool' : 'your team pool'}.`;
      if (failed > 0) text += ` ${failed} NOT saved (database error) — run Auto-distribute again.`;
      await load(filtersRef.current, { preserveSelection: false });
      setMessage(text);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setMessage(typeof detail === 'string' ? detail : 'Auto-distribute failed — nothing changed.');
    } finally {
      operationBusyRef.current = false;
      setAutoBusy(false);
    }
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
      const text = skipped > 0 ? `Deleted ${n} lead(s). ${skipped} skipped (not found).` : `Deleted ${n} lead(s).`;
      setSelected(new Set());
      await load(filtersRef.current, { preserveSelection: false });
      // After the reload (a full load clears the banner).
      setMessage(text);
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Delete failed.');
    } finally {
      operationBusyRef.current = false;
      setDeleteBusy(false);
    }
  };

  const isUnassignedView = filters.assigned_to === 'unassigned';
  const isPlainView = !isUnassignedView && filters.inquiry_status === 'all' && filters.source === 'all'
    && !filters.q.trim() && !filters.location.trim() && filters.team_view === 'all'
    && (!adminView || filters.team === 'all');
  const regionChips = [
    { key: '', label: 'All' },
    ...regions
      .filter((r) => r && r.name && r.active !== false)
      .map((r) => ({ key: String(r.name), label: String(r.name) })),
  ];
  const panelTitle = isUnassignedView
    ? 'Unassigned leads'
    : selectedEmployeeName
      ? `${selectedEmployeeName}'s leads`
      : adminView && filters.team === 'admin_pool'
        ? 'Admin pool leads'
        : selectedTeamName
          ? `Team ${selectedTeamName} · leads`
          : !adminView && filters.team_view === 'pool'
            ? 'My team pool'
            : !adminView && filters.team_view === 'assigned'
              ? 'With my employees'
              : 'Filtered leads';

  const renderEmpCard = (emp: any) => (
    <Pressable
      key={emp.employee_id}
      onPress={() => applyFilters({ ...filters, assigned_to: emp.employee_id })}
      style={[styles.empCard, {
        borderColor: filters.assigned_to === emp.employee_id ? colors.primary : colors.border,
        backgroundColor: colors.surfaceAlt,
      }]}
    >
      <Text style={[styles.empName, { color: colors.text }]} numberOfLines={1}>{emp.name}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 10 }}>{roleLabel(emp.role)}</Text>
      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 6 }}>
        {emp.assigned_total ?? 0} leads
      </Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Assign Leads"
        subtitle={adminView
          ? 'Admin pool → Team Leads → employees · advanced search · bulk status change'
          : 'Your team\'s leads · assign to your team · bulk status change'}
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
          <ScrollView contentContainerStyle={[styles.content, selectedIds.length > 0 ? { paddingBottom: adminView ? 260 : 210 } : null]}>
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

            {adminView && !teamColumnsReady ? (
              <View style={[styles.msgBanner, { backgroundColor: '#F59E0B14', borderColor: '#F59E0B66' }]}>
                <Ionicons name="warning-outline" size={16} color="#B45309" />
                <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>
                  Team Lead routing is off — the database has no team columns yet. Run
                  supabase/TEAM_LEADS_AND_EXPORTS.sql in the Supabase SQL Editor to enable Team Lead pools.
                </Text>
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
              <Pressable
                testID="assign-auto-distribute"
                onPress={autoDistribute}
                disabled={autoBusy}
                style={[styles.advancedBtn, { borderColor: '#14B8A6', backgroundColor: '#14B8A610', opacity: autoBusy ? 0.6 : 1 }]}
              >
                {autoBusy
                  ? <ActivityIndicator size="small" color="#14B8A6" />
                  : <Ionicons name="shuffle-outline" size={18} color="#14B8A6" />}
                <Text style={{ color: '#0F766E', fontWeight: '700', fontSize: 13 }}>
                  {adminView ? 'Auto-distribute to Team Leads' : 'Auto-distribute to my team'}
                </Text>
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
                label={selectedEmployeeName ? `Showing · ${selectedEmployeeName}` : 'Showing'}
                value={total}
                accent={colors.primary}
                icon="list-outline"
                active={isPlainView}
                onPress={showAllLeads}
                helper={selectedEmployeeName
                  ? 'Leads assigned to this employee'
                  : selectedTeamName
                    ? (filters.team === 'admin_pool' ? 'Leads in the admin pool' : `Leads in ${selectedTeamName}'s team`)
                    : !adminView
                      ? 'Your team\'s leads'
                      : undefined}
              />
              <SummaryBox
                colors={colors}
                label="Unassigned"
                value={unassignedCount}
                accent="#6366F1"
                icon="time-outline"
                active={isUnassignedView || (employeeScoped && filters.inquiry_status === 'open_leads')}
                onPress={showUnassignedLeads}
                helper={
                  selectedEmployeeName
                    ? `Open leads · ${selectedEmployeeName}`
                    : selectedTeamName
                      ? `Open leads · ${selectedTeamName}`
                      : adminView
                        ? 'Open leads · same box as Dashboard Open Leads'
                        : 'Open leads in your team'
                }
              />
              <SummaryBox
                colors={colors}
                label="Team"
                value={employees.length}
                accent="#14B8A6"
                icon="people-outline"
                helper={adminView ? 'People you can assign to' : 'People in your team (incl. you)'}
              />
              {adminView && teamFacets ? (
                <SummaryBox
                  colors={colors}
                  label="Admin pool"
                  // Value = every lead the box opens (incl. not interested); "waiting" = what auto-distribute routes.
                  value={adminPoolTotal}
                  accent="#F59E0B"
                  icon="file-tray-full-outline"
                  active={filters.team === 'admin_pool' && filters.team_view === 'pool'}
                  onPress={() => applyFilters({ ...DEFAULT_FILTERS, team: 'admin_pool', team_view: 'pool' })}
                  helper={[
                    `${adminPoolActive} waiting for a Team Lead`,
                    adminPoolTotal > adminPoolActive ? `${adminPoolTotal} total incl. not interested` : '',
                    Number(teamFacets.no_team_assigned || 0) > 0
                      ? `+${teamFacets.no_team_assigned} with employees outside any team`
                      : '',
                  ].filter(Boolean).join(' · ')}
                />
              ) : null}
              {!adminView && myTeamId ? (
                <>
                  <SummaryBox
                    colors={colors}
                    label="My team pool"
                    value={Number(myTeamFacet?.pool ?? 0)}
                    accent="#F59E0B"
                    icon="file-tray-full-outline"
                    active={filters.team_view === 'pool' && !isUnassignedView}
                    onPress={() => applyFilters({ ...DEFAULT_FILTERS, team_view: 'pool' })}
                    helper="In team pool · no employee assigned yet"
                  />
                  <SummaryBox
                    colors={colors}
                    label="With my employees"
                    value={Number(myTeamFacet?.assigned ?? 0)}
                    accent="#22C55E"
                    icon="people-circle-outline"
                    active={filters.team_view === 'assigned' && !isUnassignedView}
                    onPress={() => applyFilters({ ...DEFAULT_FILTERS, team_view: 'assigned' })}
                    helper="Already being worked by your team"
                  />
                </>
              ) : null}
            </View>

            {adminView && teamLeads.length > 0 ? (
              <View style={styles.summaryRow}>
                {teamLeads.map((tl) => {
                  const facet = teamFacets?.teams?.[tl.employee_id] || {};
                  return (
                    <SummaryBox
                      key={tl.employee_id}
                      compact
                      colors={colors}
                      label={tl.name || 'Team Lead'}
                      value={Number(facet.total ?? 0)}
                      accent="#8B5CF6"
                      icon="person-circle-outline"
                      active={filters.team === tl.employee_id}
                      onPress={() => applyFilters({ ...DEFAULT_FILTERS, team: tl.employee_id })}
                      helper={`pool ${Number(facet.pool ?? 0)} · assigned ${Number(facet.assigned ?? 0)}`}
                    />
                  );
                })}
              </View>
            ) : null}

            {regionChips.length > 1 ? (
              <View style={[styles.filterRow, { alignItems: 'center' }]}>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>AREA</Text>
                {regionChips.map((chip) => {
                  const active = (filters.region || '').toLowerCase() === chip.key.toLowerCase();
                  return (
                    <Pressable
                      key={chip.key || '__all__'}
                      testID={`assign-region-chip-${chip.key || 'all'}`}
                      onPress={() => applyFilters({ ...filters, region: chip.key })}
                      style={[styles.filterChip, {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + '14' : colors.surfaceAlt,
                      }]}
                    >
                      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 11, fontWeight: active ? '700' : '500' }}>
                        {chip.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>
                {panelTitle}
              </Text>
              <Text style={[styles.panelSub, { color: colors.textMuted }]}>
                {loading && leads.length === 0
                  ? 'Loading leads from server…'
                  : total > 0
                    ? `Showing ${leads.length} of ${total} matching lead${total === 1 ? '' : 's'}`
                    : isUnassignedView
                      ? 'Leads with no employee assigned — pick someone from the dropdown or use bulk assign below.'
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
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{formatPhoneDisplay(lead.phone) || '—'}</Text>
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
                            {teamColumnsReady ? (
                              <Text style={{ color: lead.team_lead_id ? '#7C3AED' : '#B45309', fontWeight: '700' }}>
                                {' · '}{lead.team_lead_id ? `Team: ${lead.team_lead_name || teamLeadName(lead.team_lead_id)}` : 'Admin pool'}
                              </Text>
                            ) : null}
                          </Text>
                        </View>
                        <View style={{ width: 200 }}>
                          <SearchableSelect
                            label=""
                            compact
                            value={lead.assigned_to
                              || (adminView && lead.team_lead_id ? teamLeadKey(String(lead.team_lead_id)) : '')}
                            options={assignTargetOptions}
                            onChange={(targetKey) => assignLead(lead.lead_id, targetKey)}
                            placeholder={busyId === lead.lead_id ? 'Saving…' : 'Assign to…'}
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
                <Text style={[styles.panelSub, { color: colors.textMuted }]}>Tap a person to see only their leads.</Text>
                {snapshotGroups ? (
                  snapshotGroups.map((group) => {
                    const facet = group.key !== '__none__' ? teamFacets?.teams?.[group.key] : null;
                    return (
                      <View key={group.key} style={{ marginTop: 14 }}>
                        <Pressable
                          disabled={group.key === '__none__'}
                          onPress={() => applyFilters({ ...DEFAULT_FILTERS, team: group.key })}
                          style={[styles.teamHeader, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                        >
                          <Ionicons
                            name={group.key === '__none__' ? 'help-circle-outline' : 'people-outline'}
                            size={14}
                            color={group.key === '__none__' ? colors.textMuted : '#7C3AED'}
                          />
                          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                            {group.key === '__none__' ? 'No team' : `Team ${group.name}`}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                            {facet
                              ? `${facet.total ?? 0} leads · pool ${facet.pool ?? 0} · with employees ${facet.assigned ?? 0}`
                              : `${group.rows.length} ${group.rows.length === 1 ? 'person' : 'people'}`}
                          </Text>
                        </Pressable>
                        <View style={[styles.empGrid, { marginTop: 8 }]}>
                          {group.rows.map(renderEmpCard)}
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.empGrid}>
                    {assignmentStats.slice(0, adminView ? 8 : 24).map(renderEmpCard)}
                  </View>
                )}
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
                    placeholder={adminView ? 'Choose Team Lead, employee or N/A…' : 'Choose employee or N/A…'}
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
              {adminView && teamLeads.length > 0 ? (
                <View style={[styles.bulkEmpRow, { alignItems: 'center' }]}>
                  <Text style={[styles.bulkLabel, { color: colors.textMuted, marginBottom: 0 }]}>TEAM LEAD POOL</Text>
                  {teamLeads.map((tl) => {
                    const key = teamLeadKey(String(tl.employee_id));
                    const active = bulkEmployeeId === key;
                    return (
                      <Pressable
                        key={key}
                        testID={`bulk-assign-tl-chip-${tl.employee_id}`}
                        disabled={bulkBusy || deleteBusy}
                        onPress={() => quickAssignTo(key)}
                        style={[styles.bulkEmpChip, {
                          borderColor: active ? '#7C3AED' : '#7C3AED55',
                          backgroundColor: active ? '#7C3AED1A' : colors.surfaceAlt,
                          opacity: bulkBusy || deleteBusy ? 0.6 : 1,
                        }]}
                      >
                        <Text style={{ color: '#7C3AED', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                          {`${tl.name || 'Team Lead'}'s team`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
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
                {adminView
                  ? 'Team Lead chips send leads to that Team Lead\'s pool; employee chips assign directly (the lead joins that employee\'s team). '
                  : 'You can assign to people in your own team. '}
                Pick N/A to change status only or clear the employee. Tap a chip to assign instantly, or pick options and Apply.
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
                <Pressable
                  testID="bulk-return-to-admin"
                  onPress={returnToAdminPool}
                  disabled={bulkBusy || deleteBusy}
                  style={[styles.bulkDeleteBtn, {
                    borderColor: '#B4530955',
                    backgroundColor: '#F59E0B12',
                    opacity: bulkBusy || deleteBusy ? 0.6 : 1,
                  }]}
                >
                  <Ionicons name="return-up-back-outline" size={16} color="#B45309" />
                  <Text style={{ color: '#B45309', fontSize: 12, fontWeight: '700' }}>Return to admin pool</Text>
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
        teamLeads={teamLeads}
        regions={regions}
        showTeamFilter={adminView}
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

function SummaryBox({ label, value, accent, icon, colors, onPress, active, helper, compact }: any) {
  const box = (
    <>
      <Ionicons name={icon} size={compact ? 14 : 16} color={accent} />
      <Text
        style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginTop: compact ? 4 : 6 }}
        numberOfLines={1}
      >
        {String(label).toUpperCase()}
      </Text>
      <Text style={{ color: colors.text, fontSize: compact ? 16 : 20, fontWeight: '700' }}>{value}</Text>
      {helper ? (
        <Text style={{ color: colors.textMuted, fontSize: 9, marginTop: 2, textAlign: 'center' }}>{helper}</Text>
      ) : null}
    </>
  );
  const boxStyle = compact ? [styles.summaryBox, styles.summaryBoxCompact] : styles.summaryBox;
  if (!onPress) {
    return (
      <View style={[boxStyle, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {box}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        boxStyle,
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
  summaryBoxCompact: { minWidth: 120, maxWidth: 220, padding: 10 },
  teamHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
  },
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
