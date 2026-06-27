import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../../src/components/TopBar';
import { NotificationCard } from '../../src/components/NotificationCard';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/auth/AuthContext';
import { useNotifications } from '../../src/notifications/NotificationContext';
import { leadDeepLinkPath } from '../../src/lib/openLeadNavigation';
import { api } from '../../src/lib/api';
import type { CrmNotification, NotificationFilter } from '../../src/notifications/types';
import { FILTER_TYPE_MAP } from '../../src/notifications/types';

const FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'read', label: 'Read' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'lead_updates', label: 'Lead Updates' },
  { key: 'comments', label: 'Comments' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'housing', label: 'Housing' },
  { key: 'system', label: 'System' },
];

export default function NotificationsPage() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ lead?: string }>();
  const {
    items: contextItems,
    loading: contextLoading,
    hasMore,
    fetchList,
    loadMore,
    markRead,
    markAllRead,
    deleteNotification,
    unreadCount: contextUnread,
    error: contextError,
    refresh,
  } = useNotifications();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [pageItems, setPageItems] = useState<CrmNotification[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageUnread, setPageUnread] = useState(0);

  const loadPage = useCallback(async () => {
    if (!user) {
      setPageItems([]);
      setPageLoading(false);
      return;
    }
    setPageLoading(true);
    try {
      const params: Record<string, unknown> = { limit: 100, offset: 0 };
      if (search.trim()) params.search = search.trim();
      if (filter === 'unread') params.unread_only = true;
      if (filter === 'read') params.read_only = true;
      const typeKey = FILTER_TYPE_MAP[filter];
      if (typeKey) params.type = typeKey;

      const r = await api.get('/notifications', { params, bypassCache: true } as any);
      const batch = Array.isArray(r.data?.items) ? r.data.items : [];
      setPageItems(batch);
      setPageUnread(r.data?.unread_count ?? 0);
      setPageError(r.data?.error || null);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Could not load notifications';
      setPageError(String(msg));
      setPageItems([]);
    } finally {
      setPageLoading(false);
    }
  }, [user, search, filter]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      loadPage();
    }, [refresh, loadPage]),
  );

  useEffect(() => {
    const t = setTimeout(loadPage, filter === 'all' && !search ? 0 : 300);
    return () => clearTimeout(t);
  }, [filter, search, loadPage]);

  useEffect(() => {
    if (params.lead) {
      router.push(leadDeepLinkPath(String(params.lead), user?.role, user?.email, user?.allowed_pages) as any);
    }
  }, [params.lead]);

  const items = useMemo(() => {
    if (pageItems.length > 0) return pageItems;
    return contextItems;
  }, [pageItems, contextItems]);

  const loading = pageLoading && items.length === 0;
  const unreadCount = pageUnread > 0 ? pageUnread : contextUnread;
  const error = pageError || contextError;

  const onOpen = async (leadId?: string | null, id?: string) => {
    if (id) await markRead(id);
    if (leadId) {
      router.push(leadDeepLinkPath(leadId, user?.role, user?.email, user?.allowed_pages) as any);
    }
  };

  const onMarkAllRead = async () => {
    await markAllRead();
    await loadPage();
  };

  const onDelete = async (id: string) => {
    await deleteNotification(id);
    setPageItems((prev) => prev.filter((n) => n.notification_id !== id));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        rightAction={
          <Pressable
            onPress={() => router.push('/(app)/notification-settings' as any)}
            style={[styles.iconBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
          >
            <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        }
      />

      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search notifications..."
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, color: colors.text, fontSize: 14, marginLeft: 8 }}
          />
        </View>
        {unreadCount > 0 ? (
          <Pressable onPress={onMarkAllRead} style={[styles.markAll, { borderColor: colors.primary }]}>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, flexGrow: 0 }}>
        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary + '18' : colors.surfaceAlt,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={{ color: active ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 120) {
            loadMore();
          }
        }}
        scrollEventThrottle={400}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 48, paddingHorizontal: 24 }}>
            <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center' }}>
              {error ? error : 'No notifications yet'}
            </Text>
            {user?.employee_id ? (
              <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 11, textAlign: 'center' }}>
                Account: {user.email}
              </Text>
            ) : null}
            <Pressable
              onPress={() => {
                refresh();
                loadPage();
              }}
              style={{ marginTop: 12 }}
            >
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          items.map((n) => (
            <NotificationCard
              key={n.notification_id}
              item={n}
              onPress={() => onOpen(n.lead_id, n.notification_id)}
              onDelete={() => onDelete(n.notification_id)}
            />
          ))
        )}
        {hasMore && items.length > 0 ? (
          <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
            Scroll for more...
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  markAll: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
