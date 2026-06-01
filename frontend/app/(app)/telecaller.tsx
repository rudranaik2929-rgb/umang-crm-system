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

const QUEUE_STAGES = ['new', 'assigned'];

type Tab = 'queue' | 'followups';

export default function Telecaller() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>('queue');
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState<string | null>(null);

  useEffect(() => {
    if (params.tab === 'followups') setTab('followups');
  }, [params.tab]);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/leads');
      setLeads(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = leads.filter((l) => {
    if (l.status !== 'active') return false;
    if (!QUEUE_STAGES.includes(l.stage)) return false;
    if (user?.role !== 'admin') {
      const myEmpId = (user as any)?.acting_as_employee_id || (user as any)?.employee_id;
      if (!myEmpId || l.assigned_to !== myEmpId) return false;
    }
    return true;
  });

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Telecaller Workspace"
        subtitle={tab === 'queue' ? 'New enquiries' : 'Scheduled follow-ups'}
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
            New Enquiries
          </Text>
        </Pressable>
        <Pressable
          testID="telecaller-tab-followups"
          onPress={() => setTab('followups')}
          style={[styles.tab, tab === 'followups' && { borderBottomColor: '#F97316' }]}
        >
          <Text style={{ color: tab === 'followups' ? '#F97316' : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
            Follow Ups
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'queue' ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
              New enquiries only. Cold lead from a lead card opens the <Text style={{ fontWeight: '700', color: '#F97316' }}>Follow Ups</Text> tab.
            </Text>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : filtered.length === 0 ? (
              <EmptyState variant="leads" title="No leads in your queue" description="New enquiries land here automatically." />
            ) : (
              <LeadQueueTable leads={filtered} onOpen={setOpenLead} testIdPrefix="telecaller" />
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
  iconBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
