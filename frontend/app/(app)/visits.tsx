import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Platform } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/auth/AuthContext';

const STATUS_COLOR: Record<string, string> = {
  scheduled: '#0284C7',
  completed: '#059669',
  rescheduled: '#D97706',
  follow_up: '#D97706',
  cancelled: '#E11D48',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayNameFromDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return DAY_NAMES[parsed.getDay()];
}

function getLocalTimeZoneLabel() {
  try {
    const parts = new Intl.DateTimeFormat('en-IN', { timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  } catch {
    return 'Local';
  }
}

function formatClockTime(value?: string | null) {
  if (!value) return '-';
  const [rawHour, rawMinute = '0'] = String(value).split(':');
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return String(value);

  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatFollowUpTime(value?: string | null, fallbackIso?: string | null) {
  if (value) return `${formatClockTime(value)} ${getLocalTimeZoneLabel()}`;
  if (fallbackIso) {
    const parsed = new Date(fallbackIso);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      });
    }
  }
  return `- ${getLocalTimeZoneLabel()}`;
}

export default function Visits() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [visits, setVisits] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [followUpVisit, setFollowUpVisit] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [v, l] = await Promise.all([api.get('/visits'), api.get('/leads')]);
      let visitData = v.data || [];
      // Non-admin: only show visits for leads assigned to this employee
      if (user?.role !== 'admin' && (user as any)?.acting_as_employee_id) {
        const myLeadIds = new Set((l.data || []).filter((x: any) => x.assigned_to === (user as any).acting_as_employee_id).map((x: any) => x.lead_id));
        visitData = visitData.filter((x: any) => myLeadIds.has(x.lead_id));
      }
      setVisits(visitData);
      // Filter out leads that already have an active visit (scheduled or rescheduled)
      const activeVisitLeadIds = new Set(
        visitData
          .filter((x: any) => x.status === 'scheduled' || x.status === 'rescheduled' || x.status === 'follow_up')
          .map((x: any) => x.lead_id)
      );
      setLeads(
        (l.data || []).filter((x: any) => x.status !== 'negative' && !activeVisitLeadIds.has(x.lead_id) && ['positive', 'site_visit'].includes(x.stage))
      );
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const update = async (id: string, payload: any, key: string) => {
    setBusy(`${id}-${key}`);
    try { await api.patch(`/visits/${id}`, payload); await load(); }
    finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Site Visit Management"
        subtitle="Schedules, feedback & on-ground execution"
        rightAction={
          <Pressable
            testID="create-visit-btn"
            onPress={() => setShowCreate(true)}
            style={[styles.primary, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={styles.primaryText}>Schedule Visit</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> :
          visits.length === 0 ? (
            <EmptyState
              variant="leads"
              title="No site visits scheduled"
              description="Once a positive lead is ready to walk-through a property, schedule the visit here. The team will see it on their feed."
              actionLabel="Schedule a Visit"
              onAction={() => setShowCreate(true)}
              testIDAction="empty-create-visit"
            />
          ) : (
            visits.map((v) => (
              <View key={v.visit_id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={[styles.iconBig, { backgroundColor: colors.info + '18' }]}>
                    <Ionicons name="location" size={18} color={colors.info} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{v.lead_name}</Text>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                      {new Date(v.scheduled_at).toLocaleString()}{v.assigned_name ? `  ·  ${v.assigned_name}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                      <Badge text={v.status.toUpperCase()} color={STATUS_COLOR[v.status] || colors.primary} />
                      {v.followups_count > 0 && <Badge text={`${v.followups_count} FOLLOW UP${v.followups_count > 1 ? 'S' : ''}`} color={colors.warning} />}
                      {v.interested === true && <Badge text="INTERESTED" color={colors.positive} />}
                      {v.interested === false && <Badge text="NOT INTERESTED" color={colors.negative} />}
                    </View>
                    {v.next_follow_up_date || v.next_follow_up_at ? (
                      <Text style={{ color: colors.warning, fontSize: 12, marginTop: 8, fontWeight: '600' }}>
                        Next follow-up: {v.next_follow_up_date || new Date(v.next_follow_up_at).toLocaleDateString()} {formatFollowUpTime(v.next_follow_up_time, v.next_follow_up_at)} {v.next_follow_up_day ? `(${v.next_follow_up_day})` : ''}
                      </Text>
                    ) : null}
                    {v.feedback ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>“{v.feedback}”</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  <ActBtn label="Visit Completed" icon="checkmark-circle-outline" color={colors.positive}
                    busy={busy === `${v.visit_id}-completed`}
                    onPress={() => update(v.visit_id, { status: 'completed' }, 'completed')}
                    testID={`visit-complete-${v.visit_id}`} />
                  
                  <ActBtn label="Follow Up" icon="calendar-outline" color={colors.warning}
                    busy={false}
                    onPress={() => setFollowUpVisit(v)}
                    testID={`visit-followup-${v.visit_id}`} />

                  <ActBtn label="Not Interested" icon="close-circle-outline" color={colors.negative}
                    busy={busy === `${v.visit_id}-notinterested`}
                    onPress={async () => {
                      setBusy(`${v.visit_id}-notinterested`);
                      try {
                        await api.patch(`/visits/${v.visit_id}`, { status: 'cancelled', interested: false });
                        await api.patch(`/leads/${v.lead_id}`, { status: 'negative' });
                        await load();
                      } finally { setBusy(null); }
                    }}
                    testID={`visit-notinterested-${v.visit_id}`} />

                  <ActBtn label="Booking Done" icon="cash-outline" color={colors.primary}
                    busy={busy === `${v.visit_id}-booking`}
                    onPress={async () => {
                      setBusy(`${v.visit_id}-booking`);
                      try {
                        await api.patch(`/visits/${v.visit_id}`, { status: 'completed', interested: true });
                        await api.patch(`/leads/${v.lead_id}`, { stage: 'booking' });
                        // Create a skeleton booking record
                        await api.post('/bookings', { lead_id: v.lead_id, property_name: 'Selected Property', booking_amount: 0 });
                        await load();
                      } finally { setBusy(null); }
                    }}
                    testID={`visit-booking-ready-${v.visit_id}`} />
                </View>
              </View>
            ))
          )}
      </ScrollView>

      <CreateVisitModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        leads={leads}
        onCreated={async () => { setShowCreate(false); await load(); }}
        colors={colors}
      />
      <FollowUpModal
        visible={!!followUpVisit}
        visit={followUpVisit}
        onClose={() => setFollowUpVisit(null)}
        onCreated={async () => { setFollowUpVisit(null); await load(); }}
        colors={colors}
      />
    </View>
  );
}

function ActBtn({ label, icon, color, onPress, busy, testID }: any) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!!busy}
      style={[styles.act, { borderColor: color + '60', backgroundColor: color + '10', opacity: busy ? 0.6 : 1 }]}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : (
        <>
          <Ionicons name={icon} size={13} color={color} />
          <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function CreateVisitModal({ visible, onClose, leads, onCreated, colors }: any) {
  const [leadId, setLeadId] = useState<string>('');
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (visible && leads[0]) setLeadId(leads[0].lead_id); if (visible) setError(null); }, [visible, leads]);

  const submit = async () => {
    setError(null);
    if (!leadId) { setError('Please pick a lead'); return; }
    let iso: string;
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) throw new Error('bad date');
      iso = d.toISOString();
    } catch {
      setError('Please enter a valid date & time (e.g. 2026-03-15T14:00)');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/visits', { lead_id: leadId, scheduled_at: iso });
      onCreated();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create visit');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Schedule Site Visit</Text>
          {leads.length === 0 ? (
            <Text style={{ color: colors.textSecondary, marginTop: 14, fontSize: 13 }}>
              No leads available. Create one through the public enquiry form first.
            </Text>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.textMuted }]}>LEAD</Text>
              <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 6 }}>
                {leads.map((l: any) => (
                  <Pressable
                    key={l.lead_id}
                    testID={`pick-lead-${l.lead_id}`}
                    onPress={() => setLeadId(l.lead_id)}
                    style={[styles.leadOpt, {
                      borderColor: leadId === l.lead_id ? colors.primary : colors.border,
                      backgroundColor: leadId === l.lead_id ? colors.primary + '20' : colors.surfaceAlt,
                    }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{l.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{l.phone} · {l.location || 'No location'}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={[styles.label, { color: colors.textMuted, marginTop: 14 }]}>DATE & TIME</Text>
              {Platform.OS === 'web' ? (
                // @ts-ignore – render native HTML datetime-local on web for calendar picker
                <input
                  data-testid="visit-date-input"
                  type="datetime-local"
                  value={date}
                  onChange={(e: any) => setDate(e.target.value)}
                  style={{
                    height: 40, padding: 10, borderRadius: 8, fontSize: 14,
                    border: `1px solid ${colors.border}`, color: colors.text,
                    background: colors.surfaceAlt, outline: 'none',
                  }}
                />
              ) : (
                <TextInput
                  testID="visit-date-input"
                  value={date} onChangeText={setDate}
                  placeholder="YYYY-MM-DDTHH:MM"
                  placeholderTextColor={colors.textMuted}
                  style={{ height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.text, backgroundColor: colors.surfaceAlt }}
                />
              )}
              {error ? (
                <View style={{ marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.negative, backgroundColor: colors.negative + '14' }}>
                  <Text style={{ color: colors.negative, fontSize: 12 }}>{error}</Text>
                </View>
              ) : null}
              <Pressable
                testID="visit-create-submit"
                onPress={submit}
                disabled={submitting}
                style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16, height: 42, justifyContent: 'center' }]}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Schedule</Text>}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FollowUpModal({ visible, visit, onClose, onCreated, colors }: any) {
  const tomorrow = new Date(Date.now() + 86400000);
  const [date, setDate] = useState(dateInputValue(tomorrow));
  const [time, setTime] = useState('11:00');
  const [day, setDay] = useState(dayNameFromDate(dateInputValue(tomorrow)));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const nextDate = dateInputValue(new Date(Date.now() + 86400000));
    setDate(nextDate);
    setTime('11:00');
    setDay(dayNameFromDate(nextDate));
    setNotes('');
    setError(null);
  }, [visible]);

  const onDateChange = (value: string) => {
    setDate(value);
    setDay(dayNameFromDate(value));
  };

  const submit = async () => {
    setError(null);
    if (!visit?.visit_id) { setError('Visit is required'); return; }
    if (!date.trim()) { setError('Date is required'); return; }
    if (!time.trim()) { setError('Time is required'); return; }
    if (!day.trim()) { setError('Day is required'); return; }

    setSubmitting(true);
    try {
      await api.post('/visit-followups', {
        visit_id: visit.visit_id,
        follow_up_date: date.trim(),
        follow_up_time: time.trim(),
        follow_up_day: day.trim(),
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create follow-up');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Schedule Follow Up</Text>
          <Text style={{ color: colors.textMuted, marginTop: 6, fontSize: 12 }}>
            {visit?.lead_name || 'Lead'} · required follow-up details
          </Text>

          <View style={styles.formRow}>
            <View style={styles.formField}>
              <Text style={[styles.label, { color: colors.textMuted }]}>DATE *</Text>
              {Platform.OS === 'web' ? (
                // @ts-ignore – render native HTML date picker on web
                <input
                  data-testid="followup-date-input"
                  type="date"
                  value={date}
                  onChange={(e: any) => onDateChange(e.target.value)}
                  required
                  style={{
                    height: 40, padding: 10, borderRadius: 8, fontSize: 14,
                    border: `1px solid ${colors.border}`, color: colors.text,
                    background: colors.surfaceAlt, outline: 'none',
                  }}
                />
              ) : (
                <TextInput
                  testID="followup-date-input"
                  value={date}
                  onChangeText={onDateChange}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }]}
                />
              )}
            </View>
            <View style={styles.formField}>
              <Text style={[styles.label, { color: colors.textMuted }]}>TIME *</Text>
              {Platform.OS === 'web' ? (
                // @ts-ignore – render native HTML time picker on web
                <input
                  data-testid="followup-time-input"
                  type="time"
                  value={time}
                  onChange={(e: any) => setTime(e.target.value)}
                  required
                  style={{
                    height: 40, padding: 10, borderRadius: 8, fontSize: 14,
                    border: `1px solid ${colors.border}`, color: colors.text,
                    background: colors.surfaceAlt, outline: 'none',
                  }}
                />
              ) : (
                <TextInput
                  testID="followup-time-input"
                  value={time}
                  onChangeText={setTime}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }]}
                />
              )}
            </View>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
            Time preview: {formatClockTime(time)} {getLocalTimeZoneLabel()}
          </Text>

          <Text style={[styles.label, { color: colors.textMuted }]}>DAY *</Text>
          <TextInput
            testID="followup-day-input"
            value={day}
            onChangeText={setDay}
            placeholder="Monday"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }]}
          />

          <Text style={[styles.label, { color: colors.textMuted }]}>NOTES</Text>
          <TextInput
            testID="followup-notes-input"
            value={notes}
            onChangeText={setNotes}
            placeholder="Customer asked to reconnect after the visit"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.input, styles.notesInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }]}
          />

          {error ? (
            <View style={{ marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.negative, backgroundColor: colors.negative + '14' }}>
              <Text style={{ color: colors.negative, fontSize: 12 }}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            testID="followup-submit"
            onPress={submit}
            disabled={submitting}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16, height: 42, justifyContent: 'center' }]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Submit Follow Up</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 4 },
  iconBig: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 30, borderRadius: 6, borderWidth: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { width: '92%', maxWidth: 480, padding: 20, borderRadius: 12, borderWidth: 1 },
  formRow: { flexDirection: 'row', gap: 10 },
  formField: { flex: 1 },
  input: { minHeight: 40, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  notesInput: { minHeight: 74, textAlignVertical: 'top' },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 14, marginBottom: 6 },
  leadOpt: { padding: 10, borderRadius: 8, borderWidth: 1 },
});
