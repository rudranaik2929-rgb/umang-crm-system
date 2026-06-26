import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { roleLabel } from '../lib/constants';
import { SearchableSelect } from './SearchableSelect';
import {
  parseInquiryStatusFilter,
  serializeInquiryStatusFilter,
} from '../lib/inquiryStatusFilter';

export type AssignWorkspaceFilters = {
  inquiry_status: string;
  source: string;
  assigned_to: string;
  q: string;
  location: string;
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
  { key: 'other_location', label: 'Other Location' },
  { key: 'already_purchased', label: 'Already Purchased' },
  { key: 'not_searching', label: 'Not Searching' },
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
  { key: 'low_budget', label: 'Low Budget' },
  { key: 'other_location', label: 'Other Location' },
  { key: 'already_purchased', label: 'Already Purchased' },
  { key: 'not_searching', label: 'Not Searching' },
  { key: 'ringing', label: 'Ringing' },
  { key: 'hot', label: 'Hot' },
  { key: 'new', label: 'Reset to New' },
];

export { STATUS_ACTIONS };

const INQUIRY_MULTI_OPTIONS = INQUIRY_OPTIONS.filter((o) => o.key !== 'all');

function InquiryStatusMultiSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ key: string; label: string; count?: number }>;
  onChange: (next: string) => void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(parseInquiryStatusFilter(value)), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.key.includes(q));
  }, [options, query]);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(serializeInquiryStatusFilter(Array.from(next)));
  };

  const summary = selected.size
    ? `${selected.size} selected`
    : 'All enquiries';

  return (
    <View style={styles.multiWrap}>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ENQUIRY STATUS (MULTI-SELECT)</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}>
        Pick one or many — e.g. Ringing + Not Interested + Not Searching
      </Text>
      <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search status…"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.text, fontSize: 13, paddingVertical: 6, paddingHorizontal: 8 }}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.multiToolbar}>
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', flex: 1 }}>{summary}</Text>
        <Pressable onPress={() => onChange('all')} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>Clear</Text>
        </Pressable>
        <Pressable
          onPress={() => onChange(serializeInquiryStatusFilter(options.map((o) => o.key)))}
          hitSlop={8}
        >
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Select all</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.multiScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        <View style={styles.chipGrid}>
          {filtered.map((opt) => {
            const active = selected.has(opt.key);
            return (
              <Pressable
                key={opt.key}
                testID={`inquiry-status-chip-${opt.key}`}
                onPress={() => toggle(opt.key)}
                style={[styles.chip, {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary + '14' : colors.surfaceAlt,
                }]}
              >
                <Ionicons
                  name={active ? 'checkbox' : 'square-outline'}
                  size={16}
                  color={active ? colors.primary : colors.textMuted}
                />
                <Text style={{ color: active ? colors.primary : colors.text, fontSize: 12, fontWeight: active ? '700' : '500' }}>
                  {opt.label}{opt.count != null ? ` (${opt.count})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export function AssignLeadsAdvancedModal({ visible, filters, facets, employees, onClose, onApply }: Props) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<AssignWorkspaceFilters>(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const inquiryMultiOptions = useMemo(
    () => INQUIRY_MULTI_OPTIONS.map((opt) => ({
      key: opt.key,
      label: opt.label,
      count: facets?.inquiry_status?.[opt.key],
    })),
    [facets],
  );

  const sourceOptions = useMemo(
    () => SOURCE_OPTIONS.map((opt) => ({
      key: opt.key,
      label: opt.label,
      count: facets?.source?.[opt.key],
    })),
    [facets],
  );

  const employeeOptions = useMemo(
    () => [
      { key: 'all', label: 'All employees' },
      { key: 'unassigned', label: 'Unassigned only' },
      ...employees.map((e) => ({
        key: e.employee_id,
        label: e.name,
        sublabel: roleLabel(e.role),
      })),
    ],
    [employees],
  );

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

          <View style={{ gap: 14 }}>
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
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>LOCATION</Text>
              <TextInput
                value={draft.location}
                onChangeText={(location) => setDraft((d) => ({ ...d, location }))}
                placeholder="City, locality, area..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }]}
              />
            </View>

            <InquiryStatusMultiSelect
              value={draft.inquiry_status}
              options={inquiryMultiOptions}
              onChange={(inquiry_status) => setDraft((d) => ({ ...d, inquiry_status }))}
            />

            <View style={styles.filterRow}>
              <SearchableSelect
                label="SOURCE"
                value={draft.source}
                options={sourceOptions}
                onChange={(source) => setDraft((d) => ({ ...d, source }))}
                placeholder="All sources"
                testID="filter-source"
              />
              <SearchableSelect
                label="ASSIGNED TO"
                value={draft.assigned_to}
                options={employeeOptions}
                onChange={(assigned_to) => setDraft((d) => ({ ...d, assigned_to }))}
                placeholder="All employees"
                testID="filter-assigned-to"
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => onApply({ inquiry_status: 'all', source: 'all', assigned_to: 'all', q: '', location: '' })}
              style={[styles.btnGhost, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Clear all</Text>
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
  sheet: { borderRadius: 14, borderWidth: 1, padding: 18, maxWidth: 920, width: '100%', alignSelf: 'center', maxHeight: '92%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '700' },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btnGhost: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  btnPrimary: { flex: 2, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  multiWrap: { gap: 6 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  multiToolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 4 },
  multiScroll: { maxHeight: 220 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
});
