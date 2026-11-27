self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// Sesión abierta en este navegador (huella del usuario o 'none'). Se conserva entre versiones del worker.
const SESSION_CACHE = 'balance-session';
const SESSION_KEY = '/__balance_session';

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== SESSION_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'balance-user') return;
  const save = (async () => {
    const cache = await caches.open(SESSION_CACHE);
    await cache.put(SESSION_KEY, new Response(String(data.audience || 'none')));
  })();
  if (event.waitUntil) event.waitUntil(save);
});

async function sessionAudience() {
  try {
    const cache = await caches.open(SESSION_CACHE);
    const hit = await cache.match(SESSION_KEY);
    return hit ? await hit.text() : null;
  } catch {
    return null;
  }
}

/**
 * Privacidad: si el aviso es para otra cuenta (suscripción que quedó del usuario anterior) o no hay sesión,
 * se enseña sin título, importe ni imagen. Sin dato de sesión (versiones anteriores), como antes.
 */
function privacyGate(payload, current) {
  if (!payload.u || current == null || current === payload.u) return payload;
  return { title: 'Balance', body: 'Tienes un aviso nuevo. Abre Balance con tu cuenta para verlo.', url: '/', image: '', tag: 'balance-privado' };
}

function absolute(path) {
  if (!path) return '';
  try {
    return new URL(path, self.location.origin).href;
  } catch {
    return '';
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(showPush(event));
});

async function showPush(event) {
  let payload = { title: 'Balance', body: '', url: '/', image: '', tag: '' };
  try {
    payload = { ...payload, ...(event.data ? event.data.json() : {}) };
  } catch {
    payload.body = event.data ? event.data.text() : '';
  }
  payload = privacyGate(payload, await sessionAudience());
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
  try {
    await self.registration.showNotification(title, shown);
  } catch {
    await self.registration.showNotification(title, { body: payload.body, lang: 'es', icon, badge, data: { url } });
  }
}

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
