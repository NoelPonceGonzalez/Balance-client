import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { LayoutDashboard, Target, Settings, ArrowLeftRight, LineChart, Camera } from 'lucide-react';
import { FixedCheck } from '@/components/FixedCheck';
import { InstallApp } from '@/components/InstallApp';
import { NotificationsBell } from '@/components/NotificationsBell';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

const ITEMS = [
  { id: 'dashboard', label: 'Resumen', short: 'Resumen', icon: LayoutDashboard },
  { id: 'market', label: 'Mercado', short: 'Mercado', icon: LineChart },
  { id: 'plans', label: 'Planes', short: 'Planes', icon: Target },
  { id: 'movements', label: 'Movimientos', short: 'Movs', icon: ArrowLeftRight },
] as const;

export type Section = (typeof ITEMS)[number]['id'] | 'settings';

const ChromeHidden = createContext<(hidden: boolean) => void>(() => {});

/** Oculta la barra de Balance mientras se está dentro de una cartera. */
export function useHideChrome() {
  return useContext(ChromeHidden);
}

export function Shell({
  section,
  onChange,
  onPlan,
  onTicket,
  onSettled,
  children,
}: {
  section: Section;
  onChange: (section: Section) => void;
  onPlan?: (planId: string) => void;
  onTicket: () => void;
  user: User;
  onSettled: () => void;
  children: ReactNode;
}) {
  const [dueNonce, setDueNonce] = useState(0);
  const [dueKey, setDueKey] = useState<string | null>(null);
  const [bare, setBare] = useState(false);
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      const squash = Math.min(0.028, Math.abs(pull) / 1100);
      band.style.transform = `translate3d(0, ${pull}px, 0) scale(${1 + squash * 0.35}, ${1 - squash})`;
      if (event.cancelable) event.preventDefault();
    };
    const release = () => {
      if (!pulling) return;
      const from = pull;
      pulling = false;
      pull = 0;
      band.style.transform = '';
      band.animate(
        [
          { transform: `translate3d(0, ${from}px, 0)`, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
          { transform: `translate3d(0, ${-from * 0.14}px, 0)`, offset: 0.4, easing: 'ease-in-out' },
          { transform: `translate3d(0, ${from * 0.05}px, 0)`, offset: 0.68, easing: 'ease-in-out' },
          { transform: `translate3d(0, ${-from * 0.015}px, 0)`, offset: 0.86, easing: 'ease-in-out' },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 900 },
      );
    };
    const onTouchStart = (event: TouchEvent) => begin(event.touches[0]?.clientX ?? 0, event.touches[0]?.clientY ?? 0);
    const onTouchMove = (event: TouchEvent) => move(event.touches[0]?.clientX ?? startX, event.touches[0]?.clientY ?? startY, event);
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

  return (
    <ChromeHidden.Provider value={hideChrome}>
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]">
      <header aria-hidden={bare} className={cn('grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-out', bare ? 'pointer-events-none grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100')}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex items-center justify-end gap-0.5 px-3 pb-1 pt-[max(0.35rem,env(safe-area-inset-top))] md:px-8">
            <InstallApp compact />
            <NotificationsBell align="right" onPlan={onPlan} onDue={(quoteKey) => { setDueKey(quoteKey); setDueNonce((value) => value + 1); }} />
            <button
              type="button"
              onClick={() => onChange('settings')}
              className={cn('rounded-full p-2', section === 'settings' ? 'text-slate-900 dark:text-white' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}
              aria-label="Ajustes"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </header>
      <FixedCheck nonce={dueNonce} focusKey={dueKey} onSettled={onSettled} />
      <main ref={scrollRef} className={cn('app-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-2 md:px-8', bare && 'pt-[max(0.75rem,env(safe-area-inset-top))]')}>
        <div ref={bandRef} className="origin-center will-change-transform">
          {children}
        </div>
      </main>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
        <div data-dock className="pointer-events-auto flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="relative w-full max-w-md sm:w-auto">
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full border border-white/80 bg-white/45 shadow-[0_16px_40px_rgba(15,23,42,0.08)] ring-1 ring-inset ring-white/70 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/45 dark:ring-white/10" />
          <nav className="relative flex h-14 items-center px-1">
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              const button = (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChange(item.id)}
                  className={cn(
                    'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1 text-[10px] font-semibold leading-none sm:flex-none sm:flex-row sm:gap-2 sm:px-3.5 sm:py-2 sm:text-[13px]',
                    active
                      ? 'text-indigo-600 dark:text-indigo-300'
                      : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-200',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      transition={still ? { duration: 0 } : { type: 'spring', stiffness: 190, damping: 18, mass: 1.05 }}
                      className="pointer-events-none absolute inset-0 rounded-full border border-white/90 bg-white/85 shadow-[0_2px_12px_rgba(15,23,42,0.05)] dark:border-white/15 dark:bg-white/10"
                    />
                  )}
                  <Icon size={18} strokeWidth={1.75} className="relative" />
                  <span className="relative truncate sm:hidden">{item.short}</span>
                  <span className="relative hidden sm:inline">{item.label}</span>
                </button>
              );
              if (item.id !== 'market') return button;
              return (
                <span key={item.id} className="contents">
                  {button}
                  <span className="w-16 shrink-0" aria-hidden />
                </span>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={onTicket}
            aria-label="Fotografiar un tique"
            className="absolute left-1/2 top-1/2 z-10 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#1d4ed8] text-white shadow-[0_8px_16px_rgba(29,78,216,0.22)]"
          >
            <Camera size={18} strokeWidth={1.75} />
          </button>
        </div>
        </div>
      </div>
    </div>
    </ChromeHidden.Provider>
  );
}
