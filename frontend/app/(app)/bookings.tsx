import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { CardActionMenu } from '../../src/components/CardActionMenu';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/auth/AuthContext';
import { canSeeRevenue } from '../../src/lib/constants';

const AGREEMENT_COLOR: Record<string, string> = { pending: '#D97706', signed: '#059669', cancelled: '#E11D48' };
const BOOKING_TASKS = [
  { key: 'login_file', label: 'Login File', status: 'login file', icon: 'folder-open-outline', color: '#0284C7' },
  { key: 'sanctioned', label: 'Sanctioned', status: 'sanctioned', icon: 'checkmark-done-outline', color: '#111827' },
  { key: 'registration', label: 'Registration', status: 'registration', icon: 'document-text-outline', color: '#7C3AED' },
  { key: 'disbursement', label: 'Disbursement', status: 'disbursement', icon: 'cash-outline', color: '#059669' },
  { key: 'bill_submitted', label: 'Bill Submitted', status: 'bill submitted', icon: 'receipt-outline', color: '#D97706' },
  { key: 'amount_received', label: 'Amt Received / Receipt', status: 'amount received', icon: 'wallet-outline', color: '#10B981' },
];

function completedTasksFor(booking: any): string[] {
  if (Array.isArray(booking.completed_tasks)) return booking.completed_tasks;
  const fromStatus = BOOKING_TASKS.find((task) => task.status === booking.status);
  return fromStatus ? [fromStatus.key] : [];
}

