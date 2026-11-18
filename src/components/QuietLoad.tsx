import { Mark } from '@/components/Mark';
import { cn } from '@/lib/utils';

function Bone({ className }: { className?: string }) {
  return <div className={cn('quiet-bone', className)} />;
}

function Seal() {
  return (
    <div className="flex items-center gap-3">
      <span className="quiet-mark grid h-10 w-10 place-items-center rounded-[1rem] bg-[#1c1915] text-[#f6f1e8] shadow-[0_10px_24px_rgba(28,25,21,0.12)] dark:bg-[#f4efe6] dark:text-[#16140f] dark:shadow-[0_14px_30px_rgba(0,0,0,0.35)]">
        <Mark size={18} />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#8a8175] dark:text-[#a89880]">Balance</span>
    </div>
  );
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
      <div role="status" aria-live="polite" className="quiet-arrive">
        <span className="sr-only">Cargando</span>
        <Bone className="h-44 w-full rounded-[1.6rem]" />
      </div>
    );
  }
  const lines = kind === 'rows' ? 4 : 3;
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="quiet-arrive">
      <span className="sr-only">Cargando</span>
      <Seal />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }, (_, index) => (
          <Bone key={index} className={cn(index === 0 && kind === 'page' ? 'h-32' : 'h-14', 'w-full rounded-[1.4rem]')} />
        ))}
      </div>
    </div>
  );
}
