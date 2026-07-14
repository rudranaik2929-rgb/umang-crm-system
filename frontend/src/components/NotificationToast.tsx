import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { useNotifications } from '../notifications/NotificationContext';
import { leadDeepLinkPath } from '../lib/openLeadNavigation';
import type { CrmNotification } from '../notifications/types';
import { TYPE_ICONS } from '../notifications/types';

const TOAST_MIN_MS = 8000;
const MAX_VISIBLE = 4;

type QueuedToast = CrmNotification & { shownAt: number };

export function NotificationToast() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { items } = useNotifications();
  const [queue, setQueue] = useState<QueuedToast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    primedRef.current = false;
    seenRef.current.clear();
    setQueue([]);
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  }, [user?.user_id]);

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setQueue((prev) => prev.filter((n) => n.notification_id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: string, shownAt: number) => {
      const elapsed = Date.now() - shownAt;
      const wait = Math.max(TOAST_MIN_MS - elapsed, 0);
      const timer = setTimeout(() => dismiss(id), wait);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    if (!items.length) return;

    if (!primedRef.current) {
      // Only skip already-read items on first paint so unread (follow-ups etc.) still toast on dashboard.
      items.forEach((n) => {
        if (n.is_read) seenRef.current.add(n.notification_id);
      });
      primedRef.current = true;
    }

    const fresh = items.filter((n) => {
      if (!n.notification_id || seenRef.current.has(n.notification_id)) return false;
      if (n.is_read) return false;
      const meta = (n.metadata || {}) as Record<string, unknown>;
      const toastable =
        Boolean(meta.assignment_summary)
        || n.type === 'lead_assigned'
        || n.type === 'follow_up_reminder'
        || n.type === 'follow_up_overdue'
        || n.type === 'lead_reassigned_removed'
        || n.type === 'broadcast'
        || n.priority === 'high'
        || n.priority === 'urgent';
      return toastable;
    });
    if (!fresh.length) return;

    fresh.forEach((n) => seenRef.current.add(n.notification_id));
    const stamped: QueuedToast[] = fresh.map((n) => ({ ...n, shownAt: Date.now() }));

    setQueue((prev) => {
      const merged = [...stamped, ...prev];
      const unique: QueuedToast[] = [];
      const ids = new Set<string>();
      for (const row of merged) {
        if (ids.has(row.notification_id)) continue;
        ids.add(row.notification_id);
        unique.push(row);
        if (unique.length >= MAX_VISIBLE) break;
      }
      return unique;
    });

    stamped.forEach((n) => scheduleDismiss(n.notification_id, n.shownAt));
  }, [items, scheduleDismiss]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  const openNotification = (n: QueuedToast) => {
    dismiss(n.notification_id);
    if (n.lead_id) {
      router.push(leadDeepLinkPath(n.lead_id, user?.role, user?.email, user?.allowed_pages) as any);
    } else {
      router.push('/(app)/notifications' as any);
    }
  };

  if (!queue.length) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {queue.map((n) => {
        const icon = TYPE_ICONS[n.type] || 'notifications-outline';
        return (
          <Pressable
            key={n.notification_id}
            onPress={() => openNotification(n)}
            style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.primary + '55' }]}
            testID={`crm-notification-toast-${n.notification_id}`}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name={icon as any} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {n.title}
              </Text>
              <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={2}>
                {n.message}
              </Text>
            </View>
            <Pressable onPress={() => dismiss(n.notification_id)} hitSlop={8} style={styles.close}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 72,
    right: 16,
    zIndex: 9999,
    gap: 10,
    maxWidth: 360,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    width: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13, fontWeight: '700' },
  message: { fontSize: 11, marginTop: 3, lineHeight: 15 },
  close: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
