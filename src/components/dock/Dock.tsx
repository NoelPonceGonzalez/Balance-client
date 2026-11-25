/**
 * Dock flotante de Balance: superficie Liquid Glass viva (integración F6 + material aprobado).
 *
 *   Glass Material      → .liquid-glass + GlassCapsule (mismo mapa óptico que el dock aprobado)
 *   Glass Geometry      → GlassCapsule cambia de ancho real por fotograma sin recalcular mapas
 *   Navigation Motion   → dock-motion.ts: muelles morph / slot / shift / press y geometría pura
 *   Context Controller  → useDockShift (scroll, histéresis, teclado) + dock-context.ts (buscador real)
 *
 * Estado normal: cápsula con cinco iconos sin etiquetas, cámara central, indicador de cristal y
 * desplazamiento lateral hacia la pestaña activa (cápsula e indicador con el mismo muelle).
 * Al bajar: la cápsula se recoge en la burbuja de la pestaña activa, el buscador nace de su canto
 * y la cámara viaja a la derecha. Al subir o tocar la burbuja: fusión inversa desde cualquier punto.
 * Solo cambia el estado de React al cruzar umbrales; cada fotograma se escribe vía MotionValues.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion, useReducedMotion, useSpring, useTransform, useVelocity, type MotionValue } from 'motion/react';
import { ArrowLeftRight, Camera, LayoutDashboard, LineChart, Search, Target } from 'lucide-react';
import { dockRoomFor, useDockShift, useKeyboardOpen } from '@/components/dock-shift';
import { GlassCapsule } from '@/components/dock/GlassCapsule';
import { findScreenSearch, openScreenSearch } from '@/components/dock/dock-context';
import {
  CAMERA_SLOT, GLASS_H, INDICATOR, MORPH_SPRING, NAV_SPRING, PRESS_SPRING,
  clamp01, dockFrame, lerp, shiftFor, slotCenter, span,
} from '@/components/dock/dock-motion';
import { cn } from '@/lib/utils';

type DockSection = 'dashboard' | 'market' | 'plans' | 'movements' | 'settings';

const TABS = [
  { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard, slot: 0 },
  { id: 'market', label: 'Mercado', icon: LineChart, slot: 1 },
  { id: 'plans', label: 'Planes', icon: Target, slot: 3 },
  { id: 'movements', label: 'Movimientos', icon: ArrowLeftRight, slot: 4 },
] as const;

const slotOf = (section: string) => TABS.find((tab) => tab.id === section)?.slot ?? -1;
const HALF = GLASS_H / 2;

export function Dock<S extends DockSection>({ section, onChange, onTicket, scrollRef }: {
  section: S;
  onChange: (section: S) => void;
  onTicket: () => void;
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const expandRef = useRef<(() => void) | null>(null);
  const compact = useDockShift(scrollRef, section, { minRoom: dockRoomFor(section), enabled: !reduceMotion, control: expandRef });
  const keyboard = useKeyboardOpen();
  const active = slotOf(section);

  // Ancho del contenedor: se mide solo al cambiar de tamaño.
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setWidth(Math.round(box.clientWidth));
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(box);
    return () => watch.disconnect();
  }, []);

  // Buscador real de la pantalla (si no hay, el estado contextual es burbuja + cámara).
  const [withSearch, setWithSearch] = useState(false);
  useLayoutEffect(() => {
    if (compact) setWithSearch(Boolean(findScreenSearch(scrollRef.current)));
  }, [compact, section, scrollRef]);

  // Muelles: interrumpibles, conservan la velocidad al invertir la dirección.
  const morph = useSpring(0, MORPH_SPRING);
  const slot = useSpring(Math.max(0, active), NAV_SPRING);
  const shift = useSpring(0, NAV_SPRING);
  const press = useSpring(0, PRESS_SPRING);
  const boxW = useSpring(0, NAV_SPRING);
  const search = useSpring(0, NAV_SPRING);
  const firstWidth = useRef(true);
  useEffect(() => {
    if (!width) return;
    const move = reduceMotion || firstWidth.current ? 'jump' : 'set';
    firstWidth.current = false;
    boxW[move](width);
    shift[move](shiftFor(active, width));
  }, [width, active, reduceMotion, boxW, shift]);
  useEffect(() => {
    if (active < 0) return;
    if (reduceMotion) slot.jump(active);
    else slot.set(active);
  }, [active, reduceMotion, slot]);
  useEffect(() => {
    if (reduceMotion) morph.jump(compact ? 1 : 0);
    else morph.set(compact ? 1 : 0);
  }, [compact, reduceMotion, morph]);
  useEffect(() => { search.jump(withSearch ? 1 : 0); }, [withSearch, search]);

  const [pressed, setPressed] = useState(false);
  useEffect(() => { press.set(pressed && !reduceMotion ? 1 : 0); }, [pressed, reduceMotion, press]);

  const frame = (pick: (f: ReturnType<typeof dockFrame>, t: number) => number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTransform([morph, shift, boxW, search] as MotionValue<number>[], ([p, s, w, q]: number[]) => pick(dockFrame(p, s, w, q > 0.5), clamp01(p)));

  const ax = frame((f) => f.ax);
  const aw = frame((f) => f.aw);
  const bx = frame((f) => f.bx);
  const bw = frame((f) => f.bw);
  const bGlass = frame((f) => f.bOpacity);
  const bContent = frame((f, t) => f.bOpacity * span(t, 0.45, 0.9));
  const camD = frame((f) => f.camD);
  const camLeft = frame((f) => f.camX - f.camD / 2);
  const camTop = frame((f) => (GLASS_H - f.camD) / 2);
  const camShadow = useTransform(morph, (p) => `0 10px 24px -10px rgb(15 23 42 / ${(0.5 * clamp01(p)).toFixed(3)})`);

  // Deformación sutil del cristal: compresión al pulsar, elongación según la velocidad.
  const morphVel = useVelocity(morph);
  const shiftVel = useVelocity(shift);
  const glassScaleX = useTransform([press, morphVel, shiftVel] as MotionValue<number>[], ([pr, mv, sv]: number[]) =>
    (1 - 0.015 * pr) * (1 + 0.025 * Math.min(1, Math.abs(mv) / 6) + 0.02 * Math.min(1, Math.abs(sv) / 900)));
  const glassScaleY = useTransform([press, morphVel, shiftVel] as MotionValue<number>[], ([pr, mv, sv]: number[]) =>
    (1 - 0.035 * pr) * (1 - 0.04 * Math.min(1, Math.abs(mv) / 6) - 0.025 * Math.min(1, Math.abs(sv) / 900)));

  // Indicador activo: viaja con el mismo muelle que la cápsula y se convierte en la burbuja.
  const slotVel = useVelocity(slot);
  const indX = useTransform([slot, morph] as MotionValue<number>[], ([s, p]: number[]) => lerp(slotCenter(s), HALF, clamp01(p)) - INDICATOR / 2);
  const indOpacity = useTransform(morph, (p) => (active < 0 ? 0 : 1 - span(p, 0.55, 1)));
  const indScaleX = useTransform(slotVel, (v) => 1 + 0.16 * Math.min(1, Math.abs(v) / 14));
  const indScaleY = useTransform(slotVel, (v) => 1 - 0.14 * Math.min(1, Math.abs(v) / 14));

  const geometry = { pointerEvents: 'auto' as const };
  const pressHandlers = {
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
  };

  const openSearch = () => {
    const input = findScreenSearch(scrollRef.current);
    if (input) openScreenSearch(input, !reduceMotion);
    else expandRef.current?.();
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[var(--app-bg)]/25 via-[var(--app-bg)]/5 to-transparent" />
      <motion.div
        data-dock
        data-compact={compact ? '' : undefined}
        className="relative px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-2"
        initial={false}
        animate={keyboard ? { y: '130%', opacity: 0 } : { y: 0, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', ...NAV_SPRING }}
        aria-hidden={keyboard || undefined}
      >
        <nav ref={boxRef} aria-label="Navegación" className="relative mx-auto w-full max-w-md" style={{ height: GLASS_H }}>
          {width > 0 && (
            <>
              {/* Cristal B (buscador) debajo de la cápsula: nace de su canto al separarse. */}
              <GlassCapsule x={bx} width={bw} height={GLASS_H} opacity={bGlass} />
              {/* Cristal A: cápsula → burbuja. Mismo material en todo el recorrido. */}
              <GlassCapsule x={ax} width={aw} height={GLASS_H} scaleX={glassScaleX} scaleY={glassScaleY} pressed={pressed} />

              {/* Contenido de A: recortado por su forma, nunca deformado ni refractado. */}
              <motion.div className="absolute left-0 top-0 overflow-hidden rounded-full" style={{ x: ax, width: aw, height: GLASS_H, borderRadius: 999 }} {...pressHandlers}>
                {active >= 0 && (
                  <motion.span aria-hidden className="pointer-events-none absolute left-0" style={{ x: indX, top: (GLASS_H - INDICATOR) / 2, width: INDICATOR, height: INDICATOR, opacity: indOpacity, scaleX: indScaleX, scaleY: indScaleY }}>
                    <span className="glass-indicator absolute inset-0 rounded-full" />
                  </motion.span>
                )}
                {TABS.map((tab) => (
                  <TabButton
                    key={tab.id}
                    tab={tab}
                    isActive={tab.slot === active}
                    compact={compact}
                    morph={morph}
                    style={geometry}
                    onPress={() => {
                      if (compact && tab.slot === active) expandRef.current?.();
                      else onChange(tab.id as S);
                    }}
                  />
                ))}
              </motion.div>

              {/* Contenido de B: el buscador real de la pantalla. */}
              <motion.button
                type="button"
                aria-label="Buscar en esta pantalla"
                tabIndex={compact && withSearch ? 0 : -1}
                aria-hidden={!(compact && withSearch) || undefined}
                onClick={openSearch}
                className={cn('absolute left-0 top-0 flex items-center gap-2.5 rounded-full pl-5 pr-4 text-left', compact && withSearch ? 'pointer-events-auto' : 'pointer-events-none')}
                style={{ x: bx, width: bw, height: GLASS_H, opacity: bContent }}
              >
                <span className="glass-label grid shrink-0 place-items-center text-slate-600 dark:text-slate-300"><Search size={20} strokeWidth={1.9} /></span>
                <span className="truncate text-[17px] font-medium text-slate-500 dark:text-slate-400">Buscar</span>
              </motion.button>

              {/* Cámara: del centro de la cápsula a su posición independiente. */}
              <motion.button
                type="button"
                onClick={onTicket}
                aria-label="Hacer una foto"
                className="pointer-events-auto absolute left-0 top-0 z-10 grid place-items-center rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                style={{ x: camLeft, y: camTop, width: camD, height: camD, borderRadius: 999, boxShadow: camShadow }}
                whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                transition={{ type: 'spring', ...PRESS_SPRING }}
              >
                <Camera size={18} strokeWidth={1.75} />
              </motion.button>
            </>
          )}
        </nav>
      </motion.div>
    </div>
  );
}

