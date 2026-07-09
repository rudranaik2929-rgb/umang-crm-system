import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyLiveDataChanged } from './liveSync';

// Default: Render URL until api.umanghometechllp.in custom domain is live on Render.
const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || 'https://umang-crm-systemumang-home-tech.onrender.com').replace(/\/$/, '');

const REQUEST_TIMEOUT_MS = 15000;
const DASHBOARD_TIMEOUT_MS = 90000;
const AUTH_TIMEOUT_MS = 90000;
export const IMPORT_TIMEOUT_MS = 300000;
/** Short TTL for non-live endpoints only (auth, static config). */
const GET_CACHE_MS = 15000;
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const SNAPSHOT_STORAGE_KEY = 'umang_snapshots_v1';
const GET_STORAGE_KEY = 'umang_get_cache_v1';
const USER_SNAPSHOT_KEY = 'auth-user';

export const api = axios.create({
    baseURL: `${BACKEND_URL}/api`,
    withCredentials: true,
    timeout: REQUEST_TIMEOUT_MS,
});

const _getCache = new Map<string, { ts: number; data: unknown }>();
const _inflightGets = new Map<string, Promise<any>>();

function getCacheKey(url: string, params?: Record<string, unknown>) {
    return `${url}?${JSON.stringify(params || {})}`;
}

function readPersistedMap(key: string): Record<string, { ts: number; data: unknown }> {
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const raw = window.sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : {};
        }
    } catch {}
    return {};
}

function writePersistedMap(key: string, value: Record<string, { ts: number; data: unknown }>) {
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.sessionStorage.setItem(key, JSON.stringify(value));
        }
    } catch {}
}

function hydrateGetCacheFromStorage() {
    const stored = readPersistedMap(GET_STORAGE_KEY);
    const now = Date.now();
    for (const [k, v] of Object.entries(stored)) {
        if (v?.ts && now - v.ts < GET_CACHE_MS) {
            _getCache.set(k, v);
        }
    }
}

function persistGetCacheEntry(key: string, entry: { ts: number; data: unknown }) {
    const stored = readPersistedMap(GET_STORAGE_KEY);
    stored[key] = entry;
    const now = Date.now();
    for (const k of Object.keys(stored)) {
        if (!stored[k]?.ts || now - stored[k].ts >= GET_CACHE_MS) delete stored[k];
    }
    writePersistedMap(GET_STORAGE_KEY, stored);
}

hydrateGetCacheFromStorage();

export function clearGetCache() {
    _getCache.clear();
    _inflightGets.clear();
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.sessionStorage.removeItem(GET_STORAGE_KEY);
        }
    } catch {}
}

/** Call after local mutations so every open screen reloads immediately. */
export function broadcastDataChanged() {
    clearGetCache();
    notifyLiveDataChanged();
}

const LIVE_GET_PREFIXES = ['/stats', '/leads', '/employees', '/activities', '/bookings', '/loans', '/visits', '/notifications'];

function isLiveGetUrl(url: string) {
    const path = String(url || '').split('?')[0];
    if (path === '/notifications/unread-count') return false;
    if (path === '/stats/dashboard-bundle' || path === '/stats/me-bundle') return false;
    return LIVE_GET_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

const _axiosGet = api.get.bind(api);
api.get = function getWithCache(url: string, config?: any) {
    if (config?.bypassCache || isLiveGetUrl(url)) {
        return _axiosGet(url, config);
    }
    const key = getCacheKey(url, config?.params);
    const hit = _getCache.get(key);
    if (hit && Date.now() - hit.ts < GET_CACHE_MS) {
        return Promise.resolve({
            data: hit.data,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: { ...(config || {}), url, method: 'get' },
        });
    }
    const pending = _inflightGets.get(key);
    if (pending) return pending;
    const promise = _axiosGet(url, config)
        .then((res) => {
            const entry = { ts: Date.now(), data: res.data };
            _getCache.set(key, entry);
            persistGetCacheEntry(key, entry);
            _inflightGets.delete(key);
            return res;
        })
        .catch((err) => {
            _inflightGets.delete(key);
            throw err;
        });
    _inflightGets.set(key, promise);
    return promise;
} as typeof api.get;

api.interceptors.response.use(
    (response) => {
        const method = String(response.config?.method || 'get').toLowerCase();
        if (method !== 'get' && method !== 'head') {
            broadcastDataChanged();
        }
        return response;
    },
    async (error) => {
    const config: any = error?.config;
    if (!config || config.__isRetry) {
        return Promise.reject(error);
    }
    const status = error?.response?.status;
    const method = String(config.method || 'get').toLowerCase();
    const noResponse = !error?.response;
    const transientStatus = status === 502 || status === 503 || status === 504;
    const isSafe = method === 'get' || method === 'head';
    const isFormUpload = typeof FormData !== 'undefined' && config.data instanceof FormData;
    const isImportUpload = String(config.url || '').includes('/leads/import');

    // Never retry multipart uploads — FormData body cannot be replayed (shows as "Network Error").
    const shouldRetry = !isFormUpload && !isImportUpload
        && ((noResponse && (isSafe || method === 'post')) || (transientStatus && isSafe));
    if (!shouldRetry) {
        return Promise.reject(error);
    }
    config.__isRetry = true;
    const authPath = String(config.url || '').includes('/auth/');
    const longRunning = isImportUpload
        || String(config.url || '').includes('/integrations/')
        || String(config.url || '').includes('/bookings');
    config.timeout = Math.max(
        Number(config.timeout) || 0,
        authPath ? AUTH_TIMEOUT_MS : (longRunning ? IMPORT_TIMEOUT_MS : 30000),
    );
    await new Promise((r) => setTimeout(r, 600));
    return api(config);
});

let warmUpPromise: Promise<boolean> | null = null;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ping Render until /api/health responds — handles cold starts before login. */
export async function warmUpBackend(force = false): Promise<boolean> {
    if (!force && warmUpPromise) return warmUpPromise;

    warmUpPromise = (async () => {
        const attempts = 8;
        for (let i = 0; i < attempts; i++) {
            try {
                await axios.get(`${BACKEND_URL}/`, { timeout: 20000 });
            } catch {
                // Render may return 502 while the container boots.
            }
            try {
                const health = await axios.get(`${BACKEND_URL}/api/health`, { timeout: 25000 });
                if (health.status === 200) return true;
            } catch {
                // keep retrying
            }
            if (i < attempts - 1) {
                await sleep(2500 + i * 2000);
            }
        }
        return false;
    })().finally(() => {
        setTimeout(() => { warmUpPromise = null; }, 2 * 60 * 1000);
    });

    return warmUpPromise;
}

export function isTransientApiError(e: any): boolean {
    const msg = String(e?.message || '').toLowerCase();
    const status = e?.response?.status;
    if (status === 401 || status === 403) return false;
    if (status === 502 || status === 503 || status === 504) return true;
    if (!e?.response) {
        return msg.includes('network error') || e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED' || msg.includes('timeout');
    }
    return false;
}

const KEEP_ALIVE_MS = 8 * 60 * 1000;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
    warmUpBackend();
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            axios.get(`${BACKEND_URL}/api/health`, { timeout: 10000 }).catch(() => undefined);
        }
    }, KEEP_ALIVE_MS);
}

