import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatEur } from '@/lib/format';
import { assetLabel, coinMoments, type CoinHolding } from '@/components/InvestPlan';
import type { AppNotification, DashboardData, PlanInvest, PlanRow } from '@/lib/types';
import { cn } from '@/lib/utils';

const BASE = 10_000;
const ABROAD = 50_000;
const REMUNERATED = /trade republic|myinvestor|n26|raisin|revolut|remuner|ahorro|indexa|finizens/i;

interface Glance {
  moves: string[];
  events: string[];
  moments: string[];
}

function madridDay(value: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

/** Una sola señal que merezca mirar el plan, y el logro más reciente. Nada de listar cada tanda. */
function planHighlights(plans: { plan: PlanRow; invest?: PlanInvest }[], holdings: CoinHolding[]): string[] {
  const lines: string[] = [];
  const moments = plans.flatMap((pack) => {
    if (pack.plan.kind !== 'inversion' || !pack.invest) return [];
    return coinMoments(pack.plan, pack.invest, holdings).filter((moment) => moment.buy && !moment.buy.done && moment.level !== 'normal');
  });
  const good = moments.find((moment) => moment.level === 'good');
  const bad = moments.find((moment) => moment.level === 'bad');
  const moment = good || bad;
  if (moment) lines.push(moment.level === 'good' ? `Buen momento para la tanda de ${moment.name}` : `${moment.name} está caro para comprar la tanda`);

  const fortnight = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const done = plans
    .flatMap((pack) => pack.plan.buys || [])
    .filter((buy) => buy.done && buy.doneAt && new Date(buy.doneAt).getTime() >= fortnight)
    .sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)))[0];
  if (done) lines.push(`Tanda de ${assetLabel(done.asset)} hecha`);
  return lines;
}

function oneDecimal(value: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Math.abs(value));
}

export function HomeGlance({ data, hidden, notes }: { data: DashboardData; hidden: boolean; notes: AppNotification[] }) {
  const [glance, setGlance] = useState<Glance>({ moves: [], events: [], moments: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ holdings: CoinHolding[] }>('/api/holdings').catch(() => ({ holdings: [] as CoinHolding[] })),
      api<{ plans: { plan: PlanRow; invest?: PlanInvest }[] }>('/api/plans').catch(() => ({ plans: [] })),
    ]).then(([book, plans]) => {
      if (cancelled) return;
      const holdings = book.holdings || [];
      const moves = holdings
        .filter((item) => item.quantity > 0 && item.change24hPct != null)
        .filter((item) => Math.abs(item.change24hPct || 0) >= (item.assetClass === 'crypto' ? 5 : 4))
        .sort((a, b) => Math.abs(b.change24hPct || 0) - Math.abs(a.change24hPct || 0))
        .slice(0, 3)
        .map((item) => {
          const change = item.change24hPct || 0;
          const name = item.symbol?.trim() || item.name;
          return `${name} ${change < 0 ? 'baja' : 'sube'} un ${oneDecimal(change)} % hoy`;
        });
      const moments = planHighlights(plans.plans || [], holdings);
      const today = data.today;
      const events = notes
        .filter((item) => (item.quoteKey || '').startsWith('event:') && madridDay(item.createdAt) === today)
        .slice(0, 2)
        .map((item) => item.title);
      setGlance({ moves, events, moments });
    });
    return () => { cancelled = true; };
  }, [data.today, notes]);

  const parked = data.accounts.filter((account) => account.currency === 'EUR' && (account.kind === 'bank' || account.kind === 'cash' || account.kind === 'broker'));
  const remunerated = parked.filter((account) => REMUNERATED.test(`${account.name} ${account.platform}`));
  const sum = (rows: typeof parked) => Math.round(rows.reduce((total, account) => total + Math.max(0, account.balance), 0) * 100) / 100;
  const cushion = sum(remunerated.length ? remunerated : parked);
  const cushionLabel = remunerated.length ? 'en cuentas remuneradas' : 'en euros parados';
  const left = Math.max(0, Math.round((BASE - cushion) * 100) / 100);
  const abroad = Math.round(data.accounts
    .filter((account) => account.kind === 'exchange')
    .reduce((total, account) => total + (account.parts || []).filter((part) => part.group === 'crypto').reduce((sum, part) => sum + part.eur, 0), 0) * 100) / 100;
  const over = abroad >= ABROAD;
  const december = data.today.slice(5, 7) === '12';
  const lines = [...glance.events, ...glance.moves, ...glance.moments];
  const money = (value: number) => (hidden ? '*****' : formatEur(value));

  return (
    <section className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10">
      <div className="px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Hoy</div>
        {lines.length ? (
          <ul className="mt-2 space-y-1.5">
            {lines.map((line) => (
              <li key={line} className="text-[14px] font-medium leading-snug text-slate-800 dark:text-slate-100">{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[14px] font-medium text-slate-500">Tus activos van tranquilos.</p>
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-4 dark:border-white/10">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-slate-500">Base de liquidez</span>
          <span className="text-[15px] font-semibold tabular-nums">{money(cushion)}</span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-slate-400">
          {money(cushion)} {cushionLabel}. {left > 0 ? `Faltan ${money(left)} para los ${money(BASE)}.` : 'La base de 10.000 € está cubierta.'}
        </p>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
          <div className="h-full rounded-full bg-slate-950 dark:bg-white" style={{ width: `${Math.min(100, (cushion / BASE) * 100)}%` }} />
        </div>
      </div>

      {abroad > 0 && (
        <div className={cn('border-t px-4 py-4', over ? 'border-amber-100 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30' : 'border-slate-100 dark:border-white/10')}>
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn('text-[13px] font-medium', over ? 'text-amber-800 dark:text-amber-200' : 'text-slate-500')}>Modelo 721</span>
            <span className={cn('text-[15px] font-semibold tabular-nums', over ? 'text-amber-900 dark:text-amber-100' : '')}>{money(abroad)}</span>
          </div>
          <p className={cn('mt-0.5 text-[12.5px] leading-snug', over ? 'text-amber-800 dark:text-amber-200' : 'text-slate-400')}>
            {over
              ? `Cripto en exchanges extranjeros, por encima de ${money(ABROAD)}. ${december ? 'Este mes cierra el año: toca presentar el modelo 721 si sigues así el 31.' : 'Si el 31 de diciembre sigues por encima, toca presentarlo.'}`
              : `Cripto en exchanges extranjeros. Vas por ${money(abroad)} de ${money(ABROAD)}: por debajo no hay que presentar el modelo 721.`}
          </p>
        </div>
      )}
    </section>
  );
}
