import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';

const STAGE_PROGRESS: Record<string, number> = {
  documentation: 25,
  verification: 50,
  sanction: 75,
  disbursal: 100,
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#D97706', submitted: '#0284C7', approved: '#059669', disbursed: '#10B981', rejected: '#E11D48',
};

export default function Loans() {
  const { colors } = useTheme();
  const [loans, setLoans] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [lo, l] = await Promise.all([api.get('/loans'), api.get('/leads')]);
      setLoans(lo.data || []);
      setLeads((l.data || []).filter((x: any) => x.status !== 'negative'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const advance = async (loan: any) => {
    setBusy(`${loan.loan_id}-adv`);
    try {
      const stages = ['documentation', 'verification', 'sanction', 'disbursal'];
      const idx = stages.indexOf(loan.bank_stage);
      const next = stages[Math.min(idx + 1, stages.length - 1)];
      const status = next === 'disbursal' ? 'disbursed' : (next === 'sanction' ? 'approved' : 'submitted');
      await api.patch(`/loans/${loan.loan_id}`, { bank_stage: next, application_status: status, progress: STAGE_PROGRESS[next] });
      await load();
    } finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Loan Department"
        subtitle="Bank approval, documentation & disbursal"
        rightAction={
          <Pressable testID="create-loan-btn" onPress={() => setShowCreate(true)} style={[styles.primary, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={styles.primaryText}>New Application</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> :
          loans.length === 0 ? (
            <EmptyState
              variant="leads"
              title="No loan applications"
              description="Send a booking lead to the loan department to start a bank application here. Track documentation → verification → sanction → disbursal in one place."
              actionLabel="Start an Application"
              onAction={() => setShowCreate(true)}
              testIDAction="empty-create-loan"
            />
          ) : loans.map((lo) => (
            <View key={lo.loan_id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={[styles.iconBig, { backgroundColor: '#7C3AED18' }]}>
                  <Ionicons name="business" size={18} color={'#7C3AED'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{lo.lead_name}</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>{lo.bank_name || 'Bank pending'}  ·  ₹{(lo.amount || 0).toLocaleString('en-IN')}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    <Badge text={lo.application_status.toUpperCase()} color={STATUS_COLOR[lo.application_status] || colors.primary} />
                    <Badge text={lo.bank_stage.toUpperCase()} color={colors.info} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.bigVal, { color: colors.text }]}>{lo.progress}%</Text>
                  <Text style={[styles.cardSub, { color: colors.textMuted }]}>Progress</Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={[styles.track, { backgroundColor: colors.surfaceAlt, marginTop: 14 }]}>
                <View style={[styles.fill, { width: `${lo.progress}%`, backgroundColor: '#7C3AED' }]} />
              </View>

              {/* Stage steps */}
              <View style={styles.steps}>
                {['documentation', 'verification', 'sanction', 'disbursal'].map((s) => {
                  const active = STAGE_PROGRESS[s] <= lo.progress;
                  return (
                    <View key={s} style={{ flex: 1, alignItems: 'center' }}>
                      <View style={[styles.stepDot, {
                        backgroundColor: active ? '#7C3AED' : colors.surfaceAlt,
                        borderColor: active ? '#7C3AED' : colors.border,
                      }]} />
                      <Text style={{ color: active ? colors.text : colors.textMuted, fontSize: 10, marginTop: 4, fontWeight: '600' }}>
                        {s.toUpperCase()}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.textMuted, marginTop: 14 }]}>PENDING DOCUMENTS</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {(lo.pending_documents || []).map((d: string, i: number) => (
                  <View key={i} style={[styles.docPill, { borderColor: colors.warning + '60', backgroundColor: colors.warning + '10' }]}>
                    <Text style={{ color: colors.warning, fontSize: 11, fontWeight: '600' }}>{d}</Text>
                  </View>
                ))}
                {(!lo.pending_documents || lo.pending_documents.length === 0) && (
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>All documents submitted</Text>
                )}
              </View>

              <View style={[styles.actions]}>
                <Pressable testID={`loan-advance-${lo.loan_id}`} onPress={() => advance(lo)} disabled={busy === `${lo.loan_id}-adv` || lo.bank_stage === 'disbursal'}
                  style={[styles.act, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '10', opacity: lo.bank_stage === 'disbursal' ? 0.5 : 1 }]}>
                  {busy === `${lo.loan_id}-adv` ? <ActivityIndicator size="small" color={colors.primary} /> : <>
                    <Ionicons name="arrow-forward" size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Advance Stage</Text>
                  </>}
                </Pressable>
                <Pressable testID={`loan-emi-${lo.loan_id}`} onPress={async () => {
                    setBusy(`${lo.loan_id}-emi`);
                    try { await api.patch(`/loans/${lo.loan_id}`, { emi_eligible: !lo.emi_eligible }); await load(); }
                    finally { setBusy(null); }
                  }}
                  disabled={busy === `${lo.loan_id}-emi`}
                  style={[styles.act, { borderColor: colors.positive + '60', backgroundColor: lo.emi_eligible ? colors.positive + '30' : colors.positive + '10' }]}>
                  {busy === `${lo.loan_id}-emi` ? <ActivityIndicator size="small" color={colors.positive} /> : <>
                    <Ionicons name={lo.emi_eligible ? 'checkmark-circle' : 'checkmark-outline'} size={13} color={colors.positive} />
                    <Text style={{ color: colors.positive, fontSize: 11, fontWeight: '600' }}>{lo.emi_eligible ? 'EMI Eligible ✓' : 'Mark EMI Eligible'}</Text>
                  </>}
                </Pressable>
                <Pressable testID={`loan-clear-docs-${lo.loan_id}`} onPress={async () => {
                    setBusy(`${lo.loan_id}-docs`);
                    try {
                      // All Docs Submitted → clear docs, mark loan disbursed (auto-completes), and CLOSE the lead
                      await api.patch(`/loans/${lo.loan_id}`, {
                        pending_documents: [],
                        application_status: 'disbursed',
                        bank_stage: 'disbursal',
                        progress: 100,
                      });
                      await api.patch(`/leads/${lo.lead_id}`, { stage: 'closed' });
                      await load();
                    } finally { setBusy(null); }
                  }}
                  disabled={busy === `${lo.loan_id}-docs`}
                  style={[styles.act, { borderColor: colors.info + '60', backgroundColor: colors.info + '10' }]}>
                  <Ionicons name="document-attach-outline" size={13} color={colors.info} />
                  <Text style={{ color: colors.info, fontSize: 11, fontWeight: '600' }}>All Docs Submitted</Text>
                </Pressable>
              </View>
            </View>
          ))}
      </ScrollView>

      <CreateLoanModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async () => { setShowCreate(false); await load(); }}
        leads={leads}
        colors={colors}
      />
    </View>
  );
}

function CreateLoanModal({ visible, onClose, onCreated, leads, colors }: any) {
  const [leadId, setLeadId] = useState('');
  const [bank, setBank] = useState('HDFC Bank');
  const [amount, setAmount] = useState('4000000');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible && leads[0]) setLeadId(leads[0].lead_id); }, [visible, leads]);

  const submit = async () => {
    if (!leadId) return;
    setBusy(true);
    try {
      await api.post('/loans', { lead_id: leadId, bank_name: bank, amount: parseFloat(amount) || 0 });
      onCreated();
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>New Loan Application</Text>
          {leads.length === 0 ? (
            <Text style={{ color: colors.textSecondary, marginTop: 14, fontSize: 13 }}>No leads available yet.</Text>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>LEAD</Text>
              <ScrollView style={{ maxHeight: 160 }} contentContainerStyle={{ gap: 6 }}>
                {leads.map((l: any) => (
                  <Pressable key={l.lead_id} testID={`loan-lead-${l.lead_id}`} onPress={() => setLeadId(l.lead_id)}
                    style={[styles.leadOpt, {
                      borderColor: leadId === l.lead_id ? colors.primary : colors.border,
                      backgroundColor: leadId === l.lead_id ? colors.primary + '20' : colors.surfaceAlt,
                    }]}>
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{l.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{l.phone}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>BANK NAME</Text>
              <TextInput testID="loan-bank" value={bank} onChangeText={setBank}
                placeholderTextColor={colors.textMuted}
                style={{ height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.text, backgroundColor: colors.surfaceAlt }} />
              <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>AMOUNT (₹)</Text>
              <TextInput testID="loan-amount" value={amount} onChangeText={setAmount} keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
                style={{ height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.text, backgroundColor: colors.surfaceAlt }} />
              <Pressable testID="loan-submit" onPress={submit} disabled={busy}
                style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16, height: 42, justifyContent: 'center' }]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create Application</Text>}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  iconBig: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bigVal: { fontSize: 22, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  steps: { flexDirection: 'row', marginTop: 16 },
  stepDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  docPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 16 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 30, borderRadius: 6, borderWidth: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { width: '92%', maxWidth: 480, padding: 20, borderRadius: 12, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  leadOpt: { padding: 10, borderRadius: 8, borderWidth: 1 },
});
