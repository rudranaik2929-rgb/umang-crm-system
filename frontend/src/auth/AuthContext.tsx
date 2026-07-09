import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { api, BACKEND, setToken, setActAsId, warmUpBackend, clearSnapshots, getSnapshot, setSnapshot, USER_SNAPSHOT_KEY, isTransientApiError } from '../lib/api';
import { useEmployeeLocation } from '../hooks/useEmployeeLocation';
import { registerPushToken } from '../notifications/usePushNotifications';

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  role?: string | null;
  employee_id?: string | null;
  acting_as_employee_id?: string | null;
  allowed_pages?: string[] | null;
  dashboard_type?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  locationStatus: 'idle' | 'checking' | 'granted' | 'denied' | 'unsupported';
  requestLocationAccess: () => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  exchangeSession: (credentials: any) => Promise<User | null>;
  setRole: (role: string) => Promise<void>;
  actAs: (employeeId: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  locationStatus: 'idle',
  requestLocationAccess: () => {},
  refresh: async () => {},
  logout: async () => {},
  exchangeSession: async () => null,
  setRole: async () => {},
  actAs: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const cachedUser = getSnapshot<User>(USER_SNAPSHOT_KEY);
  const [user, setUser] = useState<User | null>(cachedUser ?? null);
  const [loading, setLoading] = useState(!cachedUser);
  const { status: locationStatus, requestAccess: requestLocationAccess } = useEmployeeLocation(user);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get('/auth/me');
      setUser(r.data);
      setSnapshot(USER_SNAPSHOT_KEY, r.data);
    } catch (e: any) {
      const timedOut = e?.code === 'ECONNABORTED' || String(e?.message || '').toLowerCase().includes('timeout');
      const noResponse = !e?.response;
      if (timedOut || noResponse) {
        // Keep cached session when Render is waking up — do not force logout on slow cold start.
        return;
      }
      setUser(null);
      setSnapshot(USER_SNAPSHOT_KEY, null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await warmUpBackend();
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('umang_session_token');
          window.localStorage.removeItem('umang_acting_as_id');
        }
      } catch {}
      await refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    if (!user || Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!('Notification' in window) || Notification.permission === 'denied') return;
    registerPushToken().catch(() => {});
  }, [user?.user_id, user?.employee_id]);

  useEffect(() => {
    if (!user || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(refresh, 120_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [user?.user_id, refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    clearSnapshots();
    await setToken(null);
    setUser(null);
    setSnapshot(USER_SNAPSHOT_KEY, null);
  }, []);

  const exchangeSession = useCallback(async (credentials: { email: string; password: string }): Promise<User | null> => {
    const maxAttempts = 4;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await warmUpBackend(attempt > 1);
        const r = await api.post('/auth/session', credentials, { timeout: 90000 });
        if (r.data?.session_token) {
          await setToken(r.data.session_token);
        }
        setUser(r.data.user);
        setSnapshot(USER_SNAPSHOT_KEY, r.data.user);
        return r.data.user as User;
      } catch (e: any) {
        lastError = e;
        const detail = e?.response?.data?.detail;
        if (e?.response?.status === 401) {
          console.warn('exchangeSession failed: invalid credentials');
          return null;
        }
        if (attempt < maxAttempts && isTransientApiError(e)) {
          console.warn(`exchangeSession attempt ${attempt}/${maxAttempts} — server not ready, retrying…`, BACKEND);
          await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
        }
        console.warn('exchangeSession failed', detail || e);
        break;
      }
    }

    const e = lastError;
    const msg = e?.message || '';
    const timedOut = e?.code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout');
    if (!e?.response && (msg.includes('Network Error') || e?.code === 'ERR_NETWORK' || timedOut)) {
      throw new Error(
        'Server is still waking up on Render. Wait about a minute, then tap Log in again — the app will retry automatically.',
      );
    }
    if (e?.response?.status === 401) return null;
    const detail = e?.response?.data?.detail;
    throw new Error(typeof detail === 'string' ? detail : 'Could not sign in. Check email/password and try again.');
  }, []);

  const setRoleFn = useCallback(async (role: string) => {
    const r = await api.post('/auth/set-role', { role });
    setUser(r.data);
    setSnapshot(USER_SNAPSHOT_KEY, r.data);
  }, []);

  const actAs = useCallback(async (employeeId: string | null) => {
    await setActAsId(employeeId);
    const r = await api.post('/auth/act-as', { employee_id: employeeId });
    setUser(r.data);
    setSnapshot(USER_SNAPSHOT_KEY, r.data);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, locationStatus, requestLocationAccess, refresh, logout, exchangeSession, setRole: setRoleFn, actAs,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
