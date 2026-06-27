/* Firebase Cloud Messaging — background push (Android Chrome / installed PWA) */
importScripts('/firebase-config.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const firebaseConfig = self.FIREBASE_CONFIG || {};

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Umang CRM';
    const body = payload.notification?.body || payload.data?.body || '';
    const leadId = payload.data?.lead_id || '';
    const url = payload.data?.url || (leadId ? `/telecaller?openLead=${encodeURIComponent(leadId)}` : '/notifications');

    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url, ...payload.data },
      tag: payload.data?.notification_id || leadId || 'umang-crm',
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/notifications';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
