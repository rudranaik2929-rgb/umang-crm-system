import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || 'https://umang-crm-systemumang-home-tech.onrender.com').replace(/\/$/, '');

export const api = axios.create({
    baseURL: `${BACKEND_URL}/api`,
    withCredentials: true,
});

const TOKEN_KEY = 'umang_session_token';
const ACT_AS_KEY = 'umang_acting_as_id';

async function getToken(): Promise<string | null> {
    try {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  return window.localStorage.getItem(TOKEN_KEY);
          }
          return await AsyncStorage.getItem(TOKEN_KEY);
    } catch {
          return null;
    }
}

async function getActAsId(): Promise<string | null> {
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            return window.localStorage.getItem(ACT_AS_KEY);
        }
        return await AsyncStorage.getItem(ACT_AS_KEY);
    } catch { return null; }
}

export async function setToken(t: string | null) {
    try {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  if (t) window.localStorage.setItem(TOKEN_KEY, t);
                  else window.localStorage.removeItem(TOKEN_KEY);
                  return;
          }
          if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
          else await AsyncStorage.removeItem(TOKEN_KEY);
    } catch {}
}

export async function setActAsId(id: string | null) {
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            if (id) window.localStorage.setItem(ACT_AS_KEY, id);
            else window.localStorage.removeItem(ACT_AS_KEY);
            return;
        }
        if (id) await AsyncStorage.setItem(ACT_AS_KEY, id);
        else await AsyncStorage.removeItem(ACT_AS_KEY);
    } catch {}
}

api.interceptors.request.use(async (config) => {
    const t = await getToken();
    const actAs = await getActAsId();
    config.headers = config.headers || {};
    if (t) {
          (config.headers as any)['Authorization'] = `Bearer ${t}`;
    }
    if (actAs) {
        (config.headers as any)['X-Acting-As'] = actAs;
    }
    return config;
});

export const BACKEND = BACKEND_URL;

export default api;
