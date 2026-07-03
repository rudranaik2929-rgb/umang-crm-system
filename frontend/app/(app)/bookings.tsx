import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api, getSnapshot, setSnapshot, BOOKING_REQUEST_TIMEOUT_MS } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { CardActionMenu } from '../../src/components/CardActionMenu';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/auth/AuthContext';
import { canViewBookingFinance } from '../../src/lib/constants';
import { SearchableSelect } from '../../src/components/SearchableSelect';
import { RegistrationReceiptModal } from '../../src/components/RegistrationReceiptModal';
import { BOOKING_TASKS, bookingMatchesTask, countBookingTasks, normalizeCompletedTasks, type BookingTaskKey } from '../../src/lib/bookingTasks';
import { useLocalSearchParams, useRouter } from 'expo-router';

function leadInBookingQueue(lead: any) {
  const pr = String(lead?.priority || '').toLowerCase();
  return pr === 'handoff_booking' || pr === 'hot' || lead?.stage === 'booking';
}

/** Booking team sees all records — hot leads stay assigned to telecaller. */
function seesAllBookings(role?: string | null) {
  return role === 'admin' || role === 'manager' || role === 'booking';
}

const AGREEMENT_COLOR: Record<string, string> = { pending: '#D97706', signed: '#059669', cancelled: '#E11D48' };

const CHARGE_FIELDS = [
  { key: 'agreement_value', label: 'Agreement Value' },
  { key: 'flat_cost', label: 'Interior Cost' },
  { key: 'stamp_duty', label: 'Stamp Duty' },
  { key: 'registration_fees', label: 'Registration Charges' },
  { key: 'gst', label: 'GST' },
  { key: 'society_charges', label: 'Society Charges' },
] as const;

