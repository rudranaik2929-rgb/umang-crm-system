import React, { useEffect, useState, useCallback } from 'react';
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
import { leadToFollowUpCard } from '../../src/lib/leadFollowUp';

type Tab = 'queue' | 'followups';

export default function Telecaller() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>('queue');
  const cached = getSnapshot<any>('telecaller-workspace');
  const [queueLeads, setQueueLeads] = useState<any[]>(cached?.queueLeads ?? []);
  const [followUpLeads, setFollowUpLeads] = useState<any[]>(cached?.followUpLeads ?? []);
  const [stats, setStats] = useState<any>(cached?.stats ?? null);
  const [loading, setLoading] = useState(!cached);
  const [openLead, setOpenLead] = useState<string | null>(null);

  useEffect(() => {
    if (params.tab === 'followups') setTab('followups');
  }, [params.tab]);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/leads/workspace', { params: { limit: 200 } });
      const data = r.data || {};
      setStats(data.stats || {});
      setQueueLeads(data.queue?.leads || []);
      const fu = (data.follow_ups?.leads || []).map(leadToFollowUpCard);
      setFollowUpLeads(fu);
      setSnapshot('telecaller-workspace', { stats: data.stats, queueLeads: data.queue?.leads || [], followUpLeads: fu });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load);

  const queueTotal = Number(stats?.assigned_queue ?? queueLeads.length);
  const followTotal = Number(stats?.assigned_follow_ups ?? followUpLeads.length);

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Telecaller Workspace"
        subtitle={tab === 'queue' ? `${queueTotal} new enquiries` : `${followTotal} follow-ups`}
        rightAction={
          <Pressable
            onPress={load}
            disabled={loading}
            style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: loading ? 0.6 : 1 }]}
          >
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        }
      />

      <View style={[styles.tabs, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable
          testID="telecaller-tab-queue"
          onPress={() => setTab('queue')}
          style={[styles.tab, tab === 'queue' && { borderBottomColor: colors.primary }]}
        >
          <Text style={{ color: tab === 'queue' ? colors.primary : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
            New Enquiries ({queueTotal})
          </Text>
        </Pressable>
        <Pressable
          testID="telecaller-tab-followups"
          onPress={() => setTab('followups')}
          style={[styles.tab, tab === 'followups' && { borderBottomColor: '#F97316' }]}
        >
          <Text style={{ color: tab === 'followups' ? '#F97316' : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
            Follow Ups ({followTotal})
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'queue' ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
              New and assigned leads waiting for your call.
            </Text>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : queueLeads.length === 0 ? (
              <EmptyState variant="leads" title="No leads in your queue" description="New enquiries land here automatically." />
            ) : (
              <LeadQueueTable leads={queueLeads} onOpen={setOpenLead} testIdPrefix="telecaller" />
            )}
          </>
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
  iconBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
