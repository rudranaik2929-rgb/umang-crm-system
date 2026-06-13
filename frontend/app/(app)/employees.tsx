import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { api } from '../../src/lib/api';
import { EmptyState } from '../../src/components/EmptyState';
import { Badge } from '../../src/components/Badge';
import { ROLES, roleLabel, ALL_SERVICES } from '../../src/lib/constants';
import { getEmployeePassword, setEmployeePassword } from '../../src/lib/employeePasswordCache';
import { Ionicons } from '@expo/vector-icons';

// Sensible default services pre-ticked per role (manager can adjust freely).
/** Parse allowed_pages from API (array or JSON string from Supabase). */
function parseAllowedPages(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return null;
    }
  }
  return null;
}

const ROLE_DEFAULT_SERVICES: Record<string, string[]> = {
  admin: ALL_SERVICES.map((s) => s.key),
  manager: ['pipeline', 'assign-leads', 'bookings', 'loans', 'integrations', 'broker', 'employees'],
  telecaller: ['telecaller', 'pipeline', 'negative'],
  site_visit: ['sales-executive', 'telecaller', 'pipeline'],
  sales_executive: ['sales-executive', 'telecaller', 'pipeline'],
  booking: ['bookings', 'pipeline'],
  loan: ['loans', 'pipeline'],
  marketing: ['negative', 'pipeline', 'integrations'],
};

function pagesForEmployee(employee: { allowed_pages?: unknown; role?: string }) {
  const saved = parseAllowedPages(employee.allowed_pages);
  if (saved !== null) return saved;
  return ROLE_DEFAULT_SERVICES[employee.role || 'telecaller'] || ['pipeline'];
}

export default function Employees() {
  const { colors } = useTheme();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/employees');
      setEmployees(r.data || []);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        alert('Session expired. Please log in again.');
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    try {
      await api.delete(`/employees/${id}`);
      setEmployees((prev) => prev.filter((e) => e.employee_id !== id));
      await load();
    } catch (e: any) {
      const msg = e?.response?.status === 401
        ? 'Session expired. Please log in again.'
        : (e?.response?.data?.detail || 'Could not delete employee.');
      alert(msg);
    }
  };
  const toggle = async (e: any) => {
    try {
      await api.patch(`/employees/${e.employee_id}`, { active: !e.active });
      await load();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Could not update employee status.');
    }
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
                    <Pressable testID={`emp-edit-${e.employee_id}`} onPress={() => setEditEmployee(e)}
                      style={[styles.iconAct, { borderColor: colors.border }]}>
                      <Ionicons name="create-outline" size={14} color={colors.primary} />
                    </Pressable>
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
      <EditEmployeeModal
        visible={!!editEmployee}
        employee={editEmployee}
        onClose={() => setEditEmployee(null)}
        onSaved={async () => { setEditEmployee(null); await load(); }}
        onReload={load}
        colors={colors}
      />
    </View>
  );
}

