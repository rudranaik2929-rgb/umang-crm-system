import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Animated, Easing, Platform, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createPortal } from 'react-dom';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { api, broadcastDataChanged } from '../lib/api';
import { WorkflowStatusBadge } from './Badge';
import { STAGES, isAdmin, canMoveLeadToBrokerPool } from '../lib/constants';
import {
  CALL_STATUS_OPTIONS,
  NOT_INTERESTED_OPTIONS,
  formatBudgetRangeLakhs,
  formatBudgetStringLakhs,
  formatHousingConfiguration,
  formatHousingLeadDate,
  stripActivityActorPrefix,
} from '../lib/leadFormat';
import { openPhoneCall, openWhatsApp } from '../lib/leadContact';
import { ScheduleFollowUpModal } from './ScheduleFollowUpModal';
import { useSidebarLayout } from '../layout/SidebarLayoutContext';

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
  const { width: sidebarWidth } = useSidebarLayout();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sheetDimensions = useMemo(() => {
    const pad = 24;
    const sidebarPad = Platform.OS === 'web' && windowWidth >= 960 ? Math.min(sidebarWidth, windowWidth * 0.35) : 0;
    const availableW = Math.max(300, windowWidth - sidebarPad - pad * 2);
    const w = Math.min(1040, availableW);
    const h = Math.min(820, Math.max(420, windowHeight * 0.88));
    if (Platform.OS === 'web') {
      return { width: w, maxWidth: w, height: h, maxHeight: h };
    }
    return { width: '100%' as const, maxWidth: w, height: '90%' as const, maxHeight: '90%' as const };
  }, [windowWidth, windowHeight, sidebarWidth]);

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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const noteDirtyRef = React.useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
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

  const applyNoteFromTimeline = useCallback((timeline: any[], preferId?: string | null) => {
    const notes = [...(timeline || [])]
      .filter((t: any) => t.type === 'call_note' || t.type === 'visit_note')
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const picked = (preferId && notes.find((t: any) => t.activity_id === preferId)) || notes[0];
    if (picked) {
      setNote(stripActivityActorPrefix(picked.text));
      setEditingNoteId(picked.activity_id || null);
    } else {
      setNote('');
      setEditingNoteId(null);
    }
  }, []);

  const mergeSavedNoteIntoTimeline = useCallback((saved: any) => {
    if (!saved?.activity_id) return;
    setData((prev: any) => {
      if (!prev) return prev;
      const timeline = [...(prev.timeline || [])];
      const idx = timeline.findIndex((t: any) => t.activity_id === saved.activity_id);
      const row = {
        activity_id: saved.activity_id,
        lead_id: saved.lead_id || leadId,
        type: saved.type || 'call_note',
        text: saved.text,
        created_at: saved.created_at || new Date().toISOString(),
        user_id: saved.user_id,
      };
      if (idx >= 0) timeline[idx] = { ...timeline[idx], ...row };
      else timeline.unshift(row);
      timeline.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      return { ...prev, timeline };
    });
  }, [leadId]);

  const load = useCallback(async (isBackground = false, hydrateNote = false, preferNoteId?: string | null) => {
    if (!leadId) return;
    if (!isBackground) setLoading(true);
    try {
      const r = await api.get(`/leads/${leadId}`, { params: { _t: Date.now() }, bypassCache: true } as any);
      setData(r.data);
      if (hydrateNote && !noteDirtyRef.current) {
        applyNoteFromTimeline(r.data?.timeline || [], preferNoteId ?? undefined);
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [leadId, applyNoteFromTimeline]);

  useEffect(() => {
    if (visible && leadId) {
      noteDirtyRef.current = false;
      setNoteError(null);
      setNoteSaved(null);
      load(false, true);
      setAiSummary(null);
      setShowAssignDropdown(false);
      setAssignSearch('');
      setActionMessage(null);
      setBrokerageAmount('');
      api.get('/employees').then(r => setEmployees((r.data || []).filter((e: any) => e.active))).catch(() => {});
    }
    if (!visible) {
      setFollowUpOpen(false);
      setFollowUpPayload(null);
      setFollowUpAction(null);
      setActiveCategory(null);
      setNote('');
      setEditingNoteId(null);
      setNoteError(null);
      setNoteSaved(null);
      noteDirtyRef.current = false;
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

  const updateLead = async (payload: any, action: string, opts?: { closeAfter?: boolean }) => {
    if (!leadId) return;
    setBusy(action);
    try {
      await api.patch(`/leads/${leadId}`, payload);
      if (payload.stage === 'closed') {
        triggerConfetti();
      }
      onChanged?.();
      broadcastDataChanged();
      if (opts?.closeAfter) {
        onClose();
        return;
      }
      await load(true);
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
      broadcastDataChanged();
    } finally {
      setBusy(null);
    }
  };

  const addNote = async () => {
    if (!leadId || !note.trim() || savingNote) return;
    setSavingNote(true);
    setNoteError(null);
    setNoteSaved(null);
    const body = note.trim();
    const wasEditing = Boolean(editingNoteId);
    try {
      let saved: any;
      if (editingNoteId) {
        try {
          const res = await api.patch(`/leads/${leadId}/notes/${editingNoteId}`, { text: body });
          saved = res.data;
        } catch (patchErr: any) {
          if (patchErr?.response?.status === 404) {
            const res = await api.post(`/leads/${leadId}/notes`, { text: body, type: 'call_note' });
            saved = res.data;
          } else {
            throw patchErr;
          }
        }
      } else {
        const res = await api.post(`/leads/${leadId}/notes`, { text: body, type: 'call_note' });
        saved = res.data;
      }
      if (!saved?.activity_id) {
        throw new Error('Note saved but server returned no id.');
      }
      broadcastDataChanged();
      noteDirtyRef.current = false;
      const displayText = stripActivityActorPrefix(saved.text || body);
      setEditingNoteId(saved.activity_id);
      setNote(displayText);
      mergeSavedNoteIntoTimeline({ ...saved, text: saved.text || `[Note] ${body}` });
      setNoteSaved(wasEditing ? 'Note updated.' : 'Note saved.');
      onChanged?.();
      await load(true, true, saved.activity_id);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setNoteError(typeof detail === 'string' ? detail : e?.message || 'Could not save note. Please try again.');
    } finally {
      setSavingNote(false);
    }
  };

  const selectNoteForEdit = (entry: any) => {
    if (!entry || (entry.type !== 'call_note' && entry.type !== 'visit_note')) return;
    noteDirtyRef.current = false;
    setNote(stripActivityActorPrefix(entry.text));
    setEditingNoteId(entry.activity_id || null);
    setNoteError(null);
    setNoteSaved(null);
  };

  const startNewNote = () => {
    noteDirtyRef.current = true;
    setEditingNoteId(null);
    setNote('');
    setNoteError(null);
    setNoteSaved(null);
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
      broadcastDataChanged();
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
      broadcastDataChanged();
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
      broadcastDataChanged();
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
              <View style={[styles.header, { borderBottomColor: colors.border + '80' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{lead.name}</Text>
                  <Text style={[styles.sub, { color: colors.textMuted }]}>{lead.phone}{lead.email ? `  ·  ${lead.email}` : ''}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <Pressable
                      onPress={() => openPhoneCall(lead.phone)}
                      style={[styles.contactBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '12' }]}
                    >
                      <Ionicons name="call" size={14} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Call</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openWhatsApp(lead.phone)}
                      style={[styles.contactBtn, { borderColor: '#25D366', backgroundColor: '#25D36614' }]}
                    >
                      <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
                      <Text style={{ color: '#25D366', fontSize: 11, fontWeight: '700' }}>WhatsApp</Text>
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <WorkflowStatusBadge lead={lead} />
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

              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollPad} keyboardShouldPersistTaps="handled">
                {/* AI Magic Summary */}
                <View style={styles.aiBlock}>
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
                  <View style={styles.block}>
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
                      <View style={{ marginTop: 4, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                      {lead.assigned_at ? (
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 28 }}>
                          Assigned: {new Date(lead.assigned_at).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
                          })}
                        </Text>
                      ) : null}
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                          <Ionicons name="search" size={16} color={colors.textMuted} />
                          <TextInput
                            value={assignSearch}
                            onChangeText={setAssignSearch}
                            placeholder="Search employee name..."
                            placeholderTextColor={colors.textMuted}
                            style={{ flex: 1, color: colors.text, fontSize: 13, paddingVertical: 4 }}
                          />
                        </View>
                        <ScrollView style={{ maxHeight: 220 }}>
                        {employees.filter((emp: any) => {
                          const q = assignSearch.trim().toLowerCase();
                          if (!q) return true;
                          return String(emp.name || '').toLowerCase().includes(q)
                            || String(emp.role || '').toLowerCase().includes(q)
                            || String(emp.department || '').toLowerCase().includes(q);
                        }).map((emp: any) => (
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
                        </ScrollView>
                        {employees.length === 0 && (
                          <Text style={{ padding: 12, color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>No active employees found</Text>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {canMoveLeadToBrokerPool(userRole) && lead.stage !== 'broker' ? (
                  <View style={styles.block}>
                    <Text style={[styles.blockTitle, { color: colors.textSecondary }]}>BROKER POOL</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>
                      Move this lead to broker pool — no auto-assign until activated.
                    </Text>
                    <Pressable
                      onPress={moveToBrokerPool}
                      disabled={busy === 'broker'}
                      style={[styles.softBtn, { backgroundColor: colors.warning + '14' }]}
                    >
                      <Text style={{ color: colors.warning, fontWeight: '700', fontSize: 13 }}>
                        Move to Broker Pool
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {housingRaw ? (
                  <View style={styles.block}>
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
                <View style={styles.block}>
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

                {/* Call / visit note — editable anytime */}
                <View style={styles.block}>
                  <Text style={[styles.blockTitle, { color: colors.textSecondary }]}>
                    {editingNoteId ? 'EDIT CALL / VISIT NOTE' : 'ADD CALL / VISIT NOTE'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    Type or edit anytime · tap a note in timeline below to switch
                  </Text>
                  <TextInput
                    testID="lead-note-input"
                    value={note}
                    onChangeText={(text) => {
                      noteDirtyRef.current = true;
                      setNote(text);
                      setNoteError(null);
                      setNoteSaved(null);
                    }}
                    editable={!savingNote}
                    multiline
                    placeholder="e.g. Customer wants to revisit on Saturday..."
                    placeholderTextColor={colors.textMuted}
                    style={{
                      minHeight: 88, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                      color: colors.text, backgroundColor: colors.surfaceAlt, fontSize: 14, marginTop: 10,
                      textAlignVertical: 'top',
                    }}
                  />
                  {noteError ? (
                    <Text style={{ color: colors.negative, fontSize: 12, marginTop: 8 }}>{noteError}</Text>
                  ) : noteSaved ? (
                    <Text style={{ color: colors.positive, fontSize: 12, marginTop: 8 }}>{noteSaved}</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    {editingNoteId ? (
                      <Pressable
                        onPress={startNewNote}
                        disabled={savingNote}
                        style={[styles.saveBtn, { flex: 1, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, opacity: savingNote ? 0.6 : 1 }]}
                      >
                        <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Add New Note</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      testID="lead-note-save"
                      onPress={addNote}
                      disabled={!note.trim() || savingNote}
                      style={[styles.saveBtn, { flex: 1, backgroundColor: colors.primary, opacity: !note.trim() || savingNote ? 0.5 : 1 }]}
                    >
                      {savingNote ? <ActivityIndicator color="#fff" size="small" /> : (
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
                          {editingNoteId ? 'Update Note' : 'Save Note'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>

                {actionMessage ? (
                  <View style={styles.block}>
                    <Text style={{ color: colors.positive, fontSize: 13, fontWeight: '600' }}>{actionMessage}</Text>
                  </View>
                ) : null}

                {/* Quick actions Refactored */}
                <View style={styles.block}>
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
                            sub="Shows in Booking & Loan department — New Booking / New Application"
                            onPress={async () => {
                              await updateLead({ stage: 'positive', status: 'active', priority: 'hot' }, 'hot');
                              setActionMessage('Marked as Hot. Lead is now visible in Booking and Loan departments (New Booking / New Application).');
                              setActiveCategory(null);
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
                          {NOT_INTERESTED_OPTIONS.map((opt) => (
                            <SubActionBtn
                              key={opt.key}
                              label={opt.label}
                              sub={lead.status === 'negative' && String(lead.priority || '') === opt.key ? 'Currently selected' : undefined}
                              onPress={async () => {
                                await updateLead({ status: 'negative', priority: opt.key }, opt.key);
                                onClose();
                              }}
                              busy={busy === opt.key}
                              color={colors.negative}
                            />
                          ))}
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
                          {(userRole === 'admin' || userRole === 'manager' || userRole === 'sales_executive' || userRole === 'site_visit') ? (
                            <>
                              <SubActionBtn 
                                label="Ready for Booking" 
                                sub="Queues for Booking team — use New Booking to open list"
                                onPress={async () => {
                                  await updateLead({
                                    stage: lead.stage === 'site_visit' ? 'site_visit' : 'site_visit',
                                    status: 'active',
                                    priority: 'handoff_booking',
                                  }, 'ready_booking');
                                  setActionMessage('Sent to Booking queue. Booking team will pick this lead from New Booking.');
                                  setActiveCategory(null);
                                }}
                                busy={busy === 'ready_booking'}
                                color={colors.primary}
                              />
                              <SubActionBtn 
                                label="Need Loan Info" 
                                sub="Queues for Loan team — use New Application to open list"
                                onPress={async () => {
                                  await updateLead({
                                    status: 'active',
                                    priority: 'handoff_loan',
                                  }, 'need_loan');
                                  setActionMessage('Sent to Loan queue. Loan team will pick this lead from New Application.');
                                  setActiveCategory(null);
                                }}
                                busy={busy === 'need_loan'}
                                color="#7C3AED"
                              />
                            </>
                          ) : null}
                          <SubActionBtn
                            label="Mark Visited"
                            sub="Moves lead to Visited on My Dashboard"
                            onPress={async () => {
                              await updateLead({ stage: 'site_visit', status: 'active' }, 'mark_visited', { closeAfter: true });
                            }}
                            busy={busy === 'mark_visited'}
                            color={colors.info}
                          />
                        </View>
                      )}

                      {activeCategory === 'ringing' && (
                        <View style={styles.subGrid}>
                          {CALL_STATUS_OPTIONS.map((opt) => (
                            <SubActionBtn
                              key={opt.key}
                              label={opt.label}
                              sub={lead.call_status === opt.key ? 'Currently selected' : 'Open Ringing on My Dashboard'}
                              onPress={async () => {
                                await updateLead({ call_status: opt.key }, opt.key, { closeAfter: true });
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

                {/* Timeline */}
                <View style={styles.block}>
                  <Text style={[styles.blockTitle, { color: colors.textSecondary }]}>ACTIVITY TIMELINE</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    Tap a call / visit note to edit it
                  </Text>
                  {timeline.length === 0 ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>No activity yet.</Text>
                  ) : (
                    <View style={{ marginTop: 8 }}>
                      {timeline.map((t: any) => {
                        const isNote = t.type === 'call_note' || t.type === 'visit_note';
                        const isSelected = isNote && editingNoteId === t.activity_id;
                        return (
                          <Pressable
                            key={t.activity_id || `${t.type}-${t.created_at}`}
                            onPress={() => isNote && selectNoteForEdit(t)}
                            style={[
                              styles.timeItem,
                              {
                                borderLeftColor: isSelected ? colors.primary : colors.border,
                                backgroundColor: isSelected ? colors.primary + '10' : 'transparent',
                                borderRadius: isSelected ? 6 : 0,
                              },
                            ]}
                          >
                            <View style={[styles.timeDot, { backgroundColor: isNote ? colors.primary : colors.textMuted, borderColor: colors.surface }]} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.text, fontSize: 13 }}>
                                {isNote ? stripActivityActorPrefix(t.text) : t.text}
                              </Text>
                              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                {new Date(t.created_at).toLocaleString('en-IN')}
                                {isNote ? ' · tap to edit' : ''}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
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
      <View
        style={[
          styles.sheet,
          sheetDimensions,
          { backgroundColor: colors.surface },
        ]}
        {...(Platform.OS === 'web'
          ? { onClick: (e: any) => e?.stopPropagation?.() } as any
          : { onStartShouldSetResponder: () => true })}
      >
        {renderBody()}
      </View>
    </Pressable>
  );

  const followUpZIndex = overlayZIndex + 2000;
  const modalOverlayStyle = Platform.OS === 'web'
    ? ({
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: overlayZIndex,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.18)',
        opacity: followUpOpen ? 0.4 : 1,
      } as any)
    : { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.18)' };

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return (
      <>
        {visible
          ? createPortal(
              <View style={modalOverlayStyle}>{sheet}</View>,
              document.body,
            )
          : null}
        <ScheduleFollowUpModal
          visible={followUpOpen}
          leadName={data?.lead?.name}
          overlayZIndex={followUpZIndex}
          onClose={() => {
            setFollowUpOpen(false);
            setFollowUpAction(null);
          }}
          onSubmit={submitFollowUp}
        />
      </>
    );
  }

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => (followUpOpen ? setFollowUpOpen(false) : onClose())}
      >
        <View style={styles.nativeOverlay}>
          {sheet}
        </View>
      </Modal>
      <ScheduleFollowUpModal
        visible={followUpOpen}
        leadName={data?.lead?.name}
        overlayZIndex={followUpZIndex}
        onClose={() => {
          setFollowUpOpen(false);
          setFollowUpAction(null);
        }}
        onSubmit={submitFollowUp}
      />
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
  backdrop: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'transparent',
  },
  nativeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 0,
    overflow: 'hidden',
    flexDirection: 'column',
    ...Platform.select({
      web: {
        boxShadow: '0 24px 64px rgba(15, 23, 42, 0.22)' as any,
        display: 'flex' as any,
      },
      default: {
        borderWidth: StyleSheet.hairlineWidth,
      },
    }),
  },
  scrollPad: { padding: 20, paddingBottom: 24, gap: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  name: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 4 },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
  },
  block: { paddingVertical: 12, marginBottom: 4 },
  blockTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  softBtn: {
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
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
  aiBlock: { paddingVertical: 12, marginBottom: 4 },
  magicBtn: { backgroundColor: '#7C3AED', paddingHorizontal: 10, height: 24, borderRadius: 12, justifyContent: 'center' },
  timeItem: { flexDirection: 'row', gap: 12, paddingVertical: 8, paddingLeft: 10, borderLeftWidth: 1 },
  timeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginLeft: -14, borderWidth: 2 },
});
