/**
 * Apertura de la cámara desde el botón negro del dock (Bloque D).
 *
 * La capa de la cámara se recorta con un círculo que nace en el centro del botón «Hacer una foto» y crece
 * hasta cubrir la pantalla (clip-path con WAAPI, sin tocar el dock: solo se lee su posición una vez).
 * Al cerrar, el círculo vuelve al botón. Si el botón no está visible, nace del centro inferior.
 * Con movimiento reducido, solo un fundido corto. Nunca retrasa la cámara: se lanza en paralelo.
 */
function origin(): { x: number; y: number; r: number } {
  const button = document.querySelector<HTMLElement>('button[aria-label="Hacer una foto"]');
  const rect = button?.getBoundingClientRect();
  if (rect && rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: Math.max(rect.width, rect.height) / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight - 40, r: 20 };
}

function still(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Radio que necesita un círculo con centro (x, y) para tapar una pantalla de w × h. */
export function coverRadius(x: number, y: number, w: number, h: number): number {
  return Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 2;
}

function cover(x: number, y: number): number {
  return coverRadius(x, y, window.innerWidth, window.innerHeight);
}

/**
 * Geometría del vuelo de la foto: escala uniforme (nunca deforma) para que la pantalla completa cubra la
 * miniatura, traslación que la centra y recorte (en píxeles sin escalar) que deja visible solo la miniatura.
 */
export function flightGeometry(rect: { left: number; top: number; width: number; height: number }, vw: number, vh: number) {
  const scale = Math.max(rect.width / vw, rect.height / vh);
  return {
    scale,
    tx: rect.left + (rect.width - vw * scale) / 2,
    ty: rect.top + (rect.height - vh * scale) / 2,
    ix: (vw * scale - rect.width) / 2 / scale,
    iy: (vh * scale - rect.height) / 2 / scale,
  };
}

const REVEAL_MS = 460;
let revealStart = -Infinity;

/**
 * Hace emerger `layer` desde el botón de la cámara. Si el velo de carga ya había empezado la apertura
 * (el código de la cámara aún no estaba descargado), la capa real continúa la misma animación en el punto
 * en que iba, sin volver a empezar.
 */
export function revealCamera(layer: HTMLElement | null) {
  if (!layer) return;
  const now = performance.now();
  const since = now - revealStart;
  if (still()) {
    if (since > 200) layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
    revealStart = now;
    return;
  }
  const { x, y, r } = origin();
  const run = layer.animate(
    [
      { clipPath: `circle(${r}px at ${x}px ${y}px)` },
      { clipPath: `circle(${cover(x, y)}px at ${x}px ${y}px)` },
    ],
    { duration: REVEAL_MS, easing: 'cubic-bezier(0.22, 0.9, 0.24, 1)' },
  );
  if (since < REVEAL_MS) run.currentTime = since;
  else revealStart = now;
}

/**
 * La foto recién hecha vuela desde la pantalla completa hasta su miniatura (`to`) sin deformarse:
 * escala uniforme y recorte con clip-path. Al terminar se quita sola y la miniatura queda visible.
 */
export function flyPhoto(src: string, to: HTMLElement | null) {
  if (!to || still()) return;
  const rect = to.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { scale, tx, ty, ix, iy } = flightGeometry(rect, vw, vh);
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  Object.assign(img.style, { position: 'fixed', left: '0', top: '0', width: `${vw}px`, height: `${vh}px`, objectFit: 'cover', zIndex: '90', pointerEvents: 'none', transformOrigin: '0 0' });
  document.body.appendChild(img);
  to.style.opacity = '0';
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    img.remove();
    to.style.opacity = '';
  };
  const run = img.animate(
    [
      { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px round 0px)' },
      { transform: `translate(${tx}px, ${ty}px) scale(${scale})`, clipPath: `inset(${iy}px ${ix}px round ${14 / scale}px)` },
    ],
    { duration: 420, easing: 'cubic-bezier(0.22, 0.9, 0.24, 1)', fill: 'forwards' },
  );
  run.onfinish = finish;
  window.setTimeout(finish, 700);
}

/** Devuelve `layer` al botón y luego llama a `done` (la cámara ya está parada antes de empezar). */
export function concealCamera(layer: HTMLElement | null, done: () => void) {
  if (!layer || still()) {
    done();
    return;
  }
  const { x, y, r } = origin();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done();
  };
  const run = layer.animate(
    [
      { clipPath: `circle(${cover(x, y)}px at ${x}px ${y}px)` },
      { clipPath: `circle(${r}px at ${x}px ${y}px)` },
    ],
    { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.8, 0.4)', fill: 'forwards' },
  );
  run.onfinish = finish;
  // Por si la pestaña está en segundo plano y la animación no avanza: nunca dejar la cámara abierta.
  window.setTimeout(finish, 400);
}
