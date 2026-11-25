/**
 * CONTEXT CONTROLLER del dock: qué composición mostrar.
 *
 * - Compactar o no lo decide `useDockShift` (intención del scroll, histéresis, zonas de dedo, teclado).
 * - El buscador del estado contextual reutiliza el buscador REAL de cada pantalla. No se inventa
 *   ninguna búsqueda: si la pantalla no tiene, la composición es burbuja + cámara.
 *
 * Buscadores reales conocidos (2026-11-25):
 *   Mercado      → «Buscar en este mercado» (visible en «Todo» o sin destacado)
 *   Movimientos  → «Buscar» dentro de «Buscar y fechas» (se abre el desplegable)
 *   Carteras     → «Buscar» de la lista completa de actividad
 *   Resumen      → PENDIENTE: no tiene buscador propio (cuentas, carteras y activos)
 *   Planes       → PENDIENTE: no tiene buscador
 * Una pantalla puede declarar el suyo con el atributo `data-dock-search` en el campo.
 */

const SEARCH_WORDS = /\bbusca|buscar\b/i;

function described(input: HTMLInputElement): string {
  const parts = [input.placeholder, input.getAttribute('aria-label') || '', input.type === 'search' ? 'buscar' : ''];
  const labelled = input.id ? input.ownerDocument.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
  if (labelled) parts.push(labelled.textContent || '');
  const wrap = input.closest('label');
  if (wrap) parts.push(wrap.textContent || '');
  const summary = input.closest('details')?.querySelector(':scope > summary');
  if (summary) parts.push(summary.textContent || '');
  return parts.join(' ');
}

/** Busca el campo de búsqueda real de la pantalla visible (dentro del scroll del Shell). */
export function findScreenSearch(root: HTMLElement | null): HTMLInputElement | null {
  if (!root) return null;
  const marked = root.querySelector<HTMLInputElement>('input[data-dock-search], [data-dock-search] input');
  if (marked) return marked;
  for (const input of root.querySelectorAll<HTMLInputElement>('input')) {
    if (input.disabled || input.type === 'hidden' || input.readOnly) continue;
    if (SEARCH_WORDS.test(described(input))) return input;
  }
  return null;
}

/** Lleva al buscador real: abre su desplegable si lo tiene, lo centra y le da el foco. */
export function openScreenSearch(input: HTMLInputElement, smooth: boolean) {
  const details = input.closest('details');
  if (details && !details.open) details.open = true;
  // El foco va primero (iOS solo abre el teclado dentro del gesto) y sin saltos de scroll.
  input.focus({ preventScroll: true });
  input.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
}
