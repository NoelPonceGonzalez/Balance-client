import { useEffect, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const MENU_WIDTH = 148;
const MENU_HEIGHT = 72;

export function placeMenu(x: number, y: number) {
  const margin = 12;
  const left = Math.max(margin, Math.min(x - MENU_WIDTH / 2, window.innerWidth - MENU_WIDTH - margin));
  const above = y - MENU_HEIGHT - 16;
  const below = y + 14;
  const top = above >= margin ? above : Math.min(below, window.innerHeight - MENU_HEIGHT - margin);
  return { top, left };
}

/** Abre el menú solo si el dedo se queda quieto. Si la lista se mueve, se cancela. */
export function bindHold(event: ReactPointerEvent, open: (x: number, y: number) => void) {
  if (event.button !== 0) return;
  const x = event.clientX;
  const y = event.clientY;
  const target = event.currentTarget as HTMLElement;
  let alive = true;
  const stop = () => {
    alive = false;
    window.clearTimeout(timer);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    scroller?.removeEventListener('scroll', stop);
  };
  const timer = window.setTimeout(() => {
    if (!alive) return;
    stop();
    target.classList.remove('hold-pop');
    void target.offsetWidth;
    target.classList.add('hold-pop');
    window.setTimeout(() => target.classList.remove('hold-pop'), 480);
    if (navigator.vibrate) navigator.vibrate(10);
    open(x, y);
  }, 420);
  const move = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - x, ev.clientY - y) > 6) stop();
  };
  const scroller = target.closest('.app-scroll');
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
  scroller?.addEventListener('scroll', stop, { passive: true });
}

export function HoldMenu({ top, left, onClose, children }: { top: number; left: number; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const scroller = document.querySelector('.app-scroll') as HTMLElement | null;
    const previous = scroller?.style.overflow ?? '';
    if (scroller) scroller.style.overflow = 'hidden';
    const block = (event: TouchEvent) => event.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      if (scroller) scroller.style.overflow = previous;
      document.removeEventListener('touchmove', block);
    };
  }, []);

  return createPortal(
    <>
      <button type="button" className="fixed inset-0 z-[60] cursor-default bg-slate-950/5" aria-label="Cerrar menú" onClick={onClose} />
      <div
        className="hold-menu fixed z-[70] w-[9.25rem] overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 py-1 text-[13px] shadow-lg shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95"
        style={{ top, left }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

export const holdItemClass = 'flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-medium active:bg-slate-50 dark:active:bg-white/5';
