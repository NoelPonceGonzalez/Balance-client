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

/** Centro de un hueco dentro de la cápsula (coordenadas locales de la cápsula). */
export const slotCenter = (slot: number) => PAD + (slot + 0.5) * SLOT;

/** Ancho máximo del buscador para un contenedor: lo que queda entre la burbuja y la cámara. */
export const searchMax = (containerW: number) => Math.max(GLASS_H, containerW - 2 * GLASS_H - 2 * GAP);

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
 * Geometría de un fotograma, centrada en el contenedor. `p` es el progreso de la separación.
 * Coordenadas relativas al contenedor del dock.
 */
export function dockFrame(p: number, containerW: number, withSearch: boolean): DockFrame {
  const t = clamp01(p);
  const ax0 = (containerW - CAPSULE_W) / 2;
  // A: la cápsula se recoge hacia la burbuja de la izquierda.
  const ax = lerp(ax0, 0, t);
  const aw = lerp(CAPSULE_W, GLASS_H, t);
  // Cámara: del hueco central a su posición independiente a la derecha (crece al soltarse).
  const camX = lerp(ax0 + slotCenter(CAMERA_SLOT), containerW - GLASS_H / 2, t);
  const camD = lerp(CAMERA_IN, GLASS_H, smooth(t));
  // B: nace del canto derecho de la cápsula y ocupa el hueco que deja al recogerse.
  const right = lerp(ax0 + CAPSULE_W, containerW - GLASS_H - GAP, t);
  const left = ax + aw + GAP * t;
  const open = right - left;
  const bw = Math.max(GLASS_H, open);
  const bx = open >= GLASS_H ? left : right - GLASS_H;
  const bOpacity = withSearch ? smooth(clamp01(open / GLASS_H)) : 0;
  return { ax, aw, bx, bw, bOpacity, camX, camD };
}
