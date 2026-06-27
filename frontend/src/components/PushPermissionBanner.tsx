import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { registerPushToken } from '../notifications/usePushNotifications';

function currentPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Shown to every user on web until they allow browser/mobile notifications. */
export function PushPermissionBanner() {
  const { colors } = useTheme();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('granted');
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(currentPermission());
  }, []);

  if (Platform.OS !== 'web') return null;
  if (dismissed) return null;
  if (permission === 'granted' || permission === 'unsupported') return null;

  const denied = permission === 'denied';

  const onAllow = async () => {
    if (denied) {
      // Browser blocks re-prompt once denied — guide the user to re-enable.
      if (typeof window !== 'undefined') {
        window.alert(
          'Notifications are blocked in your browser.\n\n' +
            'Tap the lock/⋮ icon next to the address bar → Site settings → Notifications → Allow, ' +
            'then reload this page.',
        );
      }
      return;
    }
    setBusy(true);
    try {
      const ok = await registerPushToken();
      setPermission(currentPermission());
      if (ok) setDismissed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.primary + '55' }]}>
      <Ionicons name="notifications-outline" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>
          {denied ? 'Notifications are turned off' : 'Turn on notifications'}
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          {denied
            ? 'You blocked notifications. Re-enable them in your browser so lead assignments reach your phone.'
            : 'Allow notifications so new lead assignments reach you on mobile even when the app is closed.'}
        </Text>
      </View>
      <Pressable onPress={onAllow} disabled={busy} style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
        <Text style={styles.btnText}>{denied ? 'How to fix' : busy ? 'Please wait…' : 'Allow'}</Text>
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} hitSlop={8} style={styles.close}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  title: { fontSize: 13, fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  close: { padding: 4 },
});
