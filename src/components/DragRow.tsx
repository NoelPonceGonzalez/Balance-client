import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Fila que se arrastra con el dedo. El toque sobre un botón no se lo queda el scroll de la página. */
export function DragRow({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let pointer = -1;
    let startX = 0;
    let origin = 0;
    let dragged = false;

    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointer = event.pointerId;
      startX = event.clientX;
      origin = node.scrollLeft;
      dragged = false;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      const dx = event.clientX - startX;
      if (!dragged) {
        if (Math.abs(dx) < 8) return;
        dragged = true;
        try { node.setPointerCapture(event.pointerId); } catch { /* el gesto sigue aunque el navegador no entregue la captura */ }
      }
      node.scrollLeft = origin - dx;
      if (event.cancelable) event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = -1;
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    };
    const click = (event: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    };

    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('click', click, true);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      node.removeEventListener('click', click, true);
    };
  }, []);

  return (
    <div ref={ref} className={cn('market-pills', className)}>
      {children}
    </div>
  );
}
