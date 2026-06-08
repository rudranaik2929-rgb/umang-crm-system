import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { LeadQueueTable } from '../../src/components/LeadQueueTable';
import { FollowUpsPanel } from '../../src/components/FollowUpsPanel';
import { Ionicons } from '@expo/vector-icons';

type Tab = 'queue' | 'followups';

export default function SalesExecutive() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>('queue');
  const [queueLeads, setQueueLeads] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState<string | null>(null);

  useEffect(() => {
    if (params.tab === 'followups') setTab('followups');
  }, [params.tab]);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/leads/workspace', { params: { limit: 500 } });
      const data = r.data || {};
      setStats(data.stats || {});
      setQueueLeads(data.queue?.leads || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
        onChanged={load}
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
