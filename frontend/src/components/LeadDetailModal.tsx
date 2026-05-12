import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { StageBadge, Badge } from './Badge';
import { STAGES } from '../lib/constants';

interface Props {
  leadId: string | null;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export function LeadDetailModal({ leadId, visible, onClose, onChanged }: Props) {
  const { colors } = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const r = await api.get(`/leads/${leadId}`);
      setData(r.data);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (visible && leadId) load();
  }, [visible, leadId, load]);

  const updateLead = async (payload: any, action: string) => {
    if (!leadId) return;
    setBusy(action);
    try {
      await api.patch(`/leads/${leadId}`, payload);
      await load();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const advance = async () => {
    if (!leadId) return;
    setBusy('advance');
    try {
      await api.post(`/leads/${leadId}/advance`);
      await load();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const scheduleVisit = async () => {
    if (!leadId) return;
    setBusy('site_visit');
    try {
      // Default: tomorrow at 11:00 AM local
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(11, 0, 0, 0);
      await api.post('/visits', { lead_id: leadId, scheduled_at: d.toISOString() });
      await load();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const addNote = async () => {
    if (!leadId || !note.trim()) return;
    setBusy('note');
    try {
      await api.post(`/leads/${leadId}/notes`, { text: note, type: 'call_note' });
      setNote('');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const lead = data?.lead;
  const timeline = data?.timeline || [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {loading || !lead ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <>
              {/* Header */}
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{lead.name}</Text>
                  <Text style={[styles.sub, { color: colors.textMuted }]}>{lead.phone}{lead.email ? `  ·  ${lead.email}` : ''}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    <StageBadge stage={lead.stage} />
                    {lead.status === 'negative' ? <Badge text="NEGATIVE" color={colors.negative} /> : null}
                  </View>
                </View>
                <Pressable testID="lead-modal-close" onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
                {/* Details */}
                <View style={[styles.block, { borderColor: colors.border }]}>
                  <Text style={[styles.blockTitle, { color: colors.textSecondary }]}>CUSTOMER DETAILS</Text>
                  <DetailRow label="Budget" value={lead.budget} colors={colors} />
                  <DetailRow label="Location" value={lead.location} colors={colors} />
                  <DetailRow label="Property type" value={lead.property_type} colors={colors} />
                  <DetailRow label="Source" value={lead.source} colors={colors} />
                  <DetailRow label="Notes" value={lead.notes} colors={colors} />
                </View>

                {/* Quick actions */}
                <View style={[styles.block, { borderColor: colors.border }]}>
                  <Text style={[styles.blockTitle, { color: colors.textSecondary }]}>QUICK ACTIONS</Text>
                  <View style={styles.actionsGrid}>
                    <ActionBtn
                      label="Mark Positive"
                      icon="thumbs-up-outline"
                      color={colors.positive}
                      onPress={() => updateLead({ stage: 'positive', status: 'active' }, 'positive')}
                      busy={busy === 'positive'}
                      testID="action-positive"
                    />
                    <ActionBtn
                      label="Mark Negative"
                      icon="thumbs-down-outline"
                      color={colors.negative}
                      onPress={() => updateLead({ status: 'negative' }, 'negative')}
                      busy={busy === 'negative'}
                      testID="action-negative"
                    />
                    <ActionBtn
                      label="Follow-up"
                      icon="time-outline"
                      color={colors.warning}
                      onPress={() => updateLead({ stage: 'contacted' }, 'followup')}
                      busy={busy === 'followup'}
                      testID="action-followup"
                    />
                    <ActionBtn
                      label="Schedule Site Visit"
                      icon="location-outline"
                      color={colors.info}
                      onPress={scheduleVisit}
                      busy={busy === 'site_visit'}
                      testID="action-site-visit"
                    />
                    <ActionBtn
                      label="Move Stage → Booking"
                      icon="document-text-outline"
                      color={colors.primary}
                      onPress={() => updateLead({ stage: 'booking' }, 'booking')}
                      busy={busy === 'booking'}
                      testID="action-booking"
                    />
                    <ActionBtn
                      label="Move Stage → Loan"
                      icon="business-outline"
                      color={'#7C3AED'}
                      onPress={() => updateLead({ stage: 'loan' }, 'loan')}
                      busy={busy === 'loan'}
                      testID="action-loan"
                    />
                    <ActionBtn
                      label="Advance Stage"
                      icon="arrow-forward-circle-outline"
                      color={colors.accent}
                      onPress={advance}
                      busy={busy === 'advance'}
                      testID="action-advance"
                    />
                    <ActionBtn
                      label="Reactivate"
                      icon="refresh-outline"
                      color={colors.info}
                      onPress={() => updateLead({ status: 'active' }, 'reactivate')}
                      busy={busy === 'reactivate'}
                      testID="action-reactivate"
                    />
                  </View>
                </View>

                {/* Add note */}
                <View style={[styles.block, { borderColor: colors.border }]}>
                  <Text style={[styles.blockTitle, { color: colors.textSecondary }]}>ADD CALL / VISIT NOTE</Text>
                  <TextInput
                    testID="lead-note-input"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    placeholder="e.g. Customer wants to revisit on Saturday..."
                    placeholderTextColor={colors.textMuted}
                    style={{
                      minHeight: 70, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                      color: colors.text, backgroundColor: colors.surfaceAlt, fontSize: 13, marginTop: 8,
                    }}
                  />
                  <Pressable
                    testID="lead-note-save"
                    onPress={addNote}
                    disabled={!note.trim() || busy === 'note'}
                    style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: !note.trim() ? 0.5 : 1 }]}
                  >
                    {busy === 'note' ? <ActivityIndicator color="#fff" size="small" /> : (
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Save Note</Text>
                    )}
                  </Pressable>
                </View>

                {/* Timeline */}
                <View style={[styles.block, { borderColor: colors.border }]}>
                  <Text style={[styles.blockTitle, { color: colors.textSecondary }]}>ACTIVITY TIMELINE</Text>
                  {timeline.length === 0 ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>No activity yet.</Text>
                  ) : (
                    <View style={{ marginTop: 8 }}>
                      {timeline.map((t: any) => (
                        <View key={t.entry_id} style={[styles.timeItem, { borderLeftColor: colors.border }]}>
                          <View style={[styles.timeDot, { backgroundColor: colors.primary, borderColor: colors.surface }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontSize: 13 }}>{t.text}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                              {t.actor_name || 'System'} · {t.actor_role || 'system'} · {new Date(t.created_at).toLocaleString()}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailRow({ label, value, colors }: any) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
      <Text style={{ width: 110, fontSize: 12, color: colors.textMuted }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: colors.text }}>{value || '—'}</Text>
    </View>
  );
}

function ActionBtn({ label, icon, color, onPress, busy, testID }: any) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!!busy}
      style={[styles.actionBtn, { borderColor: color + '60', backgroundColor: color + '12', opacity: busy ? 0.7 : 1 }]}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : (
        <>
          <Ionicons name={icon} size={14} color={color} />
          <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  sheet: {
    width: '92%', maxWidth: 760, maxHeight: '92%', height: '90%',
    borderRadius: 14, borderWidth: 1, overflow: 'hidden',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  name: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 4 },
  block: { padding: 16, borderRadius: 10, borderWidth: 1 },
  blockTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 6 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1,
  },
  saveBtn: {
    height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, alignSelf: 'flex-end', marginTop: 10,
  },
  timeItem: { flexDirection: 'row', gap: 12, paddingVertical: 8, paddingLeft: 10, borderLeftWidth: 1 },
  timeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginLeft: -14, borderWidth: 2 },
});
