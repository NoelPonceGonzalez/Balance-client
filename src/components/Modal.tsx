import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { DiscardAsk } from '@/components/DiscardAsk';
import { SheetCloseContext, useEscapeLayer, useSheetClose } from '@/lib/sheet';
import { EASE_SETTLE, confirmSpring, sheetOut, sheetSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';

export const modalOverlayClass =
  'fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 sm:items-center dark:bg-black/50';

export const modalPanelClass =
  'no-scrollbar max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-[28px] bg-white p-5 text-slate-900 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:text-white dark:ring-white/10';

export function ModalClose({ onClose }: { onClose: () => void }) {
  // Dentro de una hoja con cierre protegido, «Cerrar» pasa por él (pregunta si hay cambios sin guardar).
  const guarded = useSheetClose();
  return (
    <button
      type="button"
      onClick={guarded ?? onClose}
      className="shrink-0 rounded-full border border-slate-200/90 bg-white/60 px-3 py-1 text-[13px] font-medium text-slate-600 backdrop-blur-xl hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200"
      aria-label="Cerrar"
    >
      Cerrar
    </button>
  );
}

/**
 * Fondo del modal pintado en `body`, para que quede centrado en la pantalla aunque el padre tenga transform.
 * Bloque E: Escape cierra; con `dirty` pregunta antes de perder lo escrito (fondo, «Cerrar», Escape) y con
 * `busy` no se cierra mientras se guarda. Las hojas propias (Planes, Viajes) lo usan así.
 */
export function Overlay({ onClose, className, children, dirty = false, busy = false }: { onClose: () => void; className?: string; children: ReactNode; dirty?: boolean; busy?: boolean }) {
  const [ask, setAsk] = useState(false);
  const request = () => {
    if (busy) return;
    if (dirty) {
      setAsk(true);
      return;
    }
    onClose();
  };
  useEscapeLayer(() => (ask ? setAsk(false) : request()));
  useEffect(() => {
    const scroller = document.querySelector('.app-scroll');
    if (!(scroller instanceof HTMLElement)) return;
    const previous = scroller.style.overflow;
    scroller.style.overflow = 'hidden';
    return () => { scroller.style.overflow = previous; };
  }, []);
  return createPortal(
    <SheetCloseContext.Provider value={request}>
      <div className={cn(modalOverlayClass, className)} onClick={request}>
        {children}
        {ask && <DiscardAsk onStay={() => setAsk(false)} onLeave={() => { setAsk(false); onClose(); }} />}
      </div>
    </SheetCloseContext.Provider>,
    document.body,
  );
}

function still(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Parte del teclado del móvil que tapa la pantalla (visualViewport). Solo mueve esta hoja; el dock y el
 * resto de la app no se tocan.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return undefined;
    const update = () => {
      const covered = window.innerHeight - view.height - view.offsetTop;
      setInset(covered > 80 ? Math.round(covered) : 0);
    };
    update();
    view.addEventListener('resize', update);
    view.addEventListener('scroll', update);
    return () => {
      view.removeEventListener('resize', update);
      view.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

/**
 * Hoja de Balance (Bloque D). Sale de abajo en el móvil y aparece en su sitio en escritorio, con el muelle
 * de siempre y sin deformar el texto (escala uniforme). Se cierra con el fondo, «Cerrar» o Escape, y al
 * cerrar desanda el camino. Con `dirty`, cualquiera de esas salidas pregunta antes de perder lo escrito;
 * con `busy` (guardando), no se cierra hasta saber el resultado. `compact` es para confirmaciones cortas:
 * entrada más rápida y sin recorrido. Al abrir, el foco entra en la hoja; al cerrar, vuelve a donde estaba.
 */
export function Modal({
  title,
  onClose,
  children,
  wide,
  dirty = false,
  busy = false,
  compact = false,
  entrance = 'sheet',
  onShown,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dirty?: boolean;
  busy?: boolean;
  compact?: boolean;
  /** 'fade': la hoja no se desplaza (cuando las piezas de una fila vuelan hasta su cabecera). */
  entrance?: 'sheet' | 'fade';
  /** Se llama con el panel ya pintado en su sitio, antes de que el navegador lo enseñe. */
  onShown?: (panel: HTMLElement) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const [closing, setClosing] = useState(false);
  const [ask, setAsk] = useState(false);
  const keyboard = useKeyboardInset();
  const calm = still();
  const shownRef = useRef(onShown);
  const closed = useRef(false);
  const done = () => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  };

  const finish = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (calm) {
      done();
      return;
    }
    setClosing(true);
    // Por si la animación no llega a terminar (pestaña en segundo plano): la hoja se cierra igual.
    window.setTimeout(done, 320);
  };
  const request = () => {
    if (busy || leaving.current) return;
    if (dirty) {
      setAsk(true);
      return;
    }
    finish();
  };
  useEscapeLayer(() => (ask ? setAsk(false) : request()));

  useEffect(() => {
    const scroller = document.querySelector('.app-scroll');
    if (!(scroller instanceof HTMLElement)) return;
    const previous = scroller.style.overflow;
    scroller.style.overflow = 'hidden';
    return () => { scroller.style.overflow = previous; };
  }, []);

  useLayoutEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (panel) {
      shownRef.current?.(panel);
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    }
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  // Altura que se adapta al contenido (Bloque E, D041): cuando aparecen o desaparecen campos, la hoja crece o
  // encoge en 240 ms en vez de saltar. Interrumpible (parte de la altura que tenga en ese momento), nunca
  // mientras se escribe y nunca con movimiento reducido. Solo anima la caja; el contenido no se escala.
  useEffect(() => {
    const panel = panelRef.current;
    const content = contentRef.current;
    if (!panel || !content || calm || typeof ResizeObserver === 'undefined') return undefined;
    let last = panel.offsetHeight;
    let typedAt = 0;
    let run: Animation | null = null;
    const onInput = () => { typedAt = performance.now(); };
    panel.addEventListener('input', onInput, true);
    const watch = new ResizeObserver(() => {
      const from = run ? panel.offsetHeight : last;
      run?.cancel();
      run = null;
      const to = panel.offsetHeight;
      last = to;
      if (Math.abs(to - from) < 6 || performance.now() - typedAt < 600 || leaving.current) return;
      run = panel.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 240, easing: EASE_SETTLE });
      run.onfinish = () => { run = null; last = panel.offsetHeight; };
    });
    watch.observe(content);
    return () => {
      watch.disconnect();
      run?.cancel();
      panel.removeEventListener('input', onInput, true);
    };
  }, [calm]);

  // Con el teclado abierto, el campo activo no queda escondido debajo.
  const keepInView = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    window.setTimeout(() => target.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' }), 260);
  };

  const rest = { opacity: 1, y: 0, scale: 1 };
  const start = calm || entrance === 'fade' ? { opacity: 0, y: 0, scale: 1 } : compact ? { opacity: 0, y: 10, scale: 0.98 } : { opacity: 0, y: 36, scale: 0.98 };
  const away = calm ? { opacity: 0, y: 0, scale: 1 } : compact ? { opacity: 0, y: 6, scale: 0.98 } : { opacity: 0, y: 28, scale: 0.985 };

  return createPortal(
    <motion.div
      className={cn(modalOverlayClass, closing && 'pointer-events-none')}
      style={keyboard ? { paddingBottom: keyboard + 12 } : undefined}
      onClick={request}
      initial={calm ? false : { opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: closing ? 0.2 : 0.16 }}
    >
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        className={cn(modalPanelClass, 'motion-squish outline-none', wide ? 'max-w-3xl' : compact ? 'max-w-sm' : 'max-w-xl')}
        style={keyboard ? { maxHeight: `calc(100dvh - ${keyboard + 24}px)` } : undefined}
        onClick={(event) => event.stopPropagation()}
        onFocus={keepInView}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-busy={busy || undefined}
        initial={calm ? false : start}
        animate={closing ? away : rest}
        transition={closing ? { ...sheetOut, duration: compact ? 0.14 : sheetOut.duration } : compact ? confirmSpring : sheetSpring}
        onAnimationComplete={() => { if (closing) done(); }}
      >
        <SheetCloseContext.Provider value={request}>
          <div ref={contentRef}>
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 id="modal-title" className="min-w-0 break-words text-[17px] font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">{title}</h2>
              <ModalClose onClose={request} />
            </div>
            {children}
          </div>
        </SheetCloseContext.Provider>
      </motion.div>
      {ask && (
        <DiscardAsk
          onStay={() => setAsk(false)}
          onLeave={() => { setAsk(false); finish(); }}
        />
      )}
    </motion.div>,
    document.body,
  );
}
