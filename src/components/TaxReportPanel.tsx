import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { SCALE_PATHS } from '@/lib/brand-mark';
import { formatEur, formatSignedEur } from '@/lib/format';
import { glide, quickOut, softSpring } from '@/lib/motion';
import type { TaxHolding, TaxReport } from '@/lib/tax-report';
import type { AccountRow, MovementRow } from '@/lib/types';
import { cn } from '@/lib/utils';

type Stage = 'idle' | 'working' | 'ready' | 'error';
type Format = 'pdf' | 'excel';

const STEPS = [
  'Leyendo tus movimientos',
  'Valorando cada operación en euros',
  'Calculando el coste de cada venta',
  'Separando lo que va a Hacienda',
];

const SWING = { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const };

/** La balanza de Balance: oscila mientras pesa y se nivela al terminar. */
function Scale({ weighing, className }: { weighing: boolean; className?: string }) {
  const tilt = 7;
  const drop = 8 * Math.sin((tilt * Math.PI) / 180);
  return (
    <svg viewBox="3 4 26 23" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={SCALE_PATHS.post} />
      <motion.path d={SCALE_PATHS.beam} animate={{ rotate: weighing ? [-tilt, tilt, -tilt] : 0 }} transition={weighing ? SWING : glide} />
      <motion.path d={SCALE_PATHS.left} animate={{ y: weighing ? [drop, -drop, drop] : 0 }} transition={weighing ? SWING : glide} />
      <motion.path d={SCALE_PATHS.right} animate={{ y: weighing ? [-drop, drop, -drop] : 0 }} transition={weighing ? SWING : glide} />
    </svg>
  );
}

interface Ready {
  report: TaxReport;
  owner: string;
}

