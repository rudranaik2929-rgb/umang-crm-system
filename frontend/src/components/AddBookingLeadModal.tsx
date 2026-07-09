import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: (lead: any) => void;
}

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  budget: '',
  location: '',
  property_type: '2BHK',
  notes: '',
};

export function AddBookingLeadModal({ visible, onClose, onSuccess }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const reset = () => {
    setForm({ ...EMPTY_FORM });
    setError(null);
  };

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Name and phone are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/leads/booking-manual', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        budget: form.budget.trim() || undefined,
        location: form.location.trim() || undefined,
        property_type: form.property_type.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      onSuccess(res.data);
      reset();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not save lead. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e: any) => e?.stopPropagation?.()}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>Add Manual Lead</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                Walk-in or direct enquiry — appears in your booking queue for New Booking.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            {error ? (
              <View style={[styles.errorBanner, { backgroundColor: colors.negative + '12', borderColor: colors.negative + '40' }]}>
                <Text style={{ color: colors.negative, fontSize: 12 }}>{error}</Text>
              </View>
            ) : null}

            <Field label="CUSTOMER NAME *" colors={colors}>
              <TextInput
                testID="booking-lead-name"
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                placeholder="e.g. Rahul Sharma"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, inputStyle(colors)]}
              />
            </Field>

            <Field label="MOBILE NUMBER *" colors={colors}>
              <TextInput
                testID="booking-lead-phone"
                value={form.phone}
                onChangeText={(v) => setForm({ ...form, phone: v })}
                placeholder="e.g. 9876543210 or +91..."
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                style={[styles.input, inputStyle(colors)]}
              />
            </Field>

            <Field label="EMAIL (OPTIONAL)" colors={colors}>
              <TextInput
                value={form.email}
                onChangeText={(v) => setForm({ ...form, email: v })}
                placeholder="customer@email.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={[styles.input, inputStyle(colors)]}
              />
            </Field>

            <Field label="LOCATION / PROJECT AREA" colors={colors}>
              <TextInput
                value={form.location}
                onChangeText={(v) => setForm({ ...form, location: v })}
                placeholder="e.g. Nalasopara West, Umang Skylark"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, inputStyle(colors)]}
              />
            </Field>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label="BUDGET" colors={colors}>
                  <TextInput
                    value={form.budget}
                    onChangeText={(v) => setForm({ ...form, budget: v })}
                    placeholder="e.g. 80 Lacs"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, inputStyle(colors)]}
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="FLAT TYPE" colors={colors}>
                  <TextInput
                    value={form.property_type}
                    onChangeText={(v) => setForm({ ...form, property_type: v })}
                    placeholder="e.g. 2BHK"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, inputStyle(colors)]}
                  />
                </Field>
              </View>
            </View>

            <Field label="NOTES / REQUIREMENT" colors={colors}>
              <TextInput
                value={form.notes}
                onChangeText={(v) => setForm({ ...form, notes: v })}
                placeholder="Tower preference, payment plan, visit date..."
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.input, inputStyle(colors), { height: 88, paddingTop: 12, textAlignVertical: 'top' }]}
              />
            </Field>

            <Pressable
              testID="booking-lead-submit"
              onPress={save}
              disabled={loading || !form.name.trim() || !form.phone.trim()}
              style={[styles.saveBtn, {
                backgroundColor: colors.primary,
                opacity: (!form.name.trim() || !form.phone.trim() || loading) ? 0.55 : 1,
              }]}
            >
              {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save & use for booking</Text>
              )}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, colors, children }: { label: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

function inputStyle(colors: any) {
  return {
    color: colors.text,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 520, borderRadius: 16, borderWidth: 1, overflow: 'hidden', maxHeight: '92%' },
  header: { padding: 18, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  field: { gap: 6 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  input: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, fontSize: 14 },
  row: { flexDirection: 'row', gap: 12 },
  saveBtn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  errorBanner: { padding: 10, borderRadius: 8, borderWidth: 1 },
});
