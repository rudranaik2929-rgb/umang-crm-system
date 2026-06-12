import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export type SelectOption = {
  key: string;
  label: string;
  sublabel?: string;
  count?: number;
};

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (key: string) => void;
  placeholder?: string;
  testID?: string;
  compact?: boolean;
};

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  testID,
  compact = false,
}: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const selected = options.find((o) => o.key === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.label.toLowerCase().includes(q)
      || (o.sublabel || '').toLowerCase().includes(q)
      || o.key.toLowerCase().includes(q)
    );
  }, [options, query]);

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={[styles.trigger, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
      >
        <Text style={{ color: selected ? colors.text : colors.textMuted, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <View style={styles.sheetHead}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Type to search…"
                placeholderTextColor={colors.textMuted}
                autoFocus
                style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8, paddingHorizontal: 8 }}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={{ color: colors.textMuted, textAlign: 'center', padding: 20, fontSize: 13 }}>No matches</Text>
              ) : filtered.map((opt) => {
                const active = opt.key === value;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => pick(opt.key)}
                    style={[styles.option, {
                      borderBottomColor: colors.border,
                      backgroundColor: active ? colors.primary + '12' : 'transparent',
                    }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 13, fontWeight: active ? '700' : '500' }}>
                        {opt.label}{opt.count != null ? ` (${opt.count})` : ''}
                      </Text>
                      {opt.sublabel ? (
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{opt.sublabel}</Text>
                      ) : null}
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 160 },
  wrapCompact: { minWidth: 140 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 12, borderWidth: 1, padding: 14, maxWidth: 420, width: '100%', alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontSize: 16, fontWeight: '700' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
});