const TOKEN_KEY = 'umang_session_token';
const ACT_AS_KEY = 'umang_acting_as_id';

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

export function hasSessionToken(): boolean {
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            return !!window.sessionStorage.getItem(TOKEN_KEY);
        }
    } catch {}
    return false;
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
    const url = String(config.url || '');
    if (url.includes('/auth/session') || url.includes('/auth/me')) {
        config.timeout = Math.max(Number(config.timeout) || 0, AUTH_TIMEOUT_MS);
    }
    if (url.includes('/stats/dashboard-bundle') || url.includes('/stats/me-bundle') || url.includes('/stats/dashboard')) {
        config.timeout = Math.max(Number(config.timeout) || 0, DASHBOARD_TIMEOUT_MS);
    }
    // Let the browser set multipart boundary for file uploads (Excel/CSV import).
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        delete (config.headers as Record<string, unknown>)['Content-Type'];
        delete (config.headers as Record<string, unknown>)['content-type'];
        config.timeout = Math.max(Number(config.timeout) || 0, IMPORT_TIMEOUT_MS);
    }
    if (url.includes('/leads/import')) {
        config.timeout = Math.max(Number(config.timeout) || 0, IMPORT_TIMEOUT_MS);
    }
    if (url.includes('/bookings') && (config.method === 'post' || config.method === 'patch')) {
        config.timeout = Math.max(Number(config.timeout) || 0, BOOKING_REQUEST_TIMEOUT_MS);
    }
    if (t) {
          (config.headers as any)['Authorization'] = `Bearer ${t}`;
    }
    if (actAs) {
        (config.headers as any)['X-Acting-As'] = actAs;
    }
    return config;
});

export const BACKEND = BACKEND_URL;

const _snapshotCache = new Map<string, any>();

function hydrateSnapshotsFromStorage() {
    const stored = readPersistedMap(SNAPSHOT_STORAGE_KEY);
    const now = Date.now();
    for (const [k, v] of Object.entries(stored)) {
        if (v?.ts && now - v.ts < SNAPSHOT_TTL_MS && v.data !== undefined) {
            _snapshotCache.set(k, v.data);
        }
    }
}

function persistSnapshot(key: string, value: any) {
    const stored = readPersistedMap(SNAPSHOT_STORAGE_KEY);
    stored[key] = { ts: Date.now(), data: value };
    const now = Date.now();
    for (const k of Object.keys(stored)) {
        if (!stored[k]?.ts || now - stored[k].ts >= SNAPSHOT_TTL_MS) delete stored[k];
    }
    writePersistedMap(SNAPSHOT_STORAGE_KEY, stored);
}

hydrateSnapshotsFromStorage();

export function getSnapshot<T = any>(key: string): T | undefined {
    return _snapshotCache.get(key);
}

export function setSnapshot(key: string, value: any) {
    _snapshotCache.set(key, value);
    persistSnapshot(key, value);
}

export function clearSnapshots() {
    _snapshotCache.clear();
    clearGetCache();
    try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.sessionStorage.removeItem(SNAPSHOT_STORAGE_KEY);
        }
    } catch {}
}

export { LIVE_REFRESH_MS } from './liveSync';

export const META_INTEGRATION_TIMEOUT_MS = 180000;
export const AUTH_REQUEST_TIMEOUT_MS = AUTH_TIMEOUT_MS;
export const BOOKING_REQUEST_TIMEOUT_MS = 90000;

export function integrationErrorMessage(error: any, fallback: string): string {
    if (error?.code === 'ECONNABORTED' || String(error?.message || '').toLowerCase().includes('timeout')) {
        return `${fallback} The server took too long — Meta import runs form-by-form and may need 1–3 minutes. Deploy the latest backend, then try Import again.`;
    }
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) {
        return detail.map((item) => item?.msg || String(item)).filter(Boolean).join('; ');
    }
    return fallback;
}

export { USER_SNAPSHOT_KEY };

export default api;
