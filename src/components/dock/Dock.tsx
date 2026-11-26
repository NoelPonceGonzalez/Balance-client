/**
 * Dock flotante de Balance: superficie Liquid Glass viva.
 *
 *   Glass Material      → .liquid-glass + GlassCapsule (mismo material aprobado, en dos capas)
 *   Glass Geometry      → GlassCapsule: solo transforms y clip-path por fotograma, ninguna capa cambia de tamaño
 *   Navigation Motion   → dock-motion.ts: muelles morph / slot / press y geometría pura
 *   Context Controller  → useDockShift (scroll, histéresis, teclado) + dock-search.tsx (buscador único)
 *
 * Estado normal: cápsula centrada con cinco iconos sin etiquetas, cámara central e indicador de cristal.
 * Al bajar (o al tocar la pestaña activa): la cápsula se recoge en la burbuja de la pestaña activa, el
 * buscador nace de su canto y la cámara viaja a la derecha. Al subir o tocar la burbuja: fusión inversa
 * desde cualquier punto. React solo vuelve a pintar al cruzar umbrales; cada fotograma va por MotionValues.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { ArrowLeftRight, Camera, LayoutDashboard, LineChart, Search, Target, X } from 'lucide-react';
import { dockRoomFor, useDockShift } from '@/components/dock-shift';
import { GlassCapsule } from '@/components/dock/GlassCapsule';
import { useDockSearchControl } from '@/components/dock/dock-search';
import {
  CAPSULE_W, GLASS_H, INDICATOR, MORPH_SPRING, NAV_SPRING, PRESS_SPRING,
  bell, clamp01, dockFrame, lerp, searchMax, slotCenter, smooth, span,
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
const roundClip = (hidden: number) => `inset(0px ${Math.max(0, hidden).toFixed(2)}px 0px 0px round ${HALF}px)`;

/** Altura del teclado en pantalla (visualViewport). 0 si no hay teclado. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const read = () => {
      const next = Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop));
      setInset((prev) => (Math.abs(prev - next) < 2 ? prev : next));
    };
    read();
    view.addEventListener('resize', read);
    view.addEventListener('scroll', read);
    return () => {
      view.removeEventListener('resize', read);
      view.removeEventListener('scroll', read);
    };
  }, []);
  return inset > 140 ? inset : 0;
}

export function Dock<S extends DockSection>({ section, onChange, onTicket, scrollRef }: {
  section: S;
  onChange: (section: S) => void;
  onTicket: () => void;
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const expandRef = useRef<(() => void) | null>(null);
  const compact = useDockShift(scrollRef, section, { minRoom: dockRoomFor(section), enabled: !reduceMotion, control: expandRef });
  const keyboard = useKeyboardInset();
  const active = slotOf(section);
  const { query, entry, control } = useDockSearchControl();
  const withSearch = Boolean(entry);

  // Buscador: abierto (foco o texto) mantiene la composición contextual aunque se suba.
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [opened, setOpened] = useState(false);
  const searching = withSearch && (focused || opened || query.length > 0);
  const shown = compact || searching;
  useEffect(() => { setOpened(false); setFocused(false); }, [section]);

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

  // Muelles: interrumpibles, conservan la velocidad al invertir la dirección.
  const morph = useSpring(0, MORPH_SPRING);
  const slot = useSpring(Math.max(0, active), NAV_SPRING);
  const press = useSpring(0, PRESS_SPRING);
  const boxW = useSpring(0, NAV_SPRING);
  const search = useSpring(withSearch ? 1 : 0, NAV_SPRING);
  const travelFrom = useRef(Math.max(0, active));
  const firstWidth = useRef(true);
  useEffect(() => {
    if (!width) return;
    if (reduceMotion || firstWidth.current) boxW.jump(width);
    else boxW.set(width);
    firstWidth.current = false;
  }, [width, reduceMotion, boxW]);
  useEffect(() => {
    if (active < 0) return;
    travelFrom.current = slot.get();
    if (reduceMotion) slot.jump(active);
    else slot.set(active);
  }, [active, reduceMotion, slot]);
  useEffect(() => {
    if (reduceMotion) morph.jump(shown ? 1 : 0);
    else morph.set(shown ? 1 : 0);
  }, [shown, reduceMotion, morph]);
  useEffect(() => { search.jump(withSearch ? 1 : 0); }, [withSearch, search]);

  const [pressed, setPressed] = useState(false);
  useEffect(() => { press.set(pressed && !reduceMotion ? 1 : 0); }, [pressed, reduceMotion, press]);

  const frame = (pick: (f: ReturnType<typeof dockFrame>, t: number) => number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTransform([morph, boxW, search] as MotionValue<number>[], ([p, w, q]: number[]) => pick(dockFrame(p, w, q > 0.5), clamp01(p)));

  const ax = frame((f) => f.ax);
  const aw = frame((f) => f.aw);
  const bx = frame((f) => f.bx);
  const bw = frame((f) => f.bw);
  const bGlass = frame((f) => f.bOpacity);
  const bContent = frame((f, t) => f.bOpacity * smooth(span(t, 0.5, 0.95)));
  const camD = frame((f) => f.camD);
  const camX = frame((f) => f.camX - f.camD / 2);
  const camY = frame((f) => (GLASS_H - f.camD) / 2);
  const camScale = useTransform(camD, (d) => d / GLASS_H);
  const camIcon = useTransform(camD, (d) => GLASS_H / d);
  const camShadow = useTransform(morph, (p) => `0 10px 24px -10px rgb(15 23 42 / ${(0.5 * clamp01(p)).toFixed(3)})`);
  const contentClip = useTransform(aw, (w) => roundClip(CAPSULE_W - w));
  const bMax = searchMax(width || 390);
  const bClip = useTransform(bw, (w) => roundClip(bMax - w));

  // Deformación sutil y determinista: campana durante la separación, hundimiento al pulsar.
  const glassScaleX = useTransform([press, morph] as MotionValue<number>[], ([pr, p]: number[]) => (1 - 0.015 * pr) * (1 + 0.018 * bell(p)));
  const glassScaleY = useTransform([press, morph] as MotionValue<number>[], ([pr, p]: number[]) => (1 - 0.035 * pr) * (1 - 0.03 * bell(p)));

  // Indicador: viaja con el muelle de referencia y se estira en campana según el recorrido.
  const indX = useTransform([slot, morph] as MotionValue<number>[], ([s, p]: number[]) => lerp(slotCenter(s), HALF, clamp01(p)) - INDICATOR / 2);
  const indOpacity = useTransform(morph, (p) => (active < 0 ? 0 : 1 - smooth(span(p, 0.5, 1))));
  const travel = useTransform(slot, (s) => {
    const total = Math.abs(active - travelFrom.current);
    return total < 0.01 ? 0 : bell(1 - Math.abs(active - s) / total) * Math.min(1, total / 2);
  });
  const indScaleX = useTransform(travel, (k) => 1 + 0.16 * k);
  const indScaleY = useTransform(travel, (k) => 1 - 0.12 * k);

  const pressHandlers = {
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
  };

  // Abrir el buscador: foco dentro del mismo gesto (iOS solo abre el teclado así) y composición contextual.
  const openSearch = useCallback(() => {
    if (!withSearch) return;
    setOpened(true);
    inputRef.current?.focus({ preventScroll: true });
  }, [withSearch]);
  const closeSearch = useCallback(() => {
    control?.setQuery('');
    setOpened(false);
    inputRef.current?.blur();
    expandRef.current?.();
  }, [control]);
  useEffect(() => {
    if (!control) return;
    control.opener.current = openSearch;
    return () => { control.opener.current = null; };
  }, [control, openSearch]);

  // Escritorio: «/» o Ctrl/Cmd + K abren el buscador.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
        if (!withSearch) return;
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch, withSearch]);

  const lift = keyboard && focused ? -keyboard : 0;
  const hide = keyboard > 0 && !focused;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[var(--app-bg)]/25 via-[var(--app-bg)]/5 to-transparent" />
      <motion.div
        data-dock
        data-compact={shown ? '' : undefined}
        className="relative px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-2"
        initial={false}
        animate={hide ? { y: '130%', opacity: 0 } : { y: lift, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 }}
        aria-hidden={hide || undefined}
      >
        <nav ref={boxRef} aria-label="Navegación" className="relative mx-auto w-full max-w-md" style={{ height: GLASS_H }}>
          {width > 0 && (
            <>
              {/* Cristal B (buscador) debajo de la cápsula: nace de su canto al separarse. */}
              <SearchGlass x={bx} width={bw} opacity={bGlass} span={bMax} />
              {/* Cristal A: cápsula → burbuja. Mismo material en todo el recorrido. */}
              <GlassCapsule x={ax} width={aw} height={GLASS_H} span={CAPSULE_W} scaleX={glassScaleX} scaleY={glassScaleY} pressed={pressed} />

              {/* Contenido de A: recortado a su forma (clip-path, sin cambiar de tamaño). Nunca se deforma. */}
              <motion.div className="absolute left-0 top-0" style={{ x: ax, width: CAPSULE_W, height: GLASS_H, clipPath: contentClip }} {...pressHandlers}>
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
                    compact={shown}
                    morph={morph}
                    onPress={() => {
                      if (tab.slot !== active) onChange(tab.id as S);
                      else if (searching) closeSearch();
                      else if (shown) expandRef.current?.();
                      else openSearch();
                    }}
                  />
                ))}
              </motion.div>

              {/* Contenido de B: el buscador real de la pantalla visible. */}
              <motion.div className="absolute left-0 top-0" style={{ x: bx, width: bMax, height: GLASS_H, clipPath: bClip, opacity: bContent }}>
                <label className={cn('flex h-full items-center gap-2.5 pl-5 pr-2', shown && withSearch ? 'pointer-events-auto' : 'pointer-events-none')} style={{ width: bMax }}>
                  <span className="glass-label grid shrink-0 place-items-center text-slate-600 dark:text-slate-300"><Search size={20} strokeWidth={1.9} /></span>
                  <input
                    ref={inputRef}
                    type="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    spellCheck={false}
                    value={query}
                    tabIndex={shown && withSearch ? 0 : -1}
                    aria-label={entry?.placeholder || 'Buscar'}
                    placeholder={entry?.placeholder || 'Buscar'}
                    onChange={(event) => control?.setQuery(event.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => { setFocused(false); setOpened(false); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') closeSearch();
                      if (event.key === 'Enter') inputRef.current?.blur();
                    }}
                    className="dock-search min-w-0 flex-1 bg-transparent text-[17px] font-medium text-slate-900 outline-none placeholder:text-slate-500 dark:text-white dark:placeholder:text-slate-400"
                  />
                  {query && (
                    <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => control?.setQuery('')} aria-label="Borrar búsqueda" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 dark:text-slate-300">
                      <X size={17} />
                    </button>
                  )}
                </label>
              </motion.div>

              {/* Cámara: del centro de la cápsula a su posición independiente. Solo transforms. */}
              <motion.button
                type="button"
                onClick={onTicket}
                aria-label="Hacer una foto"
                className="pointer-events-auto absolute left-0 top-0 z-10 rounded-full"
                style={{ x: camX, y: camY, width: GLASS_H, height: GLASS_H, scale: camScale, originX: 0, originY: 0 }}
                whileTap={reduceMotion ? undefined : { scale: 0.92 }}
              >
                <motion.span className="grid h-full w-full place-items-center rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950" style={{ boxShadow: camShadow }}>
                  <motion.span className="grid place-items-center" style={{ scale: camIcon }}>
                    <Camera size={18} strokeWidth={1.75} />
                  </motion.span>
                </motion.span>
              </motion.button>
            </>
          )}
        </nav>
      </motion.div>
    </div>
  );
}

