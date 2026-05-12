import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { ROLES, roleLabel } from '../../src/lib/constants';
import { Ionicons } from '@expo/vector-icons';

export default function Employees() {
  const { colors } = useTheme();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api.get('/employees'); setEmployees(r.data || []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    await api.delete(`/employees/${id}`); await load();
  };
  const toggle = async (e: any) => {
    await api.patch(`/employees/${e.employee_id}`, { active: !e.active }); await load();
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Employee Management"
        subtitle="Roles, departments & login activity"
        rightAction={
          <Pressable testID="add-employee-btn" onPress={() => setShowAdd(true)} style={[styles.primary, { backgroundColor: colors.primary }]}>
            <Ionicons name="person-add" size={14} color="#fff" />
            <Text style={styles.primaryText}>Add Employee</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
        {loading ? <ActivityIndicator color={colors.primary} /> :
          employees.length === 0 ? (
            <EmptyState
              variant="leads"
              title="No team members yet"
              description="Add telecallers, site visit executives, booking team and loan officers. Each role gets access to the right department."
              actionLabel="Add First Employee"
              onAction={() => setShowAdd(true)}
              testIDAction="empty-add-employee"
            />
          ) : (
            <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.tHead, { borderBottomColor: colors.border }]}>
                <Text style={[styles.th, { color: colors.textMuted, flex: 2 }]}>NAME</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 2 }]}>EMAIL</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 1.5 }]}>ROLE</Text>
                <Text style={[styles.th, { color: colors.textMuted, flex: 1.5 }]}>DEPARTMENT</Text>
                <Text style={[styles.th, { color: colors.textMuted, width: 100 }]}>STATUS</Text>
                <Text style={[styles.th, { color: colors.textMuted, width: 120, textAlign: 'right' }]}>ACTIONS</Text>
              </View>
              {employees.map((e) => (
                <View key={e.employee_id} style={[styles.tRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{e.name?.[0]?.toUpperCase() || '?'}</Text>
                    </View>
                    <View>
                      <Text style={[styles.cellPrimary, { color: colors.text }]}>{e.name}</Text>
                      <Text style={[styles.cellSecondary, { color: colors.textMuted }]}>{e.phone || '—'}</Text>
                    </View>
                  </View>
                  <Text style={[styles.cellPrimary, { color: colors.text, flex: 2 }]}>{e.email}</Text>
                  <Text style={[styles.cellPrimary, { color: colors.text, flex: 1.5 }]}>{roleLabel(e.role)}</Text>
                  <Text style={[styles.cellPrimary, { color: colors.text, flex: 1.5 }]}>{e.department}</Text>
                  <View style={{ width: 100 }}>
                    <Badge text={e.active ? 'ACTIVE' : 'DISABLED'} color={e.active ? colors.positive : colors.textMuted} />
                  </View>
                  <View style={{ width: 120, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                    <Pressable testID={`emp-toggle-${e.employee_id}`} onPress={() => toggle(e)}
                      style={[styles.iconAct, { borderColor: colors.border }]}>
                      <Ionicons name={e.active ? 'pause-circle-outline' : 'play-circle-outline'} size={14} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable testID={`emp-delete-${e.employee_id}`} onPress={() => remove(e.employee_id)}
                      style={[styles.iconAct, { borderColor: colors.border }]}>
                      <Ionicons name="trash-outline" size={14} color={colors.negative} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
      </ScrollView>

      <AddEmployeeModal visible={showAdd} onClose={() => setShowAdd(false)} onCreated={async () => { setShowAdd(false); await load(); }} colors={colors} />
    </View>
  );
}

function AddEmployeeModal({ visible, onClose, onCreated, colors }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('telecaller');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name || !email) return;
    setBusy(true);
    try {
      const dept = ROLES.find((r) => r.key === role)?.dept || 'General';
      await api.post('/employees', { name, email, phone, role, department: dept });
      onCreated(); setName(''); setEmail(''); setPhone(''); setRole('telecaller');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Add Employee</Text>
          <Field label="FULL NAME" testID="emp-name" value={name} onChange={setName} colors={colors} />
          <Field label="EMAIL" testID="emp-email" value={email} onChange={setEmail} colors={colors} keyboardType="email-address" />
          <Field label="PHONE" testID="emp-phone" value={phone} onChange={setPhone} colors={colors} />
          <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>ROLE</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {ROLES.map((r) => (
              <Pressable key={r.key} testID={`emp-role-${r.key}`} onPress={() => setRole(r.key)}
                style={[styles.chip, {
                  borderColor: role === r.key ? colors.primary : colors.border,
                  backgroundColor: role === r.key ? colors.primary + '20' : colors.surfaceAlt,
                }]}>
                <Text style={{ color: role === r.key ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>{r.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable testID="emp-submit" onPress={submit} disabled={busy || !name || !email}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16, height: 42, justifyContent: 'center', opacity: !name || !email ? 0.5 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Add Employee</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, value, onChange, colors, testID, keyboardType }: any) {
  return (
    <View>
      <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>{label}</Text>
      <TextInput testID={testID} value={value} onChangeText={onChange} keyboardType={keyboardType}
        placeholderTextColor={colors.textMuted}
        style={{ height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.text, backgroundColor: colors.surfaceAlt }} />
    </View>
  );
}

const styles = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  tableCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tHead: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  th: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  cellPrimary: { fontSize: 13, fontWeight: '500' },
  cellSecondary: { fontSize: 11, marginTop: 2 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconAct: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  modal: { width: '92%', maxWidth: 460, padding: 20, borderRadius: 12, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  chip: { paddingHorizontal: 12, height: 28, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
