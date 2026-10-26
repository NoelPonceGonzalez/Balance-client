import React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200/50 dark:bg-indigo-500 dark:shadow-indigo-500/20',
      secondary: 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700',
      outline: 'border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
      ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
      danger: 'bg-rose-500 text-white hover:bg-rose-600',
    };
    const sizes = {
      sm: 'px-3 py-1.5 text-xs rounded-xl',
      md: 'px-5 py-2.5 text-sm rounded-2xl',
      lg: 'px-8 py-3.5 text-base rounded-[1.4rem]',
    };
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.98 }}
        className={cn('inline-flex items-center justify-center gap-2 font-bold disabled:pointer-events-none disabled:opacity-50', variants[variant], sizes[size], className)}
        {...(props as object)}
      />
    );
  },
);
Button.displayName = 'Button';
