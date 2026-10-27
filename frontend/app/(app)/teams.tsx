import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { StatCard } from '../../src/components/StatCard';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { SearchableSelect, SelectOption } from '../../src/components/SearchableSelect';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { isAdminRole, roleLabel, regionsLabel } from '../../src/lib/constants';

// ---- API shapes (docs/TEAM_LEADS.md §4) ----
type TeamMember = {
  employee_id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  active?: boolean;
  location?: string | null;
};

type TeamLeadRow = {
  employee_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  active?: boolean;
  location?: string | null;
  regions?: string[] | null;
  members?: TeamMember[];
  leads?: { total?: number; pool?: number; assigned?: number };
};

type Overview = {
  team_leads: TeamLeadRow[];
  pipeline_total: number;
  columns_ready: boolean;
  regions_ready: boolean;
  admin_pool?: number;
  admin_pool_active?: number;
  no_team_assigned?: number;
  unteamed_employees?: TeamMember[];
};

type Region = {
  region_id: string;
  name: string;
  keywords?: string | null;
  active?: boolean;
  team_leads?: string[];
};

type Notice = { kind: 'ok' | 'error'; text: string } | null;

type TransferMode = 'keep_assignees' | 'return_to_pool';

function errText(e: any, fallback: string): string {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msg = detail.map((d) => d?.msg || String(d)).filter(Boolean).join('; ');
    if (msg) return msg;
  }
  if (e?.response?.status === 401) return 'Session expired. Please log in again.';
  return fallback;
}

/** Web uses window.confirm like the other screens; native falls back to Alert. */
function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.confirm) return Promise.resolve(true);
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ]);
  });
}

function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function n(value: unknown): number {
  const v = Number(value);
  return Number.isFinite(v) ? v : 0;
}

