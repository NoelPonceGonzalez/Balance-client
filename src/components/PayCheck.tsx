import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { formatEur } from '@/lib/format';
import { modalOverlayClass, modalPanelClass } from '@/components/Modal';
import { cn } from '@/lib/utils';

interface PayPrompt {
  planId: string;
  planName: string;
  fromId: string;
  toId: string;
  amount: number;
  role: 'pay' | 'confirm';
  otherName: string;
  rejected: boolean;
}

function skipKey(prompt: PayPrompt): string {
  return `${prompt.planId}:${prompt.fromId}:${prompt.toId}:${prompt.role}`;
}

export function PayCheck() {
  const [prompts, setPrompts] = useState<PayPrompt[]>([]);
  const [skipped, setSkipped] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('pat_pay_skip') || '[]') as string[];
    } catch {
      return [];
    }
  });
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancel = false;
    api<{ prompts: PayPrompt[] }>('/api/plans/pagos')
      .then((data) => {
        if (!cancel) setPrompts(data.prompts || []);
      })
      .catch(() => {
        if (!cancel) setPrompts([]);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const tick = () => setBlocked(Boolean(document.getElementById('fixed-check-title')));
    tick();
    const timer = window.setInterval(tick, 400);
    return () => window.clearInterval(timer);
  }, []);

  const current = prompts.find((item) => !skipped.includes(skipKey(item)));
  if (!current || blocked) return null;

  const later = () => {
    const next = [...skipped, skipKey(current)];
    setSkipped(next);
    sessionStorage.setItem('pat_pay_skip', JSON.stringify(next));
  };

  const answer = async (action: 'paid' | 'yes' | 'no') => {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/api/plans/${current.planId}/pago`, {
        method: 'POST',
        body: JSON.stringify({ fromId: current.fromId, toId: current.toId, action }),
      });
      setPrompts((rows) => rows.filter((item) => skipKey(item) !== skipKey(current)));
      window.dispatchEvent(new Event('pat-reparto'));
    } finally {
      setBusy(false);
    }
  };

  const paying = current.role === 'pay';
  const title = paying ? '¿Has pagado?' : '¿Te ha llegado?';
  const detail = paying
    ? `${formatEur(current.amount)} a ${current.otherName}`
    : `${current.otherName} dice que te ha pagado ${formatEur(current.amount)}`;

  return createPortal(
    <div className={cn(modalOverlayClass, 'z-[75]')}>
      <div className={cn(modalPanelClass, 'max-w-md')} role="dialog" aria-labelledby="pay-check-title">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{current.planName}</p>
        <h2 id="pay-check-title" className="mt-1 text-xl font-black">{title}</h2>
        <p className="mt-3 text-base font-black">{detail}</p>
        {current.rejected && <p className="mt-2 text-sm font-semibold text-[#ea3943]">{current.otherName} dice que no le ha llegado.</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {paying ? (
            <button type="button" disabled={busy} onClick={() => void answer('paid')} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">Ya está</button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => void answer('yes')} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">Me ha llegado</button>
              <button type="button" disabled={busy} onClick={() => void answer('no')} className="rounded-full px-4 py-2 text-sm font-bold text-[#ea3943] disabled:opacity-50">No ha llegado</button>
            </>
          )}
          <button type="button" onClick={later} className="rounded-full px-4 py-2 text-sm font-bold text-slate-400">Ahora no</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
