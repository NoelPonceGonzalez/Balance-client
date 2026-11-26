/**
 * Continuidad espacial entre una fila y la cabecera de detalle (Bloque B).
 *
 * 1) Al pulsar una fila, `captureFlip` guarda dónde estaban su logo, su nombre y su importe.
 * 2) Al pintarse la cabecera, `playFlip` coloca cada pieza (marcada con data-flip-to) en su sitio de origen
 *    y la deja viajar a su sitio nuevo con el muelle de Balance (SPRING_EASE, WAAPI sobre transform).
 *
 * No bloquea nada: la pantalla nueva ya es interactiva mientras vuela. Si no hay captura reciente, si falta
 * alguna pieza o si se pide menos movimiento, no hace nada.
 */
import { SPRING_EASE } from '@/lib/motion';

type Role = 'logo' | 'name' | 'value';
let pending: { rects: Partial<Record<Role, DOMRect>>; at: number } | null = null;

function still(): boolean {
  return typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Guarda la posición de las piezas de una fila. Acepta data-flip="logo|name|value" o piezas explícitas. */
export function captureFlip(row: Element | null, pieces?: Partial<Record<Role, Element | null>>) {
  if (!row || still()) return;
  const rects: Partial<Record<Role, DOMRect>> = {};
  for (const role of ['logo', 'name', 'value'] as Role[]) {
    const el = pieces?.[role] ?? row.querySelector(`[data-flip="${role}"]`);
    if (el) rects[role] = el.getBoundingClientRect();
  }
  pending = Object.keys(rects).length ? { rects, at: performance.now() } : null;
}

/** Lanza el vuelo hacia las piezas de `target` (data-flip-to). Una captura solo vale para un vuelo. */
export function playFlip(target: Element | null) {
  const shot = pending;
  pending = null;
  if (!shot || !target || still() || performance.now() - shot.at > 1500) return;
  for (const role of Object.keys(shot.rects) as Role[]) {
    const from = shot.rects[role];
    const el = target.querySelector<HTMLElement>(`[data-flip-to="${role}"]`);
    if (!from || !el) continue;
    const to = el.getBoundingClientRect();
    if (!to.width || !to.height) continue;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    // El texto escala por altura (conserva la proporción de la letra); el logo, por su lado mayor.
    const scale = role === 'logo' ? Math.max(from.width, from.height) / Math.max(to.width, to.height) : from.height / to.height;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01) continue;
    el.animate(
      [
        { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: role === 'value' ? 0.6 : 1 },
        { transformOrigin: '0 0', transform: 'none', opacity: 1 },
      ],
      { duration: role === 'logo' ? 560 : 520, easing: SPRING_EASE },
    );
  }
}
