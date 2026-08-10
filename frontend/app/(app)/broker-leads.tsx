import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api, getSnapshot, setSnapshot } from '../../src/lib/api';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { formatPhoneDisplay } from '../../src/lib/leadContact';
import { Ionicons } from '@expo/vector-icons';
export default function BrokerLeads() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const cachedBroker = getSnapshot<any[]>('broker-leads-page');
  const [leads, setLeads] = useState<any[]>(cachedBroker ?? []);
  const [loading, setLoading] = useState(!cachedBroker);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/broker-leads');
      const next = Array.isArray(r.data?.leads) ? r.data.leads : [];
      setLeads(next);
      setSnapshot('broker-leads-page', next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Broker Pool"
        subtitle="Brokerage leads stored for future — not auto-assigned to telecallers"
      />
      {loading && leads.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.banner, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' }]}>
            <Ionicons name="briefcase-outline" size={20} color={colors.warning} />
            <Text style={[styles.bannerText, { color: colors.text }]}>
              {leads.length} brokerage lead(s) waiting. Open a lead to assign to an employee when ready.
            </Text>
          </View>
          {leads.length ? leads.map((lead) => (
            <Pressable
              key={lead.lead_id}
              onPress={() => setOpenLead(lead.lead_id)}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.cardHead}>
                <Text style={[styles.name, { color: colors.text }]}>{lead.name}</Text>
                <Text style={[styles.badge, { color: colors.warning, borderColor: colors.warning + '50' }]}>Brokerage</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{formatPhoneDisplay(lead.phone) || '—'}{lead.email ? ` · ${lead.email}` : ''}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>Source: {lead.source || '—'}</Text>
              {lead.brokerage_amount ? (
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Brokerage: ₹{lead.brokerage_amount}</Text>
              ) : null}
            </Pressable>
          )) : (
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>No brokerage leads in the pool.</Text>
          )}
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, gap: 12 },
  banner: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 4 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', flex: 1 },
  badge: { fontSize: 10, fontWeight: '700', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
});
