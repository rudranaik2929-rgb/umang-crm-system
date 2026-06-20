import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { WorkflowStatusBadge } from './Badge';
import { formatBudgetRangeLakhs, formatBudgetStringLakhs } from '../lib/leadFormat';
import { copyPhone, openPhoneCall, openWhatsApp } from '../lib/leadContact';

function formatBudgetDisplay(lead: any) {
  const raw = lead?.raw_payload;
  if (raw && typeof raw === 'object' && (raw.min_price != null || raw.max_price != null)) {
    const label = formatBudgetRangeLakhs(raw.min_price, raw.max_price, lead.budget);
    return label ? `${label} L` : '—';
  }
  const s = formatBudgetStringLakhs(lead?.budget);
  return s ? `${s} L` : '—';
}

function leadRequirementLine(lead: any) {
  const parts = [lead.property_type, formatBudgetDisplay(lead)].filter((p) => p && p !== '—');
  return parts.length ? parts.join(' · ') : 'Requirement pending';
}

function LeadActions({ lead, onOpen, testIdPrefix, colors, compact = false }: {
  lead: any;
  onOpen: (id: string) => void;
  testIdPrefix: string;
  colors: any;
  compact?: boolean;
}) {
  return (
    <View style={[styles.actionCol, compact && styles.actionColCompact]}>
      <Pressable
        testID={`${testIdPrefix}-call-${lead.lead_id}`}
        onPress={() => openPhoneCall(lead.phone)}
        style={[styles.iconBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '14' }]}
      >
        <Ionicons name="call" size={16} color={colors.primary} />
      </Pressable>
      <Pressable
        testID={`${testIdPrefix}-wa-${lead.lead_id}`}
        onPress={() => openWhatsApp(lead.phone)}
        style={[styles.iconBtn, { borderColor: '#25D366', backgroundColor: '#25D36614' }]}
      >
        <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
      </Pressable>
      <Pressable
        testID={`${testIdPrefix}-copy-${lead.lead_id}`}
        onPress={() => copyPhone(lead.phone || '')}
        style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
      >
        <Ionicons name="copy-outline" size={15} color={colors.textSecondary} />
      </Pressable>
      <Pressable
        testID={`${testIdPrefix}-open-${lead.lead_id}`}
        onPress={() => onOpen(lead.lead_id)}
        style={[styles.openBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '14' }]}
      >
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Open</Text>
        <Ionicons name="arrow-forward" size={11} color={colors.primary} />
      </Pressable>
    </View>
  );
}

type Props = {
  leads: any[];
  onOpen: (leadId: string) => void;
  testIdPrefix?: string;
};

export function LeadQueueTable({ leads, onOpen, testIdPrefix = 'queue' }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const mobile = width < 768;

  if (mobile) {
    return (
      <View style={{ gap: 10 }}>
        {leads.map((l) => (
          <Pressable
            key={l.lead_id}
            onPress={() => onOpen(l.lead_id)}
            style={[styles.mobileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.mobileTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cellPrimary, { color: colors.text }]}>{l.name}</Text>
                <Text style={[styles.cellSecondary, { color: colors.textMuted }]}>{l.phone || '—'}</Text>
              </View>
              <WorkflowStatusBadge lead={l} />
            </View>
            <View style={styles.mobileMeta}>
              <View style={styles.metaRow}>
                <Ionicons name="home-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={2}>
                  {leadRequirementLine(l)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={2}>
                  {l.location || 'Location not set'}
                </Text>
              </View>
              {l.source ? (
                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{l.source}</Text>
              ) : null}
            </View>
            <LeadActions lead={l} onOpen={onOpen} testIdPrefix={testIdPrefix} colors={colors} compact />
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.tHead, { borderBottomColor: colors.border }]}>
        <Text style={[styles.th, { color: colors.textMuted, flex: 2 }]}>CUSTOMER</Text>
        <Text style={[styles.th, { color: colors.textMuted, flex: 1.5 }]}>BUDGET / TYPE</Text>
        <Text style={[styles.th, { color: colors.textMuted, flex: 1.5 }]}>LOCATION</Text>
        <Text style={[styles.th, { color: colors.textMuted, flex: 1 }]}>STATUS</Text>
        <Text style={[styles.th, { color: colors.textMuted, width: 248, textAlign: 'right' }]}>ACTION</Text>
      </View>
      {leads.map((l) => (
        <View
          key={l.lead_id}
          style={[styles.tRow, { borderBottomColor: colors.border }]}
        >
          <Pressable style={{ flex: 2 }} onPress={() => onOpen(l.lead_id)}>
            <Text style={[styles.cellPrimary, { color: colors.text }]}>{l.name}</Text>
            <Text style={[styles.cellSecondary, { color: colors.textMuted }]}>{l.phone}</Text>
          </Pressable>
          <Pressable style={{ flex: 1.5 }} onPress={() => onOpen(l.lead_id)}>
            <Text style={[styles.cellPrimary, { color: colors.text }]}>{formatBudgetDisplay(l)}</Text>
            <Text style={[styles.cellSecondary, { color: colors.textMuted }]}>{l.property_type || '—'}</Text>
          </Pressable>
          <Pressable style={{ flex: 1.5 }} onPress={() => onOpen(l.lead_id)}>
            <Text style={[styles.cellPrimary, { color: colors.text }]}>{l.location || '—'}</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <WorkflowStatusBadge lead={l} />
          </View>
          <LeadActions lead={l} onOpen={onOpen} testIdPrefix={testIdPrefix} colors={colors} />
        </View>
      ))}
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
  actionCol: { width: 248, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  actionColCompact: { width: '100%', justifyContent: 'flex-start', marginTop: 10, flexWrap: 'wrap' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, paddingHorizontal: 8, height: 36, borderRadius: 6,
  },
  mobileCard: { borderWidth: 1, borderRadius: 12, padding: 14 },
  mobileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mobileMeta: { marginTop: 10, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  metaText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
