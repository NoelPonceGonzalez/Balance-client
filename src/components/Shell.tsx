import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { LayoutDashboard, Target, Settings, ArrowLeftRight, LineChart } from 'lucide-react';
import { FixedCheck } from '@/components/FixedCheck';
import { InstallApp } from '@/components/InstallApp';
import { Mark } from '@/components/Mark';
import { NotificationsBell } from '@/components/NotificationsBell';
import { softSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

const ITEMS = [
  { id: 'dashboard', label: 'Resumen', short: 'Resumen', icon: LayoutDashboard },
  { id: 'market', label: 'Mercado', short: 'Mercado', icon: LineChart },
  { id: 'plans', label: 'Planes', short: 'Planes', icon: Target },
  { id: 'movements', label: 'Movimientos', short: 'Movs', icon: ArrowLeftRight },
] as const;

export type Section = (typeof ITEMS)[number]['id'] | 'settings';

export function Shell({
  section,
  onChange,
  user,
  onSettled,
  children,
}: {
  section: Section;
  onChange: (section: Section) => void;
  user: User;
  onSettled: () => void;
  children: ReactNode;
}) {
  const [dueNonce, setDueNonce] = useState(0);
  const [dueKey, setDueKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    const band = bandRef.current;
    if (!scroller || !band) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let startY = 0;
    let pulling = false;
    let pull = 0;
    const atTop = () => scroller.scrollTop <= 0;
    const atBottom = () => scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    const begin = (y: number) => {
      startY = y;
      pulling = false;
      pull = 0;
    };
    const move = (y: number, event: Event) => {
      const delta = y - startY;
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
          { transform: `translate3d(0, ${from}px, 0)` },
          { transform: `translate3d(0, ${-from * 0.04}px, 0)`, offset: 0.82 },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 780, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    };
    const onTouchStart = (event: TouchEvent) => begin(event.touches[0]?.clientY ?? 0);
    const onTouchMove = (event: TouchEvent) => move(event.touches[0]?.clientY ?? startY, event);
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
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]">
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-8">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white">
          <Mark size={22} />
        </span>
        <div className="min-w-0">
          <p className="font-black leading-none">Balance</p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">{user.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <InstallApp compact />
          <NotificationsBell align="right" onDue={(quoteKey) => { setDueKey(quoteKey); setDueNonce((value) => value + 1); }} />
          <button
            type="button"
            onClick={() => onChange('settings')}
            className={cn('rounded-full p-2', section === 'settings' ? 'text-indigo-700 dark:text-white' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}
            aria-label="Ajustes"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>
      <FixedCheck nonce={dueNonce} focusKey={dueKey} onSettled={onSettled} />
      <main ref={scrollRef} className="app-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-2 md:px-8">
        <div ref={bandRef} className="origin-center will-change-transform">
          {children}
        </div>
      </main>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
        <div className="pointer-events-auto flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <nav className="grid w-full max-w-md grid-cols-4 rounded-3xl border border-white/70 bg-white/70 p-1 shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:border-white/15 dark:bg-slate-950/55 sm:flex sm:w-auto sm:max-w-none sm:rounded-full sm:p-1.5">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                className={cn(
                  'relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-semibold leading-none sm:flex-row sm:gap-2 sm:rounded-full sm:px-3.5 sm:py-2 sm:text-[13px]',
                  active
                    ? 'text-indigo-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-2xl bg-white shadow-sm dark:bg-white/15 sm:rounded-full"
                    transition={softSpring}
                  />
                )}
                <Icon size={16} strokeWidth={1.75} className="relative" />
                <span className="relative truncate sm:hidden">{item.short}</span>
                <span className="relative hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>
        </div>
      </div>
    </div>
  );
}
