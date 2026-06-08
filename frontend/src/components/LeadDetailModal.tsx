import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Animated, Easing, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { StageBadge, Badge } from './Badge';
import { STAGES, isAdmin } from '../lib/constants';
import {
  CALL_STATUS_OPTIONS,
  callStatusLabel,
  formatBudgetRangeLakhs,
  formatBudgetStringLakhs,
  formatHousingConfiguration,
  formatHousingLeadDate,
} from '../lib/leadFormat';
import { ScheduleFollowUpModal } from './ScheduleFollowUpModal';

interface Props {
  leadId: string | null;
  visible: boolean;
  onClose: () => void;
  onChanged?: () => void;
  userRole?: string | null;
  overlayZIndex?: number;
  /** When set (e.g. on Telecaller page), switches to Follow Ups tab instead of navigating away. */
  onGoFollowUps?: () => void;
}

export function LeadDetailModal({ leadId, visible, onClose, onChanged, userRole, overlayZIndex = 10000, onGoFollowUps }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  const goFollowUps = () => {
    onChanged?.();
    onClose();
    if (onGoFollowUps) {
      onGoFollowUps();
      return;
    }
    const route =
      userRole === 'sales_executive' || userRole === 'site_visit'
        ? '/(app)/sales-executive?tab=followups'
        : '/(app)/telecaller?tab=followups';
    router.push(route as any);
  };
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpPayload, setFollowUpPayload] = useState<any>(null);
  const [followUpAction, setFollowUpAction] = useState<string | null>(null);

  const openFollowUpForm = (payload: any, action: string) => {
    setFollowUpPayload(payload);
    setFollowUpAction(action);
    setFollowUpOpen(true);
  };

  const submitFollowUp = async (form: {
    follow_up_date: string;
    follow_up_time: string;
    follow_up_day: string;
    reason: string;
    notes: string;
  }) => {
    if (!leadId || !followUpPayload) return;
    setBusy(followUpAction);
    try {
      await api.patch(`/leads/${leadId}`, followUpPayload);
      await api.post(`/leads/${leadId}/follow-up`, form);
      setFollowUpOpen(false);
      goFollowUps();
    } finally {
      setBusy(null);
      setFollowUpAction(null);
    }
  };
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [brokerageAmount, setBrokerageAmount] = useState('');
  const subAnim = React.useRef(new Animated.Value(0)).current;
  const confettiAnims = React.useRef([...Array(50)].map(() => new Animated.Value(0))).current;

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

  const load = useCallback(async (isBackground = false) => {
    if (!leadId) return;
    if (!isBackground) setLoading(true);
    try {
      const r = await api.get(`/leads/${leadId}`);
      setData(r.data);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (visible && leadId) {
      load();
      setAiSummary(null);
      setShowAssignDropdown(false);
      setBrokerageAmount('');
      api.get('/employees').then(r => setEmployees((r.data || []).filter((e: any) => e.active))).catch(() => {});
    }
  }, [visible, leadId, load]);

  useEffect(() => {
    if (data?.lead?.brokerage_amount) {
      setBrokerageAmount(String(data.lead.brokerage_amount));
    }
  }, [data?.lead?.brokerage_amount]);

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
    // Reset all animations
    confettiAnims.forEach(a => a.setValue(0));
    
    Animated.parallel(
      confettiAnims.map((anim, i) => 
        Animated.sequence([
          Animated.delay(Math.random() * 200),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000 + Math.random() * 1000,
            easing: Easing.bezier(0.1, 0.5, 0.3, 1), // "Explosive" start, slow finish
            useNativeDriver: true
          })
        ])
      )
    ).start(() => {
      setShowConfetti(false);
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
      await load(true);
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
      await load(true);
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
      await load(true);
    } finally {
      setBusy(null);
    }
  };

  const assignToEmployee = async (employeeId: string, employeeName: string) => {
    if (!leadId) return;
    setBusy('assign');
    try {
      const payload: any = { assigned_to: employeeId, stage: 'assigned', lead_type: 'standard' };
      const parsedBrokerage = parseFloat(brokerageAmount);
      if (!Number.isNaN(parsedBrokerage) && parsedBrokerage > 0) {
        payload.brokerage_amount = parsedBrokerage;
      }
      if (lead?.stage === 'broker') {
        await api.post(`/leads/${leadId}/from-broker`, {
          assigned_to: employeeId,
          brokerage_amount: payload.brokerage_amount,
        });
      } else {
        await api.patch(`/leads/${leadId}`, payload);
      }
      setShowAssignDropdown(false);
      await load(true);
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  const moveToBrokerPool = async () => {
    if (!leadId) return;
    setBusy('broker');
    try {
      await api.post(`/leads/${leadId}/to-broker`);
      await load(true);
      onChanged?.();
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

  // Extract preferred property if prepended in notes
  let preferredProperty = '';
  let cleanNotes = '';
  const housingRaw = lead && String(lead.source || '').toLowerCase().includes('housing') && lead.raw_payload
    ? (lead.raw_payload as Record<string, unknown>)
    : null;

  if (lead) {
    cleanNotes = lead.notes || '';
    if (cleanNotes.startsWith('Preferred Property:')) {
      const lines = cleanNotes.split('\n');
      preferredProperty = lines[0].replace('Preferred Property:', '').trim();
      cleanNotes = lines.slice(1).join('\n').trim();
    }
    if (!preferredProperty && housingRaw) {
      preferredProperty = String(housingRaw.project_name || housingRaw.project || '').trim();
    }
  }

  if (!visible) return null;

  function renderBody() {
    if (loading || !lead) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }

    return (
            <>
              {/* Header */}
              <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{lead.name}</Text>
                  <Text style={[styles.sub, { color: colors.textMuted }]}>{lead.phone}{lead.email ? `  ·  ${lead.email}` : ''}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <StageBadge stage={lead.stage} />
                    {lead.status === 'negative' ? <Badge text="NEGATIVE" color={colors.negative} /> : null}
                    {lead.call_status ? (
                      <Badge text={callStatusLabel(lead.call_status).toUpperCase()} color={colors.warning} />
                    ) : null}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {isAdmin(userRole) && (
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

                {/* Assign to Employee — Admin only */}
                {isAdmin(userRole) && (
                  <View style={[styles.block, { borderColor: '#8B5CF6' + '40', backgroundColor: '#8B5CF6' + '08' }]}>
                    <Text style={[styles.blockTitle, { color: '#8B5CF6' }]}>
                      {lead.stage === 'broker' ? 'ACTIVATE FROM BROKER POOL' : 'ASSIGN TO EMPLOYEE'}
                    </Text>
                    {lead.stage === 'broker' ? (
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}>
                        This lead is in the broker pool and was not auto-assigned.
                      </Text>
                    ) : null}
                    <View style={{ marginBottom: 10 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>BROKERAGE AMOUNT (₹)</Text>
                      <TextInput
                        value={brokerageAmount}
                        onChangeText={setBrokerageAmount}
                        placeholder="Optional brokerage"
                        keyboardType="numeric"
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 40,
                          color: colors.text,
                          backgroundColor: colors.surfaceAlt,
                        }}
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                    {lead.assigned_to ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <Ionicons name="person-circle" size={20} color="#8B5CF6" />
                        <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                          Assigned to: <Text style={{ fontWeight: '700' }}>{employees.find((e: any) => e.employee_id === lead.assigned_to)?.name || lead.assigned_to}</Text>
                        </Text>
                        <Pressable
                          onPress={() => setShowAssignDropdown(!showAssignDropdown)}
                          style={{ paddingHorizontal: 10, height: 28, borderRadius: 6, borderWidth: 1, borderColor: '#8B5CF6' + '40', backgroundColor: '#8B5CF6' + '12', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '600' }}>Reassign</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => setShowAssignDropdown(!showAssignDropdown)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#8B5CF6' + '40', backgroundColor: '#8B5CF6' + '12' }}
                      >
                        <Ionicons name="person-add" size={16} color="#8B5CF6" />
                        <Text style={{ color: '#8B5CF6', fontSize: 13, fontWeight: '600' }}>Select Employee</Text>
                      </Pressable>
                    )}
                    {showAssignDropdown && (
                      <View style={{ marginTop: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                        {employees.map((emp: any) => (
                          <Pressable
                            key={emp.employee_id}
                            onPress={() => assignToEmployee(emp.employee_id, emp.name)}
                            disabled={busy === 'assign'}
                            style={({ pressed }: any) => [{
                              flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10,
                              borderBottomWidth: 1, borderBottomColor: colors.border,
                              backgroundColor: pressed ? colors.primary + '10' : (emp.employee_id === lead.assigned_to ? '#8B5CF6' + '15' : 'transparent'),
                            }]}
                          >
                            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#8B5CF6' + '20', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: '#8B5CF6' }}>{emp.name?.[0]?.toUpperCase()}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>{emp.name}</Text>
                              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{emp.role} · {emp.department || emp.role}</Text>
                            </View>
                            {emp.employee_id === lead.assigned_to && (
                              <Ionicons name="checkmark-circle" size={18} color="#8B5CF6" />
                            )}
                          </Pressable>
                        ))}
                        {employees.length === 0 && (
                          <Text style={{ padding: 12, color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>No active employees found</Text>
                        )}
                      </View>
                    )}
                    {lead.stage !== 'broker' ? (
                      <Pressable
                        onPress={moveToBrokerPool}
                        disabled={busy === 'broker'}
                        style={{
                          marginTop: 12,
                          height: 38,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.warning + '60',
                          backgroundColor: colors.warning + '12',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: colors.warning, fontWeight: '700', fontSize: 12 }}>
                          Move to Broker Pool (no auto-assign)
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}

                {housingRaw ? (
                  <View style={[styles.block, { borderColor: '#00BFA5' + '50', backgroundColor: '#00BFA5' + '08' }]}>
                    <Text style={[styles.blockTitle, { color: '#00BFA5' }]}>HOUSING.COM — ORIGINAL ENQUIRY</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}>
                      Real lead data imported from Housing.com API (not demo).
                    </Text>
                    <DetailRow
                      label="Lead date"
                      value={formatHousingLeadDate(housingRaw.lead_date, lead.created_at)}
                      colors={colors}
                    />
                    <DetailRow label="Project" value={preferredProperty || null} colors={colors} />
                    <DetailRow label="Locality" value={housingRaw.locality_name ? String(housingRaw.locality_name) : null} colors={colors} />
                    <DetailRow label="City" value={housingRaw.city_name ? String(housingRaw.city_name) : null} colors={colors} />
                    <DetailRow
                      label="Budget range"
                      value={formatBudgetRangeLakhs(housingRaw.min_price, housingRaw.max_price, lead.budget)}
                      colors={colors}
                    />
                    <DetailRow
                      label="Configuration"
                      value={formatHousingConfiguration(housingRaw) || (lead.property_type ? String(lead.property_type) : null)}
                      colors={colors}
                    />
                  </View>
                ) : null}

                {/* Details */}
                <View style={[styles.block, { borderColor: colors.border }]}>
                  <Text style={[styles.blockTitle, { color: colors.textSecondary }]}>CUSTOMER DETAILS</Text>
                  <DetailRow label="Budget" value={formatBudgetStringLakhs(lead.budget) || lead.budget} colors={colors} />
                  <DetailRow label="Location" value={lead.location} colors={colors} />
                  <DetailRow
                    label="Configuration"
                    value={
                      (housingRaw ? formatHousingConfiguration(housingRaw) : null)
                      || lead.property_type
                    }
                    colors={colors}
                  />
                  {preferredProperty ? (
                    <DetailRow label="Pref. Property" value={preferredProperty} colors={colors} />
                  ) : null}
                  <DetailRow label="Source" value={lead.source} colors={colors} />
                  <DetailRow label="Notes" value={cleanNotes} colors={colors} />
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
                    <CategoryBtn 
                      label="Ringing" 
                      icon="call-outline" 
                      active={activeCategory === 'ringing'} 
                      onPress={() => selectCategory('ringing')}
                      color={colors.warning}
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
                            label="Cold Lead → Follow Up" 
                            sub="Schedule date, time, reason and notes"
                            onPress={() => openFollowUpForm({ stage: 'positive', status: 'active', priority: 'cold' }, 'cold')}
                            busy={busy === 'cold'}
                            color={colors.positive}
                          />
                          <SubActionBtn 
                            label="Hot Lead 🔥" 
                            sub="Active with Urgent requirement"
                            onPress={async () => {
                              await updateLead({ stage: 'positive', status: 'active', priority: 'hot' }, 'hot');
                              onClose();
                            }}
                            busy={busy === 'hot'}
                            color="#E11D48"
                          />
                          {(userRole === 'admin' || userRole === 'booking' || userRole === 'loan') && (
                            <SubActionBtn 
                              label="🏆 Deal Won (Close)" 
                              sub="Finalize and celebrate!"
                              onPress={() => {
                                updateLead({ stage: 'closed', status: 'active' }, 'deal_won');
                              }}
                              busy={busy === 'deal_won'}
                              color="#D4AF37"
                            />
                          )}
                        </View>
                      )}

                      {activeCategory === 'negative' && (
                        <View style={styles.subGrid}>
                          <SubActionBtn 
                            label="Low Budget" 
                            onPress={async () => {
                              await updateLead({ status: 'negative', priority: 'low_budget' }, 'low_budget');
                              onClose();
                            }}
                            busy={busy === 'low_budget'}
                            color={colors.negative}
                          />
                          <SubActionBtn 
                            label="Other Location" 
                            onPress={async () => {
                              await updateLead({ status: 'negative', priority: 'other_location' }, 'other_loc');
                              onClose();
                            }}
                            busy={busy === 'other_loc'}
                            color={colors.negative}
                          />
                          <SubActionBtn 
                            label="Already Purchased" 
                            onPress={async () => {
                              await updateLead({ status: 'negative', priority: 'already_purchased' }, 'purchased');
                              onClose();
                            }}
                            busy={busy === 'purchased'}
                            color={colors.negative}
                          />
                        </View>
                      )}

                      {activeCategory === 'visited' && (
                        <View style={styles.subGrid}>
                          <SubActionBtn 
                            label="Visited → Schedule Follow Up" 
                            sub="Pick date, time, reason and notes"
                            onPress={() => openFollowUpForm({ stage: 'positive', status: 'active' }, 'follow_up')}
                            busy={busy === 'follow_up'}
                            color={colors.info}
                          />
                          <SubActionBtn 
                            label="Ready for Booking" 
                            sub="Send to booking department"
                            onPress={async () => {
                              await updateLead({ stage: 'booking' }, 'ready_booking');
                              onClose();
                            }}
                            busy={busy === 'ready_booking'}
                            color={colors.primary}
                          />
                          <SubActionBtn 
                            label="Need Loan Info" 
                            sub="Send to loan department"
                            onPress={async () => {
                              await updateLead({ stage: 'loan' }, 'need_loan');
                              onClose();
                            }}
                            busy={busy === 'need_loan'}
                            color="#7C3AED"
                          />
                        </View>
                      )}

                      {activeCategory === 'ringing' && (
                        <View style={styles.subGrid}>
                          {CALL_STATUS_OPTIONS.map((opt) => (
                            <SubActionBtn
                              key={opt.key}
                              label={opt.label}
                              sub={lead.call_status === opt.key ? 'Currently selected' : undefined}
                              onPress={async () => {
                                await updateLead({ call_status: opt.key }, opt.key);
                                setActiveCategory(null);
                              }}
                              busy={busy === opt.key}
                              color={colors.warning}
                            />
                          ))}
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
                  {confettiAnims.map((anim, i) => {
                    const colors = ['#FFD700', '#FF4500', '#00FF7F', '#1E90FF', '#FF69B4', '#8A2BE2', '#FFA500'];
                    // Start from bottom center (Party Popper style)
                    const startX = 50; 
                    const targetX = Math.random() * 120 - 10; // Spread from -10% to 110%
                    const size = 18 + Math.random() * 20;
                    
                    return (
                      <Animated.Text
                        key={i}
                        style={{
                          position: 'absolute',
                          left: `${startX}%`,
                          bottom: 0,
                          fontSize: size,
                          color: colors[i % colors.length],
                          transform: [
                            // Shoot UP first (-800) then fall down slightly (0)
                            { translateY: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, -700 - Math.random() * 200, 200] }) },
                            // Spread OUT horizontally
                            { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, (targetX - startX) * 10] }) },
                            { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 + Math.random() * 1000}deg`] }) },
                            { scale: anim.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1.5, 1, 0] }) }
                          ],
                          opacity: anim.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] })
                        }}
                      >
                        {['🎉', '🎊', '✨', '⭐', '💎', '💰', '🔥', '🚀'][i % 8]}
                      </Animated.Text>
                    );
                  })}
                </View>
              )}
            </>
    );
  }

  const sheet = (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable
        style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={(e: any) => e?.stopPropagation?.()}
      >
        {renderBody()}
      </Pressable>
    </Pressable>
  );

  const followUpModal = (
    <ScheduleFollowUpModal
      visible={followUpOpen}
      leadName={data?.lead?.name}
      onClose={() => {
        setFollowUpOpen(false);
        setFollowUpAction(null);
      }}
      onSubmit={submitFollowUp}
    />
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return (
      <>
        {createPortal(
          <View style={[styles.webOverlay, { zIndex: overlayZIndex }]}>{sheet}</View>,
          document.body,
        )}
        {followUpModal}
      </>
    );
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        {sheet}
      </Modal>
      {followUpModal}
    </>
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
  webOverlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      web: { minHeight: '100vh' as any },
      default: {},
    }),
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
  categoryRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  catBtn: { flex: 1, minWidth: '22%' as any, height: 70, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 6 },
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