export function TaxReportPanel({ years, initialYear, onBusy }: { years: number[]; initialYear: string; onBusy: (busy: boolean) => void }) {
  const [year, setYear] = useState(initialYear);
  const [stage, setStage] = useState<Stage>('idle');
  const [step, setStep] = useState(0);
  const [prices, setPrices] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<Format | null>(null);
  const [saved, setSaved] = useState<Format[]>([]);

  const prepare = async () => {
    setStage('working');
    setStep(0);
    setPrices({ done: 0, total: 0 });
    setSaved([]);
    setError('');
    onBusy(true);
    try {
      const [me, movementData, accountData, holdingData, { buildTaxReport }] = await Promise.all([
        api<{ user: { name: string } }>('/api/auth/me'),
        api<{ movements: MovementRow[] }>(`/api/movements?to=${Number(year) + 1}-02-${(Number(year) + 1) % 4 === 0 ? '29' : '28'}`),
        api<{ accounts: AccountRow[] }>('/api/accounts'),
        api<{ holdings: TaxHolding[] }>('/api/holdings'),
        import('@/lib/tax-report'),
      ]);
      setStep(1);
      const report = await buildTaxReport(
        { movements: movementData.movements, accounts: accountData.accounts, holdings: holdingData.holdings },
        Number(year),
        (done, total) => setPrices({ done, total }),
      );
      if (movementData.movements.length >= 5000) report.warnings.push('El informe usa los 5000 movimientos más recientes; los anteriores quedan fuera del cálculo FIFO.');
      setStep(2);
      await new Promise((resolve) => setTimeout(resolve, 380));
      setStep(3);
      await new Promise((resolve) => setTimeout(resolve, 380));
      setReady({ report, owner: me.user.name });
      setStage('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido preparar el informe.');
      setStage('error');
    } finally {
      onBusy(false);
    }
  };

  const download = async (format: Format) => {
    if (!ready) return;
    setSaving(format);
    setError('');
    try {
      if (format === 'pdf') {
        const { downloadTaxPdf } = await import('@/lib/tax-pdf');
        await downloadTaxPdf(ready.report, ready.owner);
      } else {
        const { downloadTaxWorkbook } = await import('@/lib/tax-sheet');
        await downloadTaxWorkbook(ready.report, ready.owner);
      }
      setSaved((list) => (list.includes(format) ? list : [...list, format]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido descargar.');
    } finally {
      setSaving(null);
    }
  };

  const progress = stage === 'ready' ? 1 : (step + (step === 1 && prices.total ? prices.done / prices.total : 0)) / STEPS.length;

  return (
    <section className="overflow-hidden rounded-[24px] bg-slate-50 dark:bg-white/5">
      <AnimatePresence mode="wait" initial={false}>
        {(stage === 'idle' || stage === 'error') && (
          <motion.div key="idle" className="p-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: quickOut }} transition={softSpring}>
            <div className="flex items-start gap-3.5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-slate-950 ring-1 ring-slate-200 dark:bg-white dark:ring-0">
                <Scale weighing={false} className="w-7" />
              </span>
              <span className="min-w-0">
                <span className="block text-[16px] font-semibold tracking-tight">Informe para la Renta</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-slate-500 dark:text-slate-400">
                  Balance revisa todos tus movimientos y aparta solo los que van a la declaración.
                </span>
              </span>
            </div>
            <div className="mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400">Ejercicio</div>
            <div className="no-scrollbar -mx-5 mt-2 flex snap-x gap-1.5 overflow-x-auto overscroll-x-contain px-5 py-0.5">
              {years.map((value) => {
                const active = String(value) === year;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setYear(String(value))}
                    className={cn(
                      'relative shrink-0 snap-start rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                      active ? 'text-white dark:text-slate-950' : 'text-slate-600 ring-1 ring-slate-200 hover:bg-white dark:text-slate-300 dark:ring-white/15 dark:hover:bg-white/10',
                    )}
                  >
                    {active && <motion.span layoutId="tax-year" className="absolute inset-0 rounded-full bg-slate-950 dark:bg-white" transition={glide} />}
                    <span className="relative">{value}</span>
                  </button>
                );
              })}
            </div>
            {error && <p className="mt-4 rounded-2xl bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => void prepare()}
              className="mt-5 w-full rounded-full bg-slate-950 px-4 py-3.5 text-[15px] font-semibold text-white dark:bg-white dark:text-slate-950"
            >
              {stage === 'error' ? `Volver a preparar la Renta ${year}` : `Preparar Renta ${year}`}
            </motion.button>
          </motion.div>
        )}

        {stage === 'working' && (
          <motion.div key="working" className="p-5" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: quickOut }} transition={softSpring}>
            <div className="flex flex-col items-center pt-2 text-center">
              <motion.span
                className="grid size-20 place-items-center rounded-[26px] bg-white text-slate-950 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] ring-1 ring-slate-200 dark:ring-0"
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Scale weighing className="w-11" />
              </motion.span>
              <div className="mt-4 text-[16px] font-semibold tracking-tight">Preparando tu Renta {year}</div>
              <div className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">Pesando cada movimiento</div>
            </div>
            <div className="mt-5 h-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
              <motion.div className="h-full rounded-full bg-slate-950 dark:bg-white" initial={{ width: '4%' }} animate={{ width: `${Math.max(4, progress * 100)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 24 }} />
            </div>
            <ol className="mt-4 space-y-2.5">
              {STEPS.map((label, index) => {
                const done = index < step;
                const current = index === step;
                return (
                  <motion.li
                    key={label}
                    className="flex items-center gap-3 text-[13.5px]"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: done || current ? 1 : 0.4, x: 0 }}
                    transition={{ ...softSpring, delay: index * 0.06 }}
                  >
                    <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', done ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'ring-1 ring-slate-300 dark:ring-white/20')}>
                      {done ? (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={glide}><Check className="size-3" strokeWidth={3} /></motion.span>
                      ) : current ? (
                        <motion.span className="size-1.5 rounded-full bg-slate-950 dark:bg-white" animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.1, repeat: Infinity }} />
                      ) : null}
                    </span>
                    <span className={cn('min-w-0 flex-1', current ? 'font-semibold' : 'font-medium')}>{label}</span>
                    {index === 1 && current && prices.total > 0 && (
                      <span className="shrink-0 text-[12px] font-medium tabular-nums text-slate-400">{prices.done} de {prices.total}</span>
                    )}
                  </motion.li>
                );
              })}
            </ol>
          </motion.div>
        )}

        {stage === 'ready' && ready && (
          <motion.div key="ready" className="p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: quickOut }} transition={softSpring}>
            <ReadyView
              ready={ready}
              year={year}
              saving={saving}
              saved={saved}
              error={error}
              onDownload={(format) => void download(format)}
              onReset={() => { setStage('idle'); setReady(null); setError(''); }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ReadyView({ ready, year, saving, saved, error, onDownload, onReset }: {
  ready: Ready;
  year: string;
  saving: Format | null;
  saved: Format[];
  error: string;
  onDownload: (format: Format) => void;
  onReset: () => void;
}) {
  const { report } = ready;
  const kinds = (list: string[]) => report.incomes.filter((item) => list.includes(item.kind));
  const capital = kinds(['Intereses', 'Staking', 'Dividendos']);
  const rewards = kinds(['Recompensas']);
  const result = report.disposals.reduce((sum, item) => sum + item.gain, 0);
  const entries = report.disposals.length + report.incomes.reduce((sum, item) => sum + item.count, 0);
  const own = report.lines.filter((line) => line.effect.startsWith('Traspaso')).length;
  const rounded = Math.round(result * 100) / 100;
  const side = [
    { label: 'Capital mobiliario', value: formatEur(capital.reduce((sum, item) => sum + item.eur, 0)), note: 'Intereses y staking' },
    { label: 'Recompensas', value: formatEur(rewards.reduce((sum, item) => sum + item.eur, 0)), note: 'Base general' },
  ];
  const outside = [
    report.rewraps.length ? `${report.rewraps.length} ${report.rewraps.length === 1 ? 'cambio' : 'cambios'} de formato (${[...new Set(report.rewraps.map((item) => `${item.from} a ${item.to}`))].join(', ')})` : '',
    own ? `${own} ${own === 1 ? 'traspaso' : 'traspasos'} entre tus cuentas o a Earn` : '',
  ].filter(Boolean);

  return (
    <div>
      <div className="flex items-start gap-3.5">
        <motion.span
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-slate-950 ring-1 ring-slate-200 dark:ring-0"
          initial={{ scale: 0.6, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={glide}
        >
          <Scale weighing={false} className="w-7" />
        </motion.span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[16px] font-semibold tracking-tight">Renta {year} lista</span>
            <button type="button" onClick={onReset} className="-my-1 shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-slate-500 ring-1 ring-slate-200 dark:text-slate-300 dark:ring-white/15">Otro año</button>
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-slate-500 dark:text-slate-400">
            {entries
              ? `De ${report.lines.length} movimientos, ${entries} ${entries === 1 ? 'va' : 'van'} a la declaración.`
              : `Revisados ${report.lines.length} movimientos.`}
          </span>
        </span>
      </div>

      <motion.div
        className="mt-4 overflow-hidden rounded-[22px] bg-slate-950 text-white dark:bg-black dark:ring-1 dark:ring-white/10"
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...softSpring, delay: 0.05 }}
      >
        <div className="px-4 pb-4 pt-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/45">Ganancias y pérdidas</div>
          <motion.div
            className={cn('mt-1 text-[32px] font-semibold leading-none tabular-nums tracking-tight', rounded > 0 ? 'text-emerald-300' : rounded < 0 ? 'text-rose-300' : 'text-white')}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...softSpring, delay: 0.12 }}
          >
            {formatSignedEur(rounded)}
          </motion.div>
          <div className="mt-1.5 text-[12px] text-white/45">
            {report.disposals.length
              ? `${report.disposals.length} ${report.disposals.length === 1 ? 'transmisión' : 'transmisiones'} · base del ahorro`
              : 'Sin ventas ni cambios que declarar'}
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-white/10">
          {side.map((item, index) => (
            <motion.div
              key={item.label}
              className={cn('min-w-0 px-4 py-3.5', index > 0 && 'border-l border-white/10')}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...softSpring, delay: 0.18 + index * 0.06 }}
            >
              <div className="truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/45">{item.label}</div>
              <div className="mt-1 text-[19px] font-semibold tabular-nums tracking-tight">{item.value}</div>
              <div className="truncate text-[11.5px] text-white/40">{item.note}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        className="mt-3 grid grid-cols-2 gap-2"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...softSpring, delay: 0.24 }}
      >
        <div className="rounded-[18px] bg-white px-3.5 py-3 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
          <div className="text-[11px] font-semibold text-slate-400">Cuota estimada</div>
          <div className="mt-0.5 text-[17px] font-semibold tabular-nums tracking-tight">{formatEur(report.compensation.tax)}</div>
          <div className="text-[11.5px] text-slate-400">Base del ahorro {formatEur(report.compensation.base)}</div>
        </div>
        <div className="rounded-[18px] bg-white px-3.5 py-3 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
          <div className="text-[11px] font-semibold text-slate-400">Para otros años</div>
          <div className="mt-0.5 text-[17px] font-semibold tabular-nums tracking-tight">{formatEur(report.compensation.pending.reduce((sum, item) => sum + item.amount, 0))}</div>
          <div className="truncate text-[11.5px] text-slate-400">
            {report.compensation.pending.length ? `Pérdidas hasta ${Math.max(...report.compensation.pending.map((item) => item.until))}` : 'Sin pérdidas pendientes'}
          </div>
        </div>
      </motion.div>

      {!entries && (
        <p className="mt-3 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">
          Nada de {year} va a la declaración. Puedes descargar el informe igualmente para guardarlo o enseñárselo a tu asesor.
        </p>
      )}

      {outside.length > 0 && (
        <motion.p className="mt-3 flex gap-2 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
          <span>Revisados y fuera de la declaración: {outside.join(' y ')}.</span>
        </motion.p>
      )}
      {report.warnings.length > 0 && (
        <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-[12.5px] font-medium leading-snug text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {report.warnings.length === 1 ? 'Hay 1 punto' : `Hay ${report.warnings.length} puntos`} para revisar con tu asesor. Están marcados en el informe.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {([
          { format: 'pdf' as const, title: 'PDF para tu asesor', note: 'Lo que va a la Renta, listo para enviar', Icon: FileText, primary: true },
          { format: 'excel' as const, title: 'Excel con todo el detalle', note: 'Cada operación, compra y movimiento', Icon: FileSpreadsheet, primary: false },
        ]).map(({ format, title, note, Icon, primary }) => {
          const done = saved.includes(format);
          const busy = saving === format;
          return (
            <motion.button
              key={format}
              type="button"
              disabled={saving != null}
              whileTap={{ scale: 0.98 }}
              onClick={() => onDownload(format)}
              className={cn(
                'flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left disabled:opacity-70',
                primary ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-white ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/15',
              )}
            >
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', primary ? 'bg-white/10 dark:bg-slate-950/10' : 'bg-slate-100 dark:bg-white/10')}>
                <AnimatePresence mode="wait" initial={false}>
                  {done ? (
                    <motion.span key="done" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={glide}><Check className="size-4" strokeWidth={3} /></motion.span>
                  ) : busy ? (
                    <motion.span key="busy" className="block size-4 rounded-full border-2 border-current border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                  ) : (
                    <motion.span key="icon" initial={{ scale: 0.6 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Icon className="size-4" /></motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{title}</span>
                <span className={cn('block truncate text-[12px] font-medium', primary ? 'opacity-60' : 'text-slate-500 dark:text-slate-400')}>{done ? `Descargado · Balance-Renta-${year}.${format === 'pdf' ? 'pdf' : 'xlsx'}` : busy ? 'Preparando…' : note}</span>
              </span>
              <Download className={cn('size-4 shrink-0', primary ? 'opacity-60' : 'text-slate-400')} />
            </motion.button>
          );
        })}
      </div>
      {error && <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

      <div className="mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400">Cómo usarlo</div>
      <ol className="mt-2.5 space-y-2.5">
        {[
          'Envía el PDF a tu asesor, o ábrelo al lado de Renta Web si la haces tú.',
          'La primera tabla dice la casilla de Renta Web de cada cifra, y al final tienes los plazos y las normas que aplica.',
          'Guarda el Excel: es tu respaldo si Hacienda pide el detalle de una operación.',
        ].map((text, index) => (
          <motion.li key={text} className="flex gap-3 text-[13px] leading-snug text-slate-600 dark:text-slate-300" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...softSpring, delay: 0.35 + index * 0.06 }}>
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-[11px] font-bold text-slate-900 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white dark:ring-0">{index + 1}</span>
            <span>{text}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
