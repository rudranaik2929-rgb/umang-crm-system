import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api, getSnapshot, setSnapshot } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { CardActionMenu } from '../../src/components/CardActionMenu';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/auth/AuthContext';
import { canSeeRevenue } from '../../src/lib/constants';
import { SearchableSelect } from '../../src/components/SearchableSelect';

function leadInLoanQueue(lead: any) {
  const pr = String(lead?.priority || '').toLowerCase();
  return pr === 'handoff_loan' || pr === 'hot' || lead?.stage === 'loan';
}

function seesAllLoans(role?: string | null) {
  return role === 'admin' || role === 'manager' || role === 'loan';
}

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
  const cachedLoans = getSnapshot<any>('loans-page');
  const [loans, setLoans] = useState<any[]>(cachedLoans?.loans ?? []);
  const [leads, setLeads] = useState<any[]>(cachedLoans?.leads ?? []);
  const [loading, setLoading] = useState(!cachedLoans);
  const [showCreate, setShowCreate] = useState(false);
  const [editingLoan, setEditingLoan] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [lo, l] = await Promise.all([
        api.get('/loans'),
        api.get('/leads/loan-queue', { params: { limit: 100 } }),
      ]);
      const allLoans = Array.isArray(lo.data) ? lo.data : [];
      let loanData = allLoans;
      if (!seesAllLoans(user?.role) && (user as any)?.acting_as_employee_id) {
        const myLeadIds = new Set(
          (l.data || [])
            .filter((x: any) => x.assigned_to === (user as any).acting_as_employee_id)
            .map((x: any) => x.lead_id),
        );
        loanData = allLoans.filter((x: any) => myLeadIds.has(x.lead_id));
      }
      setLoans(loanData);
      const loanLeadIds = new Set(allLoans.map((x: any) => x.lead_id));
      const queueLeads = (l.data || []).filter((x: any) =>
        x.status !== 'negative'
        && !loanLeadIds.has(x.lead_id)
        && leadInLoanQueue(x)
      );
      setLeads(queueLeads);
      setSnapshot('loans-page', { loans: loanData, leads: queueLeads });
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

  const toggleStar = async (loan: any) => {
    await api.patch(`/loans/${loan.loan_id}`, { starred: !loan.starred });
    await load();
  };

  const deleteLoan = async (loan: any) => {
    const ok = typeof window === 'undefined' || window.confirm(`Delete loan application for ${loan.lead_name}?`);
    if (!ok) return;
    await api.delete(`/loans/${loan.loan_id}`);
    await load();
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
        {!loading && leads.length > 0 ? (
          <Pressable
            testID="loan-queue-banner"
            onPress={() => setShowCreate(true)}
            style={[styles.queueBanner, { backgroundColor: '#7C3AED14', borderColor: '#7C3AED55' }]}
          >
            <Ionicons name="flame" size={18} color="#7C3AED" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                {leads.length} hot / ready lead{leads.length === 1 ? '' : 's'} waiting
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                Tap here or use New Application to pick from telecaller hot list
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7C3AED" />
          </Pressable>
        ) : null}
        {loading ? <ActivityIndicator color={colors.primary} /> : (() => {
            const activeLoans = loans.filter((lo) => lo.bank_stage !== 'disbursal' && lo.application_status !== 'disbursed');
            const historyLoans = loans.filter((lo) => lo.bank_stage === 'disbursal' || lo.application_status === 'disbursed');
            return (
              <>
                {activeLoans.length === 0 ? (
                  <EmptyState
                    variant="leads"
                    title="No loan applications"
                    description="Initiate a loan application to start. Track Setup → Sanction (50%) → Disbursal (100%) in one clean, structured pipeline."
                    actionLabel="Start an Application"
                    onAction={() => setShowCreate(true)}
                    testIDAction="empty-create-loan"
                  />
                ) : activeLoans.map((lo) => {
              const hasSetup = lo.bank_name === 'Self Loan Adjustment' || lo.bank_name === 'Developer Loan Adjustment' || lo.bank_name === 'Umang Hometech LLP Loan';
              return (
                <View key={lo.loan_id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <View style={[styles.iconBig, { backgroundColor: '#7C3AED18' }]}>
                      <Ionicons name="business" size={18} color={'#7C3AED'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {lo.starred ? <Ionicons name="star" size={14} color={colors.warning} /> : null}
                        <Text style={[styles.cardTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>{lo.lead_name}</Text>
                      </View>
                      <Text style={[styles.cardSub, { color: colors.textMuted }]}>{lo.bank_name || 'Loan source pending'}{canSeeRevenue(user?.role, user?.email) ? `  ·  ₹${(lo.amount || 0).toLocaleString('en-IN')}` : ''}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        <Badge text={(lo.application_status || 'pending').toUpperCase()} color={STATUS_COLOR[lo.application_status] || colors.primary} />
                        <Badge text={(lo.bank_stage || 'setup').toUpperCase()} color={colors.info} />
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.bigVal, { color: colors.text }]}>{lo.progress}%</Text>
                      <Text style={[styles.cardSub, { color: colors.textMuted }]}>Progress</Text>
                    </View>
                    <CardActionMenu
                      colors={colors}
                      isStarred={!!lo.starred}
                      onEdit={() => setEditingLoan(lo)}
                      onToggleStar={() => toggleStar(lo)}
                      onDelete={() => deleteLoan(lo)}
                      testIDPrefix={`loan-${lo.loan_id}`}
                    />
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
                            bank_name: "Umang Hometech LLP Loan",
                            application_status: "submitted",
                            bank_stage: "setup"
                          });
                          await load();
                        } finally { setBusy(null); }
                      }}
                      disabled={busy !== null}
                      style={[styles.act, {
                        borderColor: lo.bank_name === 'Umang Hometech LLP Loan' ? colors.primary : colors.border,
                        backgroundColor: lo.bank_name === 'Umang Hometech LLP Loan' ? colors.primary + '15' : colors.surfaceAlt,
                        opacity: busy !== null ? 0.6 : 1
                      }]}
                    >
                      <Ionicons name="business-outline" size={12} color={lo.bank_name === 'Umang Hometech LLP Loan' ? colors.primary : colors.textMuted} />
                      <Text style={{ color: lo.bank_name === 'Umang Hometech LLP Loan' ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>UMANG LOAN</Text>
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
            })}

                {historyLoans.length > 0 && (
                  <View style={{ marginTop: 8, gap: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>Disbursal History</Text>
                      <Badge text={`${historyLoans.length} CLOSED`} color={colors.positive} />
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      Completed disbursals stay here for reference. You can delete old records when no longer needed.
                    </Text>
                    {historyLoans.map((lo) => (
                      <View key={`hist-${lo.loan_id}`} style={[styles.card, styles.historyCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                          <View style={[styles.iconBig, { backgroundColor: colors.positive + '18' }]}>
                            <Ionicons name="checkmark-done" size={18} color={colors.positive} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: colors.text }]}>{lo.lead_name}</Text>
                            <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                              {lo.bank_name || 'Loan'}{canSeeRevenue(user?.role, user?.email) ? ` · ₹${(lo.amount || 0).toLocaleString('en-IN')}` : ''}
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                              <Badge text="DISBURSED" color={colors.positive} />
                              <Badge text="100%" color={colors.info} />
                            </View>
                          </View>
                          <Pressable
                            testID={`loan-history-delete-${lo.loan_id}`}
                            onPress={() => deleteLoan(lo)}
                            style={[styles.historyDelete, { borderColor: colors.negative + '55', backgroundColor: colors.negative + '10' }]}
                          >
                            <Ionicons name="trash-outline" size={14} color={colors.negative} />
                            <Text style={{ color: colors.negative, fontSize: 11, fontWeight: '600' }}>Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            );
          })()
        }
      </ScrollView>

      <CreateLoanModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async (created) => {
          setShowCreate(false);
          if (created?.loan_id) {
            setLoans((prev) => {
              const ids = new Set(prev.map((x) => x.loan_id));
              return ids.has(created.loan_id) ? prev : [created, ...prev];
            });
            setLeads((prev) => prev.filter((x) => x.lead_id !== created.lead_id));
          }
          await load();
        }}
        leads={leads}
        colors={colors}
      />
      <EditLoanModal
        loan={editingLoan}
        visible={!!editingLoan}
        onClose={() => setEditingLoan(null)}
        onSaved={async () => { setEditingLoan(null); await load(); }}
        colors={colors}
      />
    </View>
  );
}

function CreateLoanModal({ visible, onClose, onCreated, leads, colors }: any) {
  const [leadId, setLeadId] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [bank, setBank] = useState('HDFC Bank');
  const [amount, setAmount] = useState('4000000');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible && leads[0]) setLeadId(leads[0].lead_id);
    if (visible) setLeadSearch('');
  }, [visible, leads]);

  const submit = async () => {
    if (!leadId) return;
    setBusy(true);
    try {
      const res = await api.post('/loans', { lead_id: leadId, bank_name: bank, amount: parseFloat(amount) || 0 });
      onCreated(res.data);
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>New Loan Application</Text>
          {leads.length === 0 ? (
            <Text style={{ color: colors.textSecondary, marginTop: 14, fontSize: 13 }}>
              No leads in queue yet. Hot leads from telecaller appear here under New Application.
            </Text>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>SELECT LEAD (SEARCH & PICK)</Text>
              <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  value={leadSearch}
                  onChangeText={setLeadSearch}
                  placeholder="Search name or phone..."
                  placeholderTextColor={colors.textMuted}
                  style={{ flex: 1, color: colors.text, fontSize: 13, paddingVertical: 8, paddingHorizontal: 8 }}
                />
              </View>
              <View style={{ marginTop: 10 }}>
                <SearchableSelect
                  label="LEAD"
                  value={leadId}
                  options={leads.filter((l: any) => {
                    const q = leadSearch.trim().toLowerCase();
                    if (!q) return true;
                    return String(l.name || '').toLowerCase().includes(q) || String(l.phone || '').toLowerCase().includes(q);
                  }).map((l: any) => {
                    const pr = String(l.priority || '').toLowerCase();
                    const tag = pr === 'hot' ? '🔥 Hot' : pr === 'handoff_loan' ? 'Ready' : '';
                    return {
                      key: l.lead_id,
                      label: l.name || 'Lead',
                      sublabel: `${tag ? `${tag} · ` : ''}${l.phone || '—'}`,
                    };
                  })}
                  onChange={setLeadId}
                  placeholder="Choose lead for loan"
                  testID="loan-lead-select"
                />
              </View>
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

function EditLoanModal({ visible, onClose, onSaved, loan, colors }: any) {
  const [bank, setBank] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loan) return;
    setBank(loan.bank_name || '');
    setAmount(String(loan.amount || 0));
    setStatus(loan.application_status || 'pending');
    setStage(loan.bank_stage || 'documentation');
    setProgress(String(loan.progress || 0));
  }, [loan]);

  const submit = async () => {
    if (!loan) return;
    setBusy(true);
    try {
      await api.patch(`/loans/${loan.loan_id}`, {
        bank_name: bank,
        amount: parseFloat(amount) || 0,
        application_status: status,
        bank_stage: stage,
        progress: parseInt(progress, 10) || 0,
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
          <Text style={[styles.cardTitle, { color: colors.text }]}>Edit Loan Application</Text>
          <LoanField label="BANK NAME" testID="edit-loan-bank" value={bank} onChange={setBank} colors={colors} />
          <LoanField label="AMOUNT (₹)" testID="edit-loan-amount" value={amount} onChange={setAmount} colors={colors} keyboardType="numeric" />
          <LoanField label="APPLICATION STATUS" testID="edit-loan-status" value={status} onChange={setStatus} colors={colors} />
          <LoanField label="BANK STAGE" testID="edit-loan-stage" value={stage} onChange={setStage} colors={colors} />
          <LoanField label="PROGRESS (%)" testID="edit-loan-progress" value={progress} onChange={setProgress} colors={colors} keyboardType="numeric" />
          <Pressable
            testID="edit-loan-submit"
            onPress={submit}
            disabled={busy}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16, height: 42, justifyContent: 'center' }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save Application</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LoanField({ label, value, onChange, colors, keyboardType, testID }: any) {
  return (
    <View>
      <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholderTextColor={colors.textMuted}
        style={{ height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.text, backgroundColor: colors.surfaceAlt }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  historyCard: { opacity: 0.95 },
  historyDelete: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: 6, borderWidth: 1 },
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
