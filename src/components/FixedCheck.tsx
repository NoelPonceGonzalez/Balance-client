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

type Answer = 'yes' | 'no' | null;
type Fit = 'same' | 'more' | 'less' | null;

function sameDue(prompt: DuePrompt, focusKey: string | null): boolean {
  if (!focusKey) return false;
  return focusKey === `plan-due:${prompt.planId}:${prompt.key}`;
}

export function FixedCheck({ nonce, focusKey, onSettled }: { nonce: number; focusKey: string | null; onSettled: () => void }) {
  const [prompts, setPrompts] = useState<DuePrompt[]>([]);
  const [answer, setAnswer] = useState<Answer>(null);
  const [fit, setFit] = useState<Fit>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [later, setLater] = useState(false);
  const [token, setToken] = useState(nonce);
  if (token !== nonce) {
    setToken(nonce);
    setLater(false);
  }

  useEffect(() => {
    let cancelled = false;
    api<{ prompts: DuePrompt[] }>('/api/plans/due')
      .then((data) => {
        if (cancelled) return;
        const rows = data.prompts || [];
        const focus = rows.findIndex((item) => sameDue(item, focusKey));
        setPrompts(focus > 0 ? [rows[focus], ...rows.slice(0, focus), ...rows.slice(focus + 1)] : rows);
        setAnswer(null);
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
    setAnswer(null);
    setFit(null);
    setAmount('');
    setError('');
  };

  const actual = () => {
    if (answer !== 'yes') return 0;
    if (fit === 'same') return current.amount;
    return Number(amount);
  };

  const ready = answer === 'no' || (answer === 'yes' && fit === 'same') || (answer === 'yes' && (fit === 'more' || fit === 'less') && Number(amount) > 0 && (fit === 'more' ? Number(amount) > current.amount : Number(amount) < current.amount));

  const accept = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError('');
    try {
      await api(`/api/plans/${current.planId}/settle`, {
        method: 'POST',
        body: JSON.stringify({ key: current.key, done: answer === 'yes', amount: actual() }),
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
  const choice = (on: boolean) => cn('relative overflow-hidden rounded-full border py-2 text-sm font-black', on ? 'border-slate-900 text-white dark:border-white dark:text-slate-900' : 'border-slate-200 text-slate-500');

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(modalOverlayClass, 'z-[80]')}
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={still ? undefined : { opacity: 0, transition: quickOut }}
        >
          <motion.div
            key={current.key}
            className={cn(modalPanelClass, 'max-w-md')}
            role="dialog"
            aria-labelledby="fixed-check-title"
            initial={still ? false : { opacity: 0, scaleX: 0.86, scaleY: 0.8, y: 28 }}
            animate={{ opacity: 1, scaleX: 1, scaleY: 1, y: 0 }}
            exit={still ? undefined : { opacity: 0, scale: 0.94, y: 16, transition: quickOut }}
            transition={{ ...softSpring, opacity: { duration: 0.18 } }}
          >
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{current.planName}{prompts.length > 1 ? ` · 1 de ${prompts.length}` : ''}</p>
            <h2 id="fixed-check-title" className="mt-1 text-xl font-black">{question}</h2>
            <p className="mt-3 text-base font-black">{current.label}</p>
            <p className={cn('mt-1 text-lg font-black tabular-nums', current.direction === 'in' ? 'text-[#16c784]' : 'text-[#ea3943]')}>
              {current.direction === 'in' ? '+' : '−'}{formatEur(current.amount).replace('−', '')}
            </p>
            <p className="text-sm font-medium text-slate-500">{formatDay(current.day)}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {([['yes', 'Sí'], ['no', 'No']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => { setAnswer(id); setFit(null); setAmount(''); }} className={choice(answer === id)}>
                  {answer === id && <motion.span layoutId="due-answer" transition={still ? { duration: 0 } : softSpring} className="absolute inset-0 rounded-full bg-slate-900 dark:bg-white" />}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {answer === 'yes' && (
                <motion.div
                  key="fit"
                  className="mt-4 overflow-hidden"
                  initial={still ? false : { opacity: 0, height: 0, y: 8 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={still ? undefined : { opacity: 0, height: 0, y: -6, transition: quickOut }}
                  transition={jelly}
                >
                  <p className="text-sm font-black">¿Ha sido esta cantidad?</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([['same', 'Eso'], ['more', 'Más'], ['less', 'Menos']] as const).map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setFit(id)} className={choice(fit === id)}>
                        {fit === id && <motion.span layoutId="due-fit" transition={still ? { duration: 0 } : jelly} className="absolute inset-0 rounded-full bg-slate-900 dark:bg-white" />}
                        <span className="relative z-10">{label}</span>
                      </button>
                    ))}
                  </div>
                  <AnimatePresence initial={false}>
                    {(fit === 'more' || fit === 'less') && (
                      <motion.label
                        key="amount"
                        className="mt-3 block overflow-hidden"
                        initial={still ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={still ? undefined : { opacity: 0, height: 0, transition: quickOut }}
                        transition={jelly}
                      >
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Cuánto ha sido</span>
                        <input type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black outline-none dark:border-white/10 dark:bg-black" />
                      </motion.label>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
            {error && <p className="mt-3 text-sm font-bold text-[#ea3943]">{error}</p>}
            <motion.button
              type="button"
              disabled={!ready || saving}
              onClick={() => void accept()}
              animate={still ? undefined : { scale: ready ? 1 : 0.98 }}
              transition={softSpring}
              className="mt-4 w-full rounded-full bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
            >
              {saving ? 'Guardando…' : 'OK'}
            </motion.button>
            <button type="button" onClick={() => setLater(true)} className="mt-2 w-full py-2 text-sm font-bold text-slate-400">Ahora no</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
