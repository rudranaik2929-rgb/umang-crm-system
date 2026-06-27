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

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.warn('FCM service worker registration failed', e);
    return null;
  }
}

export function usePushNotifications(enabled: boolean) {
  const registered = useRef(false);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!pushConfigured()) {
      console.info('Push: set EXPO_PUBLIC_FIREBASE_* in Vercel to enable');
      return;
    }
    if (registered.current) return;

    (async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const reg = await registerServiceWorker();
        if (!reg) return;

        const { initializeApp, getApps } = await import('firebase/app');
        const { getMessaging, getToken, isSupported } = await import('firebase/messaging');

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

        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: reg,
        });

        if (token) {
          await api.post('/notifications/fcm-token', {
            fcm_token: token,
            platform: 'web',
            user_agent: navigator.userAgent,
          });
          registered.current = true;
          console.info('FCM token registered with backend');
        }
      } catch (e) {
        console.warn('Push registration skipped', e);
      }
    })();
  }, [enabled]);
}
