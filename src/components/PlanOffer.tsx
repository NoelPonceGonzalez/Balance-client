import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { movementCount } from '@/lib/history';
import { formatCount, isCreator, offerFor, OFFERS } from '@/lib/offers';
import { cn } from '@/lib/utils';

export function PlanOffer({ username }: { username?: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    movementCount()
      .then((next) => { if (alive) setCount(next); })
      .catch(() => { if (alive) setCount(null); });
    return () => { alive = false; };
  }, []);

  const creator = isCreator(username);
  const current = creator ? offerFor(0, true) : count == null ? null : offerFor(count);
  const cap = current?.cap ?? null;
  const ratio = count == null || cap == null ? 0 : Math.min(1, count / cap);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-[28px] border border-slate-200/80 bg-white/70 px-4 py-4 text-left dark:border-white/10 dark:bg-white/[0.04]">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-slate-400">Tu plan</span>
          <span className="mt-0.5 block text-[20px] font-semibold tracking-tight">{current?.name || 'Contando…'}</span>
          {count != null && (
            <span className="mt-0.5 block text-[13px] font-medium text-slate-500">
              {formatCount(count)} movimientos{creator ? ' · por haberla creado' : ''}
            </span>
          )}
        </span>
        <ChevronRight size={18} className="shrink-0 text-slate-300" />
      </button>
      {open && (
        <Modal title="Tu plan" onClose={() => setOpen(false)}>
          {count != null && current && (
            <p className="text-[15px] font-medium leading-snug text-slate-600 dark:text-slate-300">
              Llevas {formatCount(count)} movimientos. {creator ? 'Casa es tuya, por haberla creado.' : `${current.name} es el que te cubre.`}
            </p>
          )}
          {count != null && cap != null && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <div className="h-full rounded-full bg-slate-950 dark:bg-white" style={{ width: `${Math.round(ratio * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-[12px] font-medium text-slate-400">{formatCount(count)} de {formatCount(cap)}</p>
            </div>
          )}
          <div className="mt-4 space-y-2">
            {OFFERS.map((offer) => {
              const on = current?.id === offer.id;
              return (
                <article
                  key={offer.id}
                  className={cn(
                    'rounded-[24px] px-4 py-4',
                    on ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white',
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      {on && <p className="text-[12px] font-medium text-white/60 dark:text-slate-500">La tuya</p>}
                      <h3 className="text-[20px] font-semibold tracking-tight">{offer.name}</h3>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[20px] font-semibold tabular-nums leading-none">{offer.price}</p>
                      <p className={cn('mt-1 text-[12px] font-medium', on ? 'text-white/60 dark:text-slate-500' : 'text-slate-400')}>{offer.period}</p>
                      {offer.month && <p className={cn('text-[12px] font-medium', on ? 'text-white/60 dark:text-slate-500' : 'text-slate-400')}>{offer.month}</p>}
                    </div>
                  </div>
                  <p className="mt-3 text-[14px] font-semibold">{offer.span}</p>
                  <p className={cn('mt-0.5 text-[14px] font-medium leading-snug', on ? 'text-white/75 dark:text-slate-600' : 'text-slate-500 dark:text-slate-300')}>{offer.line}</p>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-[12px] font-medium leading-5 text-slate-400">El precio sigue a los movimientos. El cobro llega con la aplicación de la tienda.</p>
        </Modal>
      )}
    </>
  );
}
