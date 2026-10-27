import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export const modalOverlayClass =
  'fixed inset-0 z-50 flex items-center justify-center bg-white/25 p-4 backdrop-blur-2xl dark:bg-slate-950/40';

export const modalPanelClass =
  'max-h-[92dvh] w-full overflow-y-auto rounded-[22px] border border-white/80 bg-white/70 p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/55 dark:text-white';

export function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="shrink-0 rounded-full border border-slate-200/90 bg-white/60 px-3 py-1 text-[13px] font-medium text-slate-600 backdrop-blur-xl hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
      aria-label="Cerrar"
    >
      Cerrar
    </button>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const scroller = document.querySelector('.app-scroll');
    if (!(scroller instanceof HTMLElement)) return;
    const previous = scroller.style.overflow;
    scroller.style.overflow = 'hidden';
    return () => { scroller.style.overflow = previous; };
  }, []);
  return createPortal(
    <div className={modalOverlayClass} onClick={onClose}>
      <motion.div
        className={cn(modalPanelClass, 'motion-squish', wide ? 'max-w-3xl' : 'max-w-xl')}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="modal-title"
        initial={{ opacity: 0, scale: 0.9, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22, mass: 0.7 }}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="modal-title" className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
          <ModalClose onClose={onClose} />
        </div>
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}