function TabButton({ tab, isActive, compact, morph, style, onPress }: {
  tab: (typeof TABS)[number];
  isActive: boolean;
  compact: boolean;
  morph: MotionValue<number>;
  style: { pointerEvents: 'auto' };
  onPress: () => void;
}) {
  const Icon = tab.icon;
  // La pestaña activa viaja al centro de la burbuja; las demás se apagan antes de quedar recortadas.
  const x = useTransform(morph, (p) => (isActive ? lerp(slotCenter(tab.slot), HALF, clamp01(p)) : slotCenter(tab.slot)) - HALF);
  const fade = useTransform(morph, (p) => (isActive ? 1 : 1 - span(p, 0, 0.4)));
  const shrink = useTransform(morph, (p) => (isActive ? 1 : 1 - 0.25 * span(p, 0, 0.4)));
  const hidden = compact && !isActive;
  return (
    <motion.button
      type="button"
      aria-label={compact && isActive ? `${tab.label} · mostrar la navegación` : tab.label}
      aria-current={isActive ? 'page' : undefined}
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
      onClick={onPress}
      className={cn(
        'glass-label absolute left-0 top-0 grid place-items-center rounded-full',
        isActive ? 'text-slate-950 dark:text-white' : 'text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white',
      )}
      style={{ ...style, x, opacity: fade, scale: shrink, width: GLASS_H, height: GLASS_H, pointerEvents: hidden ? 'none' : 'auto' }}
    >
      <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
    </motion.button>
  );
}
