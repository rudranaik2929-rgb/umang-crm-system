import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { LeadQueueTable } from '../../src/components/LeadQueueTable';
import { Ionicons } from '@expo/vector-icons';

/** Same queue as telecaller — positive / assigned active leads for sales executives. */
const QUEUE_STAGES = ['new', 'assigned', 'positive'];

export default function SalesExecutive() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState<string | null>(null);

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
    if (user?.role !== 'admin' && user?.role !== 'manager') {
      const myEmpId = (user as any)?.acting_as_employee_id || (user as any)?.employee_id;
      if (!myEmpId || l.assigned_to !== myEmpId) return false;
    }
    return true;
  });

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Sales Executive"
        subtitle="Same lead workspace as telecaller — contact & follow up"
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
          Active leads assigned to you. Budget shows in lakhs (e.g. 45 - 50 L). Use WhatsApp or Copy next to Open.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : filtered.length === 0 ? (
          <EmptyState variant="leads" title="No leads in your queue" description="Leads appear here when assigned to you." />
        ) : (
          <LeadQueueTable leads={filtered} onOpen={setOpenLead} testIdPrefix="sales-exec" />
        )}
      </ScrollView>

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

const styles = StyleSheet.create({
  content: { padding: 24, gap: 20 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
