import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Animated, Easing } from 'react-native';
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
  userRole?: string | null;
}

export function LeadDetailModal({ leadId, visible, onClose, onChanged, userRole }: Props) {
  const { colors } = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const subAnim = React.useRef(new Animated.Value(0)).current;
  const confettiAnims = React.useRef([...Array(15)].map(() => new Animated.Value(0))).current;

  const selectCategory = (cat: string) => {
    if (activeCategory === cat) {
      setActiveCategory(null);
      Animated.timing(subAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    } else {
      setActiveCategory(cat);
      subAnim.setValue(0);
      Animated.spring(subAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }).start();
    }
  };

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
    if (visible && leadId) {
      load();
      setAiSummary(null);
    }
  }, [visible, leadId, load]);

  const fetchSummary = async () => {
    if (!leadId) return;
    setLoadingSummary(true);
    try {
      const r = await api.get(`/leads/${leadId}/ai-summary`);
      setAiSummary(r.data.summary);
    } catch (e) {
      setAiSummary("Could not generate summary at this time.");
    } finally {
      setLoadingSummary(false);
    }
  };

  const triggerConfetti = () => {
    setShowConfetti(true);
    Animated.parallel(
      confettiAnims.map((anim, i) => 
        Animated.sequence([
          Animated.delay(i * 100),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true
          })
        ])
      )
    ).start(() => {
      setShowConfetti(false);
      confettiAnims.forEach(a => a.setValue(0));
    });
  };

  const updateLead = async (payload: any, action: string) => {
    if (!leadId) return;
    setBusy(action);
    try {
      await api.patch(`/leads/${leadId}`, payload);
      if (payload.stage === 'closed') {
        triggerConfetti();
      }
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

  const deleteLead = async () => {
    if (!leadId) return;
    setBusy('delete');
    try {
      await api.delete(`/leads/${leadId}`);
      setShowDeleteConfirm(false);
      onChanged?.();
      onClose();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to delete lead');
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {userRole === 'admin' && (
                    <Pressable
                      testID="lead-delete-btn"
                      onPress={() => setShowDeleteConfirm(true)}
                      hitSlop={12}
                      style={{
                        width: 34, height: 34, borderRadius: 8, borderWidth: 1,
                        borderColor: colors.negative + '60', backgroundColor: colors.negative + '12',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.negative} />
                    </Pressable>
                  )}
                  <Pressable testID="lead-modal-close" onPress={onClose} hitSlop={12}>
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>

              {/* Delete Confirmation */}
              {showDeleteConfirm && (
                <View style={{
                  padding: 16, marginHorizontal: 20, marginTop: 12, borderRadius: 10, borderWidth: 1,
                  borderColor: colors.negative, backgroundColor: colors.negative + '10',
                }}>
                  <Text style={{ color: colors.negative, fontWeight: '700', fontSize: 14 }}>
                    ⚠️ Delete "{lead.name}" permanently?
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                    This will also remove all visits, bookings, loans, and activity history for this lead. This action cannot be undone.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <Pressable
                      testID="lead-delete-confirm"
                      onPress={deleteLead}
                      disabled={busy === 'delete'}
                      style={{
                        flex: 1, height: 38, borderRadius: 8, backgroundColor: colors.negative,
                        alignItems: 'center', justifyContent: 'center', opacity: busy === 'delete' ? 0.6 : 1,
                      }}
                    >
                      {busy === 'delete' ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Yes, Delete Forever</Text>
                      )}
                    </Pressable>
                    <Pressable
                      testID="lead-delete-cancel"
                      onPress={() => setShowDeleteConfirm(false)}
                      style={{
                        flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
                {/* AI Magic Summary */}
                <View style={[styles.aiBlock, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '08' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="sparkles" size={16} color={colors.primary} />
                      <Text style={[styles.blockTitle, { color: colors.primary, marginBottom: 0 }]}>AI MAGIC SUMMARY</Text>
                    </View>
                    {!aiSummary && !loadingSummary && (
                      <Pressable onPress={fetchSummary} style={styles.magicBtn}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>GENERATE</Text>
                      </Pressable>
                    )}
                  </View>
                  {loadingSummary ? (
                    <ActivityIndicator color={colors.primary} size="small" style={{ alignSelf: 'flex-start', marginVertical: 4 }} />
                  ) : aiSummary ? (
                    <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18, fontStyle: 'italic' }}>
                      "{aiSummary}"
                    </Text>
                  ) : (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      Click generate to get an AI-powered overview of this lead's status.
                    </Text>
                  )}
                </View>

                {/* Details */}
                <View style={[styles.block, { borderColor: colors.border }]}>
                  <Text style={[styles.blockTitle, { color: colors.textSecondary }]}>CUSTOMER DETAILS</Text>
                  <DetailRow label="Budget" value={lead.budget} colors={colors} />
                  <DetailRow label="Location" value={lead.location} colors={colors} />
                  <DetailRow label="Property type" value={lead.property_type} colors={colors} />
                  <DetailRow label="Source" value={lead.source} colors={colors} />
                  <DetailRow label="Notes" value={lead.notes} colors={colors} />
                </View>

                {/* Quick actions Refactored */}
                <View style={[styles.block, { borderColor: colors.border, overflow: 'hidden' }]}>
                  <Text style={[styles.blockTitle, { color: colors.textSecondary }]}>LEAD UPDATE</Text>
                  
                  <View style={styles.categoryRow}>
                    <CategoryBtn 
                      label="Positive" 
                      icon="heart-outline" 
                      active={activeCategory === 'positive'} 
                      onPress={() => selectCategory('positive')}
                      color={colors.positive}
                    />
                    <CategoryBtn 
                      label="Visited" 
                      icon="location-outline" 
                      active={activeCategory === 'visited'} 
                      onPress={() => selectCategory('visited')}
                      color={colors.info}
                    />
                    <CategoryBtn 
                      label="Not Interested" 
                      icon="close-circle-outline" 
                      active={activeCategory === 'negative'} 
                      onPress={() => selectCategory('negative')}
                      color={colors.negative}
                    />
                  </View>

                  {activeCategory && (
                    <Animated.View style={[styles.subOptions, { 
                      opacity: subAnim,
                      transform: [{ translateY: subAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] 
                    }]}>
                      <View style={[styles.subDivider, { backgroundColor: colors.border }]} />
                      
                      {activeCategory === 'positive' && (
                        <View style={styles.subGrid}>
                          <SubActionBtn 
                            label="Cold Lead" 
                            sub="Interested but not urgent"
                            onPress={() => {
                              updateLead({ stage: 'positive', status: 'active' }, 'cold');
                              onClose();
                            }}
                            busy={busy === 'cold'}
                            color={colors.positive}
                          />
                          <SubActionBtn 
                            label="Hot Lead" 
                            sub="Active with Urgent requirement"
                            onPress={() => {
                              updateLead({ stage: 'positive', status: 'active' }, 'hot');
                              onClose();
                            }}
                            busy={busy === 'hot'}
                            color="#E11D48"
                          />
                          <SubActionBtn 
                            label="🏆 Deal Won (Close)" 
                            sub="Finalize and celebrate!"
                            onPress={() => {
                              updateLead({ stage: 'closed', status: 'active' }, 'deal_won');
                            }}
                            busy={busy === 'deal_won'}
                            color="#D4AF37"
                          />
                        </View>
                      )}

                      {activeCategory === 'negative' && (
                        <View style={styles.subGrid}>
                          <SubActionBtn 
                            label="Low Budget" 
                            onPress={() => updateLead({ status: 'negative' }, 'low_budget')}
                            busy={busy === 'low_budget'}
                            color={colors.negative}
                          />
                          <SubActionBtn 
                            label="Other Location" 
                            onPress={() => updateLead({ status: 'negative' }, 'other_loc')}
                            busy={busy === 'other_loc'}
                            color={colors.negative}
                          />
                          <SubActionBtn 
                            label="Already Purchased" 
                            onPress={() => updateLead({ status: 'negative' }, 'purchased')}
                            busy={busy === 'purchased'}
                            color={colors.negative}
                          />
                        </View>
                      )}

                      {activeCategory === 'visited' && (
                        <View style={styles.subGrid}>
                          <SubActionBtn 
                            label="Site Visit Done" 
                            sub="Move to negative for follow-up"
                            onPress={() => {
                              updateLead({ status: 'negative' }, 'visit_done');
                              onClose();
                            }}
                            busy={busy === 'visit_done'}
                            color={colors.info}
                          />
                          <SubActionBtn 
                            label="Ready for Booking" 
                            sub="Move to negative for follow-up"
                            onPress={() => {
                              updateLead({ status: 'negative' }, 'ready_booking');
                              onClose();
                            }}
                            busy={busy === 'ready_booking'}
                            color={colors.primary}
                          />
                          <SubActionBtn 
                            label="Need Loan Info" 
                            sub="Move to negative for follow-up"
                            onPress={() => {
                              updateLead({ status: 'negative' }, 'need_loan');
                              onClose();
                            }}
                            busy={busy === 'need_loan'}
                            color="#7C3AED"
                          />
                        </View>
                      )}
                    </Animated.View>
                  )}
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
                        <View key={t.activity_id} style={[styles.timeItem, { borderLeftColor: colors.border }]}>
                          <View style={[styles.timeDot, { backgroundColor: colors.primary, borderColor: colors.surface }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontSize: 13 }}>{t.text}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                              {new Date(t.created_at).toLocaleString()}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* Confetti Celebration Overlay */}
              {showConfetti && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {confettiAnims.map((anim, i) => (
                    <Animated.Text
                      key={i}
                      style={{
                        position: 'absolute',
                        left: `${(i / 15) * 100}%`,
                        fontSize: 24,
                        transform: [
                          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-50, 800] }) },
                          { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
                          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, (i % 2 === 0 ? 50 : -50)] }) }
                        ],
                        opacity: anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] })
                      }}
                    >
                      {['🎉', '🎊', '✨', '⭐', '🏠', '🔑'][i % 6]}
                    </Animated.Text>
                  ))}
                </View>
              )}
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

