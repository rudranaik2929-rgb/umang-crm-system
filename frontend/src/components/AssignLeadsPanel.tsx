import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api, getSnapshot, setSnapshot } from '../lib/api';
import { roleLabel, isAdminRole } from '../lib/constants';
import { useAuth } from '../auth/AuthContext';

type Props = { compact?: boolean };

export function AssignLeadsPanel({ compact = false }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const adminView = isAdminRole(user?.role, user?.email);
  const cached = getSnapshot<any>('assign-leads-panel');
  const [stats, setStats] = useState<any>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent && !stats) setLoading(true);
    try {
      // Soft load uses GET cache when fresh; mutations already clear via broadcastDataChanged.
      const res = await api.get('/stats/assignment');
      setStats(res.data);
      setSnapshot('assign-leads-panel', res.data);
      setError(null);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not load assignment counts.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !stats) return <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />;

  if (error && !stats) {
    return (
      <View style={[styles.alert, { backgroundColor: '#EF444412', borderColor: '#EF4444', marginTop: 0 }]}>
        <Ionicons name="warning-outline" size={16} color="#EF4444" />
        <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>{error}</Text>
        <Pressable onPress={() => load()} style={[styles.linkBtn, { borderColor: colors.primary }]}>
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const employees = stats?.employees || [];
  const unassigned = Number(stats?.unassigned_count || 0);
  const teamFacets = stats?.team || null;
  // Admin pool total includes not-interested leads that auto-distribute never moves;
  // admin_pool_active is what is really waiting to be routed.
  const adminPool = teamFacets && teamFacets.admin_pool != null ? Number(teamFacets.admin_pool || 0) : null;
  const adminPoolActive = adminPool != null
    ? (teamFacets.admin_pool_active != null ? Number(teamFacets.admin_pool_active || 0) : adminPool)
    : null;
  // Team Lead: every lead in their team pool (no employee yet) — no "active" split exists.
  const myTeamId = user?.team_lead_id || (stats?.team_leads?.length === 1 ? stats.team_leads[0]?.employee_id : null);
  const myTeamPool = !adminView && myTeamId && teamFacets?.teams
    ? Number(teamFacets.teams[myTeamId]?.pool || 0)
    : null;
  const waiting = adminView ? (adminPoolActive ?? unassigned) : (myTeamPool ?? unassigned);
  const adminPoolExtra = adminPool != null && adminPoolActive != null && adminPool > adminPoolActive
    ? ` · ${adminPool} total incl. not interested`
    : '';
  const headerText = adminView
    ? (adminPool != null
      ? `Admin pool: ${adminPoolActive} waiting${adminPoolExtra} · ${unassigned} unassigned · send leads to Team Leads from here`
      : `${unassigned} unassigned · assign leads from here`)
    : (myTeamPool != null
      ? `${myTeamPool} in team pool · ${unassigned} unassigned · assign them to your team from here`
      : `${unassigned} unassigned · assign them to your team from here`);
  const waitingText = adminView
    ? (adminPool != null
      ? `${waiting} leads waiting in the admin pool${adminPoolExtra} — send them to a Team Lead or an employee`
      : `${waiting} unassigned leads — send them to a Team Lead or an employee`)
    : (myTeamPool != null
      ? `${waiting} leads in your team pool — assign them to your team`
      : `${waiting} unassigned leads — assign them to your team`);

  return (
    <View>
      {error ? (
        <Text style={{ color: '#EF4444', fontSize: 11, marginBottom: 6 }}>
          {error} Showing the last loaded counts.
        </Text>
      ) : null}
      <View style={styles.headerRow}>
        <Text style={{ color: colors.textSecondary, fontSize: compact ? 12 : 13, flex: 1 }}>
          {headerText}
        </Text>
        <Pressable
          onPress={() => router.push('/(app)/assign-leads' as any)}
          style={[styles.linkBtn, { borderColor: colors.primary }]}
        >
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Open Assign Leads</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {employees.slice(0, compact ? 6 : 12).map((emp: any) => (
          <View key={emp.employee_id} style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{emp.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 9 }}>{roleLabel(emp.role)}</Text>
            <View style={styles.counts}>
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700' }}>{emp.assigned_queue ?? 0} queue</Text>
              <Text style={{ color: '#F97316', fontSize: 10, fontWeight: '700' }}>{emp.assigned_follow_ups ?? 0} follow-up</Text>
            </View>
          </View>
        ))}
      </View>
      {waiting > 0 ? (
        <Pressable
          onPress={() => router.push((adminView
            ? '/(app)/assign-leads?team=admin_pool&team_view=pool'
            : '/(app)/assign-leads?team_view=pool') as any)} style={[styles.alert, { backgroundColor: '#6366F112', borderColor: '#6366F1' }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#6366F1" />
          <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>{waitingText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  linkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  box: { width: 150, padding: 10, borderRadius: 8, borderWidth: 1, gap: 2 },
  counts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 8, borderWidth: 1 },
});
