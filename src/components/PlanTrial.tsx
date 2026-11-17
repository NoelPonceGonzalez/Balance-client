import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { formatDay, formatEur } from '@/lib/format';
import { wholeEur } from '@/components/InvestPlan';

interface TrialResult {
  saved: false;
  date: string;
  direction: 'in' | 'out';
  amount: number;
  onDay: number;
  monthClose: number;
  estimatedDate: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

function monthEnd(iso: string): string {
  const [year, month] = iso.slice(0, 7).split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

export function PlanTrial({ id, target, arrival }: { id: string; target: number; arrival: string | null }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrialResult | null>(null);

  const run = async () => {
    setError('');
    setBusy(true);
    try {
      const value = Number(amount);
      if (!(value > 0)) throw new Error('Escribe el importe.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Elige la fecha.');
      const data = await api<TrialResult>(`/api/plans/${id}/probar`, {
        method: 'POST',
        body: JSON.stringify({ amount: value, date, direction }),
      });
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'No se ha podido probar.');
    } finally {
      setBusy(false);
    }
  };

  const sameDay = result ? result.date.slice(0, 10) === monthEnd(result.date) || Math.abs(result.onDay - result.monthClose) < 0.005 : false;

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setError(''); }} className="text-[13px] font-semibold text-slate-500">
        Probar un movimiento
      </button>
      {open && (
        <Modal title="Probar un movimiento" onClose={() => setOpen(false)}>
          <div className="grid gap-4">
            <p className="text-[14px] font-medium leading-snug text-slate-500">No se guarda y no entra en la renta. Sirve para ver el camino si ese dinero sale o entra.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDirection('out')} className={`flex-1 rounded-full py-2 text-sm font-semibold ${direction === 'out' ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 ring-1 ring-slate-200 dark:ring-white/15'}`}>Sale</button>
              <button type="button" onClick={() => setDirection('in')} className={`flex-1 rounded-full py-2 text-sm font-semibold ${direction === 'in' ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 ring-1 ring-slate-200 dark:ring-white/15'}`}>Entra</button>
            </div>
            <Input label="Importe" type="number" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <Input label="Fecha" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
            {result && (
              <div className="rounded-[24px] bg-slate-100 px-4 py-4 text-[15px] font-medium leading-snug text-slate-800 dark:bg-white/10 dark:text-slate-100">
                <p>El {formatDay(result.date)} te quedas con {formatEur(result.onDay)}.</p>
                {!sameDay && <p className="mt-2">Cierras ese mes, el {formatDay(monthEnd(result.date))}, con {formatEur(result.monthClose)}.</p>}
                <p className="mt-2">
                  {result.estimatedDate
                    ? `Llegas a ${wholeEur(target)} el ${formatDay(result.estimatedDate)}.`
                    : `Con este movimiento no llegas a ${wholeEur(target)}.`}
                </p>
                {arrival && result.estimatedDate && arrival.slice(0, 10) !== result.estimatedDate.slice(0, 10) && (
                  <p className="mt-2 text-slate-500 dark:text-slate-400">Antes llegabas el {formatDay(arrival)}.</p>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => void run()} disabled={busy}>{busy ? 'Probando' : 'Ver el camino'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
