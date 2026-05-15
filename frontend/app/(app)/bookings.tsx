import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';

const AGREEMENT_COLOR: Record<string, string> = { pending: '#D97706', signed: '#059669', cancelled: '#E11D48' };

export default function Bookings() {
  const { colors } = useTheme();
  const [bookings, setBookings] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([api.get('/bookings'), api.get('/leads')]);
      setBookings(b.data || []);
      setLeads((l.data || []).filter((x: any) => x.status !== 'negative'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (id: string, payload: any, key: string) => {
    setBusy(`${id}-${key}`);
    try { await api.patch(`/bookings/${id}`, payload); await load(); }
    finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Booking Management"
        subtitle="Token, agreement & payment tracking"
        rightAction={
          <Pressable testID="create-booking-btn" onPress={() => setShowCreate(true)} style={[styles.primary, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={styles.primaryText}>New Booking</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> :
          bookings.length === 0 ? (
            <EmptyState
              variant="leads"
              title="No bookings yet"
              description="When a site visit converts, a booking record captures the property, token amount and agreement progress."
              actionLabel="Create First Booking"
              onAction={() => setShowCreate(true)}
              testIDAction="empty-create-booking"
            />
          ) : bookings.map((b) => (
            <View key={b.booking_id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={[styles.iconBig, { backgroundColor: colors.warning + '18' }]}>
                  <Ionicons name="document-text" size={18} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{b.property_name}</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>For {b.lead_name}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <Badge text={`AGREEMENT: ${(b.agreement_status || 'pending').toUpperCase()}`} color={AGREEMENT_COLOR[b.agreement_status] || colors.info} />
                    <Badge text={`STATUS: ${(b.status || 'active').toUpperCase()}`} color={['confirmed', 'disbursement', 'sanctioned'].includes(b.status) ? colors.positive : ['cancellation', 'cancelled'].includes(b.status) ? colors.negative : b.status === 'registration' ? '#7C3AED' : b.status === 'bill submitted' ? colors.warning : colors.info} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.bigVal, { color: colors.text }]}>₹{(b.booking_amount || 0).toLocaleString('en-IN')}</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>Booking amount</Text>
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Token received: ₹{(b.token_received || 0).toLocaleString('en-IN')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{b.payment_progress || 0}%</Text>
                </View>
                <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
                  <View style={[styles.fill, { width: `${b.payment_progress}%`, backgroundColor: colors.positive }]} />
                </View>
              </View>

              <View style={styles.actions}>
                {/* 1. Login File */}
                <Pressable testID={`booking-login-${b.booking_id}`} onPress={() => update(b.booking_id, { status: 'login file' }, 'login')} style={[styles.act, { borderColor: colors.info + '60', backgroundColor: colors.info + '10' }]}>
                  {busy === `${b.booking_id}-login` ? <ActivityIndicator size="small" color={colors.info} /> : <>
                    <Ionicons name="folder-open-outline" size={13} color={colors.info} />
                    <Text style={{ color: colors.info, fontSize: 11, fontWeight: '600' }}>Login File</Text>
                  </>}
                </Pressable>

                {/* 3. Sanctioned */}
                <Pressable testID={`booking-sanc-${b.booking_id}`} onPress={() => update(b.booking_id, { status: 'sanctioned' }, 'sanc')} style={[styles.act, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '10' }]}>
                  {busy === `${b.booking_id}-sanc` ? <ActivityIndicator size="small" color={colors.primary} /> : <>
                    <Ionicons name="checkmark-done-outline" size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Sanctioned</Text>
                  </>}
                </Pressable>

                {/* 4. Registration */}
                <Pressable testID={`booking-reg-${b.booking_id}`} onPress={() => update(b.booking_id, { status: 'registration' }, 'reg')} style={[styles.act, { borderColor: '#7C3AED60', backgroundColor: '#7C3AED10' }]}>
                  {busy === `${b.booking_id}-reg` ? <ActivityIndicator size="small" color="#7C3AED" /> : <>
                    <Ionicons name="document-text-outline" size={13} color={'#7C3AED'} />
                    <Text style={{ color: '#7C3AED', fontSize: 11, fontWeight: '600' }}>Registration</Text>
                  </>}
                </Pressable>

                {/* 5. Disbursement */}
                <Pressable testID={`booking-disb-${b.booking_id}`} onPress={() => update(b.booking_id, { status: 'disbursement' }, 'disb')} style={[styles.act, { borderColor: colors.positive + '60', backgroundColor: colors.positive + '10' }]}>
                  {busy === `${b.booking_id}-disb` ? <ActivityIndicator size="small" color={colors.positive} /> : <>
                    <Ionicons name="cash-outline" size={13} color={colors.positive} />
                    <Text style={{ color: colors.positive, fontSize: 11, fontWeight: '600' }}>Disbursement</Text>
                  </>}
                </Pressable>

                {/* 6. Bill Submitted */}
                <Pressable testID={`booking-bill-${b.booking_id}`} onPress={() => update(b.booking_id, { status: 'bill submitted' }, 'bill')} style={[styles.act, { borderColor: colors.warning + '60', backgroundColor: colors.warning + '10' }]}>
                  {busy === `${b.booking_id}-bill` ? <ActivityIndicator size="small" color={colors.warning} /> : <>
                    <Ionicons name="receipt-outline" size={13} color={colors.warning} />
                    <Text style={{ color: colors.warning, fontSize: 11, fontWeight: '600' }}>Bill Submitted</Text>
                  </>}
                </Pressable>

                {/* 7. Amt Recieved/Receipt */}
                <Pressable testID={`booking-amt-${b.booking_id}`} onPress={() => update(b.booking_id, { token_received: b.token_received + (b.booking_amount * 0.1) }, 'amt')} style={[styles.act, { borderColor: '#10B98160', backgroundColor: '#10B98110' }]}>
                  {busy === `${b.booking_id}-amt` ? <ActivityIndicator size="small" color="#10B981" /> : <>
                    <Ionicons name="wallet-outline" size={13} color={'#10B981'} />
                    <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '600' }}>Amt Recieved / Receipt</Text>
                  </>}
                </Pressable>

                {/* 2. Cancellation */}
                <Pressable testID={`booking-cancel-${b.booking_id}`} onPress={() => update(b.booking_id, { status: 'cancellation' }, 'cancel')} style={[styles.act, { borderColor: colors.negative + '60', backgroundColor: colors.negative + '10' }]}>
                  {busy === `${b.booking_id}-cancel` ? <ActivityIndicator size="small" color={colors.negative} /> : <>
                    <Ionicons name="close-circle-outline" size={13} color={colors.negative} />
                    <Text style={{ color: colors.negative, fontSize: 11, fontWeight: '600' }}>Cancellation</Text>
                  </>}
                </Pressable>
              </View>
            </View>
          ))}
      </ScrollView>

      <CreateBookingModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async () => { setShowCreate(false); await load(); }}
        leads={leads}
        colors={colors}
      />
    </View>
  );
}

