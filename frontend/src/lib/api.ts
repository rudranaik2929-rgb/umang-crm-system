import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || 'https://umang-crm-systemumang-home-tech.onrender.com').replace(/\/$/, '');

// Render free-tier instances sleep after inactivity and can take 30-60s to wake.
// A generous timeout + one automatic retry prevents the very first request after
// login from failing/hanging forever with a "Network Error".
const REQUEST_TIMEOUT_MS = 60000;

export const api = axios.create({
    baseURL: `${BACKEND_URL}/api`,
    withCredentials: true,
    timeout: REQUEST_TIMEOUT_MS,
});

// Retry once on cold-start style failures (timeout, network drop, 502/503/504).
// Mutations (POST/PUT/PATCH/DELETE) are only retried when the request never
// reached the server (no response), to stay idempotent-safe.
api.interceptors.response.use(undefined, async (error) => {
    const config: any = error?.config;
    if (!config || config.__isRetry) {
        return Promise.reject(error);
    }
    const status = error?.response?.status;
    const method = String(config.method || 'get').toLowerCase();
    const noResponse = !error?.response;
    const transientStatus = status === 502 || status === 503 || status === 504;
    const isSafe = method === 'get' || method === 'head';

    const shouldRetry = (noResponse && (isSafe || method === 'post')) || (transientStatus && isSafe);
    if (!shouldRetry) {
        return Promise.reject(error);
    }
    config.__isRetry = true;
    await new Promise((r) => setTimeout(r, 1200));
    return api(config);
});

let warmUpPromise: Promise<void> | null = null;

// Fire-and-forget ping that wakes a sleeping backend so the first real request
// (login / dashboard) doesn't pay the full cold-start penalty. Deduplicated so
// repeated calls during startup only hit the server once.
export function warmUpBackend(): Promise<void> {
    if (warmUpPromise) return warmUpPromise;
    warmUpPromise = axios
        .get(`${BACKEND_URL}/`, { timeout: REQUEST_TIMEOUT_MS })
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
            // Allow a fresh warm-up later (e.g. after the app was backgrounded).
            setTimeout(() => { warmUpPromise = null; }, 5 * 60 * 1000);
        });
    return warmUpPromise;
}

const TOKEN_KEY = 'umang_session_token';
const ACT_AS_KEY = 'umang_acting_as_id';

// ============================================================
// MULTI-USER SESSION ISOLATION
// ============================================================
// sessionStorage is PER-TAB — each browser tab has its own.
// This means Tab1=Admin and Tab2=Manager will NEVER conflict.
// Each tab requires its own login. This is the correct behavior
// for a CRM used by 100+ employees.
// ============================================================

async function getToken(): Promise<string | null> {
    try {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  return window.sessionStorage.getItem(TOKEN_KEY);
          }
          return await AsyncStorage.getItem(TOKEN_KEY);
    } catch {
          return null;
    }
}

async function getActAsId(): Promise<string | null> {
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            return window.sessionStorage.getItem(ACT_AS_KEY);
        }
        return await AsyncStorage.getItem(ACT_AS_KEY);
    } catch { return null; }
}

export async function setToken(t: string | null) {
    try {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  if (t) {
                      window.sessionStorage.setItem(TOKEN_KEY, t);
                  } else {
                      window.sessionStorage.removeItem(TOKEN_KEY);
                  }
                  return;
          }
          if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
          else await AsyncStorage.removeItem(TOKEN_KEY);
    } catch {}
}

export async function setActAsId(id: string | null) {
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            if (id) {
                window.sessionStorage.setItem(ACT_AS_KEY, id);
            } else {
                window.sessionStorage.removeItem(ACT_AS_KEY);
            }
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

// ============================================================
// LIGHTWEIGHT STALE-WHILE-REVALIDATE CACHE
// ============================================================
// Keeps the last successful payload per key in memory so screens can render
// instantly on re-navigation while they refresh in the background. Cleared on
// logout to avoid leaking data across sessions/tabs.
const _snapshotCache = new Map<string, any>();

export function getSnapshot<T = any>(key: string): T | undefined {
    return _snapshotCache.get(key);
}

export function setSnapshot(key: string, value: any) {
    _snapshotCache.set(key, value);
}

export function clearSnapshots() {
    _snapshotCache.clear();
}

export default api;
