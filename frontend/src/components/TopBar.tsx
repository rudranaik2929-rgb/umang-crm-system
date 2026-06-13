import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, AccentColor, ACCENT_THEMES } from '../theme/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { ROLES, roleLabel, defaultRouteFor } from '../lib/constants';
import { api, clearSnapshots } from '../lib/api';
import { useRouter } from 'expo-router';
import { AddLeadModal } from './AddLeadModal';
import { ImportLeadsModal } from './ImportLeadsModal';

const ACCENT_OPTIONS: AccentColor[] = ['mono', 'sky', 'forest', 'lavender', 'sunset', 'rose'];

interface Props {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}

export function TopBar({ title, subtitle, rightAction }: Props) {
  const { colors, themeName, setThemeMode, accentColor, setAccentColor } = useTheme();
  const { user, logout, setRole, actAs } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [actAsOpen, setActAsOpen] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [actingEmployee, setActingEmployee] = useState<any | null>(null);
  const [addLeadVisible, setAddLeadVisible] = useState(false);
  const [importLeadsVisible, setImportLeadsVisible] = useState(false);
  const router = useRouter();
  
  const isAdminOrOwner = user?.role === 'admin' || user?.email === 'htshpatil13@gmail.com';

  const resetAssignments = async () => {
    if (typeof window === 'undefined') return;
    const ok = window.confirm(
      'Full clean all numbers?\n\nThis clears: loans, bookings, follow-ups, assignments, employee stats.\nAll leads go back to unassigned / new.\n\nHousing & Meta leads stay — you can assign them fresh.'
    );
    if (!ok) return;
    try {
      await api.post('/leads/reset-assignments', {});
      clearSnapshots();
      alert('Success: All assignments and follow-up counts cleared.');
      window.location.reload();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to reset assignments.');
    }
  };

  const clearAllLeads = async () => {
    if (typeof window !== 'undefined') {
      const confirm = window.confirm(
        "⚠️ WARNING: This will permanently DELETE ALL LEADS and all associated bookings, visits, loans, and activities in the CRM!\n\nThis action is irreversible. Are you absolutely sure you want to proceed?"
      );
      if (!confirm) return;
      
      try {
        await api.delete('/leads/clear-all');
        clearSnapshots();
        alert("Success: Database cleared completely.");
        window.location.reload();
      } catch (e: any) {
        console.error(e);
        const msg = e.response?.data?.detail || "Failed to wipe database.";
        alert(`Error: ${msg}`);
      }
    }
  };

  const loadEmployees = useCallback(async () => {
    if (!actAsOpen) return;
    try { const r = await api.get('/employees'); setEmployees(r.data || []); } catch {}
  }, [actAsOpen]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  useEffect(() => {
    if (user?.acting_as_employee_id) {
      setActingEmployee(employees.find((e) => e.employee_id === user.acting_as_employee_id) || null);
    } else {
      setActingEmployee(null);
    }
  }, [user, employees]);

  const onChangeRole = async (r: string) => {
    setRoleOpen(false);
    await setRole(r);
    router.replace(defaultRouteFor(r, user?.email, user?.allowed_pages) as any);
  };

  const onPickEmployee = async (eid: string | null) => {
    setActAsOpen(false);
    await actAs(eid);
  };

  const onLogout = async () => {
    setMenuOpen(false);
    await logout();
    router.replace('/' as any);
  };

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.border, backgroundColor: colors.surface }]} testID="topbar">
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.actionsScroll}
        contentContainerStyle={styles.actions}
      >
        {rightAction}

        {isAdminOrOwner && (
          <>
            <Pressable
              onPress={resetAssignments}
              testID="topbar-reset-assignments"
              style={[styles.iconBtn, { borderColor: colors.warning, backgroundColor: colors.warning + '15' }]}
            >
              <Ionicons name="refresh-circle-outline" size={18} color={colors.warning} />
            </Pressable>
            <Pressable
              onPress={clearAllLeads}
              testID="topbar-clear-leads"
              style={[styles.iconBtn, { borderColor: colors.negative, backgroundColor: colors.negative + '15' }]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.negative} />
            </Pressable>
          </>
        )}

        <Pressable
          onPress={() => setImportLeadsVisible(true)}
          testID="topbar-import-leads"
          style={[styles.iconBtn, { borderColor: colors.accent, backgroundColor: colors.accent + '15' }]}
        >
          <Ionicons name="cloud-upload-outline" size={18} color={colors.accent} />
        </Pressable>

        <Pressable
          onPress={() => setAddLeadVisible(true)}
          testID="topbar-add-lead"
          style={[styles.iconBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </Pressable>

        {isAdminOrOwner ? (
          <>
            {/* Act as Employee — admin only */}
            <Pressable
              onPress={() => setActAsOpen(true)}
              testID="act-as-btn"
              style={[styles.pill, {
                borderColor: actingEmployee ? colors.accent : colors.border,
                backgroundColor: actingEmployee ? colors.accent + '20' : colors.surfaceAlt,
              }]}
            >
              <Ionicons name="person-outline" size={14} color={actingEmployee ? colors.accent : colors.textSecondary} />
              <Text style={[styles.pillText, { color: actingEmployee ? colors.accent : colors.text }]} numberOfLines={1}>
                {actingEmployee ? `Acting: ${actingEmployee.name.split(' ')[0]}` : 'Act as Self'}
              </Text>
            </Pressable>

            {/* Role switcher — admin only */}
            <Pressable
              onPress={() => setRoleOpen(true)}
              testID="role-switcher"
              style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            >
              <Ionicons name="swap-horizontal" size={14} color={colors.textSecondary} />
              <Text style={[styles.pillText, { color: colors.text }]}>
                {roleLabel(user?.role)}
              </Text>
            </Pressable>
          </>
        ) : user?.role ? (
          <View style={[styles.pill, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="briefcase-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.pillText, { color: colors.text }]}>{roleLabel(user?.role)}</Text>
          </View>
        ) : null}

        <View style={[styles.themeModeGroup, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Pressable
            onPress={() => { setThemeMode('dark'); setAccentColor('mono'); }}
            testID="theme-mode-dark"
            style={[
              styles.themeModeBtn,
              {
                backgroundColor: themeName === 'dark' && accentColor === 'mono' ? '#111827' : 'transparent',
                borderColor: themeName === 'dark' && accentColor === 'mono' ? '#111827' : 'transparent',
              },
            ]}
          >
            <View style={[styles.themeSwatch, { backgroundColor: '#111827', borderColor: '#111827' }]} />
            <Text style={[styles.themeModeText, { color: themeName === 'dark' && accentColor === 'mono' ? '#FFFFFF' : colors.textSecondary }]}>
              Dark
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setThemeMode('light'); setAccentColor('mono'); }}
            testID="theme-mode-white"
            style={[
              styles.themeModeBtn,
              {
                backgroundColor: themeName === 'light' && accentColor === 'mono' ? '#FFFFFF' : 'transparent',
                borderColor: themeName === 'light' && accentColor === 'mono' ? '#CBD5E1' : 'transparent',
              },
            ]}
          >
            <View style={[styles.themeSwatch, { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' }]} />
            <Text style={[styles.themeModeText, { color: themeName === 'light' && accentColor === 'mono' ? '#111827' : colors.textSecondary }]}>
              White
            </Text>
          </Pressable>
        </View>

        {/* Accent color picker */}
        <View style={[styles.accentRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          {ACCENT_OPTIONS.map((acc) => {
            const isSelected = accentColor === acc;
            const dotColor = ACCENT_THEMES[acc][themeName].primary;
            return (
              <Pressable
                key={acc}
                onPress={() => setAccentColor(acc)}
                testID={`accent-dot-${acc}`}
                style={[
                  styles.dotBtn,
                  {
                    backgroundColor: acc === 'mono' ? 'transparent' : dotColor,
                    borderColor: isSelected ? colors.text : 'rgba(0,0,0,0.15)',
                    borderWidth: isSelected ? 2 : 1,
                  }
                ]}
              >
                {acc === 'mono' ? (
                  <>
                    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
                    <View style={{ flex: 1, backgroundColor: '#111827' }} />
                  </>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* User menu */}
        <Pressable
          onPress={() => setMenuOpen(true)}
          testID="user-menu"
          style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
        >
          <Ionicons name="person-circle-outline" size={20} color={colors.text} />
        </Pressable>
      </ScrollView>

      {/* User menu modal */}
      <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable
            onPress={(e: any) => e.stopPropagation?.()}
            style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.menuTitle, { color: colors.text }]}>{user?.name}</Text>
            <Text style={[styles.menuSub, { color: colors.textMuted }]}>{user?.email}</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Pressable style={styles.menuItem} onPress={onLogout} testID="logout-btn">
              <Ionicons name="log-out-outline" size={16} color={colors.negative} />
              <Text style={{ color: colors.negative, fontWeight: '500' }}>Sign out</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Act-as picker */}
      <Modal transparent visible={actAsOpen} animationType="fade" onRequestClose={() => setActAsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setActAsOpen(false)}>
          <Pressable
            onPress={(e: any) => e.stopPropagation?.()}
            style={[styles.roleMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.menuTitle, { color: colors.text, marginBottom: 4 }]}>Act on behalf of an employee</Text>
            <Text style={[styles.menuSub, { color: colors.textMuted, marginBottom: 12 }]}>
              Every action you take will be credited to that employee for performance tracking.
            </Text>
            <Pressable
              testID="act-as-self"
              onPress={() => onPickEmployee(null)}
              style={({ hovered }: any) => [styles.roleItem, {
                backgroundColor: !user?.acting_as_employee_id ? colors.primary + '20' : (hovered ? colors.surfaceAlt : 'transparent'),
                borderColor: colors.border,
              }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleTitle, { color: colors.text }]}>Yourself ({user?.name})</Text>
                <Text style={[styles.roleDept, { color: colors.textMuted }]}>Direct admin action</Text>
              </View>
              {!user?.acting_as_employee_id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
            </Pressable>
            <ScrollView style={{ maxHeight: 320, marginTop: 4 }}>
              {employees.length === 0 ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>No employees yet. Add some on the Employees page.</Text>
                </View>
              ) : employees.map((e) => (
                <Pressable
                  key={e.employee_id}
                  testID={`act-as-emp-${e.employee_id}`}
                  onPress={() => onPickEmployee(e.employee_id)}
                  style={({ hovered }: any) => [styles.roleItem, {
                    backgroundColor: user?.acting_as_employee_id === e.employee_id ? colors.accent + '20' : (hovered ? colors.surfaceAlt : 'transparent'),
                    borderColor: colors.border,
                    opacity: e.active === false ? 0.5 : 1,
                  }]}
                  disabled={e.active === false}
                >
                  <View style={[{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, marginRight: 10 }]}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{e.name?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleTitle, { color: colors.text }]}>{e.name}</Text>
                    <Text style={[styles.roleDept, { color: colors.textMuted }]}>{roleLabel(e.role)} · {e.department}{e.active === false ? ' · disabled' : ''}</Text>
                  </View>
                  {user?.acting_as_employee_id === e.employee_id && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Role chooser */}
      <Modal transparent visible={roleOpen} animationType="fade" onRequestClose={() => setRoleOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setRoleOpen(false)}>
          <Pressable
            onPress={(e: any) => e.stopPropagation?.()}
            style={[styles.roleMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[styles.menuTitle, { color: colors.text, marginBottom: 4 }]}>Switch Role</Text>
            <Text style={[styles.menuSub, { color: colors.textMuted, marginBottom: 12 }]}>
              You can act as any department for this demo.
            </Text>
            {ROLES.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => onChangeRole(r.key)}
                testID={`role-option-${r.key}`}
                style={({ hovered }: any) => [
                  styles.roleItem,
                  {
                    backgroundColor: user?.role === r.key ? colors.primary + '20' :
                      (hovered ? colors.surfaceAlt : 'transparent'),
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.roleTitle, { color: colors.text }]}>{r.label}</Text>
                  <Text style={[styles.roleDept, { color: colors.textMuted }]}>{r.dept}</Text>
                </View>
                {user?.role === r.key && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <AddLeadModal
        visible={addLeadVisible}
        onClose={() => setAddLeadVisible(false)}
        onSuccess={() => {
          // Success!
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }}
      />

      <ImportLeadsModal
        visible={importLeadsVisible}
        onClose={() => setImportLeadsVisible(false)}
        onSuccess={() => {
          // Refresh page to load bulk data
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 64,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  actionsScroll: { flexGrow: 0, maxWidth: '78%' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '500' },
  iconBtn: {
    width: 34, height: 34, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  themeModeGroup: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 3,
    gap: 3,
  },
  themeModeBtn: {
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  themeSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  themeModeText: { fontSize: 11, fontWeight: '700' },
  accentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  dotBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start', alignItems: 'flex-end',
    paddingTop: 70, paddingRight: 24,
  },
  menu: {
    width: 240, padding: 14, borderRadius: 10, borderWidth: 1,
  },
  menuTitle: { fontSize: 14, fontWeight: '600' },
  menuSub: { fontSize: 11, marginTop: 2 },
  divider: { height: 1, marginVertical: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  roleMenu: {
    width: 360, padding: 16, borderRadius: 12, borderWidth: 1, gap: 6,
  },
  roleItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 8, borderWidth: 1, marginTop: 6,
  },
  roleTitle: { fontSize: 13, fontWeight: '600' },
  roleDept: { fontSize: 11, marginTop: 2 },
});
