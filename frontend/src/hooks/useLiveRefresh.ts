import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { LIVE_REFRESH_MS, subscribeLiveDataChanged } from '../lib/liveSync';

/**
 * Keeps dashboard / queue data fresh:
 * - polls every few seconds while screen is visible
 * - reloads immediately when any user saves a lead change (same or other tab)
 * - reloads when app/tab becomes active again
 */
export function useLiveRefresh(refresh: () => void | Promise<void>, intervalMs = LIVE_REFRESH_MS) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const run = () => {
      void refreshRef.current();
    };

    const unsub = subscribeLiveDataChanged(run);

    let interval: ReturnType<typeof setInterval> | null = null;
    const startInterval = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          if (document.visibilityState !== 'visible') return;
        }
        run();
      }, intervalMs);
    };
    const stopInterval = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    startInterval();

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onVis = () => {
        if (document.visibilityState === 'visible') run();
      };
      document.addEventListener('visibilitychange', onVis);
      return () => {
        unsub();
        stopInterval();
        document.removeEventListener('visibilitychange', onVis);
      };
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });

    return () => {
      unsub();
      stopInterval();
      sub.remove();
    };
  }, [intervalMs]);
}
