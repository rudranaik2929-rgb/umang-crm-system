import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { roleLabel } from '../lib/constants';

export type AssignWorkspaceFilters = {
  inquiry_status: string;
  source: string;
  assigned_to: string;
  q: string;
};

type Props = {
  visible: boolean;
  filters: AssignWorkspaceFilters;
  facets?: { inquiry_status?: Record<string, number>; source?: Record<string, number> };
  employees: any[];
  onClose: () => void;
  onApply: (filters: AssignWorkspaceFilters) => void;
};

const INQUIRY_OPTIONS = [
  { key: 'all', label: 'All enquiries' },
  { key: 'active', label: 'Active' },
  { key: 'new', label: 'New' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'visited', label: 'Visited' },
  { key: 'booked', label: 'Booked' },
  { key: 'ringing', label: 'Ringing' },
  { key: 'not_interested', label: 'Not Interested' },
  { key: 'hot', label: 'Hot' },
  { key: 'low_budget', label: 'Low Budget' },
];

const SOURCE_OPTIONS = [
  { key: 'all', label: 'All sources' },
  { key: 'housing', label: 'Housing.com' },
  { key: 'meta', label: 'Facebook / Meta' },
  { key: 'manual', label: 'Database' },
  { key: 'other', label: 'Other' },
];

const STATUS_ACTIONS = [
  { key: 'active', label: 'Mark Active' },
  { key: 'visited', label: 'Mark Visited' },
  { key: 'booked', label: 'Mark Booked' },
  { key: 'not_interested', label: 'Not Interested' },
  { key: 'ringing', label: 'Ringing' },
  { key: 'hot', label: 'Hot' },
  { key: 'new', label: 'Reset to New' },
];

export { STATUS_ACTIONS };

export function AssignLeadsAdvancedModal({ visible, filters, facets, employees, onClose, onApply }: Props) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<AssignWorkspaceFilters>(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const chip = (active: boolean) => ({
    borderColor: active ? colors.primary : colors.border,
    backgroundColor: active ? colors.primary + '16' : colors.surfaceAlt,
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation?.()}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: colors.text }]}>Advanced Search</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>
            <View>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SEARCH</Text>
              <TextInput
                value={draft.q}
                onChangeText={(q) => setDraft((d) => ({ ...d, q }))}
                placeholder="Name, phone, email, location..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }]}
              />
            </View>

            <View>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ENQUIRY STATUS</Text>
              <View style={styles.chipGrid}>
                {INQUIRY_OPTIONS.map((opt) => {
                  const active = draft.inquiry_status === opt.key;
                  const count = facets?.inquiry_status?.[opt.key];
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setDraft((d) => ({ ...d, inquiry_status: opt.key }))}
                      style={[styles.chip, chip(active)]}
                    >
                      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>
                        {opt.label}{count != null ? ` (${count})` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SOURCE</Text>
              <View style={styles.chipGrid}>
                {SOURCE_OPTIONS.map((opt) => {
                  const active = draft.source === opt.key;
                  const count = facets?.source?.[opt.key];
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setDraft((d) => ({ ...d, source: opt.key }))}
                      style={[styles.chip, chip(active)]}
                    >
                      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>
                        {opt.label}{count != null ? ` (${count})` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ASSIGNED TO</Text>
              <View style={styles.chipGrid}>
                {[
                  { key: 'all', label: 'All employees' },
                  { key: 'unassigned', label: 'Unassigned only' },
                  ...employees.map((e) => ({ key: e.employee_id, label: e.name })),
                ].map((opt) => {
                  const active = draft.assigned_to === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setDraft((d) => ({ ...d, assigned_to: opt.key }))}
                      style={[styles.chip, chip(active)]}
                    >
                      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={() => onApply({ inquiry_status: 'all', source: 'all', assigned_to: 'all', q: '' })}
              style={[styles.btnGhost, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Reset</Text>
            </Pressable>
            <Pressable
              onPress={() => onApply(draft)}
              style={[styles.btnPrimary, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Apply filters</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function inquiryStatusLabel(key?: string) {
  return INQUIRY_OPTIONS.find((o) => o.key === key)?.label || key || '—';
}

export function employeeRoleLabel(emp: any) {
  return roleLabel(emp?.role) || emp?.role || '';
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 14, borderWidth: 1, padding: 18, maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '700' },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnGhost: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  btnPrimary: { flex: 2, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
});
