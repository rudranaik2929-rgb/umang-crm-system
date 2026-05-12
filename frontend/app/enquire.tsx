import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeContext';
import { api } from '../src/lib/api';

export default function Enquire() {
  const router = useRouter();
  const { colors } = useTheme();
  const [form, setForm] = useState({
    name: '', phone: '', email: '', budget: '', location: '', property_type: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!form.name || !form.phone) {
      setError('Please provide your name and phone number.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/leads/public', form);
      setDone(true);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to submit enquiry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.brandRow}>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Text style={styles.logoText}>UMANG</Text>
          </View>
          <View>
            <Text style={[styles.brandTitle, { color: colors.text }]}>Umang Properties</Text>
            <Text style={[styles.brandSub, { color: colors.textMuted }]}>New Property Enquiry</Text>
          </View>
        </View>

        {done ? (
          <View style={styles.successWrap}>
            <View style={[styles.successCircle, { backgroundColor: colors.positive + '22', borderColor: colors.positive }]}>
              <Ionicons name="checkmark" size={32} color={colors.positive} />
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>Enquiry received</Text>
            <Text style={[styles.successDesc, { color: colors.textSecondary }]}>
              Thank you, {form.name}. Our telecaller team will reach out to you on {form.phone} shortly.
            </Text>
            <Pressable
              testID="enquiry-back-home"
              onPress={() => router.replace('/' as any)}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 24 }]}
            >
              <Text style={styles.primaryBtnText}>Back to Home</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Tell us what you&apos;re looking for</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Your details will be assigned to our telecaller team for a personalised callback.
            </Text>

            <Field label="Full name *" testID="enquire-name" value={form.name} onChange={(v) => update('name', v)} colors={colors} placeholder="Aarav Sharma" />
            <Field label="Phone number *" testID="enquire-phone" value={form.phone} onChange={(v) => update('phone', v)} colors={colors} placeholder="+91 98XXXXXXXX" keyboardType="phone-pad" />
            <Field label="Email" testID="enquire-email" value={form.email} onChange={(v) => update('email', v)} colors={colors} placeholder="aarav@email.com" keyboardType="email-address" />
            <Row>
              <Field label="Budget" testID="enquire-budget" value={form.budget} onChange={(v) => update('budget', v)} colors={colors} placeholder="₹ 50L – 80L" />
              <Field label="Property type" testID="enquire-type" value={form.property_type} onChange={(v) => update('property_type', v)} colors={colors} placeholder="2 BHK Apartment" />
            </Row>
            <Field label="Preferred location" testID="enquire-location" value={form.location} onChange={(v) => update('location', v)} colors={colors} placeholder="Pune – Hinjewadi" />
            <Field label="Notes" testID="enquire-notes" value={form.notes} onChange={(v) => update('notes', v)} colors={colors} placeholder="Anything we should know?" multiline />

            {error ? (
              <View style={[styles.errorBox, { borderColor: colors.negative, backgroundColor: colors.negative + '14' }]}>
                <Text style={{ color: colors.negative, fontSize: 12 }}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              testID="submit-enquiry-btn"
              onPress={submit}
              disabled={submitting}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="paper-plane" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Submit Enquiry</Text>
                </>
              )}
            </Pressable>

            <Pressable testID="enquiry-cancel" onPress={() => router.replace('/' as any)} style={styles.cancelBtn}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Back to login</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Field({ label, value, onChange, colors, placeholder, multiline, keyboardType, testID }: any) {
  return (
    <View style={{ flex: 1, marginTop: 14 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        style={{
          minHeight: multiline ? 80 : 42, paddingHorizontal: 12, paddingVertical: 10,
          borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          backgroundColor: colors.surfaceAlt, color: colors.text, fontSize: 13,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

function Row({ children }: any) {
  return <View style={{ flexDirection: 'row', gap: 12 }}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { padding: 24, alignItems: 'center', justifyContent: 'center', minHeight: '100%' },
  card: { width: '100%', maxWidth: 620, borderRadius: 16, borderWidth: 1, padding: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  logo: { paddingHorizontal: 12, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 1 },
  brandTitle: { fontSize: 15, fontWeight: '700' },
  brandSub: { fontSize: 11, marginTop: 1 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 6 },
  errorBox: { borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 14 },
  primaryBtn: {
    marginTop: 22, height: 46, borderRadius: 10, alignItems: 'center',
    justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  cancelBtn: { alignItems: 'center', marginTop: 14 },
  successWrap: { alignItems: 'center', paddingVertical: 24 },
  successCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  successTitle: { fontSize: 22, fontWeight: '700', marginTop: 18 },
  successDesc: { fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: 380 },
});
