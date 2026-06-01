import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, setActAsId, warmUpBackend, clearSnapshots } from '../lib/api';

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  role?: string | null;
  acting_as_employee_id?: string | null;
  allowed_pages?: string[] | null;
  dashboard_type?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  locationStatus: 'checking' | 'granted' | 'denied';
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  exchangeSession: (credentials: any) => Promise<User | null>;
  setRole: (role: string) => Promise<void>;
  actAs: (employeeId: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  locationStatus: 'granted',
  refresh: async () => {},
  logout: async () => {},
  exchangeSession: async () => null,
  setRole: async () => {},
  actAs: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationStatus] = useState<'checking' | 'granted' | 'denied'>('granted');

  const refresh = useCallback(async () => {
    try {
      const r = await api.get('/auth/me');
      setUser(r.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wake a sleeping (cold) backend immediately so the first auth/dashboard
    // request doesn't pay the full cold-start penalty.
    warmUpBackend();
    // One-time cleanup: remove old localStorage tokens that cause cross-tab bleeding
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('umang_session_token');
        window.localStorage.removeItem('umang_acting_as_id');
      }
    } catch {}
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    clearSnapshots();
    await setToken(null);
    setUser(null);
  }, []);

  const exchangeSession = useCallback(async (credentials: { email: string; password: string }): Promise<User | null> => {
    try {
      const r = await api.post('/auth/session', credentials);
      if (r.data?.session_token) {
        await setToken(r.data.session_token);
      }
      setUser(r.data.user);
      return r.data.user as User;
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      console.warn('exchangeSession failed', detail || e);
      return null;
    }
  }, []);

  const setRoleFn = useCallback(async (role: string) => {
    const r = await api.post('/auth/set-role', { role });
    setUser(r.data);
  }, []);

  const actAs = useCallback(async (employeeId: string | null) => {
    // We save this locally to support multiple people on one account
    await setActAsId(employeeId);
    const r = await api.post('/auth/act-as', { employee_id: employeeId });
    setUser(r.data);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, locationStatus, refresh, logout, exchangeSession, setRole: setRoleFn, actAs }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
