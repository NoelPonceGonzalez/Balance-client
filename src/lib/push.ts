import { api } from '@/lib/api';

let cachedKey: string | null | undefined;

function keyBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

function sameKey(current: ArrayBuffer | null | undefined, next: ArrayBuffer): boolean {
  if (!current) return false;
  const left = new Uint8Array(current);
  const right = new Uint8Array(next);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false;
  return true;
}

export function warmPushKey(): void {
  if (cachedKey !== undefined) return;
  void api<{ publicKey: string | null }>('/api/market/push-key')
    .then((data) => { cachedKey = data.publicKey; })
    .catch(() => { cachedKey = undefined; });
}

async function publicKey(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey;
  const data = await api<{ publicKey: string | null }>('/api/market/push-key');
  cachedKey = data.publicKey;
  return data.publicKey;
}

export async function enablePhonePush(ping = false): Promise<string> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return 'Este navegador no puede recibir avisos.';
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'El móvil no ha dejado mostrar avisos.';
  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  const key = await publicKey();
  if (!key) return 'El servidor todavía no puede mandar avisos al móvil.';
  const applicationServerKey = keyBuffer(key);
  let existing = await registration.pushManager.getSubscription();
  const currentKey = existing?.options?.applicationServerKey;
  if (existing && currentKey && !sameKey(currentKey, applicationServerKey)) {
    await existing.unsubscribe().catch(() => undefined);
    existing = null;
  }
  let subscription: PushSubscription;
  try {
    subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('push service') || message.includes('Registration failed')) {
      return 'Este navegador no puede recibir avisos. Ábrelo desde el icono de la pantalla de inicio.';
    }
    return message || 'No se ha podido activar.';
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return 'El móvil no ha dado una suscripción válida.';
  const sent = await api<{ sent: number }>('/api/market/push', {
    method: 'POST',
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ping }),
  });
  if (!ping) return 'Listo. Los avisos de este móvil quedan registrados.';
  return sent.sent > 0
    ? 'Listo. Tiene que llegar ahora un aviso de prueba. Si la app está abierta, mira también la barra del teléfono.'
    : 'El móvil ha quedado registrado. Si no vibra, vuelve a pulsar Probar aviso.';
}

/** Al cerrar sesión el móvil deja de recibir avisos de esa cuenta hasta que alguien vuelva a entrar. */
export async function disablePhonePush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const token = localStorage.getItem('pat_token');
  if (token) {
    void api('/api/market/push', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
  }
  await subscription.unsubscribe().catch(() => undefined);
}

/** Si el permiso ya está dado, vuelve a registrar el móvil sin pedir otro aviso de prueba. */
export async function syncPhonePush(): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  await enablePhonePush(false);
}
