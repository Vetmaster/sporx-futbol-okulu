const NOTIFICATION_URL = new URL('./?open=notifications', self.registration.scope).href;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'SASA-F', {
    body: payload.body || 'Yeni bir bildiriminiz var.',
    icon: './sasa-f-icon.svg?v=2026.07.27.159',
    badge: './sasa-f-icon.svg?v=2026.07.27.159',
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
