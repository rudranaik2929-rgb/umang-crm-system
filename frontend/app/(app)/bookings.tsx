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
import { SearchableSelect } from '../../src/components/SearchableSelect';

function leadInBookingQueue(lead: any) {
  const pr = String(lead?.priority || '').toLowerCase();
  return pr === 'handoff_booking' || pr === 'hot' || lead?.stage === 'booking';
}

/** Booking team sees all records — hot leads stay assigned to telecaller. */
function seesAllBookings(role?: string | null) {
  return role === 'admin' || role === 'manager' || role === 'booking';
}

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
      const [b, l] = await Promise.all([
        api.get('/bookings'),
        api.get('/leads', { params: { limit: 500 } }),
      ]);
      const allBookings = Array.isArray(b.data) ? b.data : [];
      let bookingData = allBookings;
      if (!seesAllBookings(user?.role) && (user as any)?.acting_as_employee_id) {
        const myLeadIds = new Set(
          (l.data || [])
            .filter((x: any) => x.assigned_to === (user as any).acting_as_employee_id)
            .map((x: any) => x.lead_id),
        );
        bookingData = allBookings.filter((x: any) => myLeadIds.has(x.lead_id));
      }
      setBookings(bookingData);
      const bookedLeadIds = new Set(allBookings.map((x: any) => x.lead_id));
      setLeads((l.data || []).filter((x: any) =>
        x.status !== 'negative'
        && !bookedLeadIds.has(x.lead_id)
        && leadInBookingQueue(x)
      ));
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
        {!loading && leads.length > 0 ? (
          <Pressable
            testID="booking-queue-banner"
            onPress={() => setShowCreate(true)}
            style={[styles.queueBanner, { backgroundColor: '#EF444414', borderColor: '#EF444455' }]}
          >
            <Ionicons name="flame" size={18} color="#EF4444" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                {leads.length} hot / ready lead{leads.length === 1 ? '' : 's'} waiting
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                Tap here or use New Booking to select a lead from telecaller hot list
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#EF4444" />
          </Pressable>
        ) : null}
        {loading ? <ActivityIndicator color={colors.primary} /> : (
          <>
          {bookings.length === 0 ? (
            <EmptyState
              variant="leads"
              title="No bookings yet"
              description="Pick a hot lead from New Booking — after you create, the record appears in this list."
              actionLabel="Create First Booking"
              onAction={() => setShowCreate(true)}
              testIDAction="empty-create-booking"
            />
          ) : (
            <>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ACTIVE BOOKINGS ({bookings.length})</Text>
            {bookings.map((b) => {
            const rawAgreement = b.agreement_status || 'pending';
            const realAgreementStatus = rawAgreement.split(' | ')[0] || 'pending';
            const brokerageAmount = Number(b.brokerage_amount || 0) || (() => {
              const m = rawAgreement.match(/Brokerage:\s*([0-9.]+)/);
              return m ? parseFloat(m[1]) : 0;
            })();
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
                  {canSeeRevenue(user?.role, user?.email) && (
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

                {canSeeRevenue(user?.role, user?.email) && (
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
                {canSeeRevenue(user?.role, user?.email) && (
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
                        update(b.booking_id, { brokerage_amount: parsedVal }, 'brokerage');
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
                  if (task.key === 'amount_received' && !canSeeRevenue(user?.role, user?.email)) return null;
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
            </>
          )}
          </>
        )}
      </ScrollView>

      <CreateBookingModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async (created) => {
          setShowCreate(false);
          if (created?.booking_id) {
            setBookings((prev) => {
              const ids = new Set(prev.map((x) => x.booking_id));
              return ids.has(created.booking_id) ? prev : [created, ...prev];
            });
            setLeads((prev) => prev.filter((x) => x.lead_id !== created.lead_id));
          }
          await load();
        }}
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
  const [leadSearch, setLeadSearch] = useState('');
  const [property, setProperty] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState('');
  const [flatCost, setFlatCost] = useState('');
  const [agreementValue, setAgreementValue] = useState('');
  const [stampDuty, setStampDuty] = useState('');
  const [registrationFees, setRegistrationFees] = useState('');
  const [gst, setGst] = useState('');
  const [societyCharges, setSocietyCharges] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && leads[0]) setLeadId(leads[0].lead_id);
    if (visible) {
      setError(null);
      setLeadSearch('');
      setProperty(''); setAmount(''); setToken('');
      setFlatCost(''); setAgreementValue(''); setStampDuty('');
      setRegistrationFees(''); setGst(''); setSocietyCharges('');
    }
  }, [visible, leads]);

  const parseNum = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const submit = async () => {
    if (!leadId) return;
    setBusy(true);
    setError(null);
    try {
      const payload: any = {
        lead_id: leadId,
        property_name: property.trim() || 'Property TBD',
        booking_amount: parseNum(amount) ?? 0,
        token_received: parseNum(token) ?? 0,
      };
      const flat = parseNum(flatCost); if (flat !== undefined) payload.flat_cost = flat;
      const agr = parseNum(agreementValue); if (agr !== undefined) payload.agreement_value = agr;
      const stamp = parseNum(stampDuty); if (stamp !== undefined) payload.stamp_duty = stamp;
      const reg = parseNum(registrationFees); if (reg !== undefined) payload.registration_fees = reg;
      const gstVal = parseNum(gst); if (gstVal !== undefined) payload.gst = gstVal;
      const soc = parseNum(societyCharges); if (soc !== undefined) payload.society_charges = soc;
      const res = await api.post('/bookings', payload);
      onCreated(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not create booking.');
    } finally { setBusy(false); }
  };

  const selectedLead = leads.find((l: any) => l.lead_id === leadId);
  const filteredLeads = leads.filter((l: any) => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return true;
    return String(l.name || '').toLowerCase().includes(q)
      || String(l.phone || '').toLowerCase().includes(q)
      || String(l.location || '').toLowerCase().includes(q);
  });
  const leadOptions = filteredLeads.map((l: any) => {
    const pr = String(l.priority || '').toLowerCase();
    const tag = pr === 'hot' ? '🔥 Hot' : pr === 'handoff_booking' ? 'Ready' : '';
    return {
      key: l.lead_id,
      label: l.name || 'Lead',
      sublabel: `${tag ? `${tag} · ` : ''}${l.phone || '—'}${l.location ? ` · ${l.location}` : ''}`,
    };
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '90%' }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>New Booking</Text>
          {leads.length === 0 ? (
            <Text style={{ color: colors.textSecondary, marginTop: 14, fontSize: 13 }}>
              No leads in queue yet. When telecaller marks Hot Lead, they appear here under New Booking.
            </Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={[styles.label, { color: colors.textMuted }]}>SELECT LEAD (SEARCH & PICK)</Text>
              <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  value={leadSearch}
                  onChangeText={setLeadSearch}
                  placeholder="Search name, phone, location..."
                  placeholderTextColor={colors.textMuted}
                  style={{ flex: 1, color: colors.text, fontSize: 13, paddingVertical: 8, paddingHorizontal: 8 }}
                />
              </View>
              <View style={{ marginTop: 10 }}>
                <SearchableSelect
                  label="LEAD"
                  value={leadId}
                  options={leadOptions.length ? leadOptions : [{ key: '', label: 'No matches' }]}
                  onChange={setLeadId}
                  placeholder="Choose lead for booking"
                  testID="booking-lead-select"
                />
              </View>
              {selectedLead ? (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
                  Selected: {selectedLead.name} · {selectedLead.phone || 'No phone'}
                </Text>
              ) : null}
              <FormField label="PROPERTY NAME (OPTIONAL)" testID="booking-property" value={property} onChange={setProperty} colors={colors} placeholder="Umang Skylark – 3BHK Tower B" />
              <FormField label="BOOKING AMOUNT (₹, OPTIONAL)" testID="booking-amount" value={amount} onChange={setAmount} colors={colors} keyboardType="numeric" />
              <FormField label="TOKEN RECEIVED (₹, OPTIONAL)" testID="booking-token-input" value={token} onChange={setToken} colors={colors} keyboardType="numeric" />
              <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>COST BREAKDOWN (ALL OPTIONAL)</Text>
              <FormField label="FLAT COST (₹)" testID="booking-flat-cost" value={flatCost} onChange={setFlatCost} colors={colors} keyboardType="numeric" />
              <FormField label="AGREEMENT VALUE (₹)" testID="booking-agreement-value" value={agreementValue} onChange={setAgreementValue} colors={colors} keyboardType="numeric" />
              <FormField label="STAMP DUTY (₹)" testID="booking-stamp-duty" value={stampDuty} onChange={setStampDuty} colors={colors} keyboardType="numeric" />
              <FormField label="REGISTRATION FEES (₹)" testID="booking-registration-fees" value={registrationFees} onChange={setRegistrationFees} colors={colors} keyboardType="numeric" />
              <FormField label="GST (₹)" testID="booking-gst" value={gst} onChange={setGst} colors={colors} keyboardType="numeric" />
              <FormField label="SOCIETY CHARGES (₹)" testID="booking-society-charges" value={societyCharges} onChange={setSocietyCharges} colors={colors} keyboardType="numeric" />
              {error ? <Text style={{ color: colors.negative, fontSize: 12, marginTop: 10 }}>{error}</Text> : null}
              <Pressable testID="booking-submit" onPress={submit} disabled={busy || !leadId}
                style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16, height: 42, justifyContent: 'center', opacity: leadId ? 1 : 0.5 }]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create Booking</Text>}
              </Pressable>
            </ScrollView>
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
  const [flatCost, setFlatCost] = useState('');
  const [agreementValue, setAgreementValue] = useState('');
  const [stampDuty, setStampDuty] = useState('');
  const [registrationFees, setRegistrationFees] = useState('');
  const [gst, setGst] = useState('');
  const [societyCharges, setSocietyCharges] = useState('');
  const [status, setStatus] = useState('');
  const [agreement, setAgreement] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!booking) return;
    setProperty(booking.property_name || '');
    setAmount(String(booking.booking_amount || ''));
    setToken(String(booking.token_received || ''));
    setFlatCost(booking.flat_cost != null ? String(booking.flat_cost) : '');
    setAgreementValue(booking.agreement_value != null ? String(booking.agreement_value) : '');
    setStampDuty(booking.stamp_duty != null ? String(booking.stamp_duty) : '');
    setRegistrationFees(booking.registration_fees != null ? String(booking.registration_fees) : '');
    setGst(booking.gst != null ? String(booking.gst) : '');
    setSocietyCharges(booking.society_charges != null ? String(booking.society_charges) : '');
    setStatus(booking.status || 'active');
    setAgreement((booking.agreement_status || 'pending').split(' | ')[0]);
  }, [booking]);

  const parseNum = (v: string) => {
    if (!v.trim()) return undefined;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const submit = async () => {
    if (!booking) return;
    setBusy(true);
    try {
      const payload: any = {
        property_name: property,
        booking_amount: parseNum(amount) ?? 0,
        token_received: parseNum(token) ?? 0,
        status,
        agreement_status: agreement,
      };
      const flat = parseNum(flatCost); if (flat !== undefined) payload.flat_cost = flat;
      const agr = parseNum(agreementValue); if (agr !== undefined) payload.agreement_value = agr;
      const stamp = parseNum(stampDuty); if (stamp !== undefined) payload.stamp_duty = stamp;
      const reg = parseNum(registrationFees); if (reg !== undefined) payload.registration_fees = reg;
      const gstVal = parseNum(gst); if (gstVal !== undefined) payload.gst = gstVal;
      const soc = parseNum(societyCharges); if (soc !== undefined) payload.society_charges = soc;
      await api.patch(`/bookings/${booking.booking_id}`, payload);
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
          style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '90%' }]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>Edit Booking</Text>
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            <FormField label="PROPERTY NAME" testID="edit-booking-property" value={property} onChange={setProperty} colors={colors} />
            <FormField label="BOOKING AMOUNT (₹)" testID="edit-booking-amount" value={amount} onChange={setAmount} colors={colors} keyboardType="numeric" />
            <FormField label="TOKEN RECEIVED (₹)" testID="edit-booking-token" value={token} onChange={setToken} colors={colors} keyboardType="numeric" />
            <FormField label="FLAT COST (₹)" testID="edit-booking-flat-cost" value={flatCost} onChange={setFlatCost} colors={colors} keyboardType="numeric" />
            <FormField label="AGREEMENT VALUE (₹)" testID="edit-booking-agreement-value" value={agreementValue} onChange={setAgreementValue} colors={colors} keyboardType="numeric" />
            <FormField label="STAMP DUTY (₹)" testID="edit-booking-stamp-duty" value={stampDuty} onChange={setStampDuty} colors={colors} keyboardType="numeric" />
            <FormField label="REGISTRATION FEES (₹)" testID="edit-booking-registration-fees" value={registrationFees} onChange={setRegistrationFees} colors={colors} keyboardType="numeric" />
            <FormField label="GST (₹)" testID="edit-booking-gst" value={gst} onChange={setGst} colors={colors} keyboardType="numeric" />
            <FormField label="SOCIETY CHARGES (₹)" testID="edit-booking-society-charges" value={societyCharges} onChange={setSocietyCharges} colors={colors} keyboardType="numeric" />
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
          </ScrollView>
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
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  queueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginTop: 8,
  },
});
