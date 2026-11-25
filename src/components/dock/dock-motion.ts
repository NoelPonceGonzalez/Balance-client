/**
 * NAVIGATION MOTION del dock: muelles y geometría.
 *
 * Toda la transformación cuelga de tres MotionValues con muelle (interrumpibles y reversibles desde
 * cualquier punto, conservan la velocidad al invertir):
 *   - morph  0 = cápsula completa · 1 = burbuja + buscador + cámara
 *   - slot   posición continua del indicador (0..4, 2 = cámara)
 *   - shift  desplazamiento lateral de la cápsula hacia la pestaña activa
 * La geometría se calcula con aritmética pura a partir del ancho del contenedor (medido solo al
 * cambiar de tamaño), nunca leyendo el DOM por fotograma.
 */

/** Alto del cristal en todos los estados: el mapa óptico no cambia nunca de altura. */
export const GLASS_H = 56;
/** Ancho de cada hueco de la cápsula (5: cuatro pestañas y la cámara). */
export const SLOT = 56;
/** Relleno interior de la cápsula. */
export const PAD = 4;
/** Separación entre las tres piezas en el estado contextual. */
export const GAP = 8;
/** Diámetro del indicador activo y de la cámara dentro de la cápsula. */
export const INDICATOR = 48;
export const CAMERA_IN = 44;
export const SLOTS = 5;
export const CAMERA_SLOT = 2;
export const CAPSULE_W = PAD * 2 + SLOT * SLOTS;

/** Muelle de referencia del dock aprobado (indicador). También mueve la cápsula: van coordinados. */
export const NAV_SPRING = { stiffness: 380, damping: 30, mass: 0.8 };
/** Separación / fusión: algo más firme y amortiguado que el indicador, sin rebote visible. */
export const MORPH_SPRING = { stiffness: 340, damping: 32, mass: 0.9, restDelta: 0.0005 };
/** Pulsación física (la del dock aprobado). */
export const PRESS_SPRING = { stiffness: 520, damping: 22, mass: 0.6 };

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Tramo 0..1 de t entre a y b. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** Centro de un hueco dentro de la cápsula (coordenadas locales de la cápsula). */
export const slotCenter = (slot: number) => PAD + (slot + 0.5) * SLOT;

/** Desplazamiento lateral de la cápsula: se arrima al lado de la pestaña activa. */
export function shiftFor(slot: number, containerW: number): number {
  if (slot < 0) return 0;
  const room = Math.max(0, (containerW - CAPSULE_W) / 2);
  const reach = Math.min(room, 40);
  return ((slot - CAMERA_SLOT) / 2) * reach;
}

export interface DockFrame {
  /** Cápsula / burbuja (cristal A). */
  ax: number;
  aw: number;
  /** Buscador (cristal B). */
  bx: number;
  bw: number;
  bOpacity: number;
  /** Centro y diámetro de la cámara. */
  camX: number;
  camD: number;
}

/**
 * Geometría de un fotograma. `p` es el progreso de la separación (puede pasar un poco de 0..1 por el
 * muelle; se recorta donde haría falta). Coordenadas relativas al contenedor del dock.
 */
export function dockFrame(p: number, shift: number, containerW: number, withSearch: boolean): DockFrame {
  const t = clamp01(p);
  const ax0 = (containerW - CAPSULE_W) / 2 + shift;
  // A: la cápsula se recoge hacia la burbuja de la izquierda.
  const ax = lerp(ax0, 0, t);
  const aw = lerp(CAPSULE_W, GLASS_H, t);
  // Cámara: del hueco central a su posición independiente a la derecha.
  const camX = lerp(ax0 + slotCenter(CAMERA_SLOT), containerW - GLASS_H / 2, t);
  const camD = lerp(CAMERA_IN, GLASS_H, t);
  // B: nace del canto derecho de la cápsula y ocupa el hueco que deja al recogerse.
  const right = lerp(ax0 + CAPSULE_W, containerW - GLASS_H - GAP, t);
  const left = ax + aw + GAP * t;
  const open = right - left;
  const bw = Math.max(GLASS_H, open);
  const bx = open >= GLASS_H ? left : right - GLASS_H;
  const bOpacity = withSearch ? clamp01(open / GLASS_H) : 0;
  return { ax, aw, bx, bw, bOpacity, camX, camD };
}
