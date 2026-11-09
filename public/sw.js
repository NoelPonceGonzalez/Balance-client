self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Balance', body: '', url: '/' };
  try {
    payload = { ...payload, ...(event.data ? event.data.json() : {}) };
  } catch {
    payload.body = event.data ? event.data.text() : '';
  }
  const title = payload.title || 'Balance';
  const url = payload.url || '/';
  const shown = {
    body: payload.body,
    lang: 'es',
    icon: '/icons/icon-192.png',
    data: { url },
  };
  event.waitUntil((async () => {
    try {
      await self.registration.showNotification(title, shown);
    } catch {
      await self.registration.showNotification(title, { body: payload.body, lang: 'es', data: { url } });
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
    }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname === '/health') return;
  event.respondWith(fetch(event.request));
});
