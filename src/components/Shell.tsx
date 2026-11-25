import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { dockRoomFor, useDockShift, useKeyboardOpen } from '@/components/dock-shift';
import { LayoutDashboard, Target, Settings, ArrowLeftRight, LineChart, Camera } from 'lucide-react';
import { FixedCheck } from '@/components/FixedCheck';
import { OfferNotice } from '@/components/OfferNotice';
import { InstallApp } from '@/components/InstallApp';
import { GlassLens } from '@/components/LiquidGlass';
import { NotificationsBell } from '@/components/NotificationsBell';
import { OfferFocusContext } from '@/components/offer-focus';
import { cn } from '@/lib/utils';
import type { AppNotification, User } from '@/lib/types';

const ITEMS = [
  { id: 'dashboard', label: 'Resumen', short: 'Resumen', icon: LayoutDashboard },
  { id: 'market', label: 'Mercado', short: 'Mercado', icon: LineChart },
  { id: 'plans', label: 'Planes', short: 'Planes', icon: Target },
  { id: 'movements', label: 'Movimientos', short: 'Movs', icon: ArrowLeftRight },
] as const;

export type Section = (typeof ITEMS)[number]['id'] | 'settings';

/** Muelle del indicador de la pestaña activa: rápido y sin rebotes exagerados. */
const INDICATOR_SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 } as const;
/** Muelle de la pulsación: se hunde un poco y recupera con algo de elasticidad. */
const PRESS_SPRING = { type: 'spring', stiffness: 520, damping: 22, mass: 0.6 } as const;

const ChromeHidden = createContext<(hidden: boolean) => void>(() => {});

/** Oculta la barra de Balance mientras se está dentro de una cartera. */
export function useHideChrome() {
  return useContext(ChromeHidden);
}

export function Shell({
  section,
  onChange,
  onPlan,
  onListing,
  onTicket,
  onSettled,
  children,
}: {
  section: Section;
  onChange: (section: Section) => void;
  onPlan?: (planId: string) => void;
  onListing?: (listingId: string) => void;
  onTicket: () => void;
  user: User;
  onSettled: () => void;
  children: ReactNode;
}) {
  const [dueNonce, setDueNonce] = useState(0);
  const [dueKey, setDueKey] = useState<string | null>(null);
  const [focusedOffer, setFocusedOffer] = useState<AppNotification | null>(null);
  const [bare, setBare] = useState(false);
  const hideChrome = useCallback((hidden: boolean) => setBare(hidden), []);
  const scrollRef = useRef<HTMLElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    const band = bandRef.current;
    if (!scroller || !band) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let startX = 0;
    let startY = 0;
    let pulling = false;
    let pull = 0;
    let axis: 'wait' | 'side' | 'down' = 'wait';
    const atTop = () => scroller.scrollTop <= 0;
    const atBottom = () => scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    const begin = (x: number, y: number) => {
      startX = x;
      startY = y;
      pulling = false;
      pull = 0;
      axis = 'wait';
    };
    const move = (x: number, y: number, event: Event) => {
      const dx = x - startX;
      const delta = y - startY;
      if (axis === 'wait') {
        if (Math.abs(dx) < 8 && Math.abs(delta) < 8) return;
        axis = Math.abs(dx) > Math.abs(delta) ? 'side' : 'down';
      }
      if (axis === 'side') return;
      const outward = (atTop() && delta > 10) || (atBottom() && delta < -10);
      if (!pulling && !outward) return;
      if (!((atTop() && delta > 0) || (atBottom() && delta < 0))) return;
      pulling = true;
      pull = delta * 0.38 / (1 + Math.abs(delta) / 240);
      band.style.willChange = 'transform';
      band.style.transform = `translate3d(0, ${pull}px, 0)`;
      if (event.cancelable) event.preventDefault();
    };
    const release = () => {
      if (!pulling) return;
      const from = pull;
      pulling = false;
      pull = 0;
      band.style.transform = '';
      const anim = band.animate(
        [
          { transform: `translate3d(0, ${from}px, 0)`, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
          { transform: `translate3d(0, ${-from * 0.14}px, 0)`, offset: 0.4, easing: 'ease-in-out' },
          { transform: `translate3d(0, ${from * 0.05}px, 0)`, offset: 0.68, easing: 'ease-in-out' },
          { transform: `translate3d(0, ${-from * 0.015}px, 0)`, offset: 0.86, easing: 'ease-in-out' },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 900 },
      );
      anim.onfinish = () => {
        band.style.willChange = '';
      };
    };
    const onPills = (event: Event) => event.target instanceof Element && Boolean(event.target.closest('.market-pills, .chart-finger'));
    const onTouchStart = (event: TouchEvent) => {
      if (onPills(event)) return;
      begin(event.touches[0]?.clientX ?? 0, event.touches[0]?.clientY ?? 0);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (onPills(event)) return;
      move(event.touches[0]?.clientX ?? startX, event.touches[0]?.clientY ?? startY, event);
    };
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', release);
    scroller.addEventListener('touchcancel', release);
    return () => {
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', release);
      scroller.removeEventListener('touchcancel', release);
    };
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const key = `pat_scroll_${section}`;
    const saved = Number(sessionStorage.getItem(key) || '0');
    if (saved > 0) scroller.scrollTop = saved;
    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => sessionStorage.setItem(key, String(scroller.scrollTop)));
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      sessionStorage.setItem(key, String(scroller.scrollTop));
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [section]);

  return (
    <ChromeHidden.Provider value={hideChrome}>
    <OfferFocusContext.Provider value={setFocusedOffer}>
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]">
      <header aria-hidden={bare} style={section === 'market' ? { background: 'var(--market-tint, transparent)' } : section === 'plans' ? { background: 'var(--app-bg)' } : undefined} className={cn('relative z-10 grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-out', bare ? 'pointer-events-none grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100')}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex items-center justify-end gap-0.5 px-3 pb-1 pt-[max(0.35rem,env(safe-area-inset-top))] md:px-8">
            <InstallApp compact />
            {section !== 'market' && <NotificationsBell align="right" onPlan={onPlan} onListing={onListing} onOffer={setFocusedOffer} onDue={(quoteKey) => { setDueKey(quoteKey); setDueNonce((value) => value + 1); }} />}
            {section !== 'market' && (
            <button
              type="button"
              onClick={() => onChange('settings')}
              className={cn('rounded-full p-2', section === 'settings' ? 'text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}
              aria-label="Ajustes"
            >
              <Settings size={18} />
            </button>
            )}
          </div>
        </div>
      </header>
      <FixedCheck nonce={dueNonce} focusKey={dueKey} onSettled={onSettled} />
      <OfferNotice focused={focusedOffer} onFocusedClose={() => setFocusedOffer(null)} />
      <main ref={scrollRef} className={cn('app-scroll relative z-10 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-2 sm:px-4 md:px-8', bare && 'pt-[max(0.75rem,env(safe-area-inset-top))]')}>
        <div ref={bandRef} className="min-w-0 origin-top">
          {children}
        </div>
      </main>
      <Dock section={section} onChange={onChange} onTicket={onTicket} scrollRef={scrollRef} />
    </div>
    </OfferFocusContext.Provider>
    </ChromeHidden.Provider>
  );
}

