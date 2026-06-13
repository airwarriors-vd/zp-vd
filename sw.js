const CACHE_NAME = 'zp-vd-v2026-06-13';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(() => null)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(fetch(req).catch(() => caches.match(req).then(res => res || caches.match('/index.html'))));
});
self.addEventListener('push', event => {
  let data = { title: 'ЗП-VD', body: 'Нагадування подати звіт', url: '/' };
  try { data = Object.assign(data, event.data ? event.data.json() : {}); } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title || 'ЗП-VD', {
    body: data.body || 'Нагадування подати звіт',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if ('focus' in client) return client.focus();
    }
    return clients.openWindow(url);
  }));
});
