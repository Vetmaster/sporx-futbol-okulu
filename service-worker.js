const NOTIFICATION_URL = new URL('./?open=notifications', self.registration.scope).href;
const NOTIFICATION_ICON_URL = new URL('./sasa-f-icon-v3.svg?v=2026.08.02.192', self.registration.scope).href;
const NOTIFICATION_BADGE_URL = new URL('./sasa-f-notification-badge.png?v=2026.08.02.203', self.registration.scope).href;

// Web FCM ayarları istemci ile aynı dosyada tutulur. Eksikse klasik Web Push
// dinleyicisi çalışmaya devam eder; service worker kurulumu etkilenmez.
try {
  importScripts('./firebase-web-config.js?v=2026.08.30.363');
  const config = self.SasaFirebaseWebConfig || {};
  const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  if (requiredKeys.every(key => typeof config[key] === 'string' && config[key].trim())) {
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
    if (!firebase.apps.length) firebase.initializeApp(config);
    firebase.messaging().onBackgroundMessage(payload => {
      const data = payload?.data || {};
      return self.registration.showNotification(data.title || 'SASA-F', {
        body: data.body || 'Yeni bir bildiriminiz var.',
        icon: data.icon || NOTIFICATION_ICON_URL,
        badge: data.badge || NOTIFICATION_BADGE_URL,
        tag: data.tag || `sasa-f-${data.notificationId || 'notification'}`,
        renotify: true,
        data: { url: data.url || NOTIFICATION_URL }
      });
    });
  }
} catch (error) {
  console.warn('Firebase Web Messaging service worker başlatılamadı; klasik Web Push kullanılacak.', error);
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }

  // Firebase Messaging kendi onBackgroundMessage işleyicisini kullanır.
  // Aynı FCM olayı klasik Web Push dinleyicisine de düşerse çift bildirimi engelleriz.
  if (payload?.data?.notificationId) return;

  event.waitUntil(self.registration.showNotification(payload.title || 'SASA-F', {
    body: payload.body || 'Yeni bir bildiriminiz var.',
    icon: NOTIFICATION_ICON_URL,
    badge: NOTIFICATION_BADGE_URL,
    tag: payload.tag || 'sasa-f-notification',
    renotify: true,
    data: { url: payload.url || NOTIFICATION_URL }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || NOTIFICATION_URL;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingWindow = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existingWindow) {
      await existingWindow.focus();
      return existingWindow.navigate(targetUrl);
    }
    return clients.openWindow(targetUrl);
  })());
});
