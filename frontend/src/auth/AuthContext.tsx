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

export type ExchangeResult =
  | { status: 'ok'; user: User }
  | { status: 'invalid' }
  | { status: 'shift_required'; active_device?: string; message?: string };

/** Result of the first step of the OTP login: credentials checked, code emailed. */
export type OtpRequestResult =
  | { status: 'sent'; challengeId: string; sentTo: string; message: string }
  | { status: 'invalid' };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  locationStatus: 'idle' | 'checking' | 'granted' | 'denied' | 'unsupported';
  requestLocationAccess: () => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  exchangeSession: (credentials: {
    email: string;
    password: string;
    force_shift?: boolean;
    device_label?: string;
  }) => Promise<ExchangeResult>;
  requestOtp: (credentials: {
    email: string;
    password: string;
    device_label?: string;
  }) => Promise<OtpRequestResult>;
  verifyOtp: (params: {
    challengeId: string;
    code: string;
    device_label?: string;
    force_shift?: boolean;
  }) => Promise<ExchangeResult>;
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
  exchangeSession: async () => ({ status: 'invalid' }),
  requestOtp: async () => ({ status: 'invalid' }),
  verifyOtp: async () => ({ status: 'invalid' }),
  setRole: async () => {},
  actAs: async () => {},
});

function parseShiftDetail(detail: any): { active_device?: string; message?: string } | null {
  if (!detail) return null;
  if (typeof detail === 'object' && detail.requires_shift) {
    return {
      active_device: typeof detail.active_device === 'string' ? detail.active_device : undefined,
      message: typeof detail.message === 'string' ? detail.message : undefined,
    };
  }
  return null;
}

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
      const detail = e?.response?.data?.detail;
      const moved =
        e?.response?.status === 401 &&
        typeof detail === 'string' &&
        /session moved|another device/i.test(detail);
      setUser(null);
      setSnapshot(USER_SNAPSHOT_KEY, null);
      if (moved) {
        await setToken(null);
        clearSnapshots();
      }
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

  // Lightweight heartbeat so the admin "Who's logged in now" panel can tell an
  // idle-but-open tab apart from a closed one. Sends no data — just presence.
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const beat = () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      api.get('/auth/heartbeat').catch(() => {});
    };
    beat();
    const interval = setInterval(beat, 60_000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [user?.user_id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMoved = () => {
      setUser(null);
      setSnapshot(USER_SNAPSHOT_KEY, null);
    };
    window.addEventListener('umang:session-moved', onMoved);
    return () => window.removeEventListener('umang:session-moved', onMoved);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    clearSnapshots();
    await setToken(null);
    setUser(null);
    setSnapshot(USER_SNAPSHOT_KEY, null);
  }, []);

  const exchangeSession = useCallback(async (credentials: {
    email: string;
    password: string;
    force_shift?: boolean;
    device_label?: string;
  }): Promise<ExchangeResult> => {
    if (!credentials || typeof credentials !== 'object' || !credentials.email) {
      return { status: 'invalid' };
    }
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
        return { status: 'ok', user: r.data.user as User };
      } catch (e: any) {
        lastError = e;
        const shift = parseShiftDetail(e?.response?.data?.detail);
        if (e?.response?.status === 409 && shift) {
          return {
            status: 'shift_required',
            active_device: shift.active_device,
            message: shift.message,
          };
        }
        if (e?.response?.status === 401) {
          console.warn('exchangeSession failed: invalid credentials');
          return { status: 'invalid' };
        }
        if (attempt < maxAttempts && isTransientApiError(e)) {
          console.warn(`exchangeSession attempt ${attempt}/${maxAttempts} — server not ready, retrying…`, BACKEND);
          await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
        }
        console.warn('exchangeSession failed', e?.response?.data?.detail || e);
        break;
      }
    }

    const e = lastError;
    const msg = e?.message || '';
    const timedOut = e?.code === 'ECONNABORTED' || msg.toLowerCase().includes('timeout');
    if (!e?.response && (msg.includes('Network Error') || e?.code === 'ERR_NETWORK' || timedOut)) {
      throw new Error(
        'Cannot reach the CRM server. Check your internet connection and try again.',
      );
    }
    if (e?.response?.status === 401) return { status: 'invalid' };
    const detail = e?.response?.data?.detail;
    throw new Error(typeof detail === 'string' ? detail : 'Could not sign in. Check email/password and try again.');
  }, []);

  const requestOtp = useCallback(async (credentials: {
    email: string;
    password: string;
    device_label?: string;
  }): Promise<OtpRequestResult> => {
    await warmUpBackend();
    try {
      const r = await api.post(
        '/auth/otp/request',
        {
          email: credentials.email,
          password: credentials.password,
          device_label: credentials.device_label,
        },
        { timeout: 90000 },
      );
      return {
        status: 'sent',
        challengeId: String(r.data?.challenge_id || ''),
        sentTo: String(r.data?.sent_to || r.data?.sent_to_masked || ''),
        message: String(r.data?.message || 'A login code has been sent to the administrator email.'),
      };
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) return { status: 'invalid' };
      const detail = e?.response?.data?.detail;
      if (e?.response && typeof detail === 'string') {
        // Surfaces actionable server messages (e.g. email not configured).
        throw new Error(detail);
      }
      if (!e?.response) {
        throw new Error('Cannot reach the CRM server. Check your internet connection and try again.');
      }
      throw new Error('Could not start sign-in. Please try again.');
    }
  }, []);

  const verifyOtp = useCallback(async (params: {
    challengeId: string;
    code: string;
    device_label?: string;
    force_shift?: boolean;
  }): Promise<ExchangeResult> => {
    try {
      const r = await api.post(
        '/auth/otp/verify',
        {
          challenge_id: params.challengeId,
          code: params.code,
          device_label: params.device_label,
          force_shift: !!params.force_shift,
        },
        { timeout: 90000 },
      );
      if (r.data?.session_token) {
        await setToken(r.data.session_token);
      }
      setUser(r.data.user);
      setSnapshot(USER_SNAPSHOT_KEY, r.data.user);
      return { status: 'ok', user: r.data.user as User };
    } catch (e: any) {
      const status = e?.response?.status;
      const shift = parseShiftDetail(e?.response?.data?.detail);
      if (status === 409 && shift) {
        return {
          status: 'shift_required',
          active_device: shift.active_device,
          message: shift.message,
        };
      }
      const detail = e?.response?.data?.detail;
      if (typeof detail === 'string') throw new Error(detail);
      if (!e?.response) {
        throw new Error('Cannot reach the CRM server. Check your internet connection and try again.');
      }
      throw new Error('Could not verify the code. Please try again.');
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
      user, loading, locationStatus, requestLocationAccess, refresh, logout, exchangeSession,
      requestOtp, verifyOtp, setRole: setRoleFn, actAs,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
