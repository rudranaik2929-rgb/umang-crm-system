import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, getSnapshot, setSnapshot, broadcastDataChanged } from '../../src/lib/api';
import { useLiveRefresh } from '../../src/hooks/useLiveRefresh';
import { EmptyState } from '../../src/components/EmptyState';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { LeadQueueTable } from '../../src/components/LeadQueueTable';
import { FollowUpsPanel } from '../../src/components/FollowUpsPanel';
import { Ionicons } from '@expo/vector-icons';

type Tab = 'queue' | 'followups';

export default function SalesExecutive() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string; openLead?: string }>();
  const workspaceCacheKey = useMemo(
    () => `sales-workspace-${user?.employee_id || user?.email || user?.user_id || 'anon'}`,
    [user?.employee_id, user?.email, user?.user_id],
  );
  const [tab, setTab] = useState<Tab>('queue');
  const cached = getSnapshot<any>(workspaceCacheKey);
  const [queueLeads, setQueueLeads] = useState<any[]>(cached?.queueLeads ?? []);
  const [stats, setStats] = useState<any>(cached?.stats ?? null);
  const [loading, setLoading] = useState(!cached);
  const [openLead, setOpenLead] = useState<string | null>(null);

  useEffect(() => {
    if (params.tab === 'followups') setTab('followups');
  }, [params.tab]);

  useEffect(() => {
    if (params.openLead) setOpenLead(String(params.openLead));
  }, [params.openLead]);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/leads/workspace', { params: { limit: 500 }, bypassCache: true });
      const data = r.data || {};
      setStats(data.stats || {});
      setQueueLeads(data.queue?.leads || []);
      setSnapshot(workspaceCacheKey, { stats: data.stats, queueLeads: data.queue?.leads || [] });
    } finally {
      setLoading(false);
    }
  }, [workspaceCacheKey]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const queueTotal = Number(stats?.assigned_queue ?? queueLeads.length);
  const followTotal = Number(stats?.assigned_follow_ups ?? 0);

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Sales Executive"
        subtitle={tab === 'queue' ? `${queueTotal} in queue` : `${followTotal} follow-ups`}
        rightAction={
          <Pressable onPress={load} disabled={loading} style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        }
      />
      <View style={[styles.tabs, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => setTab('queue')} style={[styles.tab, tab === 'queue' && { borderBottomColor: colors.primary }]}>
          <Text style={{ color: tab === 'queue' ? colors.primary : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
            Leads ({queueTotal})
          </Text>
        </Pressable>
        <Pressable onPress={() => setTab('followups')} style={[styles.tab, tab === 'followups' && { borderBottomColor: '#F97316' }]}>
          <Text style={{ color: tab === 'followups' ? '#F97316' : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
            Follow Ups ({followTotal})
          </Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'queue' ? (
          loading ? <ActivityIndicator color={colors.primary} /> : queueLeads.length === 0 ? (
            <EmptyState variant="leads" title="No leads in your queue" description="Leads appear when assigned to you." />
          ) : (
            <LeadQueueTable leads={queueLeads} onOpen={setOpenLead} testIdPrefix="sales-exec" />
          )
        ) : (
          <FollowUpsPanel onOpenLead={setOpenLead} />
        )}
      </ScrollView>
      <LeadDetailModal
        leadId={openLead}
        visible={openLead !== null}
        onClose={() => setOpenLead(null)}
        onChanged={() => {
          load();
          broadcastDataChanged();
        }}
        userRole={user?.role}
        onGoFollowUps={() => setTab('followups')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 20 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  iconBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
