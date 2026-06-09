import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { roleLabel } from '../../src/lib/constants';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { formatBudgetStringLakhs } from '../../src/lib/leadFormat';
import { Ionicons } from '@expo/vector-icons';

function formatDt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function AssignLeads() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [queue, setQueue] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [assignmentStats, setAssignmentStats] = useState<any[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEmployeeId, setBulkEmployeeId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, s] = await Promise.all([
        api.get('/leads/assign-queue'),
        api.get('/stats/assignment'),
      ]);
      setQueue(q.data?.leads || []);
      setEmployees(q.data?.employees || []);
      setAssignmentStats(s.data?.employees || []);
      setUnassignedCount(Number(s.data?.unassigned_count ?? q.data?.total ?? 0));
      setSelected(new Set());
      setBulkEmployeeId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = queue.length > 0 && selected.size === queue.length;

  const toggleLead = (leadId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(queue.map((l) => l.lead_id)));
    }
  };

  const assignLead = async (leadId: string, employeeId: string) => {
    setBusyId(leadId);
    setMessage(null);
    try {
      await api.patch(`/leads/${leadId}`, { assigned_to: employeeId, stage: 'assigned' });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const bulkAssign = async () => {
    if (selectedIds.length < 1) {
      setMessage('Select at least one lead.');
      return;
    }
    if (!bulkEmployeeId) {
      setMessage('Choose an employee for bulk assign.');
      return;
    }
    setBulkBusy(true);
    setMessage(null);
    try {
      const r = await api.post('/leads/bulk-assign', {
        lead_ids: selectedIds,
        assigned_to: bulkEmployeeId,
      });
      const n = Number(r.data?.assigned_count ?? 0);
      const name = r.data?.employee_name || 'employee';
      setMessage(`Assigned ${n} lead(s) to ${name}.`);
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Bulk assign failed.');
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
      setMessage(n > 0 ? `Auto-assigned ${n} lead(s) to team (round-robin).` : 'No unassigned leads left.');
      await load();
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Auto-assign failed.');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Assign Leads"
        subtitle="New Housing/Meta leads auto-assign · manager can reassign or bulk-assign here"
      />
      {loading ? (
        <View style={{ padding: 48 }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[styles.content, selectedIds.length > 0 ? { paddingBottom: 120 } : null]}>
            {message ? (
              <View style={[styles.msgBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' }]}>
                <Text style={{ color: colors.text, fontSize: 12 }}>{message}</Text>
              </View>
            ) : null}

            <View style={styles.summaryRow}>
              <SummaryBox colors={colors} label="Unassigned" value={unassignedCount} accent="#6366F1" icon="time-outline" />
              <SummaryBox colors={colors} label="Team" value={employees.length} accent={colors.primary} icon="people-outline" />
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.text }]}>Team snapshot</Text>
              <Text style={[styles.panelSub, { color: colors.textMuted }]}>
                Incoming leads go straight to telecallers. Use this page to reassign or bulk-assign.
              </Text>
              <View style={styles.empGrid}>
                {assignmentStats.map((emp) => (
                  <View key={emp.employee_id} style={[styles.empCard, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                    <Text style={[styles.empName, { color: colors.text }]} numberOfLines={1}>{emp.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{roleLabel(emp.role)}</Text>
                    <View style={styles.empMetrics}>
                      <MiniStat label="Queue" value={emp.assigned_queue} color={colors.primary} />
                      <MiniStat label="Follow-ups" value={emp.assigned_follow_ups} color="#F97316" />
                      <MiniStat label="Done" value={emp.assigned_completed} color={colors.positive} />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.listHead}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.panelTitle, { color: colors.text }]}>Leads waiting for assignment</Text>
                  <Text style={[styles.panelSub, { color: colors.textMuted }]}>
                    {unassignedCount} unassigned · select multiple · assign time recorded automatically
                  </Text>
                </View>
                {unassignedCount > 0 ? (
                  <Pressable
                    onPress={autoAssignAll}
                    disabled={bulkBusy}
                    style={[styles.autoBtn, { borderColor: colors.positive, backgroundColor: colors.positive + '12' }]}
                  >
                    <Ionicons name="flash-outline" size={14} color={colors.positive} />
                    <Text style={{ color: colors.positive, fontSize: 11, fontWeight: '700' }}>Auto all</Text>
                  </Pressable>
                ) : null}
              </View>

              {queue.length > 0 ? (
                <Pressable onPress={toggleSelectAll} style={styles.selectAllRow}>
                  <Ionicons
                    name={allSelected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                    {allSelected ? 'Clear selection' : `Select all (${queue.length})`}
                  </Text>
                </Pressable>
              ) : null}

              {queue.length === 0 ? (
                <Text style={{ color: colors.textMuted, paddingVertical: 20, textAlign: 'center' }}>
                  All caught up — new leads are auto-assigned when they arrive.
                </Text>
              ) : (
                <View style={{ gap: 10, marginTop: 8 }}>
                  {queue.map((lead) => {
                    const isSelected = selected.has(lead.lead_id);
                    return (
                      <View
                        key={lead.lead_id}
                        style={[
                          styles.leadRow,
                          {
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primary + '08' : colors.surfaceAlt,
                          },
                        ]}
                      >
                        <Pressable onPress={() => toggleLead(lead.lead_id)} style={styles.checkHit}>
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={isSelected ? colors.primary : colors.textMuted}
                          />
                        </Pressable>
                        <View style={{ flex: 1, minWidth: 140 }}>
                          <Text style={[styles.leadName, { color: colors.text }]}>{lead.name}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{lead.phone}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                            {lead.source} · {formatBudgetStringLakhs(lead.budget) || '—'}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>
                            Received: {formatDt(lead.created_at)}
                          </Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assignChips}>
                          {employees.map((emp) => (
                            <Pressable
                              key={emp.employee_id}
                              disabled={busyId === lead.lead_id || bulkBusy}
                              onPress={() => assignLead(lead.lead_id, emp.employee_id)}
                              style={[styles.assignChip, { borderColor: colors.primary, backgroundColor: colors.primary + '12' }]}
                            >
                              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>{emp.name?.split(' ')[0]}</Text>
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
          </ScrollView>

          {selectedIds.length > 0 ? (
            <View style={[styles.bulkBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', minWidth: 88 }}>
                {selectedIds.length} selected
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bulkEmpRow}>
                {employees.map((emp) => {
                  const active = bulkEmployeeId === emp.employee_id;
                  return (
                    <Pressable
                      key={emp.employee_id}
                      onPress={() => setBulkEmployeeId(emp.employee_id)}
                      style={[
                        styles.bulkEmpChip,
                        {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary + '18' : colors.surfaceAlt,
                        },
                      ]}
                    >
                      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 12, fontWeight: '600' }}>
                        {emp.name?.split(' ')[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable
                onPress={bulkAssign}
                disabled={bulkBusy || !bulkEmployeeId}
                style={[
                  styles.bulkGoBtn,
                  {
                    backgroundColor: bulkEmployeeId ? colors.primary : colors.textMuted,
                    opacity: bulkBusy ? 0.7 : 1,
                  },
                ]}
              >
                {bulkBusy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Assign</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
      <LeadDetailModal
        leadId={openLead}
        visible={openLead !== null}
        onClose={() => setOpenLead(null)}
        onChanged={load}
        userRole={user?.role}
      />
    </View>
  );
}

function SummaryBox({ label, value, accent, icon, colors }: any) {
  return (
    <View style={[styles.summaryBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Ionicons name={icon} size={18} color={accent} />
      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 8 }}>{label.toUpperCase()}</Text>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 56 }}>
      <Text style={{ color, fontSize: 16, fontWeight: '700' }}>{value ?? 0}</Text>
      <Text style={{ color, fontSize: 9, fontWeight: '600', opacity: 0.85 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 20 },
  msgBanner: { padding: 12, borderRadius: 8, borderWidth: 1 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryBox: { flex: 1, minWidth: 160, padding: 16, borderRadius: 10, borderWidth: 1 },
  panel: { padding: 18, borderRadius: 12, borderWidth: 1 },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  panelSub: { fontSize: 12, marginTop: 4 },
  listHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  autoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  empGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  empCard: { width: 220, padding: 12, borderRadius: 10, borderWidth: 1, gap: 4 },
  empName: { fontSize: 13, fontWeight: '700' },
  empMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, flexWrap: 'wrap' },
  checkHit: { padding: 2 },
  leadName: { fontSize: 14, fontWeight: '700' },
  assignChips: { flexDirection: 'row', gap: 6, alignItems: 'center', maxWidth: 280 },
  assignChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  openBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  bulkBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  bulkEmpRow: { flexDirection: 'row', gap: 6, alignItems: 'center', flex: 1 },
  bulkEmpChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  bulkGoBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minWidth: 72, alignItems: 'center' },
});
