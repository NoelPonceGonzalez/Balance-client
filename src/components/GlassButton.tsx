/**
 * Botones de cristal para controles que flotan sobre el contenido (estilo iOS 26). Usan el mismo material
 * Liquid Glass aprobado del dock (`.liquid-glass` + `GlassLens`) sin cambiarlo: aquí solo se reutiliza.
 * Al pulsar, el cristal recoge algo más de luz (`is-pressed`) y se hunde un poco (sin rebote exagerado).
 */
import { useState, type ButtonHTMLAttributes, type HTMLAttributes, type PointerEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { GlassLens } from '@/components/LiquidGlass';
import { glide } from '@/lib/motion';
import { cn } from '@/lib/utils';

export function GlassButton({ className, children, onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  const [pressed, setPressed] = useState(false);
  const still = useReducedMotion();
  const release = (handler?: (event: PointerEvent<HTMLButtonElement>) => void) => (event: PointerEvent<HTMLButtonElement>) => {
    setPressed(false);
    handler?.(event);
  };
  return (
    <motion.button
      type="button"
      {...(rest as object)}
      className={cn('liquid-glass relative inline-flex items-center justify-center rounded-full text-slate-900 dark:text-white', pressed && 'is-pressed', className)}
      whileTap={still ? undefined : { scale: 0.94 }}
      transition={glide}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        setPressed(true);
        onPointerDown?.(event);
      }}
      onPointerUp={release(onPointerUp)}
      onPointerLeave={release(onPointerLeave)}
      onPointerCancel={release(onPointerCancel)}
    >
      <GlassLens />
      <span className="relative z-[1] inline-flex items-center gap-1.5">{children}</span>
    </motion.button>
  );
}

/** Cápsula de cristal que agrupa varios botones pequeños (como las barras de herramientas de iOS 26). */
export function GlassGroup({ className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div {...rest} className={cn('liquid-glass relative inline-flex items-center rounded-full', className)}>
      <GlassLens />
      <div className="relative z-[1] flex items-center">{children}</div>
    </div>
  );
}
