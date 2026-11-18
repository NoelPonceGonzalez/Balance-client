import { Mark } from '@/components/Mark';
import { cn } from '@/lib/utils';

let arriveToken = 0;

/** Abre una llegada nueva. Las páginas anteriores ya no pueden cerrarla. */
export function beginArrive() {
  arriveToken += 1;
  return arriveToken;
}

export function arriveTokenNow() {
  return arriveToken;
}

/** La página ya tiene lo suyo: la cortina puede retirarse. */
export function markReady() {
  window.dispatchEvent(new CustomEvent('pat-ready', { detail: arriveToken }));
}

export function QuietLoad({ kind = 'page' }: { kind?: 'screen' | 'page' | 'rows' | 'chart' }) {
  if (kind === 'screen') {
    return (
      <div className="quiet-veil fixed inset-0 z-[70] grid place-items-center bg-[#f6f3ee] text-[#1c1915] dark:bg-[#0c0b0a] dark:text-[#f6f1e8]" role="status" aria-live="polite" aria-busy="true">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgba(255,252,246,0.95),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(232,214,180,0.16),transparent_62%)]" />
        <div className="quiet-arrive relative text-center">
          <span className="sr-only">Cargando</span>
          <span className="quiet-mark mx-auto grid h-12 w-12 place-items-center rounded-[1.15rem] bg-[#1c1915] text-[#f6f1e8] shadow-[0_12px_28px_rgba(28,25,21,0.16)] dark:bg-[#f4efe6] dark:text-[#16140f] dark:shadow-[0_16px_36px_rgba(0,0,0,0.4)]">
            <Mark size={22} />
          </span>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.32em] text-[#8a8175] dark:text-[#a89880]">Balance</p>
          <span className="quiet-line" />
        </div>
      </div>
    );
  }
  if (kind === 'chart') {
    return (
      <div role="status" aria-live="polite" className="h-44">
        <span className="sr-only">Cargando</span>
      </div>
    );
  }
  const lines = kind === 'rows' ? 4 : 3;
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="quiet-arrive">
      <span className="sr-only">Cargando</span>
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, index) => (
          <div key={index} className={cn('quiet-bone w-full rounded-[1.4rem]', index === 0 && kind === 'page' ? 'h-32' : 'h-14')} />
        ))}
      </div>
    </div>
  );
}
