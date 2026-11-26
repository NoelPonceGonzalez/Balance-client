/**
 * Capa de la cámara (Bloque D). El código de la cámara (TicketCam, ~2100 líneas, lector de carteras y
 * catálogo de plataformas) ya no viaja con la primera carga del Resumen: se descarga aparte y se
 * precarga cuando el navegador está libre, así el primer toque al botón responde igual de rápido.
 * Tesseract sigue cargándose solo cuando hace falta (dentro de TicketCam).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { apiIdle } from '@/lib/api';
import { revealCamera } from '@/lib/camera-reveal';

type CamProps = { userId: string; onClose: () => void; onSaved: () => void };

// Sin React.lazy ni Suspense a propósito: React 19 retrasa ~300 ms el contenido que sustituye a un
// fallback de Suspense, y eso retrasaría la petición de la cámara. Aquí, si el código ya está precargado,
// la cámara se monta en el mismo toque; si no, el velo emerge mientras llega y la cámara entra en cuanto llega.
let Loaded: ComponentType<CamProps> | null = null;
let pending: Promise<ComponentType<CamProps>> | null = null;
function load() {
  if (!pending) {
    pending = import('@/components/TicketCam').then((module) => {
      Loaded = module.TicketCam;
      return module.TicketCam;
    });
    pending.catch(() => { pending = null; });
  }
  return pending;
}

export function preloadCamera() {
  void load().catch(() => undefined);
}

/**
 * Precarga la cámara cuando el navegador está libre, después de pintar la pantalla inicial y cuando no queda
 * ninguna petición de datos en curso (Bloque E): así no compite con lo que el Resumen necesita primero.
 * Si la red no se queda libre, lo intenta como mucho durante ~15 s y luego precarga igualmente.
 */
export function useCameraPreload(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;
    const started = performance.now();
    let timer = 0;
    let stop = false;
    const attempt = () => {
      if (stop) return;
      if (apiIdle() || performance.now() - started > 15_000) {
        preloadCamera();
        return;
      }
      timer = window.setTimeout(wait, 700);
    };
    const wait = () => {
      const idle = (window as Window & { requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(attempt, { timeout: 2000 });
      else timer = window.setTimeout(attempt, 300);
    };
    timer = window.setTimeout(wait, 1200);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [enabled]);
}

/** Mientras llega el código (solo si aún no estaba precargado): fondo negro que ya emerge del botón. */
function CameraVeil({ failed, onClose }: { failed: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { revealCamera(ref.current); }, []);
  return createPortal(
    <div ref={ref} className="fixed inset-0 z-[80] bg-black text-white" role={failed ? 'alert' : undefined} aria-busy={!failed}>
      {failed && (
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <p className="text-[20px] font-semibold tracking-tight">No he podido abrir la cámara</p>
          <p className="mt-2 max-w-xs text-sm font-medium text-white/70">Revisa la conexión y vuelve a intentarlo.</p>
          <button type="button" onClick={onClose} className="mt-6 rounded-full bg-white px-6 py-3.5 text-[15px] font-semibold text-slate-950">Cerrar</button>
        </div>
      )}
    </div>,
    document.body,
  );
}

export function CameraLayer({ open, userId, onClose, onSaved }: { open: boolean } & CamProps) {
  const [Cam, setCam] = useState<ComponentType<CamProps> | null>(() => Loaded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || Cam) return undefined;
    let alive = true;
    setFailed(false);
    load().then((component) => { if (alive) setCam(() => component); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [open, Cam]);
  if (!open) return null;
  const Ready = Cam || Loaded;
  if (!Ready) return <CameraVeil failed={failed} onClose={onClose} />;
  return <Ready userId={userId} onClose={onClose} onSaved={onSaved} />;
}
