import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, label, icon, trailing, ...props }, ref) => (
  <label className="block w-full space-y-1.5">
    {label && <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</span>}
    <span className="relative block">
      {icon && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
      <input
        ref={ref}
        className={cn(
          'w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-white/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:ring-white/10',
          icon && 'pl-11',
          trailing && 'pr-12',
          className,
        )}
        {...props}
      />
      {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
    </span>
  </label>
));
Input.displayName = 'Input';

export const fieldClass =
  'w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-white/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:focus:ring-white/10';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}
