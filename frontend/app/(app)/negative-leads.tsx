import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { LeadDetailModal } from '../../src/components/LeadDetailModal';
import { Ionicons } from '@expo/vector-icons';

export default function NegativeLeads() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/leads?status_=negative');
      setLeads(r.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Negative Leads" subtitle="Reservoir for future re-engagement campaigns" />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> :
          leads.length === 0 ? (
            <EmptyState
              variant="leads"
              title="No negative leads (yet)"
              description="When the telecaller marks a lead as negative, it lands here — perfect for re-engagement WhatsApp campaigns later."
            />
          ) : (
            <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.tHead, { borderBottomColor: colors.border }]}>
                <Text style={[styles.th, { color: colors.textMuted, flex: 2 }]}>CUSTOMER</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 1.5 }]}>BUDGET / TYPE</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 1.5 }]}>LOCATION</Text>
                <Text style={[styles.th, { color: colors.textMuted, width: 100 }]}>STATUS</Text>
                <Text style={[styles.th, { color: colors.textMuted, width: 110, textAlign: 'right' }]}>ACTION</Text>
              </View>
              {leads.map((l) => (
                <Pressable key={l.lead_id} testID={`neg-row-${l.lead_id}`} onPress={() => setOpenLead(l.lead_id)}
                  style={({ hovered }: any) => [styles.tRow, { borderBottomColor: colors.border, backgroundColor: hovered ? colors.surfaceAlt : 'transparent' }]}>
                  <View style={{ flex: 2 }}>
                    <Text style={[styles.cellPrimary, { color: colors.text }]}>{l.name}</Text>
                    <Text style={[styles.cellSecondary, { color: colors.textMuted }]}>{l.phone}</Text>
                  </View>
                  <View style={{ flex: 1.5 }}>
                    <Text style={[styles.cellPrimary, { color: colors.text }]}>{l.budget || '—'}</Text>
                    <Text style={[styles.cellSecondary, { color: colors.textMuted }]}>{l.property_type || '—'}</Text>
                  </View>
                  <Text style={[styles.cellPrimary, { color: colors.text, flex: 1.5 }]}>{l.location || '—'}</Text>
                  <View style={{ width: 100 }}>
                    <Badge text="NEGATIVE" color={colors.negative} />
                  </View>
                  <View style={{ width: 110, alignItems: 'flex-end' }}>
                    <View style={[styles.openBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '14' }]}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Reactivate</Text>
                      <Ionicons name="refresh" size={11} color={colors.primary} />
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
      </ScrollView>
      <LeadDetailModal leadId={openLead} visible={openLead !== null} onClose={() => setOpenLead(null)} onChanged={load} userRole={user?.role} />
    </View>
  );
}

const styles = StyleSheet.create({
  tableCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tHead: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  th: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  cellPrimary: { fontSize: 13, fontWeight: '500' },
  cellSecondary: { fontSize: 11, marginTop: 2 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, paddingHorizontal: 10, height: 26, borderRadius: 6 },
});
