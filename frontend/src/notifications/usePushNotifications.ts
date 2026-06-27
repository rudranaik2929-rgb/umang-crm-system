import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { api } from '../lib/api';

const VAPID_KEY = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY || '';
const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '';
const AUTH_DOMAIN = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '';
const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '';
const STORAGE_BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '';
const MESSAGING_SENDER_ID = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '';
const APP_ID = process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '';

function pushConfigured(): boolean {
  return Boolean(VAPID_KEY && API_KEY && PROJECT_ID && MESSAGING_SENDER_ID && APP_ID);
}

async function waitForServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.warn('Service worker not ready for push', e);
    return null;
  }
}

export async function registerPushToken(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (!pushConfigured()) {
    console.info('Push: set EXPO_PUBLIC_FIREBASE_* in Vercel to enable');
    return false;
  }
  if (!('Notification' in window)) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await waitForServiceWorker();
  if (!reg) return false;

  const { initializeApp, getApps } = await import('firebase/app');
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');

  if (!(await isSupported())) return false;

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        apiKey: API_KEY,
        authDomain: AUTH_DOMAIN,
        projectId: PROJECT_ID,
        storageBucket: STORAGE_BUCKET,
        messagingSenderId: MESSAGING_SENDER_ID,
        appId: APP_ID,
      });

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: reg,
  });

  if (!token) return false;

  await api.post('/notifications/fcm-token', {
    fcm_token: token,
    platform: 'web',
    user_agent: navigator.userAgent,
  });
  console.info('FCM token registered with backend');
  return true;
}

/** Register web push when enabled (call from app shell, not only settings page). */
export function usePushNotifications(enabled: boolean, onForegroundMessage?: () => void) {
  const registered = useRef(false);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') return;

    (async () => {
      try {
        const ok = await registerPushToken();
        if (ok) registered.current = true;
      } catch (e) {
        console.warn('Push registration skipped', e);
      }
    })();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !onForegroundMessage || Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!pushConfigured()) return;

    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const { initializeApp, getApps } = await import('firebase/app');
        const { getMessaging, onMessage, isSupported } = await import('firebase/messaging');
        if (!(await isSupported())) return;

        const app = getApps().length
          ? getApps()[0]
          : initializeApp({
              apiKey: API_KEY,
              authDomain: AUTH_DOMAIN,
              projectId: PROJECT_ID,
              storageBucket: STORAGE_BUCKET,
              messagingSenderId: MESSAGING_SENDER_ID,
              appId: APP_ID,
            });

        unsubscribe = onMessage(getMessaging(app), () => {
          onForegroundMessage();
        });
      } catch {
        /* foreground handler optional */
      }
    })();

    return () => unsubscribe?.();
  }, [enabled, onForegroundMessage]);
}
