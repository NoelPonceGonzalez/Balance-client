/**
 * Piezas del Resumen (F2): selectores con indicador compartido, almacén del scrub y
 * movimiento ligado al scroll. Solo las usa views/Dashboard.tsx.
 */
import { useEffect, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { motion, useMotionValue, useReducedMotion, type MotionValue } from 'motion/react';
import { ChartLine, ChartPie } from 'lucide-react';
import { LINE_RANGES, type LineRangeId } from '@/components/LineRanges';
import { softSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';

/* ───────────── Scrub: el dedo sobre la gráfica ya no re-renderiza todo el Resumen ───────────── */

export interface ScrubState {
  value: number | null;
  day: string | null;
  move: { amount: number; pct: number | null } | null;
}

export interface ScrubStore {
  get: () => ScrubState;
  subscribe: (listener: () => void) => () => void;
  onValue: (value: number) => void;
  onDay: (day: string | null) => void;
  onMove: (move: { amount: number; pct: number | null } | null) => void;
}

/** Almacén mínimo: CashChart escribe en él y solo las cifras que lo leen se vuelven a pintar. */
export function createScrub(): ScrubStore {
  let state: ScrubState = { value: null, day: null, move: null };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<ScrubState>) => {
    const next = { ...state, ...patch };
    if (next.value === state.value && next.day === state.day && next.move === state.move) return;
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onValue: (value) => set({ value }),
    onDay: (day) => set({ day }),
    onMove: (move) => set({ move }),
  };
}

export function useScrub(store: ScrubStore): ScrubState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/* ───────────── Scroll del contenedor del Shell como MotionValue (sin estado de React) ───────────── */

/** Lee el scroll del `main` del Shell en un MotionValue: el encabezado se contrae sin renders. */
export function useShellScroll(anchor: RefObject<HTMLElement | null>): MotionValue<number> {
  const y = useMotionValue(0);
  useEffect(() => {
    const scroller = anchor.current?.closest<HTMLElement>('.app-scroll');
    if (!scroller) return;
    const read = () => y.set(scroller.scrollTop);
    read();
    scroller.addEventListener('scroll', read, { passive: true });
    return () => scroller.removeEventListener('scroll', read);
  }, [anchor, y]);
  return y;
}

/* ───────────── Selectores ───────────── */

/** General / Cartera: texto con una raya que se desliza entre las dos (geometría continua). */
export function ScopeTabs({ value, onChange }: { value: 'general' | 'cartera'; onChange: (next: 'general' | 'cartera') => void }) {
  const still = useReducedMotion();
  return (
    <div role="tablist" aria-label="Vista del resumen" className="flex items-center gap-5" data-no-squish>
      {(['general', 'cartera'] as const).map((item) => {
        const on = value === item;
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(item)}
            className={cn(
              'relative py-1.5 text-[15px] font-semibold tracking-[-0.01em] transition-colors duration-200 active:opacity-60',
              on ? 'text-slate-950 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300',
            )}
          >
            {item === 'general' ? 'General' : 'Cartera'}
            {on && (
              <motion.span
                layoutId="resumen-scope"
                layoutDependency={value}
                transition={still ? { duration: 0 } : softSpring}
                className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-slate-950 dark:bg-white"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* Fluidez: con `layoutDependency` (la opción elegida) Motion solo mide y anima la raya o la pastilla cuando cambia
   la elección. Sin ella, cada render del Resumen (datos, latido, scrub) pedía una medición completa del árbol de
   proyección con lectura forzada del layout. El deslizamiento es el mismo: medido fotograma a fotograma, también
   con el contenido desplazado. */

/** Pastilla con indicador compartido. La usan los rangos y el cambio Línea / Reparto. */
function Track({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={id} className={cn('relative flex items-center', className)} data-no-squish>
      {children}
    </div>
  );
}

function Mark({ layoutId, dep }: { layoutId: string; dep: string }) {
  const still = useReducedMotion();
  return (
    <motion.span
      layoutId={layoutId}
      layoutDependency={dep}
      transition={still ? { duration: 0 } : softSpring}
      className="pointer-events-none absolute inset-0 rounded-full bg-slate-100 dark:bg-white/[0.12]"
    />
  );
}

/** Rangos 1d · 1s · 1m · 1a · max, con la pastilla que viaja de uno a otro. */
export function RangeBar({ value, onChange }: { value: LineRangeId; onChange: (next: LineRangeId) => void }) {
  return (
    <Track id="Rango de la gráfica" className="gap-0.5">
      {LINE_RANGES.map((item) => {
        const on = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative h-8 min-w-[2.5rem] rounded-full px-2.5 text-[13px] font-semibold uppercase tabular-nums transition-[color,transform] duration-200 active:scale-[0.92]',
              on ? 'text-slate-950 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300',
            )}
          >
            {on && <Mark layoutId="resumen-range" dep={value} />}
            <span className="relative">{item.label}</span>
          </button>
        );
      })}
    </Track>
  );
}

/** Línea / Reparto como dos iconos: no compite con los rangos. */
export function ChartToggle({ value, onChange }: { value: 'line' | 'ring'; onChange: (next: 'line' | 'ring') => void }) {
  return (
    <Track id="Tipo de gráfica" className="rounded-full p-0.5 ring-1 ring-slate-200 dark:ring-white/10">
      {([['line', 'Línea', ChartLine], ['ring', 'Reparto', ChartPie]] as const).map(([id, label, Icon]) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            aria-label={label}
            title={label}
            onClick={() => onChange(id)}
            className={cn(
              'relative grid h-7 w-9 place-items-center rounded-full transition-[color,transform] duration-200 active:scale-[0.9]',
              on ? 'text-slate-950 dark:text-white' : 'text-slate-400 dark:text-slate-500',
            )}
          >
            {on && <Mark layoutId="resumen-chart" dep={value} />}
            <Icon size={16} strokeWidth={2.2} className="relative" />
          </button>
        );
      })}
    </Track>
  );
}

/** Marca la superficie blanca del Resumen mientras está montado (ver index.css, fuera del bloque del dock). */
export function useResumenSurface() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.surface = 'resumen';
    return () => {
      if (root.dataset.surface === 'resumen') delete root.dataset.surface;
    };
  }, []);
}
