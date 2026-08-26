const NOTIFICATION_URL = new URL('./?open=notifications', self.registration.scope).href;
const NOTIFICATION_ICON_URL = new URL('./sasa-f-icon-v3.svg?v=2026.08.02.192', self.registration.scope).href;
const NOTIFICATION_BADGE_URL = new URL('./sasa-f-notification-badge.png?v=2026.08.02.203', self.registration.scope).href;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));

// The Android shell always starts from the same URL. Fetch navigation
// requests fresh so a GitHub Pages CDN cache cannot hold the app on an older
// index.html after a web release. Static assets remain normally cacheable.
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request, { cache: 'reload' }));
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }

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
