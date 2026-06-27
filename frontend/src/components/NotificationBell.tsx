import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { leadDeepLinkPath } from '../lib/openLeadNavigation';
import { useNotifications } from '../notifications/NotificationContext';
import { NotificationCard } from './NotificationCard';

export function NotificationBell() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { items, unreadCount, refresh, markRead, markAllRead, deleteNotification } = useNotifications();
  const [open, setOpen] = useState(false);

  const openLead = async (leadId?: string | null, notificationId?: string) => {
    if (notificationId) await markRead(notificationId);
    setOpen(false);
    if (leadId) {
      router.push(leadDeepLinkPath(leadId, user?.role, user?.email, user?.allowed_pages) as any);
    } else {
      router.push('/(app)/notifications' as any);
    }
  };

  return (
    <>
      <Pressable
        testID="notification-bell"
        onPress={() => {
          setOpen(true);
          refresh();
        }}
        style={[styles.bell, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
      >
        <Ionicons name="notifications-outline" size={20} color={colors.text} />
        {unreadCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: colors.negative }]}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}
            {...(Platform.OS === 'web' ? { onClick: (e: any) => e?.stopPropagation?.() } as any : {})}
          >
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {unreadCount > 0 ? (
                  <Pressable onPress={markAllRead} style={[styles.linkBtn, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>Mark all read</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setOpen(false);
                    router.push('/(app)/notifications' as any);
                  }}
                  style={[styles.linkBtn, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>See all</Text>
                </Pressable>
              </View>
            </View>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {items.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Ionicons name="notifications-off-outline" size={32} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 13 }}>No notifications yet</Text>
                </View>
              ) : (
                items.slice(0, 8).map((n) => (
                  <NotificationCard
                    key={n.notification_id}
                    item={n}
                    compact
                    onPress={() => openLead(n.lead_id, n.notification_id)}
                    onDelete={() => deleteNotification(n.notification_id)}
                  />
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'web' ? 70 : 48,
    paddingRight: 16,
  },
  dropdown: {
    width: 360,
    maxWidth: '92vw',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  linkBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
});
