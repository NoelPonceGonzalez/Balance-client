/**
 * Selector segmentado con indicador compartido (Bloque B). Mismo lenguaje que los rangos del Resumen:
 * texto sereno, pastilla que viaja de una opción a otra con `softSpring`, sin movimiento si se reduce.
 */
import { motion, useReducedMotion } from 'motion/react';
import { softSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';

export function Segmented<T extends string>({ id, label, options, value, onChange, className }: {
  /** Identificador único del indicador (layoutId). */
  id: string;
  label: string;
  options: { id: T; label: string; tone?: 'up' | 'down' }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  const still = useReducedMotion();
  return (
    <div role="group" aria-label={label} data-no-squish className={cn('flex items-center gap-0.5 rounded-full bg-slate-100/80 p-0.5 dark:bg-white/[0.08]', className)}>
      {options.map((option) => {
        const on = option.id === value;
        const tone = option.tone === 'up' ? 'text-[#16a974] dark:text-[#30d158]' : option.tone === 'down' ? 'text-[#e5484d] dark:text-[#ff6b6b]' : 'text-slate-950 dark:text-white';
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.id)}
            className={cn(
              'relative h-8 flex-1 rounded-full px-3 text-[13px] font-semibold transition-[color,transform] duration-200 active:scale-[0.96]',
              on ? tone : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {on && (
              <motion.span
                layoutId={`segmented-${id}`}
                transition={still ? { duration: 0 } : softSpring}
                className="pointer-events-none absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.06)] dark:bg-white/[0.14] dark:shadow-none"
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
