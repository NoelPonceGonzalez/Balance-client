self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function absolute(path) {
  if (!path) return '';
  try {
    return new URL(path, self.location.origin).href;
  } catch {
    return '';
  }
}

self.addEventListener('push', (event) => {
  let payload = { title: 'Balance', body: '', url: '/', image: '', tag: '' };
  try {
    payload = { ...payload, ...(event.data ? event.data.json() : {}) };
  } catch {
    payload.body = event.data ? event.data.text() : '';
  }
  const title = payload.title || 'Balance';
  const url = payload.url || '/';
  const icon = absolute('/icons/icon-192.png');
  const badge = absolute('/icons/badge-96.png');
  const image = absolute(payload.image);
  const shown = {
    body: payload.body || '',
    lang: 'es',
    icon,
    badge,
    data: { url },
    timestamp: Date.now(),
  };
  if (image) shown.image = image;
  if (payload.tag) {
    shown.tag = payload.tag;
    shown.renotify = true;
  }
  event.waitUntil((async () => {
    try {
      await self.registration.showNotification(title, shown);
    } catch {
      await self.registration.showNotification(title, { body: payload.body, lang: 'es', icon, badge, data: { url } });
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
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request)));
});
