/**
 * Confirmación pequeña para no perder lo escrito (Bloque D). La usan las hojas con formulario y la
 * cámara cuando se intenta cerrar con cambios (fondo, botón, Escape). Movimiento corto y sin rebote:
 * es una confirmación, no un formulario. El foco empieza en «Seguir», la opción que no pierde nada.
 */
import { motion } from 'motion/react';
import { quickOut } from '@/lib/motion';

function still(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function DiscardAsk({ onStay, onLeave, text = 'Se pierde lo que has cambiado.' }: { onStay: () => void; onLeave: () => void; text?: string }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center dark:bg-black/40" onClick={(event) => { event.stopPropagation(); onStay(); }}>
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-ask"
        aria-describedby="discard-ask-text"
        className="w-full max-w-xs rounded-[24px] bg-white p-5 text-slate-900 shadow-[0_18px_50px_rgba(15,23,42,0.22)] ring-1 ring-slate-200/70 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10"
        onClick={(event) => event.stopPropagation()}
        initial={still() ? false : { opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ...quickOut, duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <p id="discard-ask" className="text-[17px] font-semibold tracking-tight">¿Salir sin guardar?</p>
        <p id="discard-ask-text" className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{text}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" autoFocus onClick={onStay} className="rounded-full bg-slate-950 px-4 py-3 text-[15px] font-semibold text-white active:scale-[0.98] dark:bg-white dark:text-slate-950">
            Seguir editando
          </button>
          <button type="button" onClick={onLeave} className="rounded-full px-4 py-2.5 text-[15px] font-semibold text-rose-600 active:scale-[0.98] dark:text-rose-400">
            Salir sin guardar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