function CategoryBtn({ label, icon, active, onPress, color }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.catBtn,
        {
          borderColor: active ? color : 'transparent',
          backgroundColor: active ? color + '15' : '#f8fafc10',
        }
      ]}
    >
      <Ionicons name={icon} size={18} color={active ? color : '#94a3b8'} />
      <Text style={[styles.catLabel, { color: active ? color : '#94a3b8' }]}>{label}</Text>
    </Pressable>
  );
}

function SubActionBtn({ label, sub, onPress, busy, color }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.subBtn, { backgroundColor: color + '10', borderColor: color + '30' }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color, fontSize: 13, fontWeight: '700' }}>{label}</Text>
        {sub && <Text style={{ color: color + '90', fontSize: 10, marginTop: 2 }}>{sub}</Text>}
      </View>
      {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name="chevron-forward" size={14} color={color} />}
    </Pressable>
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
  categoryRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  catBtn: { flex: 1, height: 70, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 6 },
  catLabel: { fontSize: 11, fontWeight: '700' },
  subOptions: { marginTop: 0 },
  subDivider: { height: 1, marginVertical: 16 },
  subGrid: { gap: 10 },
  subBtn: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1,
  },
  saveBtn: {
    height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, alignSelf: 'flex-end', marginTop: 10,
  },
  aiBlock: { padding: 16, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  magicBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 10, height: 24, borderRadius: 12, justifyContent: 'center' },
  timeItem: { flexDirection: 'row', gap: 12, paddingVertical: 8, paddingLeft: 10, borderLeftWidth: 1 },
  timeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginLeft: -14, borderWidth: 2 },
});
