import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from '../lib/api';

export type LocationStatus = 'idle' | 'checking' | 'granted' | 'denied' | 'unsupported';

type TrackableUser = {
  role?: string | null;
  employee_id?: string | null;
  acting_as_employee_id?: string | null;
} | null;

const PING_INTERVAL_MS = 3 * 60 * 1000;
const MIN_PING_GAP_MS = 45 * 1000;

export function shouldTrackEmployeeLocation(user: TrackableUser): boolean {
  if (!user) return false;
  const empId = user.acting_as_employee_id || user.employee_id;
  if (!empId) return false;
  if (user.role === 'admin' && !user.employee_id && !user.acting_as_employee_id) return false;
  return true;
}

async function sendLocationPing(lat: number, lng: number, accuracy?: number) {
  await api.post('/auth/ping-location', {
    lat,
    lng,
    accuracy: accuracy ?? null,
    captured_at: new Date().toISOString(),
  });
}

export function useEmployeeLocation(user: TrackableUser) {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const watchIdRef = useRef<number | null>(null);
  const lastPingRef = useRef(0);
  const tracking = shouldTrackEmployeeLocation(user);

  const pingOnce = useCallback(async (position: GeolocationPosition) => {
    const now = Date.now();
    if (now - lastPingRef.current < MIN_PING_GAP_MS) return;
    lastPingRef.current = now;
    try {
      await sendLocationPing(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy,
      );
    } catch (e) {
      console.warn('location ping failed', e);
    }
  }, []);

  const onPosition = useCallback(
    (position: GeolocationPosition) => {
      setStatus('granted');
      void pingOnce(position);
    },
    [pingOnce],
  );

  const onError = useCallback((error: GeolocationPositionError) => {
    if (error.code === error.PERMISSION_DENIED) {
      setStatus('denied');
    } else {
      setStatus((s) => (s === 'granted' ? 'granted' : 'denied'));
    }
  }, []);

  const startTracking = useCallback(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('checking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPosition(pos);
        if (watchIdRef.current != null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onError, {
          enableHighAccuracy: true,
          maximumAge: 60_000,
          timeout: 20_000,
        });
      },
      onError,
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }, [onPosition, onError]);

  const requestAccess = useCallback(() => {
    startTracking();
  }, [startTracking]);

  useEffect(() => {
    if (!tracking) {
      setStatus('idle');
      if (Platform.OS === 'web' && watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }
    startTracking();
    const interval = setInterval(() => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(onPosition, () => {}, {
        enableHighAccuracy: false,
        maximumAge: 120_000,
        timeout: 15_000,
      });
    }, PING_INTERVAL_MS);

    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        navigator.geolocation?.getCurrentPosition(onPosition, () => {}, {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 15_000,
        });
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        navigator.geolocation?.getCurrentPosition(onPosition, () => {}, {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 15_000,
        });
      }
    });

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
      appSub.remove();
      if (Platform.OS === 'web' && watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [tracking, startTracking, onPosition]);

  return { status, tracking, requestAccess };
}
