import { Mark } from '@/components/Mark';
import { cn } from '@/lib/utils';

function Bone({ className }: { className?: string }) {
  return <div className={cn('quiet-bone', className)} />;
}

export function QuietLoad({ kind = 'page' }: { kind?: 'screen' | 'page' | 'rows' | 'chart' }) {
  if (kind === 'screen') {
    return (
      <div className="grid h-dvh place-items-center bg-[var(--app-bg)]" role="status" aria-live="polite">
        <span className="sr-only">Cargando</span>
        <span className="quiet-mark grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white">
          <Mark size={22} />
        </span>
      </div>
    );
  }
  if (kind === 'chart') {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Cargando</span>
        <Bone className="h-44 w-full rounded-[1.4rem]" />
      </div>
    );
  }
  const lines = kind === 'rows' ? 4 : 3;
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-2">
      <span className="sr-only">Cargando</span>
      {Array.from({ length: lines }, (_, index) => (
        <Bone key={index} className="h-12 w-full rounded-2xl" />
      ))}
    </div>
  );
}
