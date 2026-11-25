/**
 * F6 (prototipo): decide si el dock está expandido o compacto según la intención del scroll.
 * - Solo cambia el estado de React cuando cruza un umbral (no por cada píxel).
 * - Histéresis: hace falta bajar ~28 px seguidos para compactar y subir ~18 px para expandir.
 * - Ignora gestos horizontales (el scroll vertical no cambia) y los dedos sobre la gráfica o filtros.
 * - Pantallas cortas o sin scroll útil: siempre expandido. Al cambiar de pantalla: expandido.
 */
import { useEffect, useState, type RefObject } from 'react';

const DOWN_RUN = 28;
const UP_RUN = 18;
const TOP_ZONE = 48;
const COMPACT_FROM = 96;
const FINGER_ZONES = '.chart-finger, .market-pills, [data-dock-ignore]';

export interface DockShiftOptions {
  /** Recorrido mínimo de scroll para que compactar tenga sentido. */
  minRoom: number;
  enabled: boolean;
}

export function dockRoomFor(section: string): number {
  // Planes suele ser corto y sus acciones van al final: solo compacta con recorrido amplio.
  return section === 'plans' ? 560 : 280;
}

export function useDockShift(scrollRef: RefObject<HTMLElement | null>, section: string, { minRoom, enabled }: DockShiftOptions): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const scroller = scrollRef.current;
    setCompact(false);
    if (!scroller || !enabled) return;
    const narrow = window.matchMedia('(max-width: 639px)');
    let state = false;
    let last = scroller.scrollTop;
    let run = 0;
    let finger = false;
    const set = (next: boolean) => {
      if (next === state) return;
      state = next;
      setCompact(next);
    };
    const onScroll = () => {
      const y = scroller.scrollTop;
      const dy = y - last;
      last = y;
      if (finger || !narrow.matches) return;
      const room = scroller.scrollHeight - scroller.clientHeight;
      if (y <= TOP_ZONE || room < minRoom) {
        run = 0;
        set(false);
        return;
      }
      // El rebote del final (iOS) devuelve el scroll hacia arriba: no es intención de subir.
      if (dy < 0 && y >= room - 4) return;
      if (dy === 0) return;
      if (run !== 0 && Math.sign(dy) !== Math.sign(run)) run = 0;
      run += dy;
      if (!state && run > DOWN_RUN && y > COMPACT_FROM) {
        run = 0;
        set(true);
      } else if (state && run < -UP_RUN) {
        run = 0;
        set(false);
      }
    };
    const onDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(FINGER_ZONES)) finger = true;
    };
    const onUp = () => {
      if (!finger) return;
      finger = false;
      last = scroller.scrollTop;
      run = 0;
    };
    const onNarrow = () => {
      if (!narrow.matches) set(false);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    narrow.addEventListener('change', onNarrow);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      narrow.removeEventListener('change', onNarrow);
    };
  }, [scrollRef, section, minRoom, enabled]);

  return enabled && compact;
}

/** Teclado abierto (visualViewport encoge): el dock se aparta para no tapar el campo. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const check = () => {
      const next = window.innerHeight - view.height > 140;
      setOpen((prev) => (prev === next ? prev : next));
    };
    view.addEventListener('resize', check);
    return () => view.removeEventListener('resize', check);
  }, []);
  return open;
}