export default function TeamsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = isAdminRole(user?.role, user?.email);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionsEditable, setRegionsEditable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [addMembersFor, setAddMembersFor] = useState<TeamLeadRow | null>(null);
  const [busyMember, setBusyMember] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    setLoadError(null);
    const [ov, rg] = await Promise.allSettled([
      api.get('/teams/overview'),
      api.get('/regions', { params: { include_inactive: true } }),
    ]);
    if (ov.status === 'fulfilled') {
      const d = ov.value.data || {};
      setOverview({
        team_leads: Array.isArray(d.team_leads) ? d.team_leads : [],
        pipeline_total: n(d.pipeline_total),
        columns_ready: d.columns_ready !== false,
        regions_ready: d.regions_ready !== false,
        admin_pool: n(d.admin_pool),
        admin_pool_active: n(d.admin_pool_active),
        no_team_assigned: n(d.no_team_assigned),
        unteamed_employees: Array.isArray(d.unteamed_employees) ? d.unteamed_employees : [],
      });
    } else {
      setLoadError(errText(ov.reason, 'Could not load teams.'));
    }
    if (rg.status === 'fulfilled') {
      const d = rg.value.data || {};
      setRegions(Array.isArray(d.regions) ? d.regions : []);
      setRegionsEditable(d.editable !== false);
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const teamLeads = overview?.team_leads || [];
  const activeTeamLeads = useMemo(() => teamLeads.filter((t) => t.active !== false), [teamLeads]);
  const unteamed = overview?.unteamed_employees || [];

  const teamsTotal = useMemo(() => teamLeads.reduce((s, t) => s + n(t.leads?.total), 0), [teamLeads]);
  const membersTotal = useMemo(() => teamLeads.reduce((s, t) => s + (t.members?.length || 0), 0), [teamLeads]);
  const adminPool = n(overview?.admin_pool);
  const noTeam = n(overview?.no_team_assigned);
  const pipelineTotal = n(overview?.pipeline_total);
  const accounted = adminPool + teamsTotal + noTeam;

  const teamLeadOptions: SelectOption[] = useMemo(
    () => activeTeamLeads.map((t) => ({
      key: t.employee_id,
      label: t.name || t.employee_id,
      sublabel: `${regionsLabel(t.regions)} · ${t.members?.length || 0} members`,
    })),
    [activeTeamLeads],
  );

  const assignMembers = useCallback(async (employeeIds: string[], teamLeadId: string | null) => {
    const res = await api.post('/teams/members', {
      employee_ids: employeeIds,
      team_lead_id: teamLeadId,
      move_leads: true,
    });
    return res.data || {};
  }, []);

  const putUnder = async (emp: TeamMember, teamLeadId: string) => {
    if (!teamLeadId) return;
    const tl = teamLeads.find((t) => t.employee_id === teamLeadId);
    setBusyMember(emp.employee_id);
    setNotice(null);
    try {
      const r = await assignMembers([emp.employee_id], teamLeadId);
      const skipped = countOf(r.skipped);
      setNotice(skipped
        ? { kind: 'error', text: `${emp.name || 'Employee'} could not be moved (${describeSkipped(r.skipped)}).` }
        : { kind: 'ok', text: `${emp.name || 'Employee'} is now in ${tl?.name || 'the team'}'s team · ${n(r.leads_moved)} leads moved with them.` });
      await load();
    } catch (e: any) {
      setNotice({ kind: 'error', text: errText(e, 'Could not move the employee.') });
    } finally { setBusyMember(null); }
  };

  const removeMember = async (tl: TeamLeadRow, m: TeamMember) => {
    const ok = await confirmAction(
      'Remove from team?',
      `${m.name || 'This employee'} will leave ${tl.name || 'this'}'s team. Their current leads move with them and will show under "Assigned to employees with no team" until you put them in a team again.`,
    );
    if (!ok) return;
    setBusyMember(m.employee_id);
    setNotice(null);
    try {
      const r = await assignMembers([m.employee_id], null);
      const skipped = countOf(r.skipped);
      setNotice(skipped
        ? { kind: 'error', text: `${m.name || 'Employee'} could not be removed from the team (${describeSkipped(r.skipped)}).` }
        : { kind: 'ok', text: `${m.name || 'Employee'} removed from ${tl.name || 'the'} team · ${n(r.leads_moved)} leads moved with them.` });
      await load();
    } catch (e: any) {
      setNotice({ kind: 'error', text: errText(e, 'Could not remove the employee from the team.') });
    } finally { setBusyMember(null); }
  };

  const openTransfer = (fromId: string | null) => {
    setTransferFrom(fromId);
    setTransferOpen(true);
  };

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <TopBar title="Teams & Regions" subtitle="Administrator only" />
        <View style={{ padding: 24, flex: 1 }}>
          <EmptyState
            title="Admin only"
            description="Teams & Regions is managed by the administrator. Team Leads can see their own team on the Dashboard, Assign Leads and Employees pages."
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title="Teams & Regions"
        subtitle={overview
          ? `${teamLeads.length} Team Lead${teamLeads.length === 1 ? '' : 's'} · ${membersTotal} team members · ${pipelineTotal} pipeline leads`
          : 'Team Leads, their people, their regions'}
        rightAction={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              testID="teams-transfer-btn"
              onPress={() => openTransfer(null)}
              style={[styles.outlineBtnSm, { borderColor: colors.warning }]}
            >
              <Ionicons name="swap-horizontal" size={14} color={colors.warning} />
              <Text style={{ color: colors.warning, fontWeight: '600', fontSize: 12 }}>Transfer leads</Text>
            </Pressable>
            <Pressable
              testID="teams-add-tl-btn"
              onPress={() => router.push('/(app)/employees?add=team_lead' as any)}
              style={[styles.primary, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="person-add" size={14} color="#fff" />
              <Text style={styles.primaryText}>Add Team Lead</Text>
            </Pressable>
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        {loading && !overview ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : null}

        {loadError ? (
          <View style={[styles.banner, { borderColor: colors.negative, backgroundColor: colors.negative + '12' }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.negative} />
            <Text style={[styles.bannerText, { color: colors.negative }]}>{loadError}</Text>
            <Pressable onPress={() => { setLoading(true); load(); }} style={[styles.outlineBtnSm, { borderColor: colors.negative }]}>
              <Text style={{ color: colors.negative, fontWeight: '600', fontSize: 12 }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {overview && (!overview.columns_ready || !overview.regions_ready) ? (
          <View style={[styles.banner, { borderColor: colors.warning, backgroundColor: colors.warning + '14' }]}>
            <Ionicons name="warning-outline" size={18} color={colors.warning} />
            <Text style={[styles.bannerText, { color: colors.text }]}>
              The team database columns are not set up yet. Run{' '}
              <Text style={{ fontWeight: '700' }}>supabase/TEAM_LEADS_AND_EXPORTS.sql</Text> in the Supabase SQL Editor.
              {!overview.columns_ready ? ' Team moves and transfers are disabled until then.' : ''}
              {!overview.regions_ready ? ' Regions cannot be edited until then.' : ''}
            </Text>
          </View>
        ) : null}

        {notice ? (
          <View style={[styles.banner, {
            borderColor: notice.kind === 'ok' ? colors.positive : colors.negative,
            backgroundColor: (notice.kind === 'ok' ? colors.positive : colors.negative) + '12',
          }]}>
            <Ionicons
              name={notice.kind === 'ok' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={18}
              color={notice.kind === 'ok' ? colors.positive : colors.negative}
            />
            <Text style={[styles.bannerText, { color: notice.kind === 'ok' ? colors.positive : colors.negative }]}>{notice.text}</Text>
            <Pressable onPress={() => setNotice(null)} hitSlop={10}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {overview ? (
          <>
            {/* Summary — every pipeline lead is in exactly one of these buckets */}
            <View style={styles.statRow}>
              <StatCard
                testID="teams-stat-admin-pool"
                label="Admin pool"
                value={adminPool}
                delta={`${n(overview.admin_pool_active)} active of ${adminPool} · waiting for you to route to a Team Lead`}
                icon="file-tray-full-outline"
                accent={colors.warning}
                onPress={() => router.push({ pathname: '/(app)/assign-leads', params: { team: 'admin_pool', team_view: 'pool' } } as any)}
              />
              <StatCard
                testID="teams-stat-team-leads"
                label="Team Leads"
                value={teamLeads.length}
                delta={`${activeTeamLeads.length} active · ${membersTotal} team members`}
                icon="people-outline"
              />
              <StatCard
                testID="teams-stat-pipeline"
                label="Pipeline leads"
                value={pipelineTotal}
                delta={`${teamsTotal} with Team Leads`}
                icon="layers-outline"
                accent={colors.info}
              />
              <StatCard
                testID="teams-stat-no-team"
                label="Employees with no team"
                value={noTeam}
                delta={`Leads assigned to ${unteamed.length} employee${unteamed.length === 1 ? '' : 's'} outside any team`}
                icon="person-remove-outline"
                accent={noTeam ? colors.negative : colors.positive}
              />
            </View>
            <View style={[styles.reconcile, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Ionicons
                name={accounted === pipelineTotal ? 'checkmark-done-outline' : 'alert-circle-outline'}
                size={16}
                color={accounted === pipelineTotal ? colors.positive : colors.warning}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>
                Admin pool <Text style={{ color: colors.text, fontWeight: '700' }}>{adminPool}</Text>
                {' + '}teams <Text style={{ color: colors.text, fontWeight: '700' }}>{teamsTotal}</Text>
                {' + '}no-team <Text style={{ color: colors.text, fontWeight: '700' }}>{noTeam}</Text>
                {' = '}<Text style={{ color: colors.text, fontWeight: '700' }}>{accounted}</Text>
                {' · '}pipeline total <Text style={{ color: colors.text, fontWeight: '700' }}>{pipelineTotal}</Text>
                {accounted === pipelineTotal
                  ? ' — every lead is accounted for.'
                  : ` — differs by ${Math.abs(pipelineTotal - accounted)}. Refresh; if it persists, check /schema-check.`}
              </Text>
              <Pressable onPress={() => { setLoading(true); load(); }} hitSlop={10} testID="teams-refresh">
                {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={16} color={colors.primary} />}
              </Pressable>
            </View>

            {/* Team Lead cards */}
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Team Leads</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
                Team Leads are created on the Employees page with role "Team Lead" and the regions they cover.
              </Text>
            </View>

            {teamLeads.length === 0 ? (
              <EmptyState
                variant="leads"
                title="No Team Leads yet"
                description='Add an employee with role "Team Lead" and pick the regions they cover (Virar, Vasai, Nallasopara, Nagpur…). New leads wait in the admin pool until you route them.'
                actionLabel="Add Team Lead"
                onAction={() => router.push('/(app)/employees?add=team_lead' as any)}
                testIDAction="teams-empty-add-tl"
              />
            ) : (
              <View style={styles.cardGrid}>
                {teamLeads.map((tl) => {
                  const isOpen = !!expanded[tl.employee_id];
                  const inactive = tl.active === false;
                  const members = tl.members || [];
                  return (
                    <View
                      key={tl.employee_id}
                      testID={`team-card-${tl.employee_id}`}
                      style={[styles.tlCard, { borderColor: colors.border, backgroundColor: colors.surface, opacity: inactive ? 0.6 : 1 }]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={[styles.avatar, { backgroundColor: inactive ? colors.textMuted : colors.primary }]}>
                          <Text style={{ color: '#fff', fontWeight: '700' }}>{tl.name?.[0]?.toUpperCase() || '?'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={[styles.tlName, { color: colors.text }]}>{tl.name || tl.employee_id}</Text>
                            {inactive ? <Badge text="INACTIVE" color={colors.textMuted} /> : null}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                            <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={2}>{regionsLabel(tl.regions)}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.countRow}>
                        <CountBox label="Leads" value={n(tl.leads?.total)} color={colors.primary} colors={colors} />
                        <CountBox label="Team pool" value={n(tl.leads?.pool)} color={colors.warning} colors={colors} />
                        <CountBox label="With employees" value={n(tl.leads?.assigned)} color={colors.positive} colors={colors} />
                        <CountBox label="Members" value={members.length} color={colors.info} colors={colors} />
                      </View>

                      <View style={styles.actionRow}>
                        <Pressable
                          testID={`team-open-leads-${tl.employee_id}`}
                          onPress={() => router.push({ pathname: '/(app)/assign-leads', params: { team: tl.employee_id } } as any)}
                          style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                        >
                          <Ionicons name="open-outline" size={13} color="#fff" />
                          <Text style={styles.primaryText}>Open leads</Text>
                        </Pressable>
                        <Pressable
                          testID={`team-transfer-${tl.employee_id}`}
                          onPress={() => openTransfer(tl.employee_id)}
                          style={[styles.smallBtnOutline, { borderColor: colors.warning }]}
                        >
                          <Ionicons name="swap-horizontal" size={13} color={colors.warning} />
                          <Text style={{ color: colors.warning, fontWeight: '600', fontSize: 12 }}>Transfer leads</Text>
                        </Pressable>
                        <Pressable
                          testID={`team-add-members-${tl.employee_id}`}
                          onPress={() => setAddMembersFor(tl)}
                          disabled={inactive}
                          style={[styles.smallBtnOutline, { borderColor: colors.primary, opacity: inactive ? 0.5 : 1 }]}
                        >
                          <Ionicons name="person-add-outline" size={13} color={colors.primary} />
                          <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>Add members</Text>
                        </Pressable>
                        <Pressable
                          testID={`team-expand-${tl.employee_id}`}
                          onPress={() => setExpanded((p) => ({ ...p, [tl.employee_id]: !p[tl.employee_id] }))}
                          style={[styles.smallBtnOutline, { borderColor: colors.border }]}
                        >
                          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textSecondary} />
                          <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 12 }}>
                            {isOpen ? 'Hide members' : `Members (${members.length})`}
                          </Text>
                        </Pressable>
                      </View>

                      {isOpen ? (
                        <View style={[styles.memberList, { borderTopColor: colors.border }]}>
                          {members.length === 0 ? (
                            <Text style={{ color: colors.textMuted, fontSize: 12, paddingVertical: 6 }}>
                              No members yet. Use "Add members" to put employees in this team.
                            </Text>
                          ) : members.map((m) => (
                            <View key={m.employee_id} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{m.name || m.employee_id}</Text>
                                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                                  {roleLabel(m.role)}{m.location ? ` · ${m.location}` : ''}
                                </Text>
                              </View>
                              <Badge text={m.active === false ? 'DISABLED' : 'ACTIVE'} color={m.active === false ? colors.textMuted : colors.positive} />
                              <Pressable
                                testID={`team-remove-${m.employee_id}`}
                                onPress={() => removeMember(tl, m)}
                                disabled={busyMember === m.employee_id}
                                style={[styles.iconAct, { borderColor: colors.border }]}
                                accessibilityLabel="Remove from team"
                              >
                                {busyMember === m.employee_id
                                  ? <ActivityIndicator size="small" color={colors.negative} />
                                  : <Ionicons name="person-remove-outline" size={14} color={colors.negative} />}
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Employees outside any team */}
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={[styles.cardHead, { borderBottomColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Employees with no team ({unteamed.length})</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    Their leads ({noTeam}) are not supervised by any Team Lead. Put each one under a Team Lead — their leads move with them.
                  </Text>
                </View>
              </View>
              {unteamed.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, padding: 16 }}>Everyone is in a team.</Text>
              ) : unteamed.map((emp) => (
                <View key={emp.employee_id} style={[styles.unteamedRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1, minWidth: 180 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{emp.name || emp.employee_id}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {roleLabel(emp.role)}{emp.location ? ` · ${emp.location}` : ''}{emp.active === false ? ' · disabled' : ''}
                    </Text>
                  </View>
                  <View style={{ width: 240, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {busyMember === emp.employee_id ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                    <SearchableSelect
                      label=""
                      compact
                      value=""
                      placeholder={activeTeamLeads.length ? 'Put under…' : 'No active Team Lead'}
                      options={teamLeadOptions}
                      onChange={(key) => putUnder(emp, key)}
                      testID={`unteamed-put-${emp.employee_id}`}
                    />
                  </View>
                </View>
              ))}
            </View>

            <RegionsSection
              regions={regions}
              editable={regionsEditable && overview.regions_ready}
              colors={colors}
              onChanged={load}
            />
          </>
        ) : null}
      </ScrollView>

      <TransferModal
        visible={transferOpen}
        initialFrom={transferFrom}
        teamLeads={teamLeads}
        colors={colors}
        onClose={() => setTransferOpen(false)}
        onDone={load}
      />
      <AddMembersModal
        target={addMembersFor}
        teamLeads={teamLeads}
        unteamed={unteamed}
        colors={colors}
        onClose={() => setAddMembersFor(null)}
        onSubmit={assignMembers}
        onDone={load}
      />
    </View>
  );
}

function describeSkipped(skipped: unknown): string {
  if (!Array.isArray(skipped) || skipped.length === 0) return '';
  const reasons: Record<string, string> = {
    not_found: 'not found',
    is_team_lead_or_admin: 'is a Team Lead or admin',
    save_failed: 'database rejected the change',
  };
  return skipped.map((s: any) => reasons[s?.reason] || s?.reason || 'skipped').join(', ');
}

function CountBox({ label, value, color, colors }: { label: string; value: number; color: string; colors: any }) {
  return (
    <View style={[styles.countBox, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
      <Text style={{ color, fontSize: 18, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Emergency transfer (a Team Lead is absent / leaving)
// ---------------------------------------------------------------------------
function TransferModal({ visible, initialFrom, teamLeads, colors, onClose, onDone }: {
  visible: boolean;
  initialFrom: string | null;
  teamLeads: TeamLeadRow[];
  colors: any;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [mode, setMode] = useState<TransferMode>('keep_assignees');
  const [moveMembers, setMoveMembers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFromId(initialFrom || '');
    setToId('');
    setMode('keep_assignees');
    setMoveMembers(false);
    setError(null);
    setResult(null);
  }, [visible, initialFrom]);

  const source = teamLeads.find((t) => t.employee_id === fromId) || null;
  const target = teamLeads.find((t) => t.employee_id === toId) || null;

  const fromOptions: SelectOption[] = teamLeads.map((t) => ({
    key: t.employee_id,
    label: t.name || t.employee_id,
    sublabel: `${n(t.leads?.total)} leads · ${t.members?.length || 0} members${t.active === false ? ' · inactive' : ''}`,
  }));
  const toOptions: SelectOption[] = teamLeads
    .filter((t) => t.active !== false && t.employee_id !== fromId)
    .map((t) => ({
      key: t.employee_id,
      label: t.name || t.employee_id,
      sublabel: `${regionsLabel(t.regions)} · ${n(t.leads?.total)} leads now`,
    }));

  const canSubmit = !!source && !!target && fromId !== toId && !busy;

  const submit = async () => {
    if (!source || !target) return;
    const total = n(source.leads?.total);
    const modeText = mode === 'keep_assignees'
      ? 'Employees keep working their leads; the new Team Lead supervises them.'
      : 'Leads return to the new Team Lead\'s pool to be assigned again.';
    const ok = await confirmAction(
      'Transfer leads?',
      `Move ALL ${total} leads of ${source.name} (including broker-pool and not-interested) to ${target.name}.\n\n${modeText}`
        + (moveMembers ? `\n\nAlso move ${source.members?.length || 0} team members to ${target.name}.` : ''),
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/teams/transfer', {
        from_team_lead_id: fromId,
        to_team_lead_id: toId,
        lead_ids: null,
        mode,
        move_members: moveMembers,
      }, { timeout: 180000 });
      setResult(res.data || {});
      await onDone();
    } catch (e: any) {
      setError(errText(e, 'Transfer failed. Nothing was reported as moved — try again.'));
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <Pressable style={styles.backdrop} onPress={() => { if (!busy) onClose(); }}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '90%' }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <View style={styles.modalHead}>
            <Ionicons name="swap-horizontal" size={18} color={colors.warning} />
            <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]}>Transfer leads between Team Leads</Text>
            <Pressable onPress={onClose} disabled={busy} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            Use when a Team Lead is absent or leaving. Every lead they own moves — nothing stays behind.
          </Text>

          {result ? (
            <ScrollView style={{ marginTop: 14 }}>
              <View style={[styles.resultBox, { borderColor: colors.positive, backgroundColor: colors.positive + '10' }]}>
                <Text style={{ color: colors.positive, fontWeight: '700', fontSize: 14 }}>
                  {n(result.moved_count)} leads moved to {result.to?.name || target?.name}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                  From {result.from?.name || source?.name} · {countOf(result.members_moved)} team members moved
                </Text>
              </View>
              {n(result.failed_count) > 0 ? (
                <View style={[styles.resultBox, { borderColor: colors.negative, backgroundColor: colors.negative + '10', marginTop: 10 }]}>
                  <Text style={{ color: colors.negative, fontWeight: '700', fontSize: 14 }}>
                    {n(result.failed_count)} leads were NOT moved
                  </Text>
                  <Text style={{ color: colors.negative, fontSize: 12, marginTop: 4 }}>
                    The database rejected them; they are still with {result.from?.name || source?.name}. Run the transfer again to retry them.
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                {n(result.failed_count) > 0 ? (
                  <Pressable onPress={() => setResult(null)} style={[styles.outlineBtn, { borderColor: colors.negative, flex: 1 }]}>
                    <Text style={{ color: colors.negative, fontWeight: '600', fontSize: 12 }}>Retry failed</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={onClose} style={[styles.primary, { backgroundColor: colors.primary, flex: 1, justifyContent: 'center', height: 40 }]}>
                  <Text style={styles.primaryText}>Done</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : (
            <ScrollView style={{ marginTop: 10 }} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
              <SearchableSelect
                label="FROM TEAM LEAD"
                value={fromId}
                options={fromOptions}
                onChange={(k) => { setFromId(k); if (k === toId) setToId(''); }}
                placeholder="Who is absent / leaving?"
                testID="transfer-from"
                modalZIndex={16000}
              />
              {source ? (
                <View style={[styles.sourceBox, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                    {n(source.leads?.total)} leads will move
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {n(source.leads?.pool)} in team pool · {n(source.leads?.assigned)} with employees · {source.members?.length || 0} members
                  </Text>
                </View>
              ) : null}
              <SearchableSelect
                label="TO TEAM LEAD (ACTIVE)"
                value={toId}
                options={toOptions}
                onChange={setToId}
                placeholder={toOptions.length ? 'Who takes over?' : 'No other active Team Lead'}
                testID="transfer-to"
                modalZIndex={16000}
              />

              <Text style={[styles.label, { color: colors.textMuted, marginTop: 4, marginBottom: 0 }]}>WHAT HAPPENS TO THE LEADS</Text>
              <RadioRow
                selected={mode === 'keep_assignees'}
                onPress={() => setMode('keep_assignees')}
                title="Keep employees working the leads (new Team Lead supervises)"
                colors={colors}
                testID="transfer-mode-keep"
              />
              <RadioRow
                selected={mode === 'return_to_pool'}
                onPress={() => setMode('return_to_pool')}
                title="Return leads to the new Team Lead's pool for re-assignment"
                colors={colors}
                testID="transfer-mode-pool"
              />

              <Pressable
                testID="transfer-move-members"
                onPress={() => setMoveMembers((v) => !v)}
                style={[styles.checkRow, {
                  borderColor: moveMembers ? colors.primary : colors.border,
                  backgroundColor: moveMembers ? colors.primary + '12' : colors.surfaceAlt,
                }]}
              >
                <View style={[styles.checkbox, { borderColor: moveMembers ? colors.primary : colors.border, backgroundColor: moveMembers ? colors.primary : 'transparent' }]}>
                  {moveMembers ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                </View>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500', flex: 1 }}>
                  Also move this team's members to the new Team Lead{source ? ` (${source.members?.length || 0})` : ''}
                </Text>
              </Pressable>

              {error ? <Text style={{ color: colors.negative, fontSize: 12 }}>{error}</Text> : null}

              <Pressable
                testID="transfer-submit"
                onPress={submit}
                disabled={!canSubmit}
                style={[styles.primary, { backgroundColor: colors.warning, height: 42, justifyContent: 'center', opacity: canSubmit ? 1 : 0.5 }]}
              >
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.primaryText}>
                    {source && target ? `Transfer ${n(source.leads?.total)} leads to ${target.name}` : 'Transfer leads'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RadioRow({ selected, onPress, title, colors, testID }: { selected: boolean; onPress: () => void; title: string; colors: any; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.radioRow, {
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary + '12' : colors.surfaceAlt,
      }]}
    >
      <View style={[styles.radio, { borderColor: selected ? colors.primary : colors.border }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
      </View>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500', flex: 1 }}>{title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Add members to a team
// ---------------------------------------------------------------------------
function AddMembersModal({ target, teamLeads, unteamed, colors, onClose, onSubmit, onDone }: {
  target: TeamLeadRow | null;
  teamLeads: TeamLeadRow[];
  unteamed: TeamMember[];
  colors: any;
  onClose: () => void;
  onSubmit: (ids: string[], teamLeadId: string | null) => Promise<any>;
  onDone: () => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [showOtherTeams, setShowOtherTeams] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    if (!target) return;
    setSelected([]);
    setQuery('');
    setShowOtherTeams(false);
    setError(null);
    setResult(null);
  }, [target]);

  const candidates = useMemo(() => {
    if (!target) return [] as (TeamMember & { currentTeam?: string })[];
    const rows: (TeamMember & { currentTeam?: string })[] = unteamed.map((e) => ({ ...e }));
    if (showOtherTeams) {
      for (const tl of teamLeads) {
        if (tl.employee_id === target.employee_id) continue;
        for (const m of tl.members || []) rows.push({ ...m, currentTeam: tl.name || tl.employee_id });
      }
    }
    const q = query.trim().toLowerCase();
    return q
      ? rows.filter((r) => [r.name, r.location, roleLabel(r.role), r.currentTeam].some((v) => String(v || '').toLowerCase().includes(q)))
      : rows;
  }, [target, unteamed, teamLeads, showOtherTeams, query]);

  const toggle = (id: string) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    if (!target || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onSubmit(selected, target.employee_id);
      setResult(r);
      setSelected([]);
      await onDone();
    } catch (e: any) {
      setError(errText(e, 'Could not add members.'));
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <Pressable style={styles.backdrop} onPress={() => { if (!busy) onClose(); }}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '88%' }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <View style={styles.modalHead}>
            <Ionicons name="person-add-outline" size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]}>Add members to {target?.name || 'team'}</Text>
            <Pressable onPress={onClose} disabled={busy} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            The employees' current leads move into this team with them.
          </Text>

          {result ? (
            <View style={[styles.resultBox, { borderColor: colors.positive, backgroundColor: colors.positive + '10', marginTop: 12 }]}>
              <Text style={{ color: colors.positive, fontWeight: '700', fontSize: 13 }}>
                {countOf(result.moved)} moved · {n(result.leads_moved)} leads moved with them
              </Text>
              {countOf(result.skipped) > 0 ? (
                <Text style={{ color: colors.negative, fontSize: 12, marginTop: 4 }}>
                  {countOf(result.skipped)} skipped ({describeSkipped(result.skipped)})
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, marginTop: 12 }]}>
            <Ionicons name="search" size={15} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, role, location…"
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, color: colors.text, fontSize: 13, paddingVertical: 8, paddingHorizontal: 8 }}
            />
          </View>
          <Pressable onPress={() => setShowOtherTeams((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Ionicons name={showOtherTeams ? 'checkbox' : 'square-outline'} size={16} color={colors.primary} />
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Also show employees in other teams (moves them out of that team)</Text>
          </Pressable>

          <ScrollView style={{ marginTop: 10, maxHeight: 340 }} contentContainerStyle={{ gap: 6 }}>
            {candidates.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, padding: 12, textAlign: 'center' }}>
                {unteamed.length === 0 && !showOtherTeams ? 'Every employee is already in a team.' : 'No matches.'}
              </Text>
            ) : candidates.map((c) => {
              const checked = selected.includes(c.employee_id);
              return (
                <Pressable
                  key={c.employee_id}
                  testID={`add-member-${c.employee_id}`}
                  onPress={() => toggle(c.employee_id)}
                  style={[styles.checkRow, {
                    height: undefined, paddingVertical: 8,
                    borderColor: checked ? colors.primary : colors.border,
                    backgroundColor: checked ? colors.primary + '12' : colors.surfaceAlt,
                  }]}
                >
                  <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}>
                    {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{c.name || c.employee_id}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {roleLabel(c.role)}{c.location ? ` · ${c.location}` : ''}{c.active === false ? ' · disabled' : ''}
                    </Text>
                  </View>
                  <Badge text={c.currentTeam ? `IN ${c.currentTeam.toUpperCase()}'S TEAM` : 'NO TEAM'} color={c.currentTeam ? colors.warning : colors.textMuted} />
                </Pressable>
              );
            })}
          </ScrollView>

          {error ? <Text style={{ color: colors.negative, fontSize: 12, marginTop: 10 }}>{error}</Text> : null}
          <Pressable
            testID="add-members-submit"
            onPress={submit}
            disabled={busy || selected.length === 0}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 12, height: 42, justifyContent: 'center', opacity: selected.length && !busy ? 1 : 0.5 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.primaryText}>
                {selected.length ? `Add ${selected.length} to ${target?.name || 'team'}` : 'Select employees'}
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------
function RegionsSection({ regions, editable, colors, onChanged }: {
  regions: Region[];
  editable: boolean;
  colors: any;
  onChanged: () => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editKeywords, setEditKeywords] = useState('');

  const sorted = useMemo(
    () => [...regions].sort((a, b) => Number(b.active !== false) - Number(a.active !== false) || a.name.localeCompare(b.name)),
    [regions],
  );

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy('add');
    setError(null);
    try {
      await api.post('/regions', { name: trimmed, keywords: keywords.trim() || undefined });
      setName('');
      setKeywords('');
      await onChanged();
    } catch (e: any) {
      setError(errText(e, 'Could not add the region.'));
    } finally { setBusy(null); }
  };

  const startEdit = (r: Region) => {
    setEditId(r.region_id);
    setEditName(r.name || '');
    setEditKeywords(r.keywords || '');
    setError(null);
  };

  const saveEdit = async (r: Region) => {
    if (!editName.trim()) return;
    setBusy(r.region_id);
    setError(null);
    try {
      await api.patch(`/regions/${encodeURIComponent(r.region_id)}`, { name: editName.trim(), keywords: editKeywords.trim() });
      setEditId(null);
      await onChanged();
    } catch (e: any) {
      setError(errText(e, 'Could not save the region.'));
    } finally { setBusy(null); }
  };

  const setActive = async (r: Region, active: boolean) => {
    if (!active) {
      const ok = await confirmAction(
        'Deactivate region?',
        `${r.name} will no longer be offered for new Team Leads or auto-routing. Team Leads keep their history.`,
      );
      if (!ok) return;
    }
    setBusy(r.region_id);
    setError(null);
    try {
      if (active) await api.patch(`/regions/${encodeURIComponent(r.region_id)}`, { active: true });
      else await api.delete(`/regions/${encodeURIComponent(r.region_id)}`);
      await onChanged();
    } catch (e: any) {
      setError(errText(e, 'Could not update the region.'));
    } finally { setBusy(null); }
  };

  const inputStyle = {
    height: 38, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 10, color: colors.text, backgroundColor: colors.surfaceAlt, fontSize: 13,
  } as const;

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[styles.cardHead, { borderBottomColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Regions ({regions.filter((r) => r.active !== false).length} active)</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            Auto-routing sends an admin-pool lead to the Team Lead whose region matches the lead's location. Keywords are extra spellings to match.
          </Text>
        </View>
      </View>

      {!editable ? (
        <View style={[styles.banner, { margin: 12, borderColor: colors.warning, backgroundColor: colors.warning + '14' }]}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.warning} />
          <Text style={[styles.bannerText, { color: colors.text }]}>
            Regions are read-only until supabase/TEAM_LEADS_AND_EXPORTS.sql is run in Supabase.
          </Text>
        </View>
      ) : (
        <View style={[styles.addRegionRow, { borderBottomColor: colors.border }]}>
          <TextInput
            testID="region-new-name"
            value={name}
            onChangeText={setName}
            placeholder="Region name, e.g. Naigaon"
            placeholderTextColor={colors.textMuted}
            style={[inputStyle, { flex: 1, minWidth: 160 }]}
          />
          <TextInput
            testID="region-new-keywords"
            value={keywords}
            onChangeText={setKeywords}
            placeholder="Keywords (optional), e.g. nalasopara,nala sopara"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={[inputStyle, { flex: 2, minWidth: 220 }]}
          />
          <Pressable
            testID="region-add"
            onPress={add}
            disabled={!name.trim() || busy === 'add'}
            style={[styles.primary, { backgroundColor: colors.primary, height: 38, opacity: name.trim() ? 1 : 0.5 }]}
          >
            {busy === 'add' ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Ionicons name="add" size={14} color="#fff" />
                <Text style={styles.primaryText}>Add region</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {error ? <Text style={{ color: colors.negative, fontSize: 12, paddingHorizontal: 16, paddingTop: 10 }}>{error}</Text> : null}

      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flex: 1, minWidth: 720 }}>
          <View style={[styles.tHead, { borderBottomColor: colors.border }]}>
            <Text style={[styles.th, { color: colors.textMuted, flex: 1.2 }]}>REGION</Text>
            <Text style={[styles.th, { color: colors.textMuted, flex: 2 }]}>KEYWORDS</Text>
            <Text style={[styles.th, { color: colors.textMuted, flex: 1.6 }]}>TEAM LEADS</Text>
            <Text style={[styles.th, { color: colors.textMuted, width: 90 }]}>STATUS</Text>
            <Text style={[styles.th, { color: colors.textMuted, width: 110, textAlign: 'right' }]}>ACTIONS</Text>
          </View>
          {sorted.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13, padding: 16 }}>No regions yet.</Text>
          ) : sorted.map((r) => {
            const inactive = r.active === false;
            const editing = editId === r.region_id;
            const rowBusy = busy === r.region_id;
            return (
              <View key={r.region_id} style={[styles.tRow, { borderBottomColor: colors.border, opacity: inactive && !editing ? 0.6 : 1 }]}>
                {editing ? (
                  <>
                    <View style={{ flex: 1.2, paddingRight: 8 }}>
                      <TextInput value={editName} onChangeText={setEditName} style={inputStyle} placeholderTextColor={colors.textMuted} />
                    </View>
                    <View style={{ flex: 2, paddingRight: 8 }}>
                      <TextInput
                        value={editKeywords}
                        onChangeText={setEditKeywords}
                        autoCapitalize="none"
                        placeholder="comma-separated spellings"
                        placeholderTextColor={colors.textMuted}
                        style={inputStyle}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.cellPrimary, { color: colors.text, flex: 1.2 }]}>{r.name}</Text>
                    <Text style={[styles.cellSecondary, { color: colors.textSecondary, flex: 2 }]} numberOfLines={2}>{r.keywords || '—'}</Text>
                  </>
                )}
                <Text style={[styles.cellSecondary, { color: colors.textSecondary, flex: 1.6 }]} numberOfLines={2}>
                  {r.team_leads && r.team_leads.length ? r.team_leads.join(', ') : 'No Team Lead'}
                </Text>
                <View style={{ width: 90 }}>
                  <Badge text={inactive ? 'INACTIVE' : 'ACTIVE'} color={inactive ? colors.textMuted : colors.positive} />
                </View>
                <View style={{ width: 110, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                  {rowBusy ? <ActivityIndicator size="small" color={colors.primary} /> : editing ? (
                    <>
                      <Pressable onPress={() => saveEdit(r)} style={[styles.iconAct, { borderColor: colors.positive }]} accessibilityLabel="Save region">
                        <Ionicons name="checkmark" size={14} color={colors.positive} />
                      </Pressable>
                      <Pressable onPress={() => setEditId(null)} style={[styles.iconAct, { borderColor: colors.border }]} accessibilityLabel="Cancel">
                        <Ionicons name="close" size={14} color={colors.textSecondary} />
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        testID={`region-edit-${r.region_id}`}
                        onPress={() => startEdit(r)}
                        disabled={!editable}
                        style={[styles.iconAct, { borderColor: colors.border, opacity: editable ? 1 : 0.4 }]}
                        accessibilityLabel="Edit region"
                      >
                        <Ionicons name="create-outline" size={14} color={colors.primary} />
                      </Pressable>
                      <Pressable
                        testID={`region-toggle-${r.region_id}`}
                        onPress={() => setActive(r, inactive)}
                        disabled={!editable}
                        style={[styles.iconAct, { borderColor: colors.border, opacity: editable ? 1 : 0.4 }]}
                        accessibilityLabel={inactive ? 'Reactivate region' : 'Deactivate region'}
                      >
                        <Ionicons
                          name={inactive ? 'play-circle-outline' : 'pause-circle-outline'}
                          size={14}
                          color={inactive ? colors.positive : colors.negative}
                        />
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 12, textAlign: 'center' },
  outlineBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, height: 40 },
  outlineBtnSm: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 8, borderWidth: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  reconcile: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tlCard: { flexGrow: 1, flexBasis: 360, minWidth: 300, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  tlName: { fontSize: 15, fontWeight: '700' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  countRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  countBox: { flexGrow: 1, flexBasis: 70, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, gap: 2 },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 7 },
  smallBtnOutline: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 7, borderWidth: 1 },
  memberList: { borderTopWidth: 1, paddingTop: 6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  iconAct: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  unteamedRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  addRegionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1 },
  tHead: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  th: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  cellPrimary: { fontSize: 13, fontWeight: '600' },
  cellSecondary: { fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { width: '92%', maxWidth: 520, padding: 20, borderRadius: 12, borderWidth: 1 },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 42, borderRadius: 8, borderWidth: 1 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 5 },
  resultBox: { borderWidth: 1, borderRadius: 10, padding: 12 },
  sourceBox: { borderWidth: 1, borderRadius: 8, padding: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10 },
});