function formatRupee(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

function isCancelledBooking(b: any) {
  const s = String(b?.status || '').toLowerCase();
  return s === 'cancellation' || s === 'cancelled';
}

function additionalChargesTotal(booking: any) {
  return CHARGE_FIELDS.reduce((sum, f) => sum + Number(booking?.[f.key] || 0), 0);
}

function completedTasksFor(booking: any): string[] {
  return normalizeCompletedTasks(booking);
}

export default function Bookings() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ task?: string }>();
  const router = useRouter();
  const taskFilter = String(params.task || '').trim() as BookingTaskKey | '';
  const cachedBookings = getSnapshot<any>('bookings-page');
  const [bookings, setBookings] = useState<any[]>(cachedBookings?.bookings ?? []);
  const [leads, setLeads] = useState<any[]>(cachedBookings?.leads ?? []);
  const [loading, setLoading] = useState(!cachedBookings);
  const [showCreate, setShowCreate] = useState(false);
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [localBrokerage, setLocalBrokerage] = useState<Record<string, string>>({});
  const [localCharges, setLocalCharges] = useState<Record<string, Record<string, string>>>({});
  const [openChargesId, setOpenChargesId] = useState<string | null>(null);
  const [registrationReceiptBooking, setRegistrationReceiptBooking] = useState<any | null>(null);
  const [registrationMarkComplete, setRegistrationMarkComplete] = useState(false);
  const canFinance = canViewBookingFinance(user?.role, user?.email);

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([
        api.get('/bookings'),
        api.get('/leads/booking-queue', { params: { limit: 100 } }),
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
      const queueLeads = (l.data || []).filter((x: any) =>
        x.status !== 'negative'
        && !bookedLeadIds.has(x.lead_id)
        && leadInBookingQueue(x)
      );
      setLeads(queueLeads);
      setSnapshot('bookings-page', { bookings: bookingData, leads: queueLeads });
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
    const allDone = BOOKING_TASKS.every((t) => next.includes(t.key));
    if (allDone) {
      payload.status = 'amount received';
      payload.agreement_status = 'signed';
    }
    setBookings((items) => items.map((item) => (
      item.booking_id === booking.booking_id ? { ...item, ...payload } : item
    )));
    await update(booking.booking_id, payload, task.key);
  };

  const saveChargeField = async (bookingId: string, field: string, raw: string) => {
    const parsed = raw.trim() === '' ? 0 : parseFloat(raw);
    await update(bookingId, { [field]: Number.isFinite(parsed) ? parsed : 0 }, field);
  };

  const openRegistrationReceipt = (booking: any, markComplete: boolean) => {
    setRegistrationMarkComplete(markComplete);
    setRegistrationReceiptBooking(booking);
  };

  const cancelBooking = async (booking: any) => {
    const ok = typeof window === 'undefined' || window.confirm(
      `Cancel booking for ${booking.lead_name}? The lead will move to Not Interested.`,
    );
    if (!ok) return;
    setBusy(`${booking.booking_id}-cancel`);
    try {
      await api.patch(`/bookings/${booking.booking_id}`, {
        status: 'cancellation',
        agreement_status: 'cancelled',
      });
      await load();
    } finally {
      setBusy(null);
    }
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

  const activeBookings = bookings.filter((b) => !isCancelledBooking(b));
  const cancelledBookings = bookings.filter((b) => isCancelledBooking(b));
  const taskCounts = countBookingTasks(activeBookings);
  const filteredActiveBookings = taskFilter && BOOKING_TASKS.some((t) => t.key === taskFilter)
    ? activeBookings.filter((b) => bookingMatchesTask(b, taskFilter))
    : activeBookings;

  const renderBookingCard = (b: any, cancelled = false) => {
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
    const allTasksDone = BOOKING_TASKS.every((t) => completedSet.has(t.key));
    const chargesOpen = openChargesId === b.booking_id;
    const extraTotal = additionalChargesTotal(b);
    const chargeLocal = localCharges[b.booking_id] || {};

    return (
      <View
        key={b.booking_id}
        style={[styles.card, {
          backgroundColor: colors.surface,
          borderColor: allTasksDone ? colors.positive + '80' : cancelled ? colors.negative + '50' : colors.border,
          borderWidth: allTasksDone ? 1.5 : 1,
        }]}
      >
        {allTasksDone && !cancelled ? (
          <View style={[styles.allDoneBanner, { backgroundColor: colors.positive + '14', borderColor: colors.positive }]}>
            <Ionicons name="trophy" size={16} color={colors.positive} />
            <Text style={{ color: colors.positive, fontSize: 12, fontWeight: '800' }}>ALL 6 TASKS COMPLETED — BOOKING DONE</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={[styles.iconBig, { backgroundColor: cancelled ? colors.negative + '18' : colors.warning + '18' }]}>
            <Ionicons name={cancelled ? 'close-circle' : 'document-text'} size={18} color={cancelled ? colors.negative : colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {b.starred ? <Ionicons name="star" size={14} color={colors.warning} /> : null}
              <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>{b.property_name}</Text>
            </View>
            <Text style={[styles.cardSub, { color: colors.textMuted }]}>For {b.lead_name}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <Badge text={`AGREEMENT: ${realAgreementStatus.toUpperCase()}`} color={AGREEMENT_COLOR[realAgreementStatus] || colors.info} />
              <Badge text={`STATUS: ${(b.status || 'active').toUpperCase()}`} color={['confirmed', 'disbursement', 'sanctioned', 'amount received'].includes(b.status) ? colors.positive : cancelled ? colors.negative : b.status === 'registration' ? '#7C3AED' : b.status === 'bill submitted' ? colors.warning : colors.info} />
              {cancelled ? <Badge text="NOT INTERESTED" color={colors.negative} /> : null}
            </View>
          </View>
          <CardActionMenu
            colors={colors}
            isStarred={!!b.starred}
            onEdit={() => setEditingBooking(b)}
            onToggleStar={() => toggleStar(b)}
            onDelete={() => deleteBooking(b)}
            testIDPrefix={`booking-${b.booking_id}`}
          />
        </View>

        {canFinance ? (
          <View style={[styles.amountRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.miniLabel, { color: colors.textMuted }]}>BOOKING AMOUNT</Text>
              <Text style={[styles.bigVal, { color: colors.text, fontSize: 18 }]}>{formatRupee(b.booking_amount)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
                Token: {formatRupee(b.token_received)}
              </Text>
            </View>
            <Pressable
              testID={`booking-charges-toggle-${b.booking_id}`}
              onPress={() => setOpenChargesId(chargesOpen ? null : b.booking_id)}
              style={[styles.chargesBtn, { borderColor: colors.primary, backgroundColor: chargesOpen ? colors.primary + '14' : colors.surface }]}
            >
              <Ionicons name="receipt-outline" size={16} color={colors.primary} />
              <View>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Additional Charges</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10 }}>{formatRupee(extraTotal)} total</Text>
              </View>
              <Ionicons name={chargesOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}

        {canFinance && chargesOpen ? (
          <View style={[styles.chargesPanel, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.miniLabel, { color: colors.textMuted, marginBottom: 8 }]}>EDIT CHARGES (₹)</Text>
            {CHARGE_FIELDS.map((field) => {
              const val = chargeLocal[field.key] !== undefined
                ? chargeLocal[field.key]
                : (b[field.key] != null && b[field.key] !== '' ? String(b[field.key]) : '');
              return (
                <View key={field.key} style={styles.chargeFieldRow}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>{field.label}</Text>
                  <TextInput
                    testID={`booking-charge-${field.key}-${b.booking_id}`}
                    value={val}
                    onChangeText={(text) => setLocalCharges((prev) => ({
                      ...prev,
                      [b.booking_id]: { ...(prev[b.booking_id] || {}), [field.key]: text },
                    }))}
                    onBlur={() => {
                      const raw = chargeLocal[field.key];
                      if (raw === undefined) return;
                      saveChargeField(b.booking_id, field.key, raw);
                    }}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.chargeInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                  />
                </View>
              );
            })}
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, textAlign: 'right' }}>
              Additional total: {formatRupee(extraTotal)}
            </Text>
          </View>
        ) : null}

        <View style={[styles.checkSummary, { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSoft }]}>
          <View style={[styles.completedBadge, {
            backgroundColor: allTasksDone ? colors.positive + '22' : colors.positive + '16',
            borderColor: colors.positive + '45',
          }]}>
            <Ionicons name={allTasksDone ? 'checkmark-done' : 'checkmark-circle'} size={14} color={colors.positive} />
            <Text style={{ color: colors.positive, fontSize: 12, fontWeight: '800' }}>
              {allTasksDone ? '6/6 DONE' : `${completed.length}/${BOOKING_TASKS.length} Completed`}
            </Text>
          </View>
          <View style={styles.completedChips}>
            {completedLabels.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Complete each task below</Text>
            ) : completedLabels.map((task) => (
              <Pressable
                key={task.key}
                onPress={task.key === 'registration' ? () => openRegistrationReceipt(b, false) : undefined}
                style={[styles.doneChip, { borderColor: task.color + '55', backgroundColor: task.color + '10' }]}
              >
                <Ionicons name="checkmark" size={11} color={task.color} />
                <Text style={{ color: task.color, fontSize: 10, fontWeight: '800' }}>
                  {task.key === 'registration' ? `${task.label} · Receipt` : task.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {canFinance ? (
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Token received: {formatRupee(b.token_received)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{paymentProgress}%</Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
              <View style={[styles.fill, { width: `${paymentProgress}%`, backgroundColor: colors.positive }]} />
            </View>
          </View>
        ) : null}

        {canFinance ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>BROKERAGE (₹)</Text>
              <TextInput
                value={localBrokerage[b.booking_id] !== undefined ? localBrokerage[b.booking_id] : (brokerageAmount > 0 ? String(brokerageAmount) : '')}
                placeholder="Enter Brokerage"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                onChangeText={(text) => setLocalBrokerage((prev) => ({ ...prev, [b.booking_id]: text }))}
                onBlur={() => {
                  const val = localBrokerage[b.booking_id];
                  if (val === undefined) return;
                  update(b.booking_id, { brokerage_amount: parseFloat(val) || 0 }, 'brokerage');
                }}
                style={{ height: 28, width: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, fontSize: 12, color: colors.text, backgroundColor: colors.surfaceAlt }}
              />
            </View>
            {((localBrokerage[b.booking_id] !== undefined ? parseFloat(localBrokerage[b.booking_id]) || 0 : brokerageAmount) > 0) && b.booking_amount > 0 ? (
              <Text style={{ color: colors.positive, fontSize: 12, fontWeight: '600' }}>
                ({(((localBrokerage[b.booking_id] !== undefined ? parseFloat(localBrokerage[b.booking_id]) || 0 : brokerageAmount) / b.booking_amount) * 100).toFixed(2)}%)
              </Text>
            ) : null}
          </View>
        ) : null}

        {!cancelled ? (
          <View style={styles.actions}>
            {BOOKING_TASKS.map((task) => {
              const done = completedSet.has(task.key);
              const isRegistration = task.key === 'registration';
              return (
                <Pressable
                  key={task.key}
                  testID={`booking-task-${task.key}-${b.booking_id}`}
                  onPress={() => {
                    if (isRegistration) {
                      openRegistrationReceipt(b, !done);
                      return;
                    }
                    if (!done) completeTask(b, task);
                  }}
                  disabled={!isRegistration && (done || busy !== null)}
                  style={[styles.act, {
                    borderColor: done ? colors.positive + '70' : task.color + '60',
                    backgroundColor: done ? colors.positive + '14' : task.color + '10',
                    opacity: !isRegistration && busy !== null && !done ? 0.65 : 1,
                  }]}
                >
                  {busy === `${b.booking_id}-${task.key}` ? <ActivityIndicator size="small" color={task.color} /> : <>
                    <Ionicons
                      name={isRegistration ? 'receipt-outline' : done ? 'checkmark-circle' : task.icon as any}
                      size={13}
                      color={done && !isRegistration ? colors.positive : task.color}
                    />
                    <Text style={{ color: done && !isRegistration ? colors.positive : task.color, fontSize: 11, fontWeight: '700' }}>
                      {isRegistration ? (done ? 'View Receipt' : task.label) : done ? 'Done' : task.label}
                    </Text>
                  </>}
                </Pressable>
              );
            })}
            <Pressable
              testID={`booking-cancel-${b.booking_id}`}
              onPress={() => cancelBooking(b)}
              disabled={busy !== null}
              style={[styles.act, { borderColor: colors.negative + '60', backgroundColor: colors.negative + '10' }]}
            >
              {busy === `${b.booking_id}-cancel` ? <ActivityIndicator size="small" color={colors.negative} /> : <>
                <Ionicons name="close-circle-outline" size={13} color={colors.negative} />
                <Text style={{ color: colors.negative, fontSize: 11, fontWeight: '600' }}>Cancellation</Text>
              </>}
            </Pressable>
          </View>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
            Lead moved to Not Interested. You can delete this record if needed.
          </Text>
        )}
      </View>
    );
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
        {!loading && activeBookings.length > 0 ? (
          <View style={styles.taskSummaryGrid}>
            {BOOKING_TASKS.map((task) => {
              const active = taskFilter === task.key;
              return (
                <Pressable
                  key={task.key}
                  testID={`booking-task-summary-${task.key}`}
                  onPress={() => router.replace(taskFilter === task.key ? '/(app)/bookings' as any : `/(app)/bookings?task=${task.key}` as any)}
                  style={[styles.taskSummaryCard, {
                    backgroundColor: active ? task.color + '14' : colors.surface,
                    borderColor: active ? task.color : colors.border,
                  }]}
                >
                  <Ionicons name={task.icon} size={16} color={task.color} />
                  <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: '700', marginTop: 6 }}>{task.label.toUpperCase()}</Text>
                  <Text style={{ color: task.color, fontSize: 22, fontWeight: '800', marginTop: 2 }}>{taskCounts[task.key] ?? 0}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
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
          {activeBookings.length === 0 && cancelledBookings.length === 0 ? (
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
              {filteredActiveBookings.length > 0 ? (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                    ACTIVE BOOKINGS ({filteredActiveBookings.length}{taskFilter ? ` · ${BOOKING_TASKS.find((t) => t.key === taskFilter)?.label}` : ''})
                  </Text>
                  {filteredActiveBookings.map((b) => renderBookingCard(b, false))}
                </>
              ) : taskFilter ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
                  No bookings in {BOOKING_TASKS.find((t) => t.key === taskFilter)?.label || taskFilter}.
                </Text>
              ) : null}
              {cancelledBookings.length > 0 ? (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 12 }]}>CANCELLED — NOT INTERESTED ({cancelledBookings.length})</Text>
                  {cancelledBookings.map((b) => renderBookingCard(b, true))}
                </>
              ) : null}
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
      <RegistrationReceiptModal
        visible={registrationReceiptBooking !== null}
        booking={registrationReceiptBooking}
        colors={colors}
        markTaskComplete={registrationMarkComplete}
        onClose={() => {
          setRegistrationReceiptBooking(null);
          setRegistrationMarkComplete(false);
        }}
        onSaved={async (updated) => {
          if (updated?.booking_id) {
            setBookings((items) => items.map((item) => (
              item.booking_id === updated.booking_id ? { ...item, ...updated } : item
            )));
          }
          await load();
        }}
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
  const openedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setError(null);
    setLeadSearch('');
    setProperty('');
    setAmount('');
    setToken('');
    setFlatCost('');
    setAgreementValue('');
    setStampDuty('');
    setRegistrationFees('');
    setGst('');
    setSocietyCharges('');
    setLeadId(leads[0]?.lead_id || '');
  }, [visible]);

  useEffect(() => {
    if (!visible || leadId) return;
    if (leads[0]?.lead_id) setLeadId(leads[0].lead_id);
  }, [visible, leadId, leads]);

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
      const res = await api.post('/bookings', payload, { timeout: BOOKING_REQUEST_TIMEOUT_MS });
      onCreated(res.data);
    } catch (e: any) {
      const timedOut = e?.code === 'ECONNABORTED' || String(e?.message || '').toLowerCase().includes('timeout');
      if (timedOut) {
        setError('Could not create booking — server took too long. Wait a few seconds and try again.');
      } else {
        const detail = e?.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : 'Could not create booking.');
      }
    } finally { setBusy(false); }
  };

  const selectedLead = useMemo(
    () => leads.find((l: any) => l.lead_id === leadId),
    [leads, leadId],
  );

  const leadOptions = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    const matches = (l: any) => !q
      || String(l.name || '').toLowerCase().includes(q)
      || String(l.phone || '').toLowerCase().includes(q)
      || String(l.location || '').toLowerCase().includes(q);
    const filtered = leads.filter(matches);
    const selected = leads.find((l: any) => l.lead_id === leadId);
    const list = selected && !filtered.some((l: any) => l.lead_id === leadId)
      ? [selected, ...filtered]
      : filtered;
    return list.map((l: any) => {
      const pr = String(l.priority || '').toLowerCase();
      const tag = pr === 'hot' ? '🔥 Hot' : pr === 'handoff_booking' ? 'Ready' : '';
      return {
        key: l.lead_id,
        label: l.name || 'Lead',
        sublabel: `${tag ? `${tag} · ` : ''}${l.phone || '—'}${l.location ? ` · ${l.location}` : ''}`,
      };
    });
  }, [leads, leadId, leadSearch]);

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
              <FormField label="AGREEMENT VALUE (₹)" testID="booking-agreement-value" value={agreementValue} onChange={setAgreementValue} colors={colors} keyboardType="numeric" />
              <FormField label="INTERIOR COST (₹)" testID="booking-flat-cost" value={flatCost} onChange={setFlatCost} colors={colors} keyboardType="numeric" />
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
            <FormField label="AGREEMENT VALUE (₹)" testID="edit-booking-agreement-value" value={agreementValue} onChange={setAgreementValue} colors={colors} keyboardType="numeric" />
            <FormField label="INTERIOR COST (₹)" testID="edit-booking-flat-cost" value={flatCost} onChange={setFlatCost} colors={colors} keyboardType="numeric" />
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
  taskSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  taskSummaryCard: {
    width: '15%',
    minWidth: 108,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  miniLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  allDoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexWrap: 'wrap',
  },
  chargesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 160,
  },
  chargesPanel: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  chargeFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  chargeInput: {
    width: 120,
    height: 34,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    textAlign: 'right',
  },
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
