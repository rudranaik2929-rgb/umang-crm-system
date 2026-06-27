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

interface NotificationContextValue {
  items: CrmNotification[];
  unreadCount: number;
  loading: boolean;
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
  const { user } = useAuth();
  const [items, setItems] = useState<CrmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const listOpts = useRef<{ search?: string; filter?: NotificationFilter }>({});
  const recipientId = user?.acting_as_employee_id || user?.employee_id || user?.user_id;

  const refreshUnread = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api.get('/notifications/unread-count', { bypassCache: true } as any);
      setUnreadCount(r.data?.unread_count ?? 0);
    } catch {
      /* ignore */
    }
  }, [user]);

  const fetchList = useCallback(
    async (opts?: { search?: string; filter?: NotificationFilter; reset?: boolean }) => {
      if (!user) return;
      const reset = opts?.reset !== false;
      if (opts) {
        listOpts.current = {
          search: opts.search ?? listOpts.current.search,
          filter: opts.filter ?? listOpts.current.filter,
        };
      }
      const nextOffset = reset ? 0 : offset;
      if (reset) setLoading(true);
      try {
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
        const batch = data?.items || [];
        setItems((prev) => (reset ? batch : [...prev, ...batch]));
        setUnreadCount(data?.unread_count ?? 0);
        setOffset(nextOffset + batch.length);
        setHasMore(batch.length >= PAGE_SIZE);
      } finally {
        if (reset) setLoading(false);
      }
    },
    [user, offset],
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
    if (!user) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    refreshUnread();
    fetchList({ reset: true, filter: 'all' });
  }, [user?.user_id, user?.acting_as_employee_id]);

  useEffect(() => {
    if (!user) return;
    const unsubLive = subscribeLiveDataChanged(() => {
      refreshUnread();
    });
    const poll = setInterval(refreshUnread, 12000);
    return () => {
      unsubLive();
      clearInterval(poll);
    };
  }, [user, refreshUnread]);

  useEffect(() => {
    if (!user || !recipientId || !isSupabaseRealtimeConfigured()) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    const channel = sb
      .channel(`notifications:${recipientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${recipientId}`,
        },
        (payload) => {
          const row = payload.new as CrmNotification;
          if (!row?.notification_id) return;
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
  }, [user, recipientId]);

  const value = useMemo(
    () => ({
      items,
      unreadCount,
      loading,
      refresh,
      loadMore,
      hasMore,
      markRead,
      markAllRead,
      deleteNotification,
      fetchList,
    }),
    [items, unreadCount, loading, refresh, loadMore, hasMore, markRead, markAllRead, deleteNotification, fetchList],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
