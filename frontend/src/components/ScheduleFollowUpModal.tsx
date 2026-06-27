import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView,
  ActivityIndicator, Platform,
} from 'react-native';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import {
  dayNameFromIso,
  formatDateDisplay,
  formatTime12h,
  parseTime24,
  toTime24,
  type Time12Parts,
} from '../lib/timeFormat';
import { useMainContentOverlayStyle } from '../layout/SidebarLayoutContext';

const REASON_OPTIONS = [
  'Callback requested',
  'Site visit reschedule',
  'Budget discussion',
  'Send project details',
  'Decision pending',
  'Other',
];

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

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

export function ScheduleFollowUpModal({
  visible,
  leadName,
  title = 'Schedule Follow Up',
  overlayZIndex = 12000,
  onClose,
  onSubmit,
}: Props) {
  const { colors } = useTheme();
  const portalOverlayStyle = useMainContentOverlayStyle({ portal: true });
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<FormData>({
    follow_up_date: defaultDate(),
    follow_up_time: '11:00',
    follow_up_day: dayNameFromIso(defaultDate()),
    reason: REASON_OPTIONS[0],
    notes: '',
  });
  const [timeParts, setTimeParts] = useState<Time12Parts>(parseTime24('11:00'));
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const date = defaultDate();
    const time = '11:00';
    setForm({
      follow_up_date: date,
      follow_up_time: time,
      follow_up_day: dayNameFromIso(date),
      reason: REASON_OPTIONS[0],
      notes: '',
    });
    setTimeParts(parseTime24(time));
    setTimePickerOpen(false);
    setError(null);
    setBusy(false);
  }, [visible]);

  const canSubmit = useMemo(
    () => Boolean(form.follow_up_date && form.follow_up_time && form.reason),
    [form.follow_up_date, form.follow_up_time, form.reason],
  );

  const applyTimeParts = (next: Time12Parts) => {
    setTimeParts(next);
    setForm((f) => ({ ...f, follow_up_time: toTime24(next) }));
  };

  const openDatePicker = () => {
    setTimePickerOpen(false);
    if (Platform.OS !== 'web') return;
    const input = dateInputRef.current;
    if (!input) return;

    const restore = () => {
      input.style.position = 'fixed';
      input.style.top = '50%';
      input.style.left = '50%';
      input.style.width = '1px';
      input.style.height = '1px';
      input.style.opacity = '0.01';
      input.style.pointerEvents = 'none';
      input.style.zIndex = '-1';
    };

    input.style.position = 'fixed';
    input.style.top = '0';
    input.style.left = '0';
    input.style.width = '100%';
    input.style.height = '100%';
    input.style.opacity = '0.01';
    input.style.pointerEvents = 'auto';
    input.style.zIndex = '2147483647';

    const onDone = () => {
      restore();
      input.removeEventListener('blur', onDone);
      input.removeEventListener('change', onDone);
    };
    input.addEventListener('blur', onDone, { once: true });
    input.addEventListener('change', onDone, { once: true });

    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {
      /* fall through */
    }
    input.focus();
    input.click();
  };

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
        follow_up_time: toTime24(timeParts),
        follow_up_day: dayNameFromIso(form.follow_up_date) || form.follow_up_day,
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

        <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
          <Field label="Follow-up date" colors={colors}>
            <Pressable
              onPress={openDatePicker}
              style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={18} color="#F97316" />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                {formatDateDisplay(form.follow_up_date)}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </Pressable>
            {Platform.OS !== 'web' ? (
              <TextInput
                value={form.follow_up_date}
                onChangeText={(v) => setForm((f) => ({
                  ...f,
                  follow_up_date: v,
                  follow_up_day: dayNameFromIso(v),
                }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                style={[styles.hiddenInput, { color: colors.text, borderColor: colors.border }]}
              />
            ) : null}
          </Field>

          <Field label="Follow-up time" colors={colors}>
            <Pressable
              onPress={() => setTimePickerOpen((o) => !o)}
              style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name="time-outline" size={18} color="#F97316" />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                {formatTime12h(form.follow_up_time)}
              </Text>
              <Ionicons name={timePickerOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </Pressable>

            {timePickerOpen ? (
              <View style={[styles.timePanel, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.timePanelLabel, { color: colors.textMuted }]}>Select time (12-hour)</Text>
                <View style={styles.timeRow}>
                  <View style={styles.timeCol}>
                    <Text style={[styles.colLabel, { color: colors.textMuted }]}>Hour</Text>
                    <ScrollView style={styles.timeScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {HOURS_12.map((h) => {
                        const active = timeParts.hour12 === h;
                        return (
                          <Pressable
                            key={h}
                            onPress={() => applyTimeParts({ ...timeParts, hour12: h })}
                            style={[
                              styles.timeOption,
                              active && { backgroundColor: '#F97316', borderColor: '#F97316' },
                              !active && { borderColor: colors.border },
                            ]}
                          >
                            <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 14 }}>
                              {h}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View style={styles.timeCol}>
                    <Text style={[styles.colLabel, { color: colors.textMuted }]}>Min</Text>
                    <ScrollView style={styles.timeScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                      {MINUTES.filter((m) => m % 5 === 0).map((m) => {
                        const active = timeParts.minute === m;
                        return (
                          <Pressable
                            key={m}
                            onPress={() => applyTimeParts({ ...timeParts, minute: m })}
                            style={[
                              styles.timeOption,
                              active && { backgroundColor: '#F97316', borderColor: '#F97316' },
                              !active && { borderColor: colors.border },
                            ]}
                          >
                            <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 14 }}>
                              {String(m).padStart(2, '0')}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View style={styles.ampmCol}>
                    <Text style={[styles.colLabel, { color: colors.textMuted }]}>AM/PM</Text>
                    {(['AM', 'PM'] as const).map((p) => {
                      const active = timeParts.period === p;
                      return (
                        <Pressable
                          key={p}
                          onPress={() => applyTimeParts({ ...timeParts, period: p })}
                          style={[
                            styles.ampmBtn,
                            active && { backgroundColor: '#F97316', borderColor: '#F97316' },
                            !active && { borderColor: colors.border, backgroundColor: colors.surface },
                          ]}
                        >
                          <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '800', fontSize: 13 }}>
                            {p}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Pressable
                  onPress={() => setTimePickerOpen(false)}
                  style={[styles.timeDoneBtn, { backgroundColor: '#F97316' }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Done — {formatTime12h(toTime24(timeParts))}</Text>
                </Pressable>
              </View>
            ) : null}
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

  const webDateInput = Platform.OS === 'web' ? (
    <input
      ref={dateInputRef as any}
      type="date"
      value={form.follow_up_date}
      min={new Date().toISOString().slice(0, 10)}
      aria-hidden
      tabIndex={-1}
      onChange={(e) => {
        const v = e.target.value;
        setForm((f) => ({
          ...f,
          follow_up_date: v,
          follow_up_day: dayNameFromIso(v),
        }));
      }}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        width: 1,
        height: 1,
        opacity: 0.01,
        pointerEvents: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        zIndex: -1,
      }}
    />
  ) : null;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return createPortal(
      <>
        <View style={[portalOverlayStyle, styles.webOverlay, { zIndex: overlayZIndex }]}>{sheet}</View>
        {webDateInput}
      </>,
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
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
  hiddenInput: { marginTop: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timePanel: { marginTop: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  timePanelLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },
  timeRow: { flexDirection: 'row', gap: 10 },
  timeCol: { flex: 1 },
  ampmCol: { width: 64, gap: 8 },
  colLabel: { fontSize: 10, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  timeScroll: { maxHeight: 160 },
  timeOption: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    marginBottom: 6,
    alignItems: 'center',
  },
  ampmBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  timeDoneBtn: {
    marginTop: 12,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
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
