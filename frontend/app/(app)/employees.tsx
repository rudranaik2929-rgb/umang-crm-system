import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, getSnapshot, setSnapshot } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { SearchableSelect } from '../../src/components/SearchableSelect';
import {
  ROLES,
  roleLabel,
  normalizeRole,
  isAdminRole,
  isTeamLead,
  regionsLabel,
  ALL_REGIONS,
  TEAM_LEAD_ROLE,
  EMPLOYEE_ASSIGNABLE_SERVICES,
} from '../../src/lib/constants';
import { getEmployeePassword, setEmployeePassword } from '../../src/lib/employeePasswordCache';
import { Ionicons } from '@expo/vector-icons';

/** Parse allowed_pages from API (array or JSON string from Supabase). */
function parseAllowedPages(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return null;
    }
  }
  return null;
}

/** Region list from an employee row (array, JSON string or comma list). */
function parseRegions(value: unknown): string[] {
  const parsed = parseAllowedPages(value);
  if (parsed !== null) return parsed;
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function sameList(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/** Readable message from an API error (FastAPI `detail` may be a string or a list). */
function apiErrorText(e: any, fallback: string): string {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail.map((d: any) => d?.msg).filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  return fallback;
}

/** 409 from the backend when a Team Lead still has leads or people. */
function isTeamBlockedError(e: any): boolean {
  return e?.response?.status === 409;
}

const TEAMS_TRANSFER_HINT = 'Move their leads and people first: Teams & Regions → Transfer.';

// Sensible default services pre-ticked per role (the admin / Team Lead can adjust freely).
// Dashboard, Employee Tracking and Export Leads come automatically with the Team Lead role.
const ROLE_DEFAULT_SERVICES: Record<string, string[]> = {
  admin: EMPLOYEE_ASSIGNABLE_SERVICES.map((s) => s.key),
  team_lead: ['pipeline', 'assign-leads', 'broker', 'employees', 'negative'],
  telecaller: ['telecaller', 'pipeline', 'negative'],
  site_visit: ['sales-executive', 'telecaller', 'pipeline'],
  sales_executive: ['sales-executive', 'telecaller', 'pipeline'],
  booking: ['bookings', 'pipeline'],
  loan: ['loans', 'pipeline'],
  marketing: ['negative', 'pipeline', 'integrations'],
};

function defaultServicesFor(role?: string) {
  return ROLE_DEFAULT_SERVICES[normalizeRole(role) || 'telecaller'] || ['pipeline'];
}

function pagesForEmployee(employee: { allowed_pages?: unknown; role?: string }) {
  const saved = parseAllowedPages(employee.allowed_pages);
  if (saved !== null) return saved;
  return defaultServicesFor(employee.role);
}

/** Display order for the employee list — Sales Executives first, then Telecallers, then the rest by role. */
const ROLE_SORT_ORDER = [
  'site_visit',
  'sales_executive',
  'telecaller',
  'booking',
  'loan',
  'marketing',
  'admin',
  'team_lead',
];

function roleSortRank(role?: string): number {
  const idx = ROLE_SORT_ORDER.indexOf(normalizeRole(role));
  return idx === -1 ? ROLE_SORT_ORDER.length : idx;
}

/** Roles that work leads (not admin, not Team Lead). */
function isWorkerRole(role?: string) {
  const r = normalizeRole(role);
  return r !== 'admin' && r !== TEAM_LEAD_ROLE;
}

const NO_TEAM = '__no_team__';
const ADMIN_GROUP = '__admins__';

type ViewMode = 'team' | 'service' | 'location';
type Notice = { tone: 'ok' | 'error'; text: string; teamsLink?: boolean } | null;

export default function Employees() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const viewerIsAdmin = isAdminRole(user?.role, user?.email);
  const viewerIsTeamLead = !viewerIsAdmin && isTeamLead(user?.role);
  const viewerEmployeeId = user?.employee_id || (viewerIsTeamLead ? user?.team_lead_id : null) || null;

  const cachedEmployees = getSnapshot<any[]>('employees-page');
  const [employees, setEmployees] = useState<any[]>(cachedEmployees ?? []);
  const [loading, setLoading] = useState(!cachedEmployees);
  const [showAdd, setShowAdd] = useState(false);
  const [addPreset, setAddPreset] = useState<string | null>(null);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(viewerIsAdmin ? 'team' : 'service');
  const [regionNames, setRegionNames] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/employees');
      const next = r.data || [];
      setEmployees(next);
      setSnapshot('employees-page', next);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        alert('Session expired. Please log in again.');
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Region chips for the Team Lead form (admin only).
  useEffect(() => {
    if (!viewerIsAdmin) return;
    let alive = true;
    api.get('/regions')
      .then((r) => {
        if (!alive) return;
        const list = Array.isArray(r.data?.regions) ? r.data.regions : [];
        setRegionNames(
          list
            .filter((x: any) => x && x.active !== false && x.name)
            .map((x: any) => String(x.name)),
        );
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [viewerIsAdmin]);

  // Admins land on Team wise once the login is known.
  useEffect(() => {
    if (viewerIsAdmin) setViewMode((m) => (m === 'service' ? 'team' : m));
  }, [viewerIsAdmin]);

  // Teams page links here with ?add=team_lead to open the form preset to Team Lead.
  const addParam = typeof params.add === 'string' ? params.add : '';
  useEffect(() => {
    if (addParam !== TEAM_LEAD_ROLE || !viewerIsAdmin) return;
    setAddPreset(TEAM_LEAD_ROLE);
    setShowAdd(true);
    try { router.setParams({ add: '' } as any); } catch { /* ignore */ }
  }, [addParam, viewerIsAdmin, router]);

  const teamLeads = useMemo(
    () => employees
      .filter((e) => isTeamLead(e.role) && e.active !== false)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [employees],
  );
  const teamLeadsById = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of employees) if (isTeamLead(e.role)) m.set(e.employee_id, e);
    return m;
  }, [employees]);

  const teamLeadNameOf = useCallback((e: any) => {
    const id = String(e?.team_lead_id || '').trim();
    if (!id) return '';
    return e?.team_lead_name || teamLeadsById.get(id)?.name || '';
  }, [teamLeadsById]);

  const teamCell = (e: any) => {
    if (isTeamLead(e.role)) return regionsLabel(parseRegions(e.regions));
    if (normalizeRole(e.role) === 'admin') return '—';
    return teamLeadNameOf(e) || 'No team';
  };

  const remove = async (emp: any) => {
    const id = emp.employee_id;
    setNotice(null);
    try {
      const res = await api.delete(`/employees/${id}`);
      setEmployees((prev) => prev.filter((e) => e.employee_id !== id));
      const returned = Number(res?.data?.leads_returned || 0);
      setNotice({
        tone: 'ok',
        text: returned > 0
          ? `${emp.name || 'Employee'} deleted. ${returned} lead${returned === 1 ? '' : 's'} returned to the team pool.`
          : `${emp.name || 'Employee'} deleted.`,
      });
      await load();
    } catch (e: any) {
      if (e?.response?.status === 401) {
        alert('Session expired. Please log in again.');
        return;
      }
      const blocked = isTeamBlockedError(e);
      setNotice({
        tone: 'error',
        text: apiErrorText(e, 'Could not delete employee.') + (blocked ? ` ${TEAMS_TRANSFER_HINT}` : ''),
        teamsLink: blocked && viewerIsAdmin,
      });
    }
  };
  const toggle = async (e: any) => {
    setNotice(null);
    try {
      await api.patch(`/employees/${e.employee_id}`, { active: !e.active });
      await load();
    } catch (err: any) {
      const blocked = isTeamBlockedError(err);
      setNotice({
        tone: 'error',
        text: apiErrorText(err, 'Could not update employee status.') + (blocked ? ` ${TEAMS_TRANSFER_HINT}` : ''),
        teamsLink: blocked && viewerIsAdmin,
      });
    }
  };

  const activeCount = employees.filter((e) => e.active !== false).length;

  // Group employees by team, by role (service-wise) or by location, so the list
  // is not mixed randomly. Team wise: each Team Lead heads their own group,
  // "No team" last. Service-wise: Sales Executive → Telecaller → ….
  // Location-wise: grouped per location and listed alphabetically.
  const groups = useMemo(() => {
    const sorted = [...employees].sort(
      (a, b) =>
        roleSortRank(a.role) - roleSortRank(b.role) ||
        (a.name || '').localeCompare(b.name || ''),
    );
    const out: { key: string; label: string; sublabel?: string; items: any[]; startIndex: number }[] = [];

    if (viewMode === 'team') {
      const byKey = new Map<string, any[]>();
      const keyOf = (e: any) => {
        if (isTeamLead(e.role)) return e.employee_id;
        if (normalizeRole(e.role) === 'admin') return ADMIN_GROUP;
        return String(e.team_lead_id || '').trim() || NO_TEAM;
      };
      for (const e of sorted) {
        const k = keyOf(e);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k)!.push(e);
      }
      const teamKeys = Array.from(byKey.keys()).filter((k) => k !== ADMIN_GROUP && k !== NO_TEAM);
      const nameOfTeam = (k: string) => {
        const lead = teamLeadsById.get(k);
        if (lead?.name) return lead.name as string;
        const member = byKey.get(k)?.find((e) => e.team_lead_name);
        return (member?.team_lead_name as string) || 'Team Lead';
      };
      teamKeys.sort((a, b) => nameOfTeam(a).localeCompare(nameOfTeam(b)));
      const ordered = [
        ...(byKey.has(ADMIN_GROUP) ? [ADMIN_GROUP] : []),
        ...teamKeys,
        ...(byKey.has(NO_TEAM) ? [NO_TEAM] : []),
      ];
      for (const k of ordered) {
        const items = byKey.get(k) || [];
        if (k === ADMIN_GROUP) {
          out.push({ key: k, label: 'Administrators', items, startIndex: 0 });
        } else if (k === NO_TEAM) {
          out.push({ key: k, label: 'No team', sublabel: 'Admin handles directly', items, startIndex: 0 });
        } else {
          // The Team Lead heads their own group.
          items.sort((a, b) => Number(isTeamLead(b.role)) - Number(isTeamLead(a.role)));
          const lead = teamLeadsById.get(k);
          out.push({
            key: k,
            label: `Team · ${nameOfTeam(k)}`,
            sublabel: lead ? regionsLabel(parseRegions(lead.regions)) : undefined,
            items,
            startIndex: 0,
          });
        }
      }
    } else {
      for (const e of sorted) {
        const label =
          viewMode === 'location'
            ? (e.location || '').trim() || 'Unknown'
            : roleLabel(e.role);
        const g = out.find((x) => x.label === label);
        if (g) g.items.push(e);
        else out.push({ key: label, label, items: [e], startIndex: 0 });
      }
      if (viewMode === 'location') out.sort((a, b) => a.label.localeCompare(b.label));
    }
    let idx = 0;
    for (const g of out) {
      g.startIndex = idx;
      idx += g.items.length;
    }
    return out;
  }, [employees, viewMode, teamLeadsById]);

  const viewModes: { key: ViewMode; label: string }[] = viewerIsAdmin
    ? [
        { key: 'team', label: 'Team wise' },
        { key: 'service', label: 'Service wise' },
        { key: 'location', label: 'Location wise' },
      ]
    : [
        { key: 'service', label: 'Service wise' },
        { key: 'location', label: 'Location wise' },
      ];

  /** A Team Lead manages their own people only — not themselves, admins or other Team Leads. */
  const canManageRow = (e: any) => {
    if (viewerIsAdmin) return true;
    if (viewerEmployeeId && e.employee_id === viewerEmployeeId) return false;
    return isWorkerRole(e.role);
  };
  const canEditRow = (e: any) => viewerIsAdmin || normalizeRole(e.role) !== 'admin';

  const openAdd = () => { setAddPreset(null); setShowAdd(true); };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Employee Management"
        subtitle={`${employees.length} employee${employees.length === 1 ? '' : 's'} · ${activeCount} active${viewerIsTeamLead ? ' · your team' : ''}`}
        rightAction={
          <Pressable testID="add-employee-btn" onPress={openAdd} style={[styles.primary, { backgroundColor: colors.primary }]}>
            <Ionicons name="person-add" size={14} color="#fff" />
            <Text style={styles.primaryText}>Add Employee</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
        {notice ? (
          <View
            style={[extra.notice, {
              borderColor: notice.tone === 'ok' ? colors.positive : colors.negative,
              backgroundColor: (notice.tone === 'ok' ? colors.positive : colors.negative) + '14',
            }]}
          >
            <Ionicons
              name={notice.tone === 'ok' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={16}
              color={notice.tone === 'ok' ? colors.positive : colors.negative}
            />
            <Text style={{ flex: 1, color: colors.text, fontSize: 12 }}>{notice.text}</Text>
            {notice.teamsLink ? (
              <Pressable testID="emp-open-teams" onPress={() => router.push('/(app)/teams' as any)}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Open Teams & Regions</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setNotice(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}
        {employees.length === 0 && !loading ? null : (
          <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.toggleLabel, { color: colors.textMuted }]}>Group by</Text>
            <View style={[styles.toggleSeg, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
              {viewModes.map((m) => (
                <Pressable
                  key={m.key}
                  testID={`group-${m.key}`}
                  onPress={() => setViewMode(m.key)}
                  style={[styles.toggleBtn, viewMode === m.key && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.toggleText, { color: viewMode === m.key ? '#fff' : colors.textSecondary }]}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {loading ? <ActivityIndicator color={colors.primary} /> :
          employees.length === 0 ? (
            <EmptyState
              variant="leads"
              title="No team members yet"
              description="Add telecallers, sales executives, booking team and loan officers. Each role gets access to the right department."
              actionLabel="Add First Employee"
              onAction={openAdd}
              testIDAction="empty-add-employee"
            />
          ) : (
            <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.tableSummary, { borderBottomColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                  Total employees: {employees.length}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {activeCount} active · {employees.length - activeCount} disabled
                </Text>
              </View>
              <View style={[styles.tHead, { borderBottomColor: colors.border }]}>
                <Text style={[styles.th, { color: colors.textMuted, width: 44 }]}>#</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 2 }]}>NAME</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 1.4 }]}>LOCATION</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 2 }]}>EMAIL</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 1.2 }]}>ROLE</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 1.4 }]}>TEAM</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 1.2 }]}>DEPARTMENT</Text>
                <Text style={[styles.th, { color: colors.textMuted, width: 90 }]}>STATUS</Text>
                <Text style={[styles.th, { color: colors.textMuted, width: 120, textAlign: 'right' }]}>ACTIONS</Text>
              </View>
              {groups.map((g) => (
                <View key={g.key}>
                  <View style={[styles.groupHeader, { backgroundColor: colors.surfaceAlt, borderBottomColor: colors.border }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 }}>
                      <Text style={[styles.groupTitle, { color: colors.primary }]}>
                        {viewMode === 'service' ? `${g.label}s` : g.label}
                      </Text>
                      {g.sublabel ? (
                        <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{g.sublabel}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.groupCount, { color: colors.textMuted }]}>
                      {g.items.length} member{g.items.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {g.items.map((e, i) => {
                    const lead = isTeamLead(e.role);
                    const manageable = canManageRow(e);
                    return (
                      <View key={e.employee_id} style={[styles.tRow, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.serialNo, { color: colors.textMuted, width: 44 }]}>{g.startIndex + i + 1}</Text>
                        <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={[styles.avatar, { backgroundColor: lead ? colors.accent || colors.primary : colors.primary }]}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>{e.name?.[0]?.toUpperCase() || '?'}</Text>
                          </View>
                          <View style={{ flexShrink: 1 }}>
                            <Text style={[styles.cellPrimary, { color: colors.text }]}>{e.name}</Text>
                            <Text style={[styles.cellSecondary, { color: colors.textMuted }]}>{e.phone || '—'}</Text>
                          </View>
                        </View>
                        <Text style={[styles.cellPrimary, { color: colors.text, flex: 1.4 }]} numberOfLines={2}>
                          {e.location || '—'}
                        </Text>
                        <Text style={[styles.cellPrimary, { color: colors.text, flex: 2 }]}>{e.email}</Text>
                        <Text style={[styles.cellPrimary, { color: colors.text, flex: 1.2 }]}>{roleLabel(e.role)}</Text>
                        <Text
                          style={[styles.cellPrimary, {
                            color: !lead && isWorkerRole(e.role) && !teamLeadNameOf(e) ? colors.textMuted : colors.text,
                            flex: 1.4,
                          }]}
                          numberOfLines={2}
                        >
                          {teamCell(e)}
                        </Text>
                        <Text style={[styles.cellPrimary, { color: colors.text, flex: 1.2 }]}>{e.department}</Text>
                        <View style={{ width: 90 }}>
                          <Badge text={e.active ? 'ACTIVE' : 'DISABLED'} color={e.active ? colors.positive : colors.textMuted} />
                        </View>
                        <View style={{ width: 120, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                          {canEditRow(e) ? (
                            <Pressable testID={`emp-edit-${e.employee_id}`} onPress={() => setEditEmployee(e)}
                              style={[styles.iconAct, { borderColor: colors.border }]}>
                              <Ionicons name="create-outline" size={14} color={colors.primary} />
                            </Pressable>
                          ) : null}
                          {manageable ? (
                            <Pressable testID={`emp-toggle-${e.employee_id}`} onPress={() => toggle(e)}
                              style={[styles.iconAct, { borderColor: colors.border }]}>
                              <Ionicons name={e.active ? 'pause-circle-outline' : 'play-circle-outline'} size={14} color={colors.textSecondary} />
                            </Pressable>
                          ) : null}
                          {manageable ? (
                            <Pressable testID={`emp-delete-${e.employee_id}`} onPress={() => remove(e)}
                              style={[styles.iconAct, { borderColor: colors.border }]}>
                              <Ionicons name="trash-outline" size={14} color={colors.negative} />
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
      </ScrollView>

      <AddEmployeeModal
        visible={showAdd}
        presetRole={addPreset}
        onClose={() => { setShowAdd(false); setAddPreset(null); }}
        onCreated={async (msg?: string) => {
          setShowAdd(false);
          setAddPreset(null);
          if (msg) setNotice({ tone: 'ok', text: msg });
          await load();
        }}
        colors={colors}
        viewerIsAdmin={viewerIsAdmin}
        viewerIsTeamLead={viewerIsTeamLead}
        viewerName={user?.name || ''}
        regionNames={regionNames}
        teamLeads={teamLeads}
      />
      <EditEmployeeModal
        visible={!!editEmployee}
        employee={editEmployee}
        onClose={() => setEditEmployee(null)}
        onSaved={async (msg?: string) => {
          setEditEmployee(null);
          if (msg) setNotice({ tone: 'ok', text: msg });
          await load();
        }}
        onReload={load}
        colors={colors}
        viewerIsAdmin={viewerIsAdmin}
        viewerIsTeamLead={viewerIsTeamLead}
        viewerEmployeeId={viewerEmployeeId}
        regionNames={regionNames}
        teamLeads={teamLeads}
      />
    </View>
  );
}

/** Role chips: admins create any non-admin role; Team Leads create workers only. */
function roleOptionsFor(viewerIsAdmin: boolean) {
  return ROLES.filter((r) => r.key !== 'admin' && (viewerIsAdmin || r.key !== TEAM_LEAD_ROLE));
}

function RoleChips({ roles, value, onPick, colors, testPrefix }: any) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {roles.map((r: { key: string; label: string }) => (
        <Pressable key={r.key} testID={testPrefix ? `${testPrefix}-${r.key}` : undefined} onPress={() => onPick(r.key)}
          style={[styles.chip, {
            borderColor: value === r.key ? colors.primary : colors.border,
            backgroundColor: value === r.key ? colors.primary + '20' : colors.surfaceAlt,
          }]}>
          <Text style={{ color: value === r.key ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>{r.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Region multi-select for a Team Lead. "All regions" (['*']) excludes specific regions. */
function RegionPicker({ regionNames, value, onChange, colors, testPrefix }: {
  regionNames: string[]; value: string[]; onChange: (next: string[]) => void; colors: any; testPrefix: string;
}) {
  const all = value.includes(ALL_REGIONS);
  // Keep regions already saved on the employee even if the region was renamed/removed.
  const names = Array.from(new Set([...regionNames, ...value.filter((v) => v !== ALL_REGIONS)]));
  const toggleRegion = (name: string) => {
    const specific = value.filter((v) => v !== ALL_REGIONS);
    onChange(specific.includes(name) ? specific.filter((v) => v !== name) : [...specific, name]);
  };
  const chip = (key: string, label: string, on: boolean, onPress: () => void) => (
    <Pressable key={key} testID={`${testPrefix}-${key === ALL_REGIONS ? 'all' : key}`} onPress={onPress}
      style={[styles.chip, {
        borderColor: on ? colors.primary : colors.border,
        backgroundColor: on ? colors.primary + '20' : colors.surfaceAlt,
        flexDirection: 'row', gap: 4,
      }]}>
      {on ? <Ionicons name="checkmark" size={12} color={colors.primary} /> : null}
      <Text style={{ color: on ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View>
      <Text style={[styles.label, { color: colors.textMuted, marginTop: 14 }]}>REGIONS COVERED</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {chip(ALL_REGIONS, 'All regions', all, () => onChange(all ? [] : [ALL_REGIONS]))}
        {names.map((n) => chip(n, n, !all && value.includes(n), () => toggleRegion(n)))}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
        {names.length === 0
          ? 'No regions yet — add them on Teams & Regions. "All regions" works meanwhile.'
          : 'Auto-assign sends a lead to the Team Lead whose region matches its location.'}
      </Text>
    </View>
  );
}

function teamLeadSelectOptions(teamLeads: any[], excludeId?: string) {
  return [
    { key: NO_TEAM, label: 'No team (admin handles directly)' },
    ...teamLeads
      .filter((t) => t.employee_id !== excludeId)
      .map((t) => ({
        key: t.employee_id as string,
        label: `${t.name} · ${regionsLabel(parseRegions(t.regions))}`,
        sublabel: t.email || undefined,
      })),
  ];
}

function AddEmployeeModal({
  visible, presetRole, onClose, onCreated, colors,
  viewerIsAdmin, viewerIsTeamLead, viewerName, regionNames, teamLeads,
}: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('telecaller');
  const [pages, setPages] = useState<string[]>(ROLE_DEFAULT_SERVICES.telecaller);
  const [regions, setRegions] = useState<string[]>([]);
  const [teamLeadId, setTeamLeadId] = useState<string>(NO_TEAM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleOptions = roleOptionsFor(!!viewerIsAdmin);

  const pickRole = (r: string) => {
    setRole(r);
    // Pre-fill the recommended services for the chosen role; they can still be edited.
    setPages(defaultServicesFor(r));
  };

  // Opened from Teams & Regions → "Add Team Lead".
  useEffect(() => {
    if (visible && presetRole && roleOptions.some((r) => r.key === presetRole)) pickRole(presetRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, presetRole]);

  const togglePage = (key: string) => {
    setPages((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const reset = () => {
    setName(''); setEmail(''); setPhone(''); setLocation(''); setPassword('');
    setRole('telecaller'); setPages(ROLE_DEFAULT_SERVICES.telecaller); setError(null);
    setRegions([]); setTeamLeadId(NO_TEAM);
  };

  const isLeadRole = role === TEAM_LEAD_ROLE;
  const needsRegions = viewerIsAdmin && isLeadRole;

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const trimmedLocation = location.trim();
    if (!name.trim() || !trimmedEmail || trimmedPassword.length < 4 || !trimmedLocation) return;
    if (needsRegions && regions.length === 0) {
      setError('Pick the regions this Team Lead covers (or "All regions").');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dept = ROLES.find((r) => r.key === role)?.dept || 'General';
      const payload: Record<string, unknown> = {
        name: name.trim(),
        email: trimmedEmail,
        phone: phone.trim() || undefined,
        location: trimmedLocation,
        password: trimmedPassword,
        role,
        department: dept,
        allowed_pages: pages,
      };
      if (viewerIsAdmin) {
        if (isLeadRole) payload.regions = regions;
        else payload.team_lead_id = teamLeadId === NO_TEAM ? null : teamLeadId;
      }
      // A Team Lead's new employee always joins their own team (the backend sets it).
      const res = await api.post('/employees', payload);
      if (res.data?.employee_id) setEmployeePassword(res.data.employee_id, trimmedPassword);
      const who = name.trim();
      let msg = `${who} added.`;
      if (isLeadRole) msg = `${who} added as Team Lead · ${regionsLabel(regions)}.`;
      else if (viewerIsTeamLead) msg = `${who} added to your team.`;
      else if (teamLeadId !== NO_TEAM) {
        const tl = (teamLeads || []).find((t: any) => t.employee_id === teamLeadId);
        if (tl?.name) msg = `${who} added to ${tl.name}'s team.`;
      }
      onCreated(msg); reset();
    } catch (e: any) {
      setError(apiErrorText(e, 'Could not add employee. Check email is unique and password is at least 4 characters.'));
    } finally { setBusy(false); }
  };

  const canSubmit = !!name.trim() && !!email.trim() && !!location.trim() && password.trim().length >= 4
    && (!needsRegions || regions.length > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '88%' }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{isLeadRole ? 'Add Team Lead' : 'Add Employee'}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            Creates a login. The employee signs in with this email and password and sees only the services you tick below.
          </Text>
          <ScrollView style={{ marginTop: 4 }} contentContainerStyle={{ paddingBottom: 4 }}>
            <Field label="FULL NAME" testID="emp-name" value={name} onChange={setName} colors={colors} />
            <Field label="LOGIN EMAIL" testID="emp-email" value={email} onChange={setEmail} colors={colors} keyboardType="email-address" />
            <Field label="LOGIN PASSWORD (REQUIRED)" testID="emp-password" value={password} onChange={setPassword} colors={colors} secureTextEntry required showPasswordToggle />
            <Field label="PHONE" testID="emp-phone" value={phone} onChange={setPhone} colors={colors} keyboardType="phone-pad" />
            <Field
              label="LOCATION (REQUIRED)"
              testID="emp-location"
              value={location}
              onChange={setLocation}
              colors={colors}
              placeholder="e.g. Nalasopara West, Virar, Naigaon"
            />
            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>ROLE (DASHBOARD TYPE)</Text>
            <RoleChips roles={roleOptions} value={role} onPick={pickRole} colors={colors} testPrefix="emp-role" />

            {needsRegions ? (
              <RegionPicker regionNames={regionNames || []} value={regions} onChange={setRegions} colors={colors} testPrefix="emp-region" />
            ) : null}

            {viewerIsAdmin && !isLeadRole ? (
              <View style={{ marginTop: 14 }}>
                <SearchableSelect
                  label="UNDER TEAM LEAD"
                  testID="emp-team-lead"
                  value={teamLeadId}
                  options={teamLeadSelectOptions(teamLeads || [])}
                  onChange={setTeamLeadId}
                  placeholder="No team (admin handles directly)"
                />
              </View>
            ) : null}

            {viewerIsTeamLead ? (
              <View style={[extra.infoRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="people-outline" size={14} color={colors.primary} />
                <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
                  Will join your team{viewerName ? ` (${viewerName})` : ''}.
                </Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>SIDEBAR SERVICES (ACCESS AFTER LOGIN)</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}>
              {isLeadRole
                ? 'Dashboard, Employee Tracking and Export Leads come automatically with the Team Lead role.'
                : 'Employee Tracking is only for Admin/Team Lead — not listed here.'}
            </Text>
            <View style={{ gap: 8 }}>
              {EMPLOYEE_ASSIGNABLE_SERVICES.map((svc) => {
                const checked = pages.includes(svc.key);
                return (
                  <Pressable key={svc.key} testID={`emp-page-${svc.key}`} onPress={() => togglePage(svc.key)}
                    style={[styles.checkRow, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary + '12' : colors.surfaceAlt }]}>
                    <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}>
                      {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>{svc.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {error ? <Text style={{ color: colors.negative, fontSize: 12, marginTop: 10 }}>{error}</Text> : null}
          <Pressable testID="emp-submit" onPress={submit} disabled={busy || !canSubmit}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 14, height: 42, justifyContent: 'center', opacity: canSubmit ? 1 : 0.5 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{isLeadRole ? 'Create Login & Add Team Lead' : 'Create Login & Add Employee'}</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function EditEmployeeModal({
  visible, employee, onClose, onSaved, onReload, colors,
  viewerIsAdmin, viewerIsTeamLead, viewerEmployeeId, regionNames, teamLeads,
}: any) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [role, setRole] = useState('telecaller');
  const [pages, setPages] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [regions, setRegions] = useState<string[]>([]);
  const [teamLeadId, setTeamLeadId] = useState<string>(NO_TEAM);
  const [busy, setBusy] = useState(false);
  const [sidebarBusy, setSidebarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorBlocked, setErrorBlocked] = useState(false);
  const [sidebarSaved, setSidebarSaved] = useState(false);
  const sidebarReady = React.useRef(false);
  const sidebarTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const originalRole = normalizeRole(employee?.role) || 'telecaller';
  const originalRegions = useMemo(() => parseRegions(employee?.regions), [employee]);
  const originalTeamLead = isWorkerRole(employee?.role)
    ? (String(employee?.team_lead_id || '').trim() || NO_TEAM)
    : NO_TEAM;
  const isSelf = !!viewerEmployeeId && employee?.employee_id === viewerEmployeeId;
  // A Team Lead cannot change roles of other Team Leads/admins or their own role/status.
  const roleLocked = !viewerIsAdmin && (isSelf || !isWorkerRole(employee?.role));

  useEffect(() => {
    if (!visible || !employee) return;
    sidebarReady.current = false;
    setName(employee.name || '');
    setEmail(employee.email || '');
    setPhone(employee.phone || '');
    setLocation(employee.location || '');
    setCurrentPassword(getEmployeePassword(employee.employee_id));
    setShowCurrentPassword(false);
    setNewPassword('');
    setShowNewPassword(false);
    setRole(normalizeRole(employee.role) || 'telecaller');
    setPages(pagesForEmployee(employee));
    setActive(employee.active !== false);
    setRegions(parseRegions(employee.regions));
    setTeamLeadId(
      isWorkerRole(employee.role) ? (String(employee.team_lead_id || '').trim() || NO_TEAM) : NO_TEAM,
    );
    setError(null);
    setErrorBlocked(false);
    setSidebarSaved(false);
    const t = setTimeout(() => { sidebarReady.current = true; }, 200);
    return () => clearTimeout(t);
  }, [visible, employee]);

  useEffect(() => () => {
    if (sidebarTimer.current) clearTimeout(sidebarTimer.current);
  }, []);

  const togglePage = (key: string) => {
    setPages((prev) => {
      const next = prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key];
      setSidebarSaved(false);
      if (sidebarReady.current && employee?.employee_id) {
        if (sidebarTimer.current) clearTimeout(sidebarTimer.current);
        sidebarTimer.current = setTimeout(() => saveSidebarPages(next, true), 450);
      }
      return next;
    });
  };

  const saveSidebarPages = async (pageList: string[], auto = false) => {
    if (!employee?.employee_id) return;
    if (auto) setSidebarBusy(true);
    else setBusy(true);
    if (!auto) { setError(null); setErrorBlocked(false); }
    setSidebarSaved(false);
    try {
      const res = await api.patch(`/employees/${employee.employee_id}`, { allowed_pages: pageList });
      const saved = parseAllowedPages(res.data?.allowed_pages);
      if (saved !== null) setPages(saved);
      setSidebarSaved(true);
      await onReload?.();
    } catch (e: any) {
      if (!auto) setError(apiErrorText(e, 'Could not update sidebar access.'));
    } finally {
      if (auto) setSidebarBusy(false);
      else setBusy(false);
    }
  };

  const saveSidebarOnly = async (auto = false) => {
    await saveSidebarPages(pages, auto);
  };

  const isLeadRole = role === TEAM_LEAD_ROLE;
  const teamChanged = viewerIsAdmin && isWorkerRole(role) && teamLeadId !== originalTeamLead;
  const demotingLead = originalRole === TEAM_LEAD_ROLE && role !== TEAM_LEAD_ROLE;

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedNewPassword = newPassword.trim();
    const trimmedLocation = location.trim();
    if (!employee?.employee_id || !name.trim() || !trimmedEmail || !trimmedLocation) return;
    if (trimmedNewPassword.length > 0 && trimmedNewPassword.length < 4) {
      setError('New password must be at least 4 characters.');
      setErrorBlocked(false);
      return;
    }
    if (viewerIsAdmin && isLeadRole && regions.length === 0) {
      setError('Pick the regions this Team Lead covers (or "All regions").');
      setErrorBlocked(false);
      return;
    }
    setBusy(true);
    setError(null);
    setErrorBlocked(false);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        email: trimmedEmail,
        phone: phone.trim() || undefined,
        location: trimmedLocation,
        allowed_pages: pages,
      };
      // Only send what changed: role/status/team changes have side effects on the backend.
      if (role !== originalRole && !roleLocked) payload.role = role;
      if (active !== (employee.active !== false)) payload.active = active;
      if (viewerIsAdmin) {
        if (isLeadRole && (role !== originalRole || !sameList(regions, originalRegions))) payload.regions = regions;
        if (teamChanged) payload.team_lead_id = teamLeadId === NO_TEAM ? null : teamLeadId;
      }
      if (trimmedNewPassword.length >= 4) payload.password = trimmedNewPassword;
      const res = await api.patch(`/employees/${employee.employee_id}`, payload);
      if (trimmedNewPassword.length >= 4) {
        setEmployeePassword(employee.employee_id, trimmedNewPassword);
        setCurrentPassword(trimmedNewPassword);
        setNewPassword('');
      }
      const moved = Number(res?.data?.leads_moved || 0);
      let msg = `${name.trim()} saved.`;
      if (teamChanged) {
        const tl = (teamLeads || []).find((t: any) => t.employee_id === teamLeadId);
        const where = teamLeadId === NO_TEAM ? 'no team (admin handles directly)' : `${tl?.name || 'the new'}'s team`;
        msg = `${name.trim()} moved to ${where}.`;
        if (moved > 0) msg += ` ${moved} lead${moved === 1 ? '' : 's'} moved with them.`;
      }
      onSaved(msg);
    } catch (e: any) {
      const blocked = isTeamBlockedError(e);
      setError(apiErrorText(e, 'Could not update employee.') + (blocked && viewerIsAdmin ? ` ${TEAMS_TRANSFER_HINT}` : ''));
      setErrorBlocked(blocked && !!viewerIsAdmin);
    } finally { setBusy(false); }
  };

  const canSave = !!name.trim() && !!email.trim() && !!location.trim();

  if (!employee) return null;

  const roleOptions = roleOptionsFor(!!viewerIsAdmin);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '88%' }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Edit Employee</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            Sidebar checkboxes save automatically. View current login password below; enter a new password only when you want to change it.
          </Text>
          <ScrollView style={{ marginTop: 4 }} contentContainerStyle={{ paddingBottom: 4 }}>
            <Field label="FULL NAME" testID="edit-emp-name" value={name} onChange={setName} colors={colors} />
            <Field label="LOGIN EMAIL" testID="edit-emp-email" value={email} onChange={setEmail} colors={colors} keyboardType="email-address" />
            <Field label="PHONE" testID="edit-emp-phone" value={phone} onChange={setPhone} colors={colors} keyboardType="phone-pad" />
            <Field
              label="LOCATION (REQUIRED)"
              testID="edit-emp-location"
              value={location}
              onChange={setLocation}
              colors={colors}
              placeholder="e.g. Nalasopara West, Virar, Naigaon"
            />
            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>ROLE</Text>
            {roleLocked ? (
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                {roleLabel(role)}
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '400' }}>  · only the administrator can change this</Text>
              </Text>
            ) : (
              <RoleChips roles={roleOptions} value={role} onPick={setRole} colors={colors} testPrefix="edit-emp-role" />
            )}
            {viewerIsAdmin && demotingLead ? (
              <Text style={{ color: colors.warning || colors.textMuted, fontSize: 11, marginTop: 6 }}>
                A Team Lead who still has leads or people cannot change role. {TEAMS_TRANSFER_HINT}
              </Text>
            ) : null}

            {viewerIsAdmin && isLeadRole ? (
              <RegionPicker regionNames={regionNames || []} value={regions} onChange={setRegions} colors={colors} testPrefix="edit-emp-region" />
            ) : null}

            {viewerIsAdmin && isWorkerRole(role) ? (
              <View style={{ marginTop: 14 }}>
                <SearchableSelect
                  label="UNDER TEAM LEAD"
                  testID="edit-emp-team-lead"
                  value={teamLeadId}
                  options={teamLeadSelectOptions(teamLeads || [], employee.employee_id)}
                  onChange={setTeamLeadId}
                  placeholder="No team (admin handles directly)"
                />
                <Text style={{ color: teamChanged ? colors.primary : colors.textMuted, fontSize: 11, marginTop: 6 }}>
                  {teamChanged
                    ? 'On save, the leads this person is working move with them to the new team.'
                    : 'Changing the Team Lead moves this person\'s current leads with them.'}
                </Text>
              </View>
            ) : null}

            {!viewerIsAdmin && viewerIsTeamLead && isWorkerRole(role) ? (
              <View style={[extra.infoRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="people-outline" size={14} color={colors.primary} />
                <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>In your team.</Text>
              </View>
            ) : null}

            {roleLocked && isSelf ? null : (
              <Pressable onPress={() => setActive((v) => !v)} style={[styles.checkRow, { marginTop: 14, borderColor: active ? colors.positive : colors.border, backgroundColor: active ? colors.positive + '12' : colors.surfaceAlt }]}>
                <View style={[styles.checkbox, { borderColor: active ? colors.positive : colors.border, backgroundColor: active ? colors.positive : 'transparent' }]}>
                  {active ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                </View>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>Account active (can log in)</Text>
              </Pressable>
            )}
            <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>
              SIDEBAR SERVICES {sidebarBusy ? '(saving…)' : sidebarSaved ? '(saved)' : '(auto-saves)'}
            </Text>
            {isLeadRole ? (
              <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}>
                Dashboard, Employee Tracking and Export Leads come automatically with the Team Lead role.
              </Text>
            ) : null}
            <View style={{ gap: 8 }}>
              {EMPLOYEE_ASSIGNABLE_SERVICES.map((svc) => {
                const checked = pages.includes(svc.key);
                return (
                  <Pressable key={svc.key} onPress={() => togglePage(svc.key)}
                    style={[styles.checkRow, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary + '12' : colors.surfaceAlt }]}>
                    <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}>
                      {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>{svc.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <PasswordDisplayField
              label="CURRENT LOGIN PASSWORD"
              testID="edit-emp-current-password"
              value={currentPassword}
              visible={showCurrentPassword}
              onToggleVisible={() => setShowCurrentPassword((v) => !v)}
              colors={colors}
              emptyHint="Not saved in this browser — set a new password below if needed"
            />
            <Field
              label="NEW PASSWORD (OPTIONAL)"
              testID="edit-emp-new-password"
              value={newPassword}
              onChange={setNewPassword}
              colors={colors}
              secureTextEntry
              showPasswordToggle
              showPassword={showNewPassword}
              onTogglePassword={() => setShowNewPassword((v) => !v)}
              autoComplete="new-password"
              placeholder="Type new password to change login"
            />
          </ScrollView>
          {error ? <Text style={{ color: colors.negative, fontSize: 12, marginTop: 10 }}>{error}</Text> : null}
          {error && errorBlocked ? (
            <Pressable testID="edit-emp-open-teams" onPress={() => { onClose(); router.push('/(app)/teams' as any); }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 }}>Open Teams & Regions → Transfer</Text>
            </Pressable>
          ) : null}
          {sidebarSaved && !sidebarBusy ? (
            <Text style={{ color: colors.positive, fontSize: 12, marginTop: 10 }}>Sidebar access saved.</Text>
          ) : null}
          <Pressable testID="edit-emp-save-sidebar" onPress={() => saveSidebarOnly(false)} disabled={busy || sidebarBusy}
            style={[styles.outlineBtn, { borderColor: colors.primary, marginTop: 14, height: 40, justifyContent: 'center', opacity: busy || sidebarBusy ? 0.6 : 1 }]}>
            {sidebarBusy ? <ActivityIndicator color={colors.primary} /> : (
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>Save Sidebar Now</Text>
            )}
          </Pressable>
          <Pressable testID="edit-emp-submit" onPress={submit} disabled={busy || sidebarBusy || !canSave}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 10, height: 42, justifyContent: 'center', opacity: canSave && !busy ? 1 : 0.5 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save Profile</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const extra = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
});

function PasswordDisplayField({ label, value, visible, onToggleVisible, colors, testID, emptyHint }: any) {
  return (
    <View>
      <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          testID={testID}
          value={value}
          editable={false}
          secureTextEntry={!visible}
          placeholder={emptyHint}
          placeholderTextColor={colors.textMuted}
          style={{
            flex: 1, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
            padding: 10, color: colors.text, backgroundColor: colors.surfaceAlt + '80',
          }}
        />
        <Pressable
          onPress={onToggleVisible}
          style={[styles.eyeBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
          accessibilityLabel={visible ? 'Hide current password' : 'Show current password'}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

function Field({ label, value, onChange, colors, testID, keyboardType, secureTextEntry, required, showPasswordToggle, showPassword, onTogglePassword, autoComplete, placeholder }: any) {
  const [showInternal, setShowInternal] = React.useState(false);
  const show = showPasswordToggle && onTogglePassword ? showPassword : showInternal;
  const toggleShow = onTogglePassword || (() => setShowInternal((v) => !v));
  return (
    <View>
      <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>
        {label}{required ? ' *' : ''}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry && !show}
          autoCapitalize="none"
          autoComplete={autoComplete}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={{
            flex: 1, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
            padding: 10, color: colors.text, backgroundColor: colors.surfaceAlt,
          }}
        />
        {showPasswordToggle ? (
          <Pressable
            onPress={toggleShow}
            style={[styles.eyeBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
          >
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  tableCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tableSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  tHead: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  th: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  groupTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  groupCount: { fontSize: 11, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  toggleLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  toggleSeg: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  toggleText: { fontSize: 12, fontWeight: '700' },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  serialNo: { fontSize: 12, fontWeight: '700' },
  cellPrimary: { fontSize: 13, fontWeight: '500' },
  cellSecondary: { fontSize: 11, marginTop: 2 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconAct: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { width: '92%', maxWidth: 460, padding: 20, borderRadius: 12, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  chip: { paddingHorizontal: 12, height: 28, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 42, borderRadius: 8, borderWidth: 1 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  eyeBtn: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  outlineBtn: { alignItems: 'center', borderRadius: 8, borderWidth: 1 },
});
