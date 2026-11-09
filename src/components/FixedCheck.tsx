import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '@/lib/api';
import { formatDay, formatEur } from '@/lib/format';
import { jelly, quickOut, softSpring } from '@/lib/motion';
import { modalOverlayClass, modalPanelClass } from '@/components/Modal';
import { cn } from '@/lib/utils';

interface DuePrompt {
  planId: string;
  planName: string;
  key: string;
  label: string;
  amount: number;
  direction: 'in' | 'out';
  day: string;
}

type Fit = 'same' | 'more' | 'less' | null;

function sameDue(prompt: DuePrompt, focusKey: string | null): boolean {
  if (!focusKey) return false;
  return focusKey === `plan-due:${prompt.planId}:${prompt.key}`;
}

export function FixedCheck({ nonce, focusKey, onSettled }: { nonce: number; focusKey: string | null; onSettled: () => void }) {
  const [prompts, setPrompts] = useState<DuePrompt[]>([]);
  const [fit, setFit] = useState<Fit>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [later, setLater] = useState(true);
  const [token, setToken] = useState(nonce);
  if (token !== nonce) {
    setToken(nonce);
    setLater(false);
  }

  useEffect(() => {
    if (focusKey) setLater(false);
  }, [focusKey]);

  useEffect(() => {
    const openDue = () => setLater(false);
    window.addEventListener('pat-due', openDue);
    return () => window.removeEventListener('pat-due', openDue);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ prompts: DuePrompt[] }>('/api/plans/due')
      .then((data) => {
        if (cancelled) return;
        const rows = data.prompts || [];
        const focus = rows.findIndex((item) => sameDue(item, focusKey));
        setPrompts(focus > 0 ? [rows[focus], ...rows.slice(0, focus), ...rows.slice(focus + 1)] : rows);
        setFit(null);
        setAmount('');
      })
      .catch(() => {
        if (!cancelled) setPrompts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce, focusKey]);

  const current = prompts[0];
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const open = Boolean(current) && !later;

  const reset = () => {
    setFit(null);
    setAmount('');
    setError('');
  };

  const settle = async (done: boolean, value: number) => {
    if (saving) return;
    if (!done) {
      setPrompts(prompts.slice(1));
      reset();
      return;
    }
    if (!(value > 0)) return;
    setSaving(true);
    setError('');
    try {
      await api(`/api/plans/${current.planId}/settle`, {
        method: 'POST',
        body: JSON.stringify({ key: current.key, done: true, amount: value }),
      });
      const rest = prompts.slice(1);
      setPrompts(rest);
      reset();
      onSettled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (!current) return null;
  const question = current.direction === 'in' ? '¿Ha entrado?' : '¿Lo has pagado?';

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(modalOverlayClass, 'z-[80]')}
          onClick={() => setLater(true)}
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={still ? undefined : { opacity: 0, transition: quickOut }}
        >
          <motion.div
            key={current.key}
            className={cn(modalPanelClass, 'max-w-md')}
            role="dialog"
            aria-labelledby="fixed-check-title"
            onClick={(event) => event.stopPropagation()}
            initial={still ? false : { opacity: 0, scaleX: 0.86, scaleY: 0.8, y: 28 }}
            animate={{ opacity: 1, scaleX: 1, scaleY: 1, y: 0 }}
            exit={still ? undefined : { opacity: 0, scale: 0.94, y: 16, transition: quickOut }}
            transition={{ ...softSpring, opacity: { duration: 0.18 } }}
          >
            <p className="text-[13px] font-semibold text-slate-400">{current.planName}{prompts.length > 1 ? ` · 1 de ${prompts.length}` : ''}</p>
            <h2 id="fixed-check-title" className="mt-1 text-xl font-semibold">{question}</h2>
            <p className="mt-3 text-base font-semibold">{current.label}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', current.direction === 'in' ? 'text-[#16c784]' : 'text-[#ea3943]')}>
              {current.direction === 'in' ? '+' : '−'}{formatEur(current.amount).replace('−', '')}
            </p>
            <p className="text-sm font-medium text-slate-500">{formatDay(current.day)}</p>
            <button type="button" disabled={saving} onClick={() => void settle(true, current.amount)} className="mt-4 w-full rounded-full bg-slate-950 py-3 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">
              {saving && fit !== 'more' ? 'Guardando…' : 'Sí, esa'}
            </button>
            <button type="button" onClick={() => { setFit(fit === 'more' ? null : 'more'); setAmount(''); }} className="mt-2 w-full py-2 text-sm font-semibold text-slate-500">
              Otra cantidad
            </button>
            <AnimatePresence initial={false}>
              {fit === 'more' && (
                <motion.div
                  key="amount"
                  className="overflow-hidden"
                  initial={still ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={still ? undefined : { opacity: 0, height: 0, transition: quickOut }}
                  transition={jelly}
                >
                  <input type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Cuánto ha sido" className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none dark:border-white/10 dark:bg-black" />
                  <button type="button" disabled={saving || !(Number(amount) > 0)} onClick={() => void settle(true, Number(amount))} className="mt-2 w-full rounded-full bg-slate-950 py-3 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            {error && <p className="mt-3 text-sm font-semibold text-[#ea3943]">{error}</p>}
            <button type="button" onClick={() => void settle(false, 0)} className="mt-2 w-full py-2 text-sm font-semibold text-slate-400">Todavía no</button>
            <button type="button" onClick={() => setLater(true)} className="w-full py-2 text-sm font-semibold text-slate-400">Ahora no</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
