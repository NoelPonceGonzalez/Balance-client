import { api } from '@/lib/api';

function keyBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enablePhonePush(): Promise<string> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return 'Este navegador no puede recibir avisos.';
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'El móvil no ha dejado mostrar avisos.';
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string | null }>('/api/market/push-key');
  if (!publicKey) return 'El servidor todavía no puede mandar avisos al móvil.';
  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey) as BufferSource,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('push service') || message.includes('Registration failed')) {
      return 'Este navegador no puede recibir avisos. Ábrelo en el móvil y pulsa el botón.';
    }
    return message || 'No se ha podido activar.';
  }
  const json = subscription.toJSON();
  const sent = await api<{ sent: number }>('/api/market/push', {
    method: 'POST',
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  return sent.sent > 0 ? 'Listo. El aviso pendiente ya va hacia el móvil.' : 'Listo. Los avisos de compra llegarán a este móvil.';
}
