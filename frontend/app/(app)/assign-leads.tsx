import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { roleLabel } from '../../src/lib/constants';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { formatBudgetStringLakhs } from '../../src/lib/leadFormat';
import { Ionicons } from '@expo/vector-icons';

export default function AssignLeads() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [queue, setQueue] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [assignmentStats, setAssignmentStats] = useState<any[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const assignLead = async (leadId: string, employeeId: string) => {
    setBusyId(leadId);
    try {
      await api.patch(`/leads/${leadId}`, { assigned_to: employeeId, stage: 'assigned' });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Assign Leads" subtitle="Assign new enquiries to telecallers and sales executives" />
      {loading ? (
        <View style={{ padding: 48 }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryRow}>
            <SummaryBox colors={colors} label="Waiting to assign" value={unassignedCount} accent="#6366F1" icon="time-outline" />
            <SummaryBox colors={colors} label="Team members" value={employees.length} accent={colors.primary} icon="people-outline" />
            <SummaryBox
              colors={colors}
              label="Total assigned"
              value={assignmentStats.reduce((n, e) => n + Number(e.assigned_total || 0), 0)}
              accent={colors.positive}
              icon="checkmark-done-outline"
            />
          </View>

          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.panelTitle, { color: colors.text }]}>Employee assignment overview</Text>
            <Text style={[styles.panelSub, { color: colors.textMuted }]}>Assigned · active · completed per team member</Text>
            <View style={styles.empGrid}>
              {assignmentStats.map((emp) => (
                <View key={emp.employee_id} style={[styles.empCard, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[styles.empName, { color: colors.text }]} numberOfLines={1}>{emp.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10 }}>{roleLabel(emp.role)}</Text>
                  <View style={styles.empMetrics}>
                    <MiniStat label="Assigned" value={emp.assigned_total} color={colors.info} />
                    <MiniStat label="Active" value={emp.assigned_active} color={colors.primary} />
                    <MiniStat label="Completed" value={emp.assigned_completed} color={colors.positive} />
                    <MiniStat label="Not Interested" value={emp.assigned_not_interested} color={colors.negative} />
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.panelTitle, { color: colors.text }]}>Leads waiting for assignment</Text>
            <Text style={[styles.panelSub, { color: colors.textMuted }]}>{queue.length} leads · tap Open or assign directly</Text>
            {queue.length === 0 ? (
              <Text style={{ color: colors.textMuted, paddingVertical: 20, textAlign: 'center' }}>All caught up — no unassigned leads right now.</Text>
            ) : (
              <View style={{ gap: 10, marginTop: 12 }}>
                {queue.map((lead) => (
                  <View key={lead.lead_id} style={[styles.leadRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                    <View style={{ flex: 1, minWidth: 160 }}>
                      <Text style={[styles.leadName, { color: colors.text }]}>{lead.name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{lead.phone}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                        {lead.source} · {formatBudgetStringLakhs(lead.budget) || '—'}
                      </Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assignChips}>
                      {employees.map((emp) => (
                        <Pressable
                          key={emp.employee_id}
                          disabled={busyId === lead.lead_id}
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
                ))}
              </View>
            )}
          </View>
        </ScrollView>
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
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryBox: { flex: 1, minWidth: 160, padding: 16, borderRadius: 10, borderWidth: 1 },
  panel: { padding: 18, borderRadius: 12, borderWidth: 1 },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  panelSub: { fontSize: 12, marginTop: 4 },
  empGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  empCard: { width: 220, padding: 12, borderRadius: 10, borderWidth: 1, gap: 4 },
  empName: { fontSize: 13, fontWeight: '700' },
  empMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, flexWrap: 'wrap' },
  leadName: { fontSize: 14, fontWeight: '700' },
  assignChips: { flexDirection: 'row', gap: 6, alignItems: 'center', maxWidth: 320 },
  assignChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  openBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
