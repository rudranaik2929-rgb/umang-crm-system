import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, BACKEND, setToken, setActAsId, warmUpBackend, clearSnapshots, getSnapshot, setSnapshot, USER_SNAPSHOT_KEY } from '../lib/api';
import { useEmployeeLocation } from '../hooks/useEmployeeLocation';

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
    try {
      await warmUpBackend();
      const r = await api.post('/auth/session', credentials, { timeout: 90000 });
      if (r.data?.session_token) {
        await setToken(r.data.session_token);
      }
      setUser(r.data.user);
      setSnapshot(USER_SNAPSHOT_KEY, r.data.user);
      return r.data.user as User;
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const msg = e?.message || '';
      const timedOut = e?.code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout');
      if (!e?.response && (msg.includes('Network Error') || e?.code === 'ERR_NETWORK' || timedOut)) {
        console.warn('exchangeSession failed: cannot reach API', BACKEND, e);
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        const wwwHint = host.startsWith('www.')
          ? ' Your site uses www — on Render set CORS_ORIGINS to include both https://umanghometechllp.in and https://www.umanghometechllp.in, then redeploy the backend.'
          : '';
        throw new Error(
          timedOut
            ? `Server is waking up (Render cold start). Wait 30–60 seconds and try Log in again.${wwwHint}`
            : `Cannot reach the CRM server (${BACKEND}). On Vercel set EXPO_PUBLIC_BACKEND_URL to your Render URL and redeploy.${wwwHint}`,
        );
      }
      console.warn('exchangeSession failed', detail || e);
      return null;
    }
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
