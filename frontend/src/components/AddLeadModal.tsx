import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddLeadModal({ visible, onClose, onSuccess }: Props) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    budget: '',
    location: '',
    property_type: '2BHK',
    notes: ''
  });

  const save = async () => {
    if (!form.name || !form.phone) return;
    setLoading(true);
    try {
      await api.post('/leads', { ...form, stage: 'new', source: 'manual_entry' });
      onSuccess();
      onClose();
      setForm({ name: '', phone: '', email: '', budget: '', location: '', property_type: '2BHK', notes: '' });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Add New Enquiry</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>FULL NAME *</Text>
              <TextInput
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                placeholder="e.g. Rahul Sharma"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>PHONE NUMBER *</Text>
              <TextInput
                value={form.phone}
                onChangeText={(v) => setForm({ ...form, phone: v })}
                placeholder="e.g. 9876543210"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>LOCATION PREFERENCE</Text>
              <TextInput
                value={form.location}
                onChangeText={(v) => setForm({ ...form, location: v })}
                placeholder="e.g. Baner, Pune"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>BUDGET</Text>
                <TextInput
                  value={form.budget}
                  onChangeText={(v) => setForm({ ...form, budget: v })}
                  placeholder="e.g. 80 Lacs"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>TYPE</Text>
                <TextInput
                  value={form.property_type}
                  onChangeText={(v) => setForm({ ...form, property_type: v })}
                  placeholder="e.g. 3BHK"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>REQUIREMENT NOTES</Text>
              <TextInput
                value={form.notes}
                onChangeText={(v) => setForm({ ...form, notes: v })}
                placeholder="Any specific requirement..."
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt, height: 80, paddingTop: 12 }]}
              />
            </View>

            <Pressable
              onPress={save}
              disabled={loading || !form.name || !form.phone}
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: (!form.name || !form.phone) ? 0.5 : 1 }]}
            >
              {loading ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={{ color: '#fff', fontWeight: '700' }}>Create Enquiry</Text>
              )}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  sheet: { width: '90%', maxWidth: 460, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  header: { padding: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700' },
  field: { gap: 6 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  input: { height: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, fontSize: 14 },
  row: { flexDirection: 'row', gap: 12 },
  saveBtn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
});