/** Cristal del buscador: oculto (sin coste de backdrop-filter) mientras no se ve. */
const SearchGlass = memo(function SearchGlass({ x, width, opacity, span: wide }: { x: MotionValue<number>; width: MotionValue<number>; opacity: MotionValue<number>; span: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const apply = (value: number) => { host.style.visibility = value <= 0.001 ? 'hidden' : ''; };
    apply(opacity.get());
    return opacity.on('change', apply);
  }, [opacity]);
  return (
    <div ref={hostRef} className="absolute left-0 top-0">
      <GlassCapsule x={x} width={width} height={GLASS_H} span={wide} opacity={opacity} />
    </div>
  );
});

const TabButton = memo(function TabButton({ tab, isActive, compact, morph, onPress }: {
  tab: (typeof TABS)[number];
  isActive: boolean;
  compact: boolean;
  morph: MotionValue<number>;
  onPress: () => void;
}) {
  const Icon = tab.icon;
  // La pestaña activa viaja al centro de la burbuja; las demás se apagan antes de quedar recortadas.
  const x = useTransform(morph, (p) => (isActive ? lerp(slotCenter(tab.slot), HALF, clamp01(p)) : slotCenter(tab.slot)) - HALF);
  const fade = useTransform(morph, (p) => (isActive ? 1 : 1 - smooth(span(p, 0, 0.45))));
  const shrink = useTransform(morph, (p) => (isActive ? 1 : 1 - 0.2 * smooth(span(p, 0, 0.45))));
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
      style={{ x, opacity: fade, scale: shrink, width: GLASS_H, height: GLASS_H, pointerEvents: hidden ? 'none' : 'auto' }}
    >
      <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
    </motion.button>
  );
});