export default function Bookings() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [localBrokerage, setLocalBrokerage] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([api.get('/bookings'), api.get('/leads')]);
      let bookingData = b.data || [];
      // Non-admin: only show bookings for leads assigned to this employee
      if (user?.role !== 'admin' && (user as any)?.acting_as_employee_id) {
        const myLeadIds = new Set((l.data || []).filter((x: any) => x.assigned_to === (user as any).acting_as_employee_id).map((x: any) => x.lead_id));
        bookingData = bookingData.filter((x: any) => myLeadIds.has(x.lead_id));
      }
      setBookings(bookingData);
      setLeads((l.data || []).filter((x: any) => x.status !== 'negative' && ['booking'].includes(x.stage)));
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const update = async (id: string, payload: any, key: string) => {
    setBusy(`${id}-${key}`);
    try { await api.patch(`/bookings/${id}`, payload); await load(); }
    finally { setBusy(null); }
  };

  const completeTask = async (booking: any, task: typeof BOOKING_TASKS[number]) => {
    const current = completedTasksFor(booking);
    if (current.includes(task.key)) return;
    const next = Array.from(new Set([...current, task.key]));
    const payload: any = { completed_tasks: next, status: task.status };
    if (task.key === 'amount_received') {
      const bookingAmount = Number(booking.booking_amount || 0);
      payload.token_received = bookingAmount > 0 ? Math.max(Number(booking.token_received || 0), bookingAmount) : Number(booking.token_received || 0);
      payload.payment_status = 'received';
      payload.payment_progress = 100;
    }
    if ('token_received' in payload || booking.booking_amount) {
      const amount = Number(booking.booking_amount || 0);
      const token = Number(payload.token_received ?? booking.token_received ?? 0);
      if (task.key !== 'amount_received') {
        payload.payment_progress = amount ? Math.min(100, Math.round((token / amount) * 100)) : 0;
      }
    }
    setBookings((items) => items.map((item) => (
      item.booking_id === booking.booking_id ? { ...item, ...payload } : item
    )));
    await update(booking.booking_id, payload, task.key);
  };

  const toggleStar = async (booking: any) => {
    await api.patch(`/bookings/${booking.booking_id}`, { starred: !booking.starred });
    await load();
  };

  const deleteBooking = async (booking: any) => {
    const ok = typeof window === 'undefined' || window.confirm(`Delete booking for ${booking.lead_name || booking.property_name}?`);
    if (!ok) return;
    await api.delete(`/bookings/${booking.booking_id}`);
    await load();
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
          ) : bookings.map((b) => {
            const rawAgreement = b.agreement_status || 'pending';
            const realAgreementStatus = rawAgreement.split(' | ')[0] || 'pending';
            const brokerageMatch = rawAgreement.match(/Brokerage:\s*([0-9.]+)/);
            const brokerageAmount = brokerageMatch ? parseFloat(brokerageMatch[1]) : 0;
            const completed = completedTasksFor(b);
            const completedSet = new Set(completed);
            const completedLabels = BOOKING_TASKS.filter((task) => completedSet.has(task.key));
            const paymentProgress = completedSet.has('amount_received') ? 100 : Number(b.payment_progress || 0);

            return (
              <View key={b.booking_id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={[styles.iconBig, { backgroundColor: colors.warning + '18' }]}>
                    <Ionicons name="document-text" size={18} color={colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {b.starred ? <Ionicons name="star" size={14} color={colors.warning} /> : null}
                      <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>{b.property_name}</Text>
                    </View>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>For {b.lead_name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <Badge text={`AGREEMENT: ${realAgreementStatus.toUpperCase()}`} color={AGREEMENT_COLOR[realAgreementStatus] || colors.info} />
                      <Badge text={`STATUS: ${(b.status || 'active').toUpperCase()}`} color={['confirmed', 'disbursement', 'sanctioned'].includes(b.status) ? colors.positive : ['cancellation', 'cancelled'].includes(b.status) ? colors.negative : b.status === 'registration' ? '#7C3AED' : b.status === 'bill submitted' ? colors.warning : colors.info} />
                    </View>
                  </View>
                  {canSeeRevenue(user?.role) && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.bigVal, { color: colors.text }]}>₹{(b.booking_amount || 0).toLocaleString('en-IN')}</Text>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>Booking amount</Text>
                  </View>
                  )}
                  <CardActionMenu
                    colors={colors}
                    isStarred={!!b.starred}
                    onEdit={() => setEditingBooking(b)}
                    onToggleStar={() => toggleStar(b)}
                    onDelete={() => deleteBooking(b)}
                    testIDPrefix={`booking-${b.booking_id}`}
                  />
                </View>

                <View style={[styles.checkSummary, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSoft }]}>
                  <View style={[styles.completedBadge, { backgroundColor: colors.positive + '16', borderColor: colors.positive + '45' }]}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.positive} />
                    <Text style={{ color: colors.positive, fontSize: 12, fontWeight: '800' }}>
                      {completed.length}/{BOOKING_TASKS.length} Completed
                    </Text>
                  </View>
                  <View style={styles.completedChips}>
                    {completedLabels.length === 0 ? (
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>No checklist task completed yet</Text>
                    ) : completedLabels.map((task) => (
                      <View key={task.key} style={[styles.doneChip, { borderColor: task.color + '55', backgroundColor: task.color + '10' }]}>
                        <Ionicons name="checkmark" size={11} color={task.color} />
                        <Text style={{ color: task.color, fontSize: 10, fontWeight: '800' }}>{task.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {canSeeRevenue(user?.role) && (
                <View style={{ marginTop: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Token received: ₹{(b.token_received || 0).toLocaleString('en-IN')}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{paymentProgress}%</Text>
                  </View>
                  <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.fill, { width: `${paymentProgress}%`, backgroundColor: colors.positive }]} />
                  </View>
                </View>
                )}

                {/* Brokerage Input & Percentage Calculation — hidden for manager */}
                {canSeeRevenue(user?.role) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>BROKERAGE (₹)</Text>
                    <TextInput
                      value={localBrokerage[b.booking_id] !== undefined ? localBrokerage[b.booking_id] : (brokerageAmount > 0 ? String(brokerageAmount) : '')}
                      placeholder="Enter Brokerage"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      onChangeText={(text) => setLocalBrokerage(prev => ({ ...prev, [b.booking_id]: text }))}
                      onBlur={() => {
                        const val = localBrokerage[b.booking_id];
                        if (val === undefined) return;
                        const parsedVal = parseFloat(val) || 0;
                        const existingStatus = b.agreement_status ? b.agreement_status.replace(/ \| Brokerage:\s*[0-9.]+/, '').trim() : 'pending';
                        const newStatus = parsedVal > 0 ? `${existingStatus} | Brokerage: ${parsedVal}` : existingStatus;
                        if (newStatus !== b.agreement_status) {
                          update(b.booking_id, { agreement_status: newStatus }, 'brokerage');
                        }
                      }}
                      style={{ height: 28, width: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surfaceAlt }}
                    />
                  </View>
                  {((localBrokerage[b.booking_id] !== undefined ? parseFloat(localBrokerage[b.booking_id]) || 0 : brokerageAmount) > 0) && b.booking_amount > 0 && (
                    <Text style={{ color: colors.positive, fontSize: 12, fontWeight: '600' }}>
                      ({(((localBrokerage[b.booking_id] !== undefined ? parseFloat(localBrokerage[b.booking_id]) || 0 : brokerageAmount) / b.booking_amount) * 100).toFixed(2)}%)
                    </Text>
                  )}
                </View>
                )}

                <View style={styles.actions}>
                {BOOKING_TASKS.map((task) => {
                  if (task.key === 'amount_received' && !canSeeRevenue(user?.role)) return null;
                  const done = completedSet.has(task.key);
                  return (
                    <Pressable
                      key={task.key}
                      testID={`booking-task-${task.key}-${b.booking_id}`}
                      onPress={() => completeTask(b, task)}
                      disabled={done || busy !== null}
                      style={[
                        styles.act,
                        {
                          borderColor: done ? colors.positive + '70' : task.color + '60',
                          backgroundColor: done ? colors.positive + '14' : task.color + '10',
                          opacity: busy !== null && !done ? 0.65 : 1,
                        },
                      ]}
                    >
                      {busy === `${b.booking_id}-${task.key}` ? <ActivityIndicator size="small" color={task.color} /> : <>
                        <Ionicons name={done ? 'checkmark-circle' : task.icon as any} size={13} color={done ? colors.positive : task.color} />
                        <Text style={{ color: done ? colors.positive : task.color, fontSize: 11, fontWeight: '700' }}>
                          {done ? 'Completed' : task.label}
                        </Text>
                      </>}
                    </Pressable>
                  );
                })}

                {/* 2. Cancellation */}
                <Pressable testID={`booking-cancel-${b.booking_id}`} onPress={() => update(b.booking_id, { status: 'cancellation' }, 'cancel')} style={[styles.act, { borderColor: colors.negative + '60', backgroundColor: colors.negative + '10' }]}>
                  {busy === `${b.booking_id}-cancel` ? <ActivityIndicator size="small" color={colors.negative} /> : <>
                    <Ionicons name="close-circle-outline" size={13} color={colors.negative} />
                    <Text style={{ color: colors.negative, fontSize: 11, fontWeight: '600' }}>Cancellation</Text>
                  </>}
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <CreateBookingModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async () => { setShowCreate(false); await load(); }}
        leads={leads}
        colors={colors}
      />
      <EditBookingModal
        booking={editingBooking}
        visible={!!editingBooking}
        onClose={() => setEditingBooking(null)}
        onSaved={async () => { setEditingBooking(null); await load(); }}
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

function EditBookingModal({ visible, onClose, onSaved, booking, colors }: any) {
  const [property, setProperty] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');
  const [agreement, setAgreement] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!booking) return;
    setProperty(booking.property_name || '');
    setAmount(String(booking.booking_amount || 0));
    setToken(String(booking.token_received || 0));
    setStatus(booking.status || 'active');
    setAgreement((booking.agreement_status || 'pending').split(' | ')[0]);
  }, [booking]);

  const submit = async () => {
    if (!booking) return;
    setBusy(true);
    try {
      await api.patch(`/bookings/${booking.booking_id}`, {
        property_name: property,
        booking_amount: parseFloat(amount) || 0,
        token_received: parseFloat(token) || 0,
        status,
        agreement_status: agreement,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(event: any) => event?.stopPropagation?.()}
          style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>Edit Booking</Text>
          <FormField label="PROPERTY NAME" testID="edit-booking-property" value={property} onChange={setProperty} colors={colors} />
          <FormField label="BOOKING AMOUNT (₹)" testID="edit-booking-amount" value={amount} onChange={setAmount} colors={colors} keyboardType="numeric" />
          <FormField label="TOKEN RECEIVED (₹)" testID="edit-booking-token" value={token} onChange={setToken} colors={colors} keyboardType="numeric" />
          <FormField label="STATUS" testID="edit-booking-status" value={status} onChange={setStatus} colors={colors} />
          <FormField label="AGREEMENT STATUS" testID="edit-booking-agreement" value={agreement} onChange={setAgreement} colors={colors} />
          <Pressable
            testID="edit-booking-submit"
            onPress={submit}
            disabled={busy}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16, height: 42, justifyContent: 'center' }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save Booking</Text>}
          </Pressable>
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
  checkSummary: { marginTop: 14, borderRadius: 8, borderWidth: 1, padding: 10, gap: 8 },
  completedBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, height: 26 },
  completedChips: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, height: 24 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 30, borderRadius: 6, borderWidth: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { width: '92%', maxWidth: 480, padding: 20, borderRadius: 12, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  leadOpt: { padding: 10, borderRadius: 8, borderWidth: 1 },
});
