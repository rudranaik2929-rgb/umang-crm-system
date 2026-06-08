import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

const REASON_OPTIONS = [
  'Callback requested',
  'Site visit reschedule',
  'Budget discussion',
  'Send project details',
  'Decision pending',
  'Other',
];

type FormData = {
  follow_up_date: string;
  follow_up_time: string;
  follow_up_day: string;
  reason: string;
  notes: string;
};

type Props = {
  visible: boolean;
  leadName?: string;
  title?: string;
  overlayZIndex?: number;
  onClose: () => void;
  onSubmit: (data: FormData) => Promise<void>;
};

function defaultDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function dayName(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { weekday: 'long' });
}

export function ScheduleFollowUpModal({
  visible,
  leadName,
  title = 'Schedule Follow Up',
  overlayZIndex = 12000,
  onClose,
  onSubmit,
}: Props) {
  const { colors } = useTheme();
  const [form, setForm] = useState<FormData>({
    follow_up_date: defaultDate(),
    follow_up_time: '11:00',
    follow_up_day: dayName(defaultDate()),
    reason: REASON_OPTIONS[0],
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const date = defaultDate();
    setForm({
      follow_up_date: date,
      follow_up_time: '11:00',
      follow_up_day: dayName(date),
      reason: REASON_OPTIONS[0],
      notes: '',
    });
    setError(null);
    setBusy(false);
  }, [visible]);

  const canSubmit = useMemo(
    () => Boolean(form.follow_up_date && form.follow_up_time && form.reason),
    [form.follow_up_date, form.follow_up_time, form.reason],
  );

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Date, time and reason are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        ...form,
        follow_up_day: dayName(form.follow_up_date) || form.follow_up_day,
      });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Could not schedule follow-up.');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  const sheet = (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={(e: any) => e?.stopPropagation?.()}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {leadName ? (
              <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
                {leadName}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={onClose} style={[styles.close, { borderColor: colors.border }]}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
          <Field label="Follow-up date" colors={colors}>
            <TextInput
              value={form.follow_up_date}
              onChangeText={(v) => setForm((f) => ({ ...f, follow_up_date: v, follow_up_day: dayName(v) }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            />
          </Field>

          <Field label="Follow-up time (24h)" colors={colors}>
            <TextInput
              value={form.follow_up_time}
              onChangeText={(v) => setForm((f) => ({ ...f, follow_up_time: v }))}
              placeholder="11:00"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            />
          </Field>

          {form.follow_up_day ? (
            <Text style={[styles.dayHint, { color: colors.primary }]}>{form.follow_up_day}</Text>
          ) : null}

          <Field label="Reason" colors={colors}>
            <View style={styles.reasonGrid}>
              {REASON_OPTIONS.map((reason) => {
                const active = form.reason === reason;
                return (
                  <Pressable
                    key={reason}
                    onPress={() => setForm((f) => ({ ...f, reason }))}
                    style={[
                      styles.reasonChip,
                      {
                        borderColor: active ? '#F97316' : colors.border,
                        backgroundColor: active ? '#F9731618' : colors.surfaceAlt,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? '#F97316' : colors.textSecondary, fontSize: 11, fontWeight: '600' }}>
                      {reason}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Notes (optional)" colors={colors}>
            <TextInput
              value={form.notes}
              onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
              placeholder="Add call notes or context for the follow-up"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[
                styles.input,
                styles.notes,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
              ]}
            />
          </Field>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.actions}>
          <Pressable onPress={onClose} style={[styles.btn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSubmit}
            disabled={busy || !canSubmit}
            style={[styles.btn, styles.primaryBtn, { backgroundColor: busy ? colors.muted : '#F97316', opacity: canSubmit ? 1 : 0.6 }]}
          >
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryText}>Save & Open Follow Ups</Text>}
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return createPortal(
      <View style={[styles.webOverlay, { zIndex: overlayZIndex }]}>{sheet}</View>,
      document.body,
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {sheet}
    </Modal>
  );
}

function Field({ label, colors, children }: { label: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  webOverlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: { minHeight: '100vh' as any },
      default: {},
    }),
  },
  card: { width: '100%', maxWidth: 480, borderRadius: 12, borderWidth: 1, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 4 },
  close: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  field: { marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  notes: { minHeight: 84, textAlignVertical: 'top' },
  dayHint: { fontSize: 12, fontWeight: '600', marginTop: -6, marginBottom: 10 },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  error: { color: '#EF4444', fontSize: 12, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { borderWidth: 0 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
