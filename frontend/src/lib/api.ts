import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
});

const TOKEN_KEY = 'umang_session_token';

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

api.interceptors.request.use(async (config) => {
  const t = await getToken();
  if (t) {
    config.headers = config.headers || {};
    (config.headers as any)['Authorization'] = `Bearer ${t}`;
  }
  return config;
});

export const BACKEND = BACKEND_URL;
