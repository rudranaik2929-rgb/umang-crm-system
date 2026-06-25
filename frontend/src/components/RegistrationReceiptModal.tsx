import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';

export type RegistrationReceiptForm = {
  invoice_no: string;
  receipt_date: string;
  buyer_name: string;
  buyer_phone: string;
  property_name: string;
  unit_number: string;
  tower: string;
  flat_cost: string;
  agreement_value: string;
  stamp_duty: string;
  registration_fees: string;
  gst: string;
  society_charges: string;
  notes: string;
};

function formatRupee(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

function num(raw: string) {
  const n = parseFloat(String(raw || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function strVal(v: unknown) {
  if (v == null || v === '') return '';
  return String(v);
}

export function buildReceiptFormFromBooking(booking: any): RegistrationReceiptForm {
  const saved = booking?.registration_receipt && typeof booking.registration_receipt === 'object'
    ? booking.registration_receipt
    : {};
  return {
    invoice_no: strVal(saved.invoice_no),
    receipt_date: strVal(saved.receipt_date),
    buyer_name: strVal(saved.buyer_name || booking?.lead_name),
    buyer_phone: strVal(saved.buyer_phone),
    property_name: strVal(saved.property_name || booking?.property_name),
    unit_number: strVal(saved.unit_number || booking?.unit_number),
    tower: strVal(saved.tower || booking?.tower),
    flat_cost: strVal(saved.flat_cost ?? booking?.flat_cost),
    agreement_value: strVal(saved.agreement_value ?? booking?.agreement_value),
    stamp_duty: strVal(saved.stamp_duty ?? booking?.stamp_duty),
    registration_fees: strVal(saved.registration_fees ?? booking?.registration_fees),
    gst: strVal(saved.gst ?? booking?.gst),
    society_charges: strVal(saved.society_charges ?? booking?.society_charges),
    notes: strVal(saved.notes),
  };
}

type Props = {
  visible: boolean;
  booking: any | null;
  colors: any;
  onClose: () => void;
  onSaved: (updated: any) => void | Promise<void>;
  markTaskComplete?: boolean;
};

export function RegistrationReceiptModal({
  visible,
  booking,
  colors,
  onClose,
  onSaved,
  markTaskComplete = false,
}: Props) {
  const [form, setForm] = useState<RegistrationReceiptForm>(buildReceiptFormFromBooking(booking));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && booking) {
      setForm(buildReceiptFormFromBooking(booking));
      setError(null);
    }
  }, [visible, booking]);

  const total = useMemo(() => (
    num(form.flat_cost)
    + num(form.agreement_value)
    + num(form.stamp_duty)
    + num(form.registration_fees)
    + num(form.gst)
    + num(form.society_charges)
  ), [form]);

  const setField = (key: keyof RegistrationReceiptForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (!booking?.booking_id) return;
    setBusy(true);
    setError(null);
    try {
      const receiptPayload = {
        ...form,
        total_amount: total,
        saved_at: new Date().toISOString(),
      };
      const payload: any = {
        registration_receipt: receiptPayload,
        property_name: form.property_name.trim() || booking.property_name,
        unit_number: form.unit_number.trim() || null,
        tower: form.tower.trim() || null,
        flat_cost: num(form.flat_cost),
        agreement_value: num(form.agreement_value),
        stamp_duty: num(form.stamp_duty),
        registration_fees: num(form.registration_fees),
        gst: num(form.gst),
        society_charges: num(form.society_charges),
      };
      if (markTaskComplete) {
        const current = Array.isArray(booking.completed_tasks) ? booking.completed_tasks : [];
        const next = Array.from(new Set([...current, 'registration']));
        payload.completed_tasks = next;
        payload.status = 'registration';
      }
      const res = await api.patch(`/bookings/${booking.booking_id}`, payload);
      await onSaved(res.data || { ...booking, ...payload });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not save registration receipt.');
    } finally {
      setBusy(false);
    }
  };

  if (!booking) return null;

  const hasSaved = Boolean(booking.registration_receipt?.invoice_no || booking.registration_receipt?.saved_at);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e: any) => e?.stopPropagation?.()}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>Registration — Basic Receipt</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                {booking.lead_name} · {booking.property_name}
              </Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closeBtn, { borderColor: colors.border }]}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 4, paddingBottom: 12 }}>
            <View style={[styles.receiptPreview, { borderColor: '#7C3AED55', backgroundColor: '#7C3AED08' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="receipt-outline" size={18} color="#7C3AED" />
                <Text style={{ color: '#7C3AED', fontWeight: '800', fontSize: 13 }}>
                  {hasSaved ? 'SAVED RECEIPT PREVIEW' : 'NEW RECEIPT'}
                </Text>
              </View>
              <ReceiptLine label="Invoice / Receipt No." value={form.invoice_no || '—'} colors={colors} />
              <ReceiptLine label="Receipt Date" value={form.receipt_date || '—'} colors={colors} />
              <ReceiptLine label="Buyer" value={form.buyer_name || '—'} colors={colors} />
              <ReceiptLine label="Property" value={form.property_name || '—'} colors={colors} />
              <ReceiptLine label="Agreement Value" value={form.agreement_value ? formatRupee(num(form.agreement_value)) : '—'} colors={colors} />
              <ReceiptLine label="Registration Charges" value={form.registration_fees ? formatRupee(num(form.registration_fees)) : '—'} colors={colors} />
              <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>Total (all charges)</Text>
                <Text style={{ color: '#7C3AED', fontWeight: '800', fontSize: 16 }}>{formatRupee(total)}</Text>
              </View>
            </View>

            <Text style={[styles.section, { color: colors.textMuted }]}>INVOICE DETAILS</Text>
            <Field label="INVOICE / RECEIPT NO." value={form.invoice_no} onChange={(v) => setField('invoice_no', v)} colors={colors} testID="reg-invoice-no" />
            <Field label="RECEIPT DATE" value={form.receipt_date} onChange={(v) => setField('receipt_date', v)} colors={colors} placeholder="e.g. 13 Jun 2026" testID="reg-receipt-date" />
            <Field label="BUYER NAME" value={form.buyer_name} onChange={(v) => setField('buyer_name', v)} colors={colors} testID="reg-buyer-name" />
            <Field label="BUYER PHONE" value={form.buyer_phone} onChange={(v) => setField('buyer_phone', v)} colors={colors} keyboardType="phone-pad" testID="reg-buyer-phone" />
            <Field label="PROPERTY NAME" value={form.property_name} onChange={(v) => setField('property_name', v)} colors={colors} testID="reg-property" />
            <Field label="FLAT / UNIT NO." value={form.unit_number} onChange={(v) => setField('unit_number', v)} colors={colors} testID="reg-unit" />
            <Field label="TOWER / WING" value={form.tower} onChange={(v) => setField('tower', v)} colors={colors} testID="reg-tower" />

            <Text style={[styles.section, { color: colors.textMuted, marginTop: 8 }]}>CHARGE BREAKDOWN (₹)</Text>
            {([
              ['agreement_value', 'Agreement Value'],
              ['flat_cost', 'Interior Cost'],
              ['stamp_duty', 'Stamp Duty'],
              ['registration_fees', 'Registration Charges'],
              ['gst', 'GST'],
              ['society_charges', 'Society Charges'],
            ] as const).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                value={form[key]}
                onChange={(v) => setField(key, v)}
                colors={colors}
                keyboardType="numeric"
                testID={`reg-${key}`}
              />
            ))}
            <Field label="NOTES" value={form.notes} onChange={(v) => setField('notes', v)} colors={colors} multiline testID="reg-notes" />

            {error ? <Text style={{ color: colors.negative, fontSize: 12, marginTop: 8 }}>{error}</Text> : null}

            <Pressable
              testID="reg-receipt-save"
              onPress={save}
              disabled={busy}
              style={[styles.saveBtn, { backgroundColor: '#7C3AED', opacity: busy ? 0.7 : 1 }]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.saveBtnText}>
                  {markTaskComplete ? 'Save Receipt & Complete Registration' : 'Save Receipt'}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ReceiptLine({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.previewLine}>
      <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600', flex: 1.2, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function Field({
  label, value, onChange, colors, keyboardType, placeholder, multiline, testID,
}: any) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        style={{
          minHeight: multiline ? 64 : 40,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: multiline ? 10 : 8,
          color: colors.text,
          backgroundColor: colors.surfaceAlt,
          fontSize: 13,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 520, maxHeight: '92%', borderRadius: 12, borderWidth: 1, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  closeBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  receiptPreview: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 4 },
  previewLine: { flexDirection: 'row', gap: 8, marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  section: { fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginTop: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  saveBtn: { marginTop: 16, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