/** Muelle de la geometría del dock (expandido ↔ compacto): firme, sin rebote visible. */
const DOCK_SPRING = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const;
/** Las etiquetas se van rápido antes de que encoja la superficie y vuelven cuando ya ha llegado. */
const LABEL_OUT = { duration: 0.12, ease: [0.4, 0, 1, 1] } as const;
const LABEL_IN = { duration: 0.24, ease: [0.22, 1, 0.36, 1], delay: 0.14 } as const;

/**
 * Continuidad espacial: al compactar, la cápsula se desplaza para que la pestaña activa quede
 * casi donde estaba (como en el vídeo, la barra encoge anclada a la pestaña activa).
 * Cálculo aritmético con las medidas del propio dock (sin leer el DOM). Devuelve px respecto al centro.
 */
function anchorShift(section: Section): number {
  const index = ITEMS.findIndex((item) => item.id === section);
  if (index < 0 || typeof window === 'undefined') return 0;
  const camera = 44;
  const wide = Math.min(window.innerWidth - 32, 448);
  const cell = (wide - 8 - camera) / ITEMS.length;
  const before = (k: number, size: number, slot: number) => 4 + (k < 2 ? (k + 0.5) * size : 2 * size + slot + (k - 2 + 0.5) * size);
  const fromCenterWide = before(index, cell, camera) - wide / 2;
  const narrow = 8 + ITEMS.length * 48 + 48;
  const fromCenterNarrow = before(index, 48, 48) - narrow / 2;
  return Math.round(fromCenterWide - fromCenterNarrow);
}

/**
 * Dock flotante. F6 (prototipo): se compacta al bajar con intención y se expande al subir.
 * Material, refracción, iconos, indicador y pulsación son los del dock aprobado (dock-approved-2026-11-25).
 * La geometría cambia con animaciones de layout (transform), así el cristal no se re-mide en cada fotograma.
 */
