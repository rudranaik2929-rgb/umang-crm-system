import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken } from '../lib/api';

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  role?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  exchangeSession: (credentials: any) => Promise<User | null>;
  setRole: (role: string) => Promise<void>;
  actAs: (employeeId: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
  exchangeSession: async () => null,
  setRole: async () => {},
  actAs: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    await setToken(null);
    setUser(null);
  }, []);

  const exchangeSession = useCallback(async (credentials: any): Promise<User | null> => {
    try {
      const r = await api.post('/auth/session', credentials);
      if (r.data?.session_token) {
        await setToken(r.data.session_token);
      }
      setUser(r.data.user);
      return r.data.user as User;
    } catch (e) {
      console.warn('exchangeSession failed', e);
      return null;
    }
  }, []);

  const setRoleFn = useCallback(async (role: string) => {
    const r = await api.post('/auth/set-role', { role });
    setUser(r.data);
  }, []);

  const actAs = useCallback(async (employeeId: string | null) => {
    const r = await api.post('/auth/act-as', { employee_id: employeeId });
    setUser(r.data);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout, exchangeSession, setRole: setRoleFn, actAs }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