function CreateBookingModal({ visible, onClose, onCreated, leads, colors }: any) {
  const [leadId, setLeadId] = useState('');
  const [property, setProperty] = useState('');
  const [amount, setAmount] = useState('5000000');
  const [token, setToken] = useState('100000');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible && leads[0]) setLeadId(leads[0].lead_id);
  }, [visible, leads]);

  const submit = async () => {
    if (!leadId || !property) return;
    setBusy(true);
    try {
      await api.post('/bookings', {
        lead_id: leadId,
        property_name: property,
        booking_amount: parseFloat(amount) || 0,
        token_received: parseFloat(token) || 0,
      });
      onCreated();
      setProperty(''); setAmount('5000000'); setToken('100000');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>New Booking</Text>
          {leads.length === 0 ? (
            <Text style={{ color: colors.textSecondary, marginTop: 14, fontSize: 13 }}>
              No leads available yet.
            </Text>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.textMuted }]}>LEAD</Text>
              <ScrollView style={{ maxHeight: 160 }} contentContainerStyle={{ gap: 6 }}>
                {leads.map((l: any) => (
                  <Pressable key={l.lead_id} testID={`booking-lead-${l.lead_id}`} onPress={() => setLeadId(l.lead_id)}
                    style={[styles.leadOpt, {
                      borderColor: leadId === l.lead_id ? colors.primary : colors.border,
                      backgroundColor: leadId === l.lead_id ? colors.primary + '20' : colors.surfaceAlt,
                    }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{l.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{l.phone} · {l.location || ''}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <FormField label="PROPERTY NAME" testID="booking-property" value={property} onChange={setProperty} colors={colors} placeholder="Umang Skylark – 3BHK Tower B" />
              <FormField label="BOOKING AMOUNT (₹)" testID="booking-amount" value={amount} onChange={setAmount} colors={colors} keyboardType="numeric" />
              <FormField label="TOKEN RECEIVED (₹)" testID="booking-token-input" value={token} onChange={setToken} colors={colors} keyboardType="numeric" />
              <Pressable testID="booking-submit" onPress={submit} disabled={busy}
                style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16, height: 42, justifyContent: 'center' }]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create Booking</Text>}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FormField({ label, value, onChange, colors, keyboardType, testID, placeholder }: any) {
  return (
    <View>
      <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>{label}</Text>
      <TextInput
        testID={testID}
        value={value} onChangeText={onChange}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={{ height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.text, backgroundColor: colors.surfaceAlt }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  iconBig: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bigVal: { fontSize: 20, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 30, borderRadius: 6, borderWidth: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { width: '92%', maxWidth: 480, padding: 20, borderRadius: 12, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  leadOpt: { padding: 10, borderRadius: 8, borderWidth: 1 },
});
