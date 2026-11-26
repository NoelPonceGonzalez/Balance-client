/**
 * Buscador único de Balance: vive en el dock y sirve a la pantalla visible.
 *
 * Cada pantalla que se puede buscar llama a `useDockSearch(placeholder)` y filtra con lo que devuelve.
 * La pantalla montada más recientemente manda (p. ej., la lista de transacciones de una cartera sobre el
 * Resumen). Al cambiar de pantalla o de buscador, el texto se vacía.
 *
 * El texto llega a las pantallas como valor diferido (useDeferredValue): escribir nunca espera a que se
 * vuelva a pintar una lista larga. El dock lee el valor inmediato.
 */
import { createContext, useCallback, useContext, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

interface Entry { id: string; placeholder: string }

interface Control {
  setQuery: (query: string) => void;
  register: (id: string, placeholder: string) => void;
  unregister: (id: string) => void;
  /** El dock instala aquí la función que abre el buscador (foco + composición contextual). */
  opener: { current: (() => void) | null };
}

const QueryContext = createContext('');
const EntryContext = createContext<Entry | null>(null);
const ControlContext = createContext<Control | null>(null);

export function DockSearchProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const [query, setQueryState] = useState('');
  const [top, setTop] = useState<Entry | null>(null);
  const entries = useRef<Entry[]>([]);
  const opener = useRef<(() => void) | null>(null);

  const topRef = useRef<Entry | null>(null);
  const refresh = useCallback(() => {
    const next = entries.current[entries.current.length - 1] || null;
    const prev = topRef.current;
    if (prev?.id === next?.id && prev?.placeholder === next?.placeholder) return;
    topRef.current = next;
    if (prev?.id !== next?.id) setQueryState('');
    setTop(next);
  }, []);

  const control = useMemo<Control>(() => ({
    setQuery: (value) => setQueryState(value),
    register: (id, placeholder) => {
      const list = entries.current;
      const at = list.findIndex((entry) => entry.id === id);
      if (at >= 0) list[at] = { id, placeholder };
      else list.push({ id, placeholder });
      refresh();
    },
    unregister: (id) => {
      entries.current = entries.current.filter((entry) => entry.id !== id);
      refresh();
    },
    opener,
  }), [refresh]);

  useEffect(() => { setQueryState(''); }, [scope]);

  return (
    <ControlContext.Provider value={control}>
      <EntryContext.Provider value={top}>
        <QueryContext.Provider value={query}>{children}</QueryContext.Provider>
      </EntryContext.Provider>
    </ControlContext.Provider>
  );
}

/**
 * Para las pantallas: registra el buscador (si `placeholder` no es null) y devuelve [texto, cambiar texto].
 * El texto es diferido: úsalo para filtrar.
 */
export function useDockSearch(placeholder: string | null): [string, (query: string) => void] {
  const control = useContext(ControlContext);
  const query = useContext(QueryContext);
  const deferred = useDeferredValue(query);
  const id = useId();
  useEffect(() => {
    if (!control || placeholder == null) return;
    control.register(id, placeholder);
    return () => control.unregister(id);
  }, [control, id, placeholder]);
  const set = useCallback((value: string) => control?.setQuery(value), [control]);
  return [placeholder == null ? '' : deferred, set];
}

/** Para el dock: texto inmediato, buscador activo y control. */
export function useDockSearchControl() {
  return { query: useContext(QueryContext), entry: useContext(EntryContext), control: useContext(ControlContext) };
}

/** Abre el buscador del dock desde una pantalla (p. ej., un botón «Buscar» propio). */
export function useOpenDockSearch(): () => void {
  const control = useContext(ControlContext);
  return useCallback(() => control?.opener.current?.(), [control]);
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Coincidencia sin acentos ni mayúsculas; todas las palabras de la búsqueda tienen que aparecer. */
export function matchesSearch(query: string, ...parts: (string | number | null | undefined)[]): boolean {
  const words = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold(parts.filter((part) => part != null && part !== '').join(' '));
  return words.every((word) => haystack.includes(word));
}
