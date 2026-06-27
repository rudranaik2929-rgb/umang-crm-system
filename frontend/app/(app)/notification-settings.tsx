import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Pressable, ActivityIndicator, Platform } from 'react-native';
import { TopBar } from '../../src/components/TopBar';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { api } from '../../src/lib/api';
import { usePushNotifications } from '../../src/notifications/usePushNotifications';
import type { NotificationPreferences } from '../../src/notifications/types';

const TOGGLES: { key: keyof NotificationPreferences; label: string; hint: string }[] = [
  { key: 'lead_assigned', label: 'Lead Assigned', hint: 'When a manager assigns you a lead' },
  { key: 'lead_updated', label: 'Lead Updated', hint: 'Status changes on your leads' },
  { key: 'comments', label: 'Comments', hint: 'Notes from manager or team' },
  { key: 'housing_leads', label: 'Housing Leads', hint: 'New Housing.com enquiries' },
  { key: 'facebook_leads', label: 'Facebook Leads', hint: 'New Meta lead ads' },
  { key: 'reminders', label: 'Reminders', hint: 'Follow-up reminders and overdue alerts' },
  { key: 'marketing', label: 'Marketing', hint: 'Campaign and promo alerts' },
  { key: 'system_alerts', label: 'System Alerts', hint: 'Maintenance and admin broadcasts' },
  { key: 'push_enabled', label: 'Push Notifications', hint: 'Android Chrome / installed PWA' },
];

export default function NotificationSettingsPage() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);

  usePushNotifications(Boolean(prefs?.push_enabled));

  useEffect(() => {
    api.get('/notifications/preferences').then((r) => setPrefs(r.data)).catch(() => {
      setPrefs({
        lead_assigned: true,
        lead_updated: true,
        comments: true,
        housing_leads: true,
        facebook_leads: true,
        reminders: true,
        marketing: true,
        system_alerts: true,
        push_enabled: true,
      });
    });
  }, []);

  const updatePref = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    try {
      await api.patch('/notifications/preferences', { [key]: value });
      if (key === 'push_enabled' && value && Platform.OS === 'web' && typeof Notification !== 'undefined') {
        await Notification.requestPermission();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title="Notification Settings" subtitle="Choose what you receive on mobile" />
      {!prefs ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {TOGGLES.map((row) => (
            <View
              key={row.key}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{row.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{row.hint}</Text>
              </View>
              <Switch
                value={Boolean(prefs[row.key])}
                onValueChange={(v) => updatePref(row.key, v)}
                trackColor={{ false: colors.border, true: colors.primary + '80' }}
                thumbColor={prefs[row.key] ? colors.primary : '#f4f3f4'}
              />
            </View>
          ))}
          {user?.role === 'admin' ? (
            <Pressable
              style={[styles.broadcast, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
              onPress={() => {
                if (typeof window === 'undefined') return;
                const title = window.prompt('Broadcast title');
                if (!title) return;
                const message = window.prompt('Broadcast message');
                if (!message) return;
                api.post('/notifications/broadcast', { title, message }).then(() => {
                  alert('Broadcast sent to all active employees.');
                });
              }}
            >
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Admin: Send broadcast</Text>
            </Pressable>
          ) : null}
          {saving ? <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center' }}>Saving...</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  broadcast: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
});
