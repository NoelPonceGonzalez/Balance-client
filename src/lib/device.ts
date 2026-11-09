import { enablePhonePush } from '@/lib/push';

export type Gate = 'ready' | 'ask' | 'blocked' | 'unsupported';

const CAMERA_OK = 'pat_camera_ok';

function installedApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || nav.standalone === true;
}

export async function phoneStatus(): Promise<{ push: Gate; camera: Gate }> {
  return { push: await pushGate(), camera: await cameraGate() };
}

async function pushGate(): Promise<Gate> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'ask';
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? 'ready' : 'ask';
  } catch {
    return 'ask';
  }
}

async function cameraGate(): Promise<Gate> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    if (status.state === 'granted') return 'ready';
    if (status.state === 'denied') return 'blocked';
    return 'ask';
  } catch {
    return localStorage.getItem(CAMERA_OK) === '1' ? 'ready' : 'ask';
  }
}

export async function activatePush(): Promise<string> {
  if (!installedApp() && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
    return 'En el iPhone, instala Balance en la pantalla de inicio y ábrelo desde ese icono. Safari no entrega los avisos.';
  }
  const message = await enablePhonePush(true);
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    return 'El teléfono tiene los avisos bloqueados. En los ajustes del móvil, entra en Balance y permite las notificaciones.';
  }
  return message;
}

export async function activateCamera(): Promise<string> {
  if (!navigator.mediaDevices?.getUserMedia) return 'Este navegador no deja abrir la cámara.';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    localStorage.setItem(CAMERA_OK, '1');
    return 'Cámara lista para fotografiar tiques.';
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      localStorage.removeItem(CAMERA_OK);
      return 'El teléfono tiene la cámara bloqueada. En los ajustes del móvil, entra en Balance y permite la cámara.';
    }
    return 'No se ha podido activar la cámara.';
  }
}
