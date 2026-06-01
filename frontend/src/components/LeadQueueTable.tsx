import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { StageBadge } from './Badge';
import { formatBudgetRangeLakhs, formatBudgetStringLakhs } from '../lib/leadFormat';

function digitsOnly(phone?: string) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.startsWith('91') && d.length >= 12) return d;
  return d;
}

function formatBudgetDisplay(lead: any) {
  const raw = lead?.raw_payload;
  if (raw && typeof raw === 'object' && (raw.min_price != null || raw.max_price != null)) {
    const label = formatBudgetRangeLakhs(raw.min_price, raw.max_price, lead.budget);
    return label ? `${label} L` : '—';
  }
  const s = formatBudgetStringLakhs(lead?.budget);
  return s ? `${s} L` : '—';
}

async function copyPhone(phone: string) {
  const text = phone.trim();
  if (!text) return;
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      alert('Phone number copied.');
      return;
    }
  } catch {
    /* fallback */
  }
  alert(text);
}

function openWhatsApp(phone?: string) {
  const wa = digitsOnly(phone);
  if (!wa) {
    alert('No phone number on this lead.');
    return;
  }
  const url = `https://wa.me/${wa}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
}

type Props = {
  leads: any[];
  onOpen: (leadId: string) => void;
  testIdPrefix?: string;
};

export function LeadQueueTable({ leads, onOpen, testIdPrefix = 'queue' }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.tHead, { borderBottomColor: colors.border }]}>
        <Text style={[styles.th, { color: colors.textMuted, flex: 2 }]}>CUSTOMER</Text>
        <Text style={[styles.th, { color: colors.textMuted, flex: 1.5 }]}>BUDGET / TYPE</Text>
        <Text style={[styles.th, { color: colors.textMuted, flex: 1.5 }]}>LOCATION</Text>
        <Text style={[styles.th, { color: colors.textMuted, flex: 1 }]}>STAGE</Text>
        <Text style={[styles.th, { color: colors.textMuted, width: 200, textAlign: 'right' }]}>ACTION</Text>
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
            <StageBadge stage={l.stage} />
          </View>
          <View style={styles.actionCol}>
            <Pressable
              testID={`${testIdPrefix}-wa-${l.lead_id}`}
              onPress={() => openWhatsApp(l.phone)}
              style={[styles.iconBtn, { borderColor: '#25D366', backgroundColor: '#25D36614' }]}
            >
              <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
            </Pressable>
            <Pressable
              testID={`${testIdPrefix}-copy-${l.lead_id}`}
              onPress={() => copyPhone(l.phone || '')}
              style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name="copy-outline" size={15} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              testID={`${testIdPrefix}-open-${l.lead_id}`}
              onPress={() => onOpen(l.lead_id)}
              style={[styles.openBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '14' }]}
            >
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Open</Text>
              <Ionicons name="arrow-forward" size={11} color={colors.primary} />
            </Pressable>
          </View>
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
  actionCol: { width: 200, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  iconBtn: {
    width: 32, height: 32, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, paddingHorizontal: 8, height: 32, borderRadius: 6,
  },
});
