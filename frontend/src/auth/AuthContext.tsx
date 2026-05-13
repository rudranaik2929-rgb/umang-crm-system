import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { api, setToken, setActAsId } from '../lib/api';

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
  locationStatus: 'checking',
  refresh: async () => {},
  logout: async () => {},
  exchangeSession: async () => null,
  setRole: async () => {},
  actAs: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationStatus, setLocationStatus] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [coords, setCoords] = useState<{ lat: number, lng: number } | null>(null);

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

  const checkLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: true }
    );
  }, []);

  const pingLocation = useCallback(async (lat: number, lng: number) => {
    try {
      await api.post('/auth/ping-location', { lat, lng });
    } catch (e) {
      console.warn('Failed to ping location', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    checkLocation();
  }, [refresh, checkLocation]);

  useEffect(() => {
    if (user && coords && locationStatus === 'granted') {
      pingLocation(coords.lat, coords.lng);
      const interval = setInterval(() => {
        navigator.geolocation.getCurrentPosition((pos) => {
          pingLocation(pos.coords.latitude, pos.coords.longitude);
        });
      }, 5 * 60 * 1000); // Ping every 5 minutes
      return () => clearInterval(interval);
    }
  }, [user, coords, locationStatus, pingLocation]);

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
    // We save this locally to support multiple people on one account
    await setActAsId(employeeId);
    const r = await api.post('/auth/act-as', { employee_id: employeeId });
    setUser(r.data);
  }, []);

  if (locationStatus === 'checking') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A1628', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#D4A843" />
        <Text style={{ color: '#94A3B8', marginTop: 16, fontSize: 14 }}>Verifying GPS Status...</Text>
      </View>
    );
  }

  if (locationStatus === 'denied') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A1628', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#EF444420', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Text style={{ fontSize: 40 }}>📍</Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 12 }}>GPS Access Required</Text>
        <Text style={{ color: '#94A3B8', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 32 }}>
          To ensure accountability for site visits and fieldwork, you must enable location services to use the Umang CRM.
        </Text>
        <Pressable 
          onPress={checkLocation}
          style={{ backgroundColor: '#D4A843', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 }}
        >
          <Text style={{ color: '#000', fontWeight: '700' }}>Retry Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, locationStatus, refresh, logout, exchangeSession, setRole: setRoleFn, actAs }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
