import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { LIVE_REFRESH_MS, subscribeLiveDataChanged } from '../lib/liveSync';

/** Ignore bursty duplicate triggers (mutation + visibility + poll). */
const MIN_REFRESH_GAP_MS = 4000;

/**
 * Keeps dashboard / queue data fresh:
 * - polls every few minutes while screen is visible
 * - reloads when any user saves a lead change (same or other tab)
 * - reloads when app/tab becomes active again
 * Debounced so overlapping triggers don't stampede the API.
 */
export function useLiveRefresh(refresh: () => void | Promise<void>, intervalMs = LIVE_REFRESH_MS) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lastRunAt = useRef(0);
  const inflight = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    const run = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRunAt.current < MIN_REFRESH_GAP_MS) {
        pending.current = true;
        return;
      }
      if (inflight.current) {
        pending.current = true;
        return;
      }
      pending.current = false;
      lastRunAt.current = now;
      inflight.current = true;
      Promise.resolve(refreshRef.current())
        .catch(() => undefined)
        .finally(() => {
          inflight.current = false;
          if (pending.current) {
            pending.current = false;
            // Coalesce trailing edge after the debounce window.
            setTimeout(() => run(false), MIN_REFRESH_GAP_MS);
          }
        });
    };

    const unsub = subscribeLiveDataChanged(() => run(true));

    let interval: ReturnType<typeof setInterval> | null = null;
    const startInterval = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          if (document.visibilityState !== 'visible') return;
        }
        run(false);
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
        if (document.visibilityState === 'visible') run(false);
      };
      document.addEventListener('visibilitychange', onVis);
      return () => {
        unsub();
        stopInterval();
        document.removeEventListener('visibilitychange', onVis);
      };
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run(false);
    });

    return () => {
      unsub();
      stopInterval();
      sub.remove();
    };
  }, [intervalMs]);
}
