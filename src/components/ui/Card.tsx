import React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { dark?: boolean }>(
  ({ className, dark, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[1.7rem] border p-5 shadow-sm transition-colors sm:p-6',
        dark
          ? 'border-slate-800 bg-slate-900 text-white shadow-indigo-200/40 dark:shadow-black/40'
          : 'border-slate-100 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';
