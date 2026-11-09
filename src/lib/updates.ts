function poke(registration: ServiceWorkerRegistration | undefined) {
  registration?.update().catch(() => undefined);
}

export function watchAppUpdates() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  const refresh = () => {
    navigator.serviceWorker.getRegistration().then((registration) => poke(registration)).catch(() => undefined);
  };
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => poke(registration)).catch(() => undefined);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  window.addEventListener('pageshow', refresh);
}
