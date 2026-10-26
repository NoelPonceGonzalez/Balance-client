import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDay, formatEur } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PlanForecast, PlanRow } from '@/lib/types';

interface DuePrompt {
  planId: string;
  planName: string;
  key: string;
  label: string;
  amount: number;
  direction: 'in' | 'out';
  day: string;
}

interface CheckItem {
  planId: string;
  key: string;
  label: string;
  amount: number;
  direction: 'in' | 'out';
  day: string;
  mode: 'settle' | 'mark';
}

interface SoonItem {
  id: string;
  label: string;
  amount: number;
  day: string;
}

function monthDate(month: string, anchor: number): string {
  const [year, index] = month.split('-').map(Number);
  const dim = new Date(year, index, 0).getDate();
  return `${month}-${String(Math.min(anchor, dim)).padStart(2, '0')}`;
}

export function PendingToday({ hidden, onChanged }: { hidden: boolean; onChanged: () => void }) {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [soon, setSoon] = useState<SoonItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const [due, plans] = await Promise.all([
      api<{ prompts: DuePrompt[] }>('/api/plans/due'),
      api<{ plans: { plan: PlanRow; forecast: PlanForecast }[] }>('/api/plans'),
    ]);
    const known = new Set<string>();
    const nextChecks: CheckItem[] = [];
    for (const item of due.prompts || []) {
      const id = `${item.planId}:${item.key}`;
      if (known.has(id)) continue;
      known.add(id);
      nextChecks.push({
        planId: item.planId,
        key: item.key,
        label: item.label,
        amount: item.amount,
        direction: item.direction,
        day: item.day,
        mode: 'settle',
      });
    }
    const nextSoon: SoonItem[] = [];
    for (const entry of plans.plans) {
      const plan = entry.plan;
      const forecast = entry.forecast;
      const planId = String(plan._id);
      const today = forecast.today;
      if (plan.monthlySavings > 0 && today) {
        const anchor = plan.savingsDay && plan.savingsDay >= 1 && plan.savingsDay <= 31 ? Math.round(plan.savingsDay) : 31;
        const day = monthDate(today.slice(0, 7), anchor);
        if (day > today) nextSoon.push({ id: `${planId}:savings:${day}`, label: plan.name, amount: plan.monthlySavings, day });
      }
      for (const month of forecast.months || []) {
        for (const line of month.lines) {
          if (!line.markKey || line.automatic || line.paid || line.amount == null || !line.day || !today || line.day > today) continue;
          const id = `${planId}:${line.markKey}`;
          if (known.has(id)) continue;
          known.add(id);
          nextChecks.push({
            planId,
            key: line.markKey,
            label: line.label,
            amount: Math.abs(line.amount),
            direction: line.amount < 0 ? 'out' : 'in',
            day: line.day,
            mode: 'mark',
          });
        }
      }
    }
    setChecks(nextChecks.slice(0, 6));
    setSoon(nextSoon.slice(0, 2));
  };

  useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => {
        if (!cancelled) {
          setChecks([]);
          setSoon([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = async (item: CheckItem) => {
    if (busy) return;
    setBusy(`${item.planId}:${item.key}`);
    setError('');
    try {
      if (item.mode === 'settle') {
        await api(`/api/plans/${item.planId}/settle`, {
          method: 'POST',
          body: JSON.stringify({ key: item.key, done: true, amount: item.amount }),
        });
      } else {
        await api(`/api/plans/${item.planId}/mark`, {
          method: 'POST',
          body: JSON.stringify({ key: item.key, paid: true }),
        });
      }
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido confirmar.');
    } finally {
      setBusy(null);
    }
  };

  if (checks.length === 0 && soon.length === 0) return null;
  const money = (value: number) => (hidden ? '••••' : formatEur(value));

  return (
    <section className="rounded-2xl border border-white/70 bg-white/55 px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      {checks.length > 0 && <p className="px-1 pb-1 text-[11px] font-semibold text-slate-400">Pendiente</p>}
      <ul>
        {checks.map((item) => {
          const id = `${item.planId}:${item.key}`;
          return (
            <li key={id} className="flex items-center gap-2 border-t border-slate-200/70 py-1.5 first:border-t-0 dark:border-white/10">
              <button
                type="button"
                aria-label={`Confirmar ${item.label}`}
                disabled={busy === id}
                onClick={() => void confirm(item)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-slate-300 text-transparent active:border-[#16c784] active:text-[#16c784] disabled:opacity-40 dark:border-white/20"
              >
                <Check size={13} strokeWidth={3} />
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{item.label}</span>
                <span className="block text-[11px] text-slate-400">{formatDay(item.day)}</span>
              </span>
              <span className={cn('shrink-0 text-[13px] font-semibold tabular-nums', item.direction === 'in' ? 'text-[#16c784]' : 'text-[#ea3943]')}>
                {item.direction === 'in' ? '+' : '−'}{money(item.amount).replace('−', '')}
              </span>
            </li>
          );
        })}
      </ul>
      {soon.map((item) => (
        <p key={item.id} className={cn('flex items-center justify-between gap-2 px-1 py-1 text-[13px]', checks.length > 0 && 'border-t border-slate-200/70 dark:border-white/10')}>
          <span className="min-w-0 truncate text-slate-500">El {Number(item.day.slice(8, 10))} apartas</span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-700 dark:text-slate-200">{money(item.amount)}</span>
        </p>
      ))}
      {error && <p className="px-1 pt-1 text-xs font-medium text-[#ea3943]">{error}</p>}
    </section>
  );
}
