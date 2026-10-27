import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDay, formatEur } from '@/lib/format';
import { OriginGlyph } from '@/components/OriginMark';
import { cn } from '@/lib/utils';
import type { PlanForecast, PlanRow } from '@/lib/types';

interface CheckItem {
  planId: string;
  key: string;
  label: string;
  amount: number;
  direction: 'in' | 'out';
  day: string;
  paid: boolean;
  image: string;
}

interface SoonItem {
  id: string;
  label: string;
  amount: number;
  day: string;
}

function eventImage(plan: PlanRow, markKey: string): string {
  const [kind, id] = markKey.split(':');
  const list = kind === 'expense' ? plan.plannedExpenses : kind === 'income' ? plan.incomes : [];
  return list?.find((item) => item._id === id)?.image || '';
}

function monthDate(month: string, anchor: number): string {
  const [year, index] = month.split('-').map(Number);
  const dim = new Date(year, index, 0).getDate();
  return `${month}-${String(Math.min(anchor, dim)).padStart(2, '0')}`;
}

function monthStart(month: string, back: number): string {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 - back, 1)).toISOString().slice(0, 10);
}

export function PendingToday({ hidden, onChanged }: { hidden: boolean; onChanged: () => void }) {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [soon, setSoon] = useState<SoonItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const plans = await api<{ plans: { plan: PlanRow; forecast: PlanForecast }[] }>('/api/plans');
    const nextChecks: CheckItem[] = [];
    const nextSoon: SoonItem[] = [];
    const known = new Set<string>();
    for (const entry of plans.plans) {
      const plan = entry.plan;
      const forecast = entry.forecast;
      const planId = String(plan._id);
      const today = forecast.today;
      if (!today) continue;
      if (plan.monthlySavings > 0) {
        const anchor = plan.savingsDay && plan.savingsDay >= 1 && plan.savingsDay <= 31 ? Math.round(plan.savingsDay) : 31;
        const day = monthDate(today.slice(0, 7), anchor);
        if (day > today) nextSoon.push({ id: `${planId}:savings:${day}`, label: plan.name, amount: plan.monthlySavings, day });
      }
      const keepFrom = monthStart(today.slice(0, 7), 1);
      for (const month of forecast.months || []) {
        for (const line of month.lines) {
          if (!line.markKey || line.automatic || line.amount == null || !line.day || line.day > today) continue;
          if (line.paid && line.day < keepFrom) continue;
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
            paid: line.paid === true,
            image: eventImage(plan, line.markKey),
          });
        }
      }
    }
    nextChecks.sort((a, b) => Number(a.paid) - Number(b.paid) || b.day.localeCompare(a.day));
    setChecks(nextChecks.slice(0, 8));
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

  const toggle = async (item: CheckItem) => {
    if (busy) return;
    const id = `${item.planId}:${item.key}`;
    setBusy(id);
    setError('');
    try {
      await api(`/api/plans/${item.planId}/mark`, {
        method: 'POST',
        body: JSON.stringify({ key: item.key, paid: !item.paid }),
      });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido cambiar la marca.');
    } finally {
      setBusy(null);
    }
  };

  if (checks.length === 0 && soon.length === 0) return null;
  const money = (value: number) => (hidden ? '••••' : formatEur(value));
  const pending = checks.some((item) => !item.paid);

  return (
    <section className="rounded-2xl border border-white/70 bg-white/55 px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      <p className="px-1 pb-1 text-[11px] font-semibold text-slate-400">{pending ? 'Pendiente' : 'Este mes'}</p>
      <ul>
        {checks.map((item) => {
          const id = `${item.planId}:${item.key}`;
          return (
            <li key={id} className="flex items-center gap-2 border-t border-slate-200/70 py-1.5 first:border-t-0 dark:border-white/10">
              <button
                type="button"
                aria-pressed={item.paid}
                aria-label={item.paid ? `Quitar marca de ${item.label}` : `Marcar ${item.label}`}
                disabled={busy === id}
                onClick={() => void toggle(item)}
                className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 bg-white disabled:opacity-40 dark:bg-transparent', item.paid ? 'border-[#16c784] bg-[#16c784] text-white dark:bg-[#16c784]' : 'border-slate-300 text-transparent dark:border-white/20')}
              >
                <Check size={13} strokeWidth={3} />
              </button>
              <OriginGlyph name={item.label} image={item.image} className="h-8 w-8" />
              <span className="min-w-0 flex-1">
                <span className={cn('block break-words text-[13px] font-semibold leading-snug', item.paid ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>{item.label}</span>
                <span className="block text-[11px] text-slate-400">{formatDay(item.day)}</span>
              </span>
              <span className={cn('shrink-0 text-[13px] font-semibold tabular-nums', item.paid ? '' : 'opacity-40', item.direction === 'in' ? 'text-[#16c784]' : 'text-[#ea3943]')}>
                {item.direction === 'in' ? '+' : '−'}{money(item.amount).replace('−', '')}
              </span>
            </li>
          );
        })}
      </ul>
      {soon.map((item) => (
        <p key={item.id} className="flex items-center justify-between gap-2 border-t border-slate-200/70 px-1 py-1 text-[13px] dark:border-white/10">
          <span className="min-w-0 truncate text-slate-500">El {Number(item.day.slice(8, 10))} apartas</span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-700 dark:text-slate-200">{money(item.amount)}</span>
        </p>
      ))}
      {error && <p className="px-1 pt-1 text-xs font-medium text-[#ea3943]">{error}</p>}
    </section>
  );
}
