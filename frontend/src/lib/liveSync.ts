import { Platform } from 'react-native';

/** How often open screens poll for changes made by other users. */
export const LIVE_REFRESH_MS = 30000;

const STORAGE_KEY = 'umang_live_rev';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Notify all mounted screens in this tab to reload live data. */
export function notifyLiveDataChanged() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore listener errors */
    }
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* private mode / quota */
    }
  }
}

/** Subscribe to same-tab and cross-tab data changes (employee → manager). */
export function subscribeLiveDataChanged(listener: Listener) {
  listeners.add(listener);

  let onStorage: ((e: StorageEvent) => void) | null = null;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) listener();
    };
    window.addEventListener('storage', onStorage);
  }

  return () => {
    listeners.delete(listener);
    if (onStorage && typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}
