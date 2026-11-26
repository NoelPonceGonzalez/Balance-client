/**
 * NAVIGATION MOTION del dock: muelles y geometría.
 *
 * Toda la transformación cuelga de MotionValues con muelle (interrumpibles y reversibles desde cualquier
 * punto, conservan la velocidad al invertir):
 *   - morph  0 = cápsula completa · 1 = burbuja + buscador + cámara
 *   - slot   posición continua del indicador (0..4, 2 = cámara)
 * La geometría es aritmética pura a partir del ancho del contenedor (medido solo al cambiar de tamaño).
 * Las deformaciones salen del progreso del muelle (curvas suaves), nunca de velocidades medidas por
 * fotograma, que tiemblan.
 */

/** Alto del cristal en todos los estados: el mapa óptico no cambia nunca de altura. */
export const GLASS_H = 56;
/** Hueco máximo de cada pestaña (en pantallas anchas la fila no se estira más). */
export const MAX_SLOT = 64;
/** Relleno interior de la cápsula. */
export const PAD = 4;
/** Separación entre piezas. */
export const GAP = 8;
/** Diámetro del indicador activo y de la cámara dentro de la cápsula. */
export const INDICATOR = 48;
export const CAMERA_IN = 44;
export const SLOTS = 5;
export const CAMERA_SLOT = 2;

/** Indicador entre pestañas: el muelle de referencia del dock aprobado. */
export const NAV_SPRING = { stiffness: 380, damping: 30, mass: 0.8 };
/**
 * Separación / fusión: amortiguamiento crítico (ζ ≈ 1), sin rebote ni frenazo final.
 * ~0,42 s hasta el 99 %: lo bastante largo para leerse como un solo gesto continuo.
 */
export const MORPH_SPRING = { stiffness: 230, damping: 30, mass: 1, restDelta: 0.0005, restSpeed: 0.002 };
/** Pulsación física (la del dock aprobado). */
export const PRESS_SPRING = { stiffness: 520, damping: 22, mass: 0.6 };

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Tramo 0..1 de t entre a y b. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** Suavizado de entrada y salida para tramos (sin aristas al empezar ni al acabar). */
export const smooth = (t: number) => t * t * (3 - 2 * t);
/** Campana 0 → 1 → 0: deformación que nace y se recupera con el propio movimiento. */
export const bell = (t: number) => Math.sin(Math.PI * clamp01(t));

/**
 * Composición en reposo (estilo Apple Music): cápsula con cinco huecos (cámara en el centro) y, si la
 * pantalla se puede buscar, la burbuja de la lupa a su derecha. La fila entera va centrada.
 */
export function capsuleWidth(containerW: number, withSearch: boolean): number {
  const room = withSearch ? containerW - GLASS_H - GAP : containerW;
  return Math.max(GLASS_H, Math.min(room, PAD * 2 + SLOTS * MAX_SLOT));
}

/** Centro de un hueco dentro de una cápsula de ancho `capW` (coordenadas locales de la cápsula). */
export const slotCenter = (slot: number, capW: number) => PAD + (slot + 0.5) * ((capW - PAD * 2) / SLOTS);

/** Ancho del buscador abierto: lo que queda entre la burbuja activa y la cámara. */
export const searchMax = (containerW: number) => Math.max(GLASS_H, containerW - 2 * GLASS_H - 2 * GAP);

export interface DockFrame {
  /** Cápsula / burbuja (cristal A). */
  ax: number;
  aw: number;
  capW: number;
  /** Lupa / buscador (cristal B). */
  bx: number;
  bw: number;
  /** Centro y diámetro de la cámara. */
  camX: number;
  camD: number;
}

/** Geometría de un fotograma. `p`: 0 en reposo, 1 en la composición contextual. */
export function dockFrame(p: number, containerW: number, withSearch: boolean): DockFrame {
  const t = clamp01(p);
  const capW = capsuleWidth(containerW, withSearch);
  const rowW = capW + (withSearch ? GAP + GLASS_H : 0);
  const ax0 = (containerW - rowW) / 2;
  // A: la cápsula se recoge en la burbuja de la pestaña activa, a la izquierda.
  const ax = lerp(ax0, 0, t);
  const aw = lerp(capW, GLASS_H, t);
  // B: la lupa se desliza hacia dentro y se estira hasta ser el buscador.
  const bx = lerp(ax0 + capW + GAP, GLASS_H + GAP, t);
  const bw = lerp(GLASS_H, searchMax(containerW), t);
  // Cámara: del hueco central de la cápsula a su posición independiente a la derecha.
  const camX = lerp(ax0 + slotCenter(CAMERA_SLOT, capW), containerW - GLASS_H / 2, t);
  const camD = lerp(CAMERA_IN, GLASS_H, smooth(t));
  return { ax, aw, capW, bx, bw, camX, camD };
}
