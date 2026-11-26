/**
 * Piezas comunes de las hojas (Bloque E): cambios sin guardar, operaciones en curso, Escape y cierre protegido.
 * Las usan `Modal` y `Overlay` (components/Modal.tsx) y las hojas propias de Planes, Viajes y CSFloat.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * ¿Ha cambiado el formulario desde que se abrió? `value` es el estado del formulario (null = cerrado).
 * La primera vez que deja de ser null se toma como punto de partida; al cerrarse, se olvida.
 */
export function useDirty(value: unknown): boolean {
  const start = useRef<string | null>(null);
  const now = value == null ? null : JSON.stringify(value);
  if (now == null) start.current = null;
  else if (start.current == null) start.current = now;
  return now != null && now !== start.current;
}

/** Una operación a la vez: `run` ignora llamadas mientras la anterior sigue en curso; `pending` lo dice. */
export function usePending(): [boolean, <T>(task: () => Promise<T>) => Promise<T | undefined>] {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const run = useCallback(async <T,>(task: () => Promise<T>) => {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    try {
      return await task();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);
  return [pending, run];
}

// Hojas abiertas, de abajo arriba: Escape solo cierra la de encima.
const stack: symbol[] = [];

/** Escape cierra la hoja de encima (y solo esa). `onEscape` siempre es la versión más reciente. */
export function useEscapeLayer(onEscape: () => void) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => {
    const me = Symbol('hoja');
    stack.push(me);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || stack[stack.length - 1] !== me || event.defaultPrevented) return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const at = stack.indexOf(me);
      if (at >= 0) stack.splice(at, 1);
    };
  }, []);
}

/** Cierre protegido de la hoja que lo contiene: `ModalClose` lo usa si existe (pregunta si hay cambios). */
export const SheetCloseContext = createContext<(() => void) | null>(null);
export function useSheetClose(): (() => void) | null {
  return useContext(SheetCloseContext);
}