function AddEmployeeModal({ visible, onClose, onCreated, colors }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('telecaller');
  const [pages, setPages] = useState<string[]>(ROLE_DEFAULT_SERVICES.telecaller);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickRole = (r: string) => {
    setRole(r);
    // Pre-fill the recommended services for the chosen role; manager can edit.
    setPages(ROLE_DEFAULT_SERVICES[r] || ['pipeline']);
  };

  const togglePage = (key: string) => {
    setPages((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const reset = () => {
    setName(''); setEmail(''); setPhone(''); setPassword('');
    setRole('telecaller'); setPages(ROLE_DEFAULT_SERVICES.telecaller); setError(null);
  };

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!name.trim() || !trimmedEmail || trimmedPassword.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const dept = ROLES.find((r) => r.key === role)?.dept || 'General';
      const res = await api.post('/employees', {
        name: name.trim(),
        email: trimmedEmail,
        phone: phone.trim() || undefined,
        password: trimmedPassword,
        role,
        department: dept,
        allowed_pages: pages,
      });
      if (res.data?.employee_id) setEmployeePassword(res.data.employee_id, trimmedPassword);
      onCreated(); reset();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not add employee. Check email is unique and password is at least 4 characters.');
    } finally { setBusy(false); }
  };

  const canSubmit = !!name.trim() && !!email.trim() && password.trim().length >= 4;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '88%' }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Add Employee</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            Creates a login. The employee signs in with this email and password and sees only the services you tick below.
          </Text>
          <ScrollView style={{ marginTop: 4 }} contentContainerStyle={{ paddingBottom: 4 }}>
            <Field label="FULL NAME" testID="emp-name" value={name} onChange={setName} colors={colors} />
            <Field label="LOGIN EMAIL" testID="emp-email" value={email} onChange={setEmail} colors={colors} keyboardType="email-address" />
            <Field label="LOGIN PASSWORD (REQUIRED)" testID="emp-password" value={password} onChange={setPassword} colors={colors} secureTextEntry required showPasswordToggle />
            <Field label="PHONE" testID="emp-phone" value={phone} onChange={setPhone} colors={colors} keyboardType="phone-pad" />
            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>ROLE (DASHBOARD TYPE)</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {ROLES.filter((r) => r.key !== 'admin').map((r) => (
                <Pressable key={r.key} testID={`emp-role-${r.key}`} onPress={() => pickRole(r.key)}
                  style={[styles.chip, {
                    borderColor: role === r.key ? colors.primary : colors.border,
                    backgroundColor: role === r.key ? colors.primary + '20' : colors.surfaceAlt,
                  }]}>
                  <Text style={{ color: role === r.key ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>{r.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>SIDEBAR SERVICES (ACCESS AFTER LOGIN)</Text>
            <View style={{ gap: 8 }}>
              {ALL_SERVICES.map((svc) => {
                const checked = pages.includes(svc.key);
                return (
                  <Pressable key={svc.key} testID={`emp-page-${svc.key}`} onPress={() => togglePage(svc.key)}
                    style={[styles.checkRow, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary + '12' : colors.surfaceAlt }]}>
                    <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}>
                      {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>{svc.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {error ? <Text style={{ color: colors.negative, fontSize: 12, marginTop: 10 }}>{error}</Text> : null}
          <Pressable testID="emp-submit" onPress={submit} disabled={busy || !canSubmit}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 14, height: 42, justifyContent: 'center', opacity: canSubmit ? 1 : 0.5 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create Login & Add Employee</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function EditEmployeeModal({ visible, employee, onClose, onSaved, onReload, colors }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('telecaller');
  const [pages, setPages] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sidebarBusy, setSidebarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarSaved, setSidebarSaved] = useState(false);
  const sidebarReady = React.useRef(false);
  const sidebarTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible || !employee) return;
    sidebarReady.current = false;
    setName(employee.name || '');
    setEmail(employee.email || '');
    setPhone(employee.phone || '');
    setPassword(getEmployeePassword(employee.employee_id));
    setRole(employee.role || 'telecaller');
    setPages(pagesForEmployee(employee));
    setActive(employee.active !== false);
    setError(null);
    setSidebarSaved(false);
    const t = setTimeout(() => { sidebarReady.current = true; }, 200);
    return () => clearTimeout(t);
  }, [visible, employee]);

  useEffect(() => () => {
    if (sidebarTimer.current) clearTimeout(sidebarTimer.current);
  }, []);

  const togglePage = (key: string) => {
    setPages((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
    setSidebarSaved(false);
    if (!sidebarReady.current || !employee?.employee_id) return;
    if (sidebarTimer.current) clearTimeout(sidebarTimer.current);
    sidebarTimer.current = setTimeout(() => saveSidebarOnly(true), 450);
  };

  const saveSidebarOnly = async (auto = false) => {
    if (!employee?.employee_id) return;
    if (auto) setSidebarBusy(true);
    else setBusy(true);
    if (!auto) setError(null);
    setSidebarSaved(false);
    try {
      const res = await api.patch(`/employees/${employee.employee_id}`, { allowed_pages: pages });
      const saved = parseAllowedPages(res.data?.allowed_pages);
      if (saved !== null) setPages(saved);
      setSidebarSaved(true);
      await onReload?.();
    } catch (e: any) {
      if (!auto) setError(e?.response?.data?.detail || 'Could not update sidebar access.');
    } finally {
      if (auto) setSidebarBusy(false);
      else setBusy(false);
    }
  };

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!employee?.employee_id || !name.trim() || !trimmedEmail) return;
    if (trimmedPassword.length > 0 && trimmedPassword.length < 4) {
      setError('Password must be at least 4 characters when changing it.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        email: trimmedEmail,
        phone: phone.trim() || undefined,
        role,
        active,
        allowed_pages: pages,
      };
      if (trimmedPassword.length >= 4) payload.password = trimmedPassword;
      await api.patch(`/employees/${employee.employee_id}`, payload);
      if (trimmedPassword.length >= 4) setEmployeePassword(employee.employee_id, trimmedPassword);
      onSaved();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not update employee.');
    } finally { setBusy(false); }
  };

  const canSave = !!name.trim() && !!email.trim();

  if (!employee) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, maxHeight: '88%' }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Edit Employee</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            Sidebar checkboxes save automatically — no password needed. Change password only when you want a new login password.
          </Text>
          <ScrollView style={{ marginTop: 4 }} contentContainerStyle={{ paddingBottom: 4 }}>
            <Field label="FULL NAME" testID="edit-emp-name" value={name} onChange={setName} colors={colors} />
            <Field label="LOGIN EMAIL" testID="edit-emp-email" value={email} onChange={setEmail} colors={colors} keyboardType="email-address" />
            <Field label="PHONE" testID="edit-emp-phone" value={phone} onChange={setPhone} colors={colors} keyboardType="phone-pad" />
            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>ROLE</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {ROLES.filter((r) => r.key !== 'admin').map((r) => (
                <Pressable key={r.key} onPress={() => setRole(r.key)}
                  style={[styles.chip, {
                    borderColor: role === r.key ? colors.primary : colors.border,
                    backgroundColor: role === r.key ? colors.primary + '20' : colors.surfaceAlt,
                  }]}>
                  <Text style={{ color: role === r.key ? colors.primary : colors.text, fontSize: 11, fontWeight: '600' }}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setActive((v) => !v)} style={[styles.checkRow, { marginTop: 14, borderColor: active ? colors.positive : colors.border, backgroundColor: active ? colors.positive + '12' : colors.surfaceAlt }]}>
              <View style={[styles.checkbox, { borderColor: active ? colors.positive : colors.border, backgroundColor: active ? colors.positive : 'transparent' }]}>
                {active ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
              </View>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>Account active (can log in)</Text>
            </Pressable>
            <Text style={[styles.label, { color: colors.textMuted, marginTop: 16 }]}>
              SIDEBAR SERVICES {sidebarBusy ? '(saving…)' : sidebarSaved ? '(saved)' : '(auto-saves)'}
            </Text>
            <View style={{ gap: 8 }}>
              {ALL_SERVICES.map((svc) => {
                const checked = pages.includes(svc.key);
                return (
                  <Pressable key={svc.key} onPress={() => togglePage(svc.key)}
                    style={[styles.checkRow, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary + '12' : colors.surfaceAlt }]}>
                    <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}>
                      {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>{svc.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Field
              label={password ? 'LOGIN PASSWORD (SAVED — CHANGE ONLY IF NEEDED)' : 'LOGIN PASSWORD (OPTIONAL — SET NEW PASSWORD)'}
              testID="edit-emp-password"
              value={password}
              onChange={setPassword}
              colors={colors}
              secureTextEntry
              showPasswordToggle
              autoComplete="off"
              placeholder={password ? '' : 'Leave blank to keep current password'}
            />
          </ScrollView>
          {error ? <Text style={{ color: colors.negative, fontSize: 12, marginTop: 10 }}>{error}</Text> : null}
          {sidebarSaved && !sidebarBusy ? (
            <Text style={{ color: colors.positive, fontSize: 12, marginTop: 10 }}>Sidebar access saved.</Text>
          ) : null}
          <Pressable testID="edit-emp-save-sidebar" onPress={() => saveSidebarOnly(false)} disabled={busy || sidebarBusy}
            style={[styles.outlineBtn, { borderColor: colors.primary, marginTop: 14, height: 40, justifyContent: 'center', opacity: busy || sidebarBusy ? 0.6 : 1 }]}>
            {sidebarBusy ? <ActivityIndicator color={colors.primary} /> : (
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>Save Sidebar Now</Text>
            )}
          </Pressable>
          <Pressable testID="edit-emp-submit" onPress={submit} disabled={busy || sidebarBusy || !canSave}
            style={[styles.primary, { backgroundColor: colors.primary, marginTop: 10, height: 42, justifyContent: 'center', opacity: canSave && !busy ? 1 : 0.5 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save Profile</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, value, onChange, colors, testID, keyboardType, secureTextEntry, required, showPasswordToggle, autoComplete, placeholder }: any) {
  const [show, setShow] = React.useState(false);
  return (
    <View>
      <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>
        {label}{required ? ' *' : ''}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry && !show}
          autoCapitalize="none"
          autoComplete={autoComplete}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={{
            flex: 1, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
            padding: 10, color: colors.text, backgroundColor: colors.surfaceAlt,
          }}
        />
        {showPasswordToggle ? (
          <Pressable
            onPress={() => setShow((v) => !v)}
            style={[styles.eyeBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
          >
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
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
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 42, borderRadius: 8, borderWidth: 1 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  eyeBtn: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  outlineBtn: { alignItems: 'center', borderRadius: 8, borderWidth: 1 },
});
