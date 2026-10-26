import type { ReactNode } from 'react';
import { LayoutDashboard, Target, Settings, ArrowLeftRight, LineChart } from 'lucide-react';
import { InstallApp } from '@/components/InstallApp';
import { Mark } from '@/components/Mark';
import { NotificationsBell } from '@/components/NotificationsBell';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

const ITEMS = [
  { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
  { id: 'market', label: 'Mercado', icon: LineChart },
  { id: 'plans', label: 'Planes', icon: Target },
  { id: 'movements', label: 'Movimientos', icon: ArrowLeftRight },
] as const;

export type Section = (typeof ITEMS)[number]['id'] | 'settings';

export function Shell({
  section,
  onChange,
  user,
  children,
}: {
  section: Section;
  onChange: (section: Section) => void;
  user: User;
  children: ReactNode;
}) {
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]">
      <header className="flex shrink-0 items-center gap-3 px-4 py-3 md:px-8">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white">
          <Mark size={22} />
        </span>
        <div className="min-w-0">
          <p className="font-black leading-none">Balance</p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-400">{user.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <NotificationsBell align="right" />
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
      <main className="app-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-2 pb-36 md:px-8">
        <InstallApp />
        {children}
      </main>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
        <div className="pointer-events-auto flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <nav className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-white/70 bg-white/55 p-1.5 shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:border-white/15 dark:bg-slate-950/50">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold transition min-[480px]:px-3.5',
                  active
                    ? 'bg-white/85 text-indigo-700 shadow-sm dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                <Icon size={16} strokeWidth={1.75} />
                <span className="sr-only min-[480px]:not-sr-only">{item.label}</span>
              </button>
            );
          })}
        </nav>
        </div>
      </div>
    </div>
  );
}
