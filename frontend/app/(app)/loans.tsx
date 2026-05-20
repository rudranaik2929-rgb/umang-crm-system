import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/auth/AuthContext';

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
  const { user } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [lo, l] = await Promise.all([api.get('/loans'), api.get('/leads')]);
      let loanData = lo.data || [];
      // Non-admin: only show loans for leads assigned to this employee
      if (user?.role !== 'admin' && (user as any)?.acting_as_employee_id) {
        const myLeadIds = new Set((l.data || []).filter((x: any) => x.assigned_to === (user as any).acting_as_employee_id).map((x: any) => x.lead_id));
        loanData = loanData.filter((x: any) => myLeadIds.has(x.lead_id));
      }
      setLoans(loanData);
      setLeads((l.data || []).filter((x: any) => x.status !== 'negative'));
    } finally { setLoading(false); }
  }, [user]);
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
          (() => {
            const activeLoans = loans.filter((lo) => lo.bank_stage !== 'disbursal' && lo.application_status !== 'disbursed');
            return activeLoans.length === 0 ? (
              <EmptyState
                variant="leads"
                title="No loan applications"
                description="Initiate a loan application to start. Track Setup → Sanction (50%) → Disbursal (100%) in one clean, structured pipeline."
                actionLabel="Start an Application"
                onAction={() => setShowCreate(true)}
                testIDAction="empty-create-loan"
              />
            ) : activeLoans.map((lo) => {
              const hasSetup = lo.bank_name === 'Self Loan Adjustment' || lo.bank_name === 'Developer Loan Adjustment' || lo.bank_name === 'Umang Properties Loan';
              return (
                <View key={lo.loan_id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <View style={[styles.iconBig, { backgroundColor: '#7C3AED18' }]}>
                      <Ionicons name="business" size={18} color={'#7C3AED'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>{lo.lead_name}</Text>
                      <Text style={[styles.cardSub, { color: colors.textMuted }]}>{lo.bank_name || 'Loan source pending'}  ·  ₹{(lo.amount || 0).toLocaleString('en-IN')}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        <Badge text={(lo.application_status || 'pending').toUpperCase()} color={STATUS_COLOR[lo.application_status] || colors.primary} />
                        <Badge text={(lo.bank_stage || 'setup').toUpperCase()} color={colors.info} />
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
                    {[
                      { name: 'SETUP', active: hasSetup },
                      { name: 'SANCTIONED (50%)', active: lo.progress >= 50 },
                      { name: 'DISBURSAL (100%)', active: lo.progress === 100 }
                    ].map((step, idx) => (
                      <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
                        <View style={[styles.stepDot, {
                          backgroundColor: step.active ? '#7C3AED' : colors.surfaceAlt,
                          borderColor: step.active ? '#7C3AED' : colors.border,
                        }]} />
                        <Text style={{ color: step.active ? colors.text : colors.textMuted, fontSize: 9, marginTop: 4, fontWeight: '700' }}>
                          {step.name}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={[styles.actions, { marginTop: 18, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 14 }]}>
                    {/* 1. SELF Button */}
                    <Pressable
                      testID={`loan-self-${lo.loan_id}`}
                      onPress={async () => {
                        setBusy(`${lo.loan_id}-self`);
                        try {
                          await api.patch(`/loans/${lo.loan_id}`, {
                            bank_name: "Self Loan Adjustment",
                            application_status: "submitted",
                            bank_stage: "setup"
                          });
                          await load();
                        } finally { setBusy(null); }
                      }}
                      disabled={busy !== null}
                      style={[styles.act, {
                        borderColor: lo.bank_name === 'Self Loan Adjustment' ? colors.primary : colors.border,
                        backgroundColor: lo.bank_name === 'Self Loan Adjustment' ? colors.primary + '15' : colors.surfaceAlt,
                        opacity: busy !== null ? 0.6 : 1
                      }]}
                    >
                      <Ionicons name="person-outline" size={12} color={lo.bank_name === 'Self Loan Adjustment' ? colors.primary : colors.textMuted} />
                      <Text style={{ color: lo.bank_name === 'Self Loan Adjustment' ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>SELF</Text>
                    </Pressable>

                    {/* 2. DEVELOPER Button */}
                    <Pressable
                      testID={`loan-developer-${lo.loan_id}`}
                      onPress={async () => {
                        setBusy(`${lo.loan_id}-dev`);
                        try {
                          await api.patch(`/loans/${lo.loan_id}`, {
                            bank_name: "Developer Loan Adjustment",
                            application_status: "submitted",
                            bank_stage: "setup"
                          });
                          await load();
                        } finally { setBusy(null); }
                      }}
                      disabled={busy !== null}
                      style={[styles.act, {
                        borderColor: lo.bank_name === 'Developer Loan Adjustment' ? colors.primary : colors.border,
                        backgroundColor: lo.bank_name === 'Developer Loan Adjustment' ? colors.primary + '15' : colors.surfaceAlt,
                        opacity: busy !== null ? 0.6 : 1
                      }]}
                    >
                      <Ionicons name="construct-outline" size={12} color={lo.bank_name === 'Developer Loan Adjustment' ? colors.primary : colors.textMuted} />
                      <Text style={{ color: lo.bank_name === 'Developer Loan Adjustment' ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>DEVELOPER</Text>
                    </Pressable>

                    {/* 3. UMANG LOAN Button */}
                    <Pressable
                      testID={`loan-umang-${lo.loan_id}`}
                      onPress={async () => {
                        setBusy(`${lo.loan_id}-umang`);
                        try {
                          await api.patch(`/loans/${lo.loan_id}`, {
                            bank_name: "Umang Properties Loan",
                            application_status: "submitted",
                            bank_stage: "setup"
                          });
                          await load();
                        } finally { setBusy(null); }
                      }}
                      disabled={busy !== null}
                      style={[styles.act, {
                        borderColor: lo.bank_name === 'Umang Properties Loan' ? colors.primary : colors.border,
                        backgroundColor: lo.bank_name === 'Umang Properties Loan' ? colors.primary + '15' : colors.surfaceAlt,
                        opacity: busy !== null ? 0.6 : 1
                      }]}
                    >
                      <Ionicons name="business-outline" size={12} color={lo.bank_name === 'Umang Properties Loan' ? colors.primary : colors.textMuted} />
                      <Text style={{ color: lo.bank_name === 'Umang Properties Loan' ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>UMANG LOAN</Text>
                    </Pressable>

                    {/* 4. SANCTIONED Button */}
                    <Pressable
                      testID={`loan-sanctioned-${lo.loan_id}`}
                      onPress={async () => {
                        setBusy(`${lo.loan_id}-sanc`);
                        try {
                          await api.patch(`/loans/${lo.loan_id}`, {
                            progress: 50,
                            bank_stage: "sanction",
                            application_status: "approved"
                          });
                          await load();
                        } finally { setBusy(null); }
                      }}
                      disabled={busy !== null || !hasSetup}
                      style={[styles.act, {
                        borderColor: lo.progress >= 50 ? colors.positive : colors.border,
                        backgroundColor: lo.progress >= 50 ? colors.positive + '15' : colors.surfaceAlt,
                        opacity: (!hasSetup || busy !== null) ? 0.5 : 1
                      }]}
                    >
                      <Ionicons name="shield-checkmark-outline" size={12} color={lo.progress >= 50 ? colors.positive : colors.textMuted} />
                      <Text style={{ color: lo.progress >= 50 ? colors.positive : colors.text, fontSize: 11, fontWeight: '600' }}>SANCTIONED (50%)</Text>
                    </Pressable>

                    {/* 5. DISBURSAL Button */}
                    <Pressable
                      testID={`loan-disbursal-${lo.loan_id}`}
                      onPress={async () => {
                        setBusy(`${lo.loan_id}-disb`);
                        try {
                          // 1. Mark loan as fully disbursed (100%)
                          await api.patch(`/loans/${lo.loan_id}`, {
                            progress: 100,
                            bank_stage: "disbursal",
                            application_status: "disbursed"
                          });
                          // 2. Change main lead status to CLOSED so it vanishes and joins Dashboard Closed Metrics!
                          await api.patch(`/leads/${lo.lead_id}`, { stage: "closed" });
                          await load();
                        } finally { setBusy(null); }
                      }}
                      disabled={busy !== null || lo.progress !== 50}
                      style={[styles.act, {
                        borderColor: lo.progress === 100 ? colors.info : colors.border,
                        backgroundColor: lo.progress === 100 ? colors.info + '15' : colors.surfaceAlt,
                        opacity: (lo.progress !== 50 || busy !== null) ? 0.4 : 1
                      }]}
                    >
                      <Ionicons name="cash-outline" size={12} color={lo.progress === 100 ? colors.info : colors.textMuted} />
                      <Text style={{ color: lo.progress === 100 ? colors.info : colors.text, fontSize: 11, fontWeight: '600' }}>DISBURSAL (100%)</Text>
                    </Pressable>
                  </View>
                </View>
              );
            });
          })()
        }
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
