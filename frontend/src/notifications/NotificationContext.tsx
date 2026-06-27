import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { api } from '../lib/api';
import { subscribeLiveDataChanged } from '../lib/liveSync';
import { getSupabaseClient, isSupabaseRealtimeConfigured } from '../lib/supabaseClient';
import { useAuth } from '../auth/AuthContext';
import type { CrmNotification, NotificationFilter, NotificationListResponse } from './types';
import { FILTER_TYPE_MAP } from './types';
import { usePushNotifications } from './usePushNotifications';

interface NotificationContextValue {
  items: CrmNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  fetchList: (opts?: { search?: string; filter?: NotificationFilter; reset?: boolean }) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const PAGE_SIZE = 25;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<CrmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const listOpts = useRef<{ search?: string; filter?: NotificationFilter }>({});
  const offsetRef = useRef(0);
  const [pushEnabled, setPushEnabled] = useState(false);

  const recipientIds = useMemo(() => {
    const ids = new Set<string>();
    if (user?.acting_as_employee_id) ids.add(user.acting_as_employee_id);
    if (user?.employee_id) ids.add(user.employee_id);
    if (user?.user_id) ids.add(user.user_id);
    return [...ids];
  }, [user?.acting_as_employee_id, user?.employee_id, user?.user_id]);

  const refreshUnread = useCallback(async () => {
    if (!user || authLoading) return;
    try {
      const r = await api.get('/notifications/unread-count', { bypassCache: true } as any);
      setUnreadCount(r.data?.unread_count ?? 0);
    } catch {
      /* ignore */
    }
  }, [user, authLoading]);

  const fetchList = useCallback(
    async (opts?: { search?: string; filter?: NotificationFilter; reset?: boolean }) => {
      if (!user || authLoading) return;
      const reset = opts?.reset !== false;
      if (opts) {
        listOpts.current = {
          search: opts.search ?? listOpts.current.search,
          filter: opts.filter ?? listOpts.current.filter,
        };
      }
      const nextOffset = reset ? 0 : offsetRef.current;
      if (reset) setLoading(true);
      try {
        setError(null);
        const filter = listOpts.current.filter || 'all';
        const params: Record<string, unknown> = {
          limit: PAGE_SIZE,
          offset: nextOffset,
        };
        if (listOpts.current.search?.trim()) params.search = listOpts.current.search.trim();
        if (filter === 'unread') params.unread_only = true;
        if (filter === 'read') params.read_only = true;
        const typeKey = FILTER_TYPE_MAP[filter];
        if (typeKey) params.type = typeKey;

        const r = await api.get<NotificationListResponse>('/notifications', {
          params,
          bypassCache: true,
        } as any);
        const data = r.data;
        const batch = Array.isArray(data?.items) ? data.items : [];
        setItems((prev) => (reset ? batch : [...prev, ...batch]));
        setUnreadCount(data?.unread_count ?? 0);
        const newOffset = nextOffset + batch.length;
        offsetRef.current = newOffset;
        setOffset(newOffset);
        setHasMore(batch.length >= PAGE_SIZE);
        if (data?.error) setError(String(data.error));
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || 'Could not load notifications';
        setError(String(msg));
        console.warn('Failed to load notifications', e);
      } finally {
        if (reset) setLoading(false);
      }
    },
    [user, authLoading],
  );

  const refresh = useCallback(async () => {
    await Promise.all([fetchList({ reset: true }), refreshUnread()]);
  }, [fetchList, refreshUnread]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    await fetchList({ reset: false });
  }, [fetchList, hasMore, loading]);

  const markRead = useCallback(async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    setItems((prev) =>
      prev.map((n) => (n.notification_id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.post('/notifications/read-all');
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
    setUnreadCount(0);
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    await api.delete(`/notifications/${id}`);
    setItems((prev) => {
      const removed = prev.find((n) => n.notification_id === id);
      if (removed && !removed.is_read) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.filter((n) => n.notification_id !== id);
    });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setItems([]);
      setUnreadCount(0);
      setError(null);
      return;
    }
    refresh();
  }, [user?.user_id, user?.employee_id, user?.acting_as_employee_id, authLoading]);

  useEffect(() => {
    if (!user || authLoading) return;
    const unsubLive = subscribeLiveDataChanged(() => {
      refresh();
    });
    const poll = setInterval(refresh, 5000);
    return () => {
      unsubLive();
      clearInterval(poll);
    };
  }, [user, authLoading, refresh]);

  useEffect(() => {
    if (!user || authLoading || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, authLoading, refresh]);

  useEffect(() => {
    if (!user || authLoading) {
      setPushEnabled(false);
      return;
    }
    api
      .get('/notifications/preferences', { bypassCache: true } as any)
      .then((r) => setPushEnabled(Boolean(r.data?.push_enabled ?? true)))
      .catch(() => setPushEnabled(true));
  }, [user?.user_id, user?.employee_id, user?.acting_as_employee_id, authLoading]);

  usePushNotifications(pushEnabled, refresh);

  useEffect(() => {
    if (!user || authLoading || recipientIds.length === 0 || !isSupabaseRealtimeConfigured()) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    const stableIds = recipientIds.filter((id) => id && !/\s/.test(id));
    if (stableIds.length === 0) return;

    const filter =
      stableIds.length === 1
        ? `user_id=eq.${stableIds[0]}`
        : `user_id=in.(${stableIds.join(',')})`;

    const channel = sb
      .channel(`notifications:${stableIds.join('-')}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter,
        },
        (payload) => {
          const row = payload.new as CrmNotification;
          if (!row?.notification_id) return;
          if (row.user_id && !recipientIds.includes(row.user_id)) return;
          setItems((prev) => {
            if (prev.some((n) => n.notification_id === row.notification_id)) return prev;
            return [row, ...prev];
          });
          if (!row.is_read) setUnreadCount((c) => c + 1);
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [user, authLoading, recipientIds]);

  const value = useMemo(
    () => ({
      items,
      unreadCount,
      loading,
      error,
      refresh,
      loadMore,
      hasMore,
      markRead,
      markAllRead,
      deleteNotification,
      fetchList,
    }),
    [items, unreadCount, loading, error, refresh, loadMore, hasMore, markRead, markAllRead, deleteNotification, fetchList],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
