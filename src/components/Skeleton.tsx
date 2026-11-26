/**
 * Skeletons de Balance (Bloque B). Reutilizan el material `quiet-bone` de QuietLoad (brillo suave, sin
 * movimiento con prefers-reduced-motion) y copian la geometría final de cada pieza: al llegar los datos no
 * salta nada de sitio.
 */
import { cn } from '@/lib/utils';

export function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={cn('quiet-bone block rounded-lg', className)} />;
}

/** Hueco de CashChart: misma altura que la gráfica (168 / 228 px) y la fila de rangos encima. */
export function ChartBone({ tall = false, ranges = true }: { tall?: boolean; ranges?: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando la gráfica</span>
      {ranges && (
        <div className="mb-3 flex justify-between px-1">
          {Array.from({ length: 5 }, (_, index) => <Bone key={index} className="h-4 w-7 rounded-md" />)}
        </div>
      )}
      <Bone className={cn('w-full rounded-2xl', tall ? 'h-[228px]' : 'h-[168px]')} />
    </div>
  );
}

/** Filas de lista: logo redondo, dos líneas a la izquierda y cifra a la derecha. */
export function RowBones({ count = 5, logo = 38 }: { count?: number; logo?: number }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="divide-y divide-slate-100 dark:divide-white/[0.08]">
      <span className="sr-only">Cargando</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-3.5">
          <span aria-hidden className="quiet-bone block shrink-0 rounded-full" style={{ width: logo, height: logo }} />
          <span className="min-w-0 flex-1 space-y-1.5">
            <Bone className="h-3.5 w-[46%]" />
            <Bone className="h-3 w-[28%]" />
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1.5">
            <Bone className="h-3.5 w-16" />
            <Bone className="h-3 w-10" />
          </span>
        </div>
      ))}
    </div>
  );
}