function Dock({ section, onChange, onTicket, scrollRef }: { section: Section; onChange: (section: Section) => void; onTicket: () => void; scrollRef: RefObject<HTMLElement | null> }) {
  const reduceMotion = useReducedMotion();
  const compact = useDockShift(scrollRef, section, { minRoom: dockRoomFor(section), enabled: !reduceMotion });
  const keyboard = useKeyboardOpen();
  // Dirección del último cambio de pestaña (para deformar el indicador hacia donde viaja).
  const [shownSection, setShownSection] = useState(section);
  const [travel, setTravel] = useState(0);
  if (shownSection !== section) {
    const from = ITEMS.findIndex((item) => item.id === shownSection);
    const to = ITEMS.findIndex((item) => item.id === section);
    setShownSection(section);
    setTravel(from >= 0 && to >= 0 ? Math.sign(to - from) : 0);
  }
  const [pressed, setPressed] = useState(false);
  const geometry = reduceMotion ? { duration: 0 } : { ...DOCK_SPRING, delay: compact ? 0.06 : 0 };
  const label = compact ? LABEL_OUT : LABEL_IN;
  const anchor = compact ? anchorShift(section) : 0;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[var(--app-bg)]/25 via-[var(--app-bg)]/5 to-transparent" />
      <motion.div
        data-dock
        data-compact={compact ? '' : undefined}
        className="pointer-events-auto relative flex justify-center px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-2"
        animate={keyboard ? { y: '130%', opacity: 0 } : { y: 0, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : DOCK_SPRING}
        aria-hidden={keyboard || undefined}
      >
      <div className="relative flex w-full max-w-md items-center justify-center sm:w-auto">
        <motion.div layout transition={geometry} style={{ borderRadius: 999, marginLeft: anchor * 2 }} className={cn('relative rounded-full sm:w-auto', compact ? 'w-auto' : 'w-full')}>
          {/* Material de cristal en su propia capa: el contenido va encima, nítido y sin refractar. */}
          <motion.div
            aria-hidden
            className={cn('liquid-glass pointer-events-none absolute inset-0 rounded-full', pressed && 'is-pressed')}
            layout
            style={{ borderRadius: 999 }}
            animate={reduceMotion ? undefined : { scaleX: pressed ? 0.985 : 1, scaleY: pressed ? 0.965 : 1 }}
            transition={{ ...PRESS_SPRING, layout: geometry }}
          >
            <GlassLens />
          </motion.div>
          <motion.nav
            layout
            transition={geometry}
            className={cn('relative z-[1] flex items-center px-1', compact ? 'h-12' : 'h-14')}
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
          >
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              const button = (
                <motion.button
                  key={item.id}
                  layout
                  transition={geometry}
                  type="button"
                  aria-label={item.label}
                  onClick={() => onChange(item.id)}
                  className={cn(
                    compact ? 'h-10 w-12 flex-none' : 'min-w-0 flex-1',
                    'glass-label relative flex flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1 text-[10px] font-semibold leading-none sm:flex-none sm:flex-row sm:gap-2 sm:px-3.5 sm:py-2 sm:text-[13px]',
                    active
                      ? 'text-slate-950 dark:text-white'
                      : 'text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white',
                  )}
                >
                  {active && (
                    // Un único indicador compartido: Motion lo lleva de una pestaña a otra (layoutId).
                    <motion.span
                      aria-hidden
                      layoutId="dock-indicator"
                      transition={reduceMotion ? { duration: 0 } : INDICATOR_SPRING}
                      style={{ borderRadius: 999 }}
                      className="pointer-events-none absolute inset-0.5"
                    >
                      <motion.span
                        className="glass-indicator absolute inset-0 rounded-full"
                        style={{ originX: travel > 0 ? 0 : 1 }}
                        animate={reduceMotion || !travel ? undefined : { scaleX: [1, 1.16, 1], scaleY: [1, 0.86, 1] }}
                        transition={{ duration: 0.46, times: [0, 0.38, 1], ease: 'easeOut' }}
                      />
                    </motion.span>
                  )}
                  <motion.span layout="position" transition={geometry} className="relative grid place-items-center">
                    <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
                  </motion.span>
                  <motion.span
                    layout="position"
                    aria-hidden={compact || undefined}
                    initial={false}
                    animate={{ opacity: compact ? 0 : 1, scale: compact ? 0.7 : 1, y: compact ? 4 : 0 }}
                    transition={reduceMotion ? { duration: 0 } : { ...label, layout: geometry }}
                    className={cn('relative truncate sm:hidden', compact && 'pointer-events-none absolute inset-x-0 bottom-0 text-center')}
                  >
                    {item.short}
                  </motion.span>
                  <span className="relative hidden sm:inline">{item.label}</span>
                </motion.button>
              );
              if (item.id !== 'market') return button;
              return (
                <span key={item.id} className="contents">
                  {button}
                  <motion.span layout transition={geometry} className={cn('grid shrink-0 place-items-center sm:w-16', compact ? 'w-12' : 'w-11')}>
                    <motion.button
                      layout
                      transition={geometry}
                      type="button"
                      onClick={onTicket}
                      aria-label="Hacer una foto"
                      style={{ borderRadius: 999 }}
                      className={cn('relative z-10 grid place-items-center rounded-full bg-slate-950 text-white dark:bg-white dark:text-slate-950', compact ? 'h-9 w-9' : 'h-10 w-10')}
                    >
                      <motion.span layout="position" transition={geometry} className="grid place-items-center">
                        <Camera size={18} strokeWidth={1.75} />
                      </motion.span>
                    </motion.button>
                  </motion.span>
                </span>
              );
            })}
          </motion.nav>
        </motion.div>
      </div>
      </motion.div>
    </div>
  );
}
