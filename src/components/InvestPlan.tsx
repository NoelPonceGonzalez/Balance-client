import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { EntrySheet } from '@/components/EntrySheet';
import { Modal } from '@/components/Modal';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { formatEur, formatSignedEur as formatSigned } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AccountRow, PlanBuy, PlanInvest, PlanInvestAsset, PlanRow } from '@/lib/types';

export const INVEST_ASSETS: { id: string; name: string }[] = [
  { id: 'bitcoin', name: 'Bitcoin' },
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'solana', name: 'Solana' },
  { id: 'ripple', name: 'XRP' },
  { id: 'binancecoin', name: 'BNB' },
  { id: 'cardano', name: 'Cardano' },
];

const SYMBOL: Record<string, string> = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', ripple: 'XRP', binancecoin: 'BNB', cardano: 'ADA' };

export function assetLabel(id: string): string {
  return INVEST_ASSETS.find((item) => item.id === id)?.name || id;
}

export interface CoinHolding {
  _id: string;
  accountId: string;
  name: string;
  symbol: string;
  assetClass: string;
  quantity: number;
  unitMarketValue: number | null;
  costBasis: number | null;
  quoteId?: string | null;
  change24hPct?: number | null;
}

export type MomentLevel = 'good' | 'normal' | 'bad';

export interface CoinMoment {
  asset: string;
  name: string;
  level: MomentLevel;
  reasons: string[];
  /** Próxima tanda pendiente de esa moneda. */
  buy?: PlanBuy;
}

export const MOMENT_LABEL: Record<MomentLevel, string> = { good: 'Buen momento', normal: 'Normal', bad: 'Mal momento' };

function oneDecimal(value: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Math.abs(value));
}

/**
 * Lee si es buen momento para comprar cada moneda del plan: zona de compra, precio frente a tu media,
 * movimiento desde la referencia y movimiento del día.
 */
export function coinMoments(plan: PlanRow, invest: PlanInvest | undefined, holdings: CoinHolding[]): CoinMoment[] {
  if (!invest) return [];
  const drop = plan.watch?.dropPct || 5;
  const rise = plan.watch?.risePct || 8;
  return invest.assets.flatMap((row) => {
    if (row.priceEur == null) return [];
    const price = row.priceEur;
    let score = 0;
    const reasons: string[] = [];
    if (row.zoneEur != null) {
      if (price <= row.zoneEur) {
        score += 2;
        reasons.push(`en tu zona de compra (${wholeEur(row.zoneEur)})`);
      } else if ((price / row.zoneEur - 1) * 100 <= 5) {
        score += 0.5;
        reasons.push(`a un ${oneDecimal((price / row.zoneEur - 1) * 100)} % de tu zona`);
      }
    }
    if (row.average != null && price < row.average * 0.95) {
      score += 1;
      reasons.push(`un ${oneDecimal((1 - price / row.average) * 100)} % bajo tu media, comprar baja tu media`);
    } else if (row.average != null && price > row.average * 1.05) {
      score -= 0.5;
      reasons.push(`un ${oneDecimal((price / row.average - 1) * 100)} % sobre tu media`);
    }
    if (row.changePct != null) {
      if (row.changePct <= -drop) {
        score += 1;
        reasons.push(`baja un ${oneDecimal(row.changePct)} % desde tu referencia`);
      } else if (row.changePct <= -2) {
        score += 0.5;
        reasons.push(`baja un ${oneDecimal(row.changePct)} % desde tu referencia`);
      } else if (row.changePct >= rise) {
        score -= 1;
        reasons.push(`sube un ${oneDecimal(row.changePct)} % desde tu referencia`);
      } else if (row.changePct >= 3) {
        score -= 0.5;
        reasons.push(`sube un ${oneDecimal(row.changePct)} % desde tu referencia`);
      }
    }
    const day = coinsOf(plan, row.asset, holdings).find((item) => item.change24hPct != null)?.change24hPct;
    if (day != null && day <= -3) {
      score += 0.5;
      reasons.push(`hoy baja un ${oneDecimal(day)} %`);
    } else if (day != null && day >= 4) {
      score -= 0.5;
      reasons.push(`hoy sube un ${oneDecimal(day)} %`);
    }
    if (!reasons.length) reasons.push('precio cerca de tu referencia');
    const buy = sortBuys((plan.buys || []).filter((item) => item.asset === row.asset && buyLeft(item) > 0))[0];
    return [{ asset: row.asset, name: row.name, level: score >= 1.5 ? 'good' : score <= -0.5 ? 'bad' : 'normal', reasons, buy }];
  });
}

/** Piezas y cuentas para leer el plan de tandas desde tu cartera. */
export function usePlanCoins(plan: PlanRow | null | undefined) {
  const [holdings, setHoldings] = useState<CoinHolding[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const planId = plan?._id || '';
  const reload = useCallback(async () => {
    if (!planId) return;
    const [holdingData, accountData] = await Promise.all([
      api<{ holdings: CoinHolding[] }>('/api/holdings'),
      api<{ accounts: AccountRow[] }>('/api/accounts'),
    ]);
    setHoldings(holdingData.holdings);
    setAccounts(accountData.accounts);
  }, [planId]);
  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);
  return { holdings, accounts, reload };
}

function coinsOf(plan: PlanRow, asset: string, holdings: CoinHolding[]): CoinHolding[] {
  const accountId = String(plan.linkedAccountIds?.[0] || '');
  return holdings.filter((item) => String(item.accountId) === accountId && item.assetClass === 'crypto' && (item.quoteId === asset || item.symbol.trim().toUpperCase() === SYMBOL[asset]));
}

/** Lo mismo que calcula el servidor, sacado de tus piezas: cantidad, coste, precio y media de cada moneda del plan. */
export function localInvest(plan: PlanRow, holdings: CoinHolding[]): PlanInvest | undefined {
  if (!holdings.length) return undefined;
  const assets = [...new Set((plan.buys || []).map((buy) => buy.asset))];
  const rows: PlanInvestAsset[] = assets.map((asset) => {
    const mine = coinsOf(plan, asset, holdings);
    const quantity = mine.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const cost = mine.reduce((sum, item) => sum + (item.costBasis || 0), 0);
    const priceEur = mine.find((item) => item.unitMarketValue != null)?.unitMarketValue ?? null;
    const pending = (plan.buys || []).filter((buy) => buy.asset === asset).reduce((sum, buy) => sum + buyLeft(buy), 0);
    const refEur = plan.watch?.refs.find((ref) => ref.asset === asset)?.priceEur ?? null;
    return {
      asset,
      name: assetLabel(asset),
      priceEur,
      quantity,
      cost,
      average: quantity > 0 ? cost / quantity : null,
      pending,
      averageAfter: priceEur && quantity + pending / priceEur > 0 ? (cost + pending) / (quantity + pending / priceEur) : null,
      refEur,
      changePct: refEur && priceEur ? (priceEur / refEur - 1) * 100 : null,
      zoneEur: plan.watch?.zones.find((zone) => zone.asset === asset)?.belowEur ?? null,
    };
  });
  const btc = rows.find((row) => row.asset === 'bitcoin')?.priceEur;
  const eth = rows.find((row) => row.asset === 'ethereum')?.priceEur;
  return { assets: rows, ratio: btc && eth ? eth / btc : null };
}

/** Lo que valen hoy las monedas del plan frente a lo que has metido, sin contar las tandas pendientes. */
export function investResult(invest: PlanInvest | undefined): { value: number; cost: number; result: number; pct: number } | null {
  if (!invest?.assets.length || invest.assets.some((row) => row.priceEur == null)) return null;
  const value = invest.assets.reduce((sum, row) => sum + row.quantity * (row.priceEur as number), 0);
  const cost = invest.assets.reduce((sum, row) => sum + row.cost, 0);
  return { value, cost, result: value - cost, pct: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function dayLabel(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] || ''}`.trim();
}

function wholeEur(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: value >= 100 ? 0 : 2, useGrouping: 'always' as unknown as boolean }).format(value);
}

function pctText(value: number): string {
  const text = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Math.abs(value));
  return `${value >= 0 ? '+' : '−'}${text} %`;
}

function ratioText(value: number): string {
  return value.toFixed(4).replace('.', ',');
}

export function buyLeft(buy: PlanBuy): number {
  return buy.done ? 0 : Math.max(0, buy.amount - (buy.spent || 0));
}

function fromMoves(buy: PlanBuy): boolean {
  return (buy.movementIds?.length || 0) > 0;
}

function sortBuys(buys: PlanBuy[]): PlanBuy[] {
  return [...buys].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.asset.localeCompare(b.asset);
  });
}

function AssetRow({ row }: { row: PlanInvestAsset }) {
  const moved = row.changePct;
  const inZone = row.zoneEur != null && row.priceEur != null && row.priceEur <= row.zoneEur;
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{row.name}</span>
        <span className="text-sm font-semibold tabular-nums">{wholeEur(row.priceEur)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-[12px] font-medium text-slate-400">
        <span>
          {row.average != null ? `Tu media ${wholeEur(row.average)}` : 'Sin compras todavía'}
          {row.pending > 0 && row.averageAfter != null && <> · con lo que falta {wholeEur(row.averageAfter)}</>}
        </span>
        {moved != null && (
          <span className={cn('shrink-0 tabular-nums', moved >= 0 ? 'text-[#16c784]' : 'text-[#ea3943]')}>{pctText(moved)} desde la referencia</span>
        )}
      </div>
      {row.quantity > 0 && row.priceEur != null && (
        <p className="mt-1 text-[12px] font-medium text-slate-400">
          Tienes {new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(row.quantity)} {SYMBOL[row.asset] || ''} · valen {formatEur(row.quantity * row.priceEur)} · has metido {formatEur(row.cost)}{' '}
          <span className={row.quantity * row.priceEur >= row.cost ? 'text-[#16c784]' : 'text-[#ea3943]'}>
            {formatSigned(row.quantity * row.priceEur - row.cost)} ({pctText(row.cost > 0 ? ((row.quantity * row.priceEur) / row.cost - 1) * 100 : 0)})
          </span>
        </p>
      )}
      {(row.refEur != null || row.zoneEur != null) && (
        <p className="mt-1 text-[12px] font-medium text-slate-400">
          {row.refEur != null && <>Referencia {wholeEur(row.refEur)}</>}
          {row.refEur != null && row.zoneEur != null && ' · '}
          {row.zoneEur != null && (inZone
            ? <span className="text-slate-700 dark:text-slate-200">En tu zona de compra</span>
            : <>Zona de compra {wholeEur(row.zoneEur)}{row.priceEur ? `, a un ${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format((1 - row.zoneEur / row.priceEur) * 100)} %` : ''}</>)}
        </p>
      )}
    </div>
  );
}

type Coins = ReturnType<typeof usePlanCoins>;

export const MOMENT_TONE: Record<MomentLevel, string> = {
  good: 'bg-[#16c784]/12 text-[#0f9f68] dark:text-[#3ee0a1]',
  normal: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200',
  bad: 'bg-[#ea3943]/10 text-[#d0303a] dark:text-[#ff6b73]',
};

function TandaSheet({ plan, buy, row, moment, serverReady, onClose, onBought, onChanged }: {
  plan: PlanRow;
  buy: PlanBuy;
  row?: PlanInvestAsset;
  moment?: CoinMoment;
  serverReady: boolean;
  onClose: () => void;
  onBought: () => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(buy.amount));
  const [date, setDate] = useState(buy.date || '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const linked = fromMoves(buy);
  const left = buyLeft(buy);
  const price = row?.priceEur ?? null;
  const coins = price && left > 0 ? left / price : null;
  const after = row && price && left > 0 ? (row.cost + left) / (row.quantity + left / price) : null;
  const symbol = SYMBOL[buy.asset] || assetLabel(buy.asset);
  const when = buy.date ? `el ${dayLabel(buy.date)}` : 'cuando salte un aviso';

  const run = async (path: string, init: RequestInit) => {
    setBusy(true);
    setError('');
    try {
      await api(path, init);
      await onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    } finally {
      setBusy(false);
    }
  };

  const action = 'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ring-1 ring-slate-200 disabled:opacity-50 dark:ring-white/10';

  return (
    <Modal title={`${formatEur(buy.amount)} de ${assetLabel(buy.asset)}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[13px] font-medium leading-snug text-slate-500 dark:text-slate-400">
          {buy.done
            ? `Hecha${buy.doneAt ? ` el ${dayLabel(buy.doneAt)}` : ''}${buy.priceEur ? ` a ${wholeEur(buy.priceEur)}` : ''}${linked ? ', con tus compras apuntadas' : ', marcada a mano'}.`
            : (buy.spent || 0) > 0
              ? `Llevas ${formatEur(buy.spent || 0)} y faltan ${formatEur(left)}, ${when}.`
              : `Toca ${when}.`}
          {coins != null && <> Al precio de ahora ({wholeEur(price)}) son {new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(coins)} {symbol}.</>}
          {after != null && row?.average != null && <> Tu media pasaría de {wholeEur(row.average)} a {wholeEur(after)}.</>}
        </p>
        {moment && (
          <p className={cn('rounded-2xl px-3 py-2.5 text-[13px] font-medium leading-snug', MOMENT_TONE[moment.level])}>
            {MOMENT_LABEL[moment.level]}: {moment.reasons.join(', ')}.
          </p>
        )}
        {left > 0 && (
          <p className="text-[12px] font-medium leading-snug text-slate-400">
            Puedes meter hoy, otro día, más o menos de lo previsto: lo que apuntes cuenta para la tanda y el resto queda pendiente.
          </p>
        )}

        {!serverReady && (
          <p className="rounded-2xl bg-amber-50 px-3 py-2.5 text-[13px] font-medium leading-snug text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Apuntar la compra funciona ya. Marcar, cambiar y quitar tandas se activan al actualizar el servidor.
          </p>
        )}

        <div className="space-y-2">
          {left > 0 && (
            <button type="button" className={action} onClick={onBought}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">La he comprado</span>
                <span className="block text-[12px] font-medium text-slate-400">Apunta la compra en Movimientos con el importe y la cantidad ya puestos. Tu cartera y la tanda se actualizan con ella.</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-slate-400" />
            </button>
          )}

          {!linked && (
            <button
              type="button"
              className={action}
              disabled={!serverReady || busy || !buy._id}
              onClick={() => void run(`/api/plans/${plan._id}/compra`, { method: 'POST', body: JSON.stringify({ buyId: buy._id, done: !buy.done }) })}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{buy.done ? 'Volver a dejarla pendiente' : 'Darla por hecha sin apuntar'}</span>
                <span className="block text-[12px] font-medium text-slate-400">{buy.done ? 'La tanda vuelve a esperar su fecha o su aviso.' : 'Marca la tanda con el precio de ahora, sin crear ningún movimiento.'}</span>
              </span>
            </button>
          )}

          {!buy.done && (
            <button type="button" className={action} disabled={!serverReady || busy || !buy._id} onClick={() => setEditing((value) => !value)}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Cambiar importe o fecha</span>
                <span className="block text-[12px] font-medium text-slate-400">Para retrasarla, adelantarla o meter más o menos.</span>
              </span>
            </button>
          )}
          {editing && (
            <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
              <Input label="Importe" type="number" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
              <Input label="Fecha (vacía: cuando salte un aviso)" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              <button
                type="button"
                disabled={busy || !(Number(amount) > 0)}
                onClick={() => void run(`/api/plans/${plan._id}/tanda/${buy._id}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(amount), date }) })}
                className="rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
              >
                Guardar tanda
              </button>
            </div>
          )}

          {!linked && (
            <button
              type="button"
              className={cn(action, 'text-[#ea3943]')}
              disabled={!serverReady || busy || !buy._id}
              onClick={() => { if (confirmRemove) void run(`/api/plans/${plan._id}/tanda/${buy._id}`, { method: 'DELETE' }); else setConfirmRemove(true); }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{confirmRemove ? 'Pulsa otra vez para quitarla' : 'No la voy a hacer'}</span>
                <span className="block text-[12px] font-medium text-slate-400">Quita la tanda del plan y deja de avisarte por ella.</span>
              </span>
            </button>
          )}
        </div>

        {linked && (
          <p className="text-[12px] font-medium leading-snug text-slate-400">Esta tanda lleva compras tuyas. Si cambias o borras esas compras en Movimientos, la tanda se ajusta sola.</p>
        )}
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
      </div>
    </Modal>
  );
}

export function InvestPlan({ plan, invest, serverReady, coins, focus, onChanged }: {
  plan: PlanRow;
  invest?: PlanInvest;
  serverReady: boolean;
  coins: Coins;
  /** Tanda que se abre al tocar una etiqueta de arriba. */
  focus?: { id: string; at: number } | null;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState<PlanBuy | null>(null);
  useEffect(() => {
    if (!focus) return;
    const found = (plan.buys || []).find((buy) => buy._id === focus.id);
    if (found) setOpen(found);
  }, [focus?.at]);
  const [buying, setBuying] = useState<PlanBuy | null>(null);
  const buys = sortBuys(plan.buys || []);
  const watch = plan.watch;
  const waiting = buys.reduce((sum, buy) => sum + buyLeft(buy), 0);
  const spent = buys.reduce((sum, buy) => sum + (fromMoves(buy) ? buy.spent || 0 : buy.done ? buy.amount : 0), 0);
  const rowOf = (asset: string) => invest?.assets.find((row) => row.asset === asset);
  const accountId = String(plan.linkedAccountIds?.[0] || '');
  const refresh = async () => {
    await Promise.all([onChanged(), coins.reload().catch(() => undefined)]);
  };
  const buyingRow = buying ? rowOf(buying.asset) : undefined;
  const buyingLeft = buying ? buyLeft(buying) : 0;
  const buyingPiece = buying ? coinsOf(plan, buying.asset, coins.holdings)[0] : undefined;

  const zones = (watch?.zones || []).map((zone) => `${assetLabel(zone.asset)} baja de ${wholeEur(zone.belowEur)}`);
  const rules = [
    watch?.dropPct ? `baja un ${watch.dropPct} %` : '',
    watch?.risePct ? `sube un ${watch.risePct} %` : '',
  ].filter(Boolean);

  return (
    <article className="rounded-[28px] bg-white p-4 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10 sm:p-5">
      <h3 className="text-base font-semibold tracking-tight">Compras por tandas</h3>
      <p className="mt-1 text-[13px] font-medium text-slate-400">
        {waiting > 0 ? `Quedan ${formatEur(waiting)} por meter` : 'Todas las tandas hechas'}
        {spent > 0 && ` · ${formatEur(spent)} ya dentro`}
      </p>

      {invest && invest.assets.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 dark:divide-white/10">
          {invest.assets.map((row) => <AssetRow key={row.asset} row={row} />)}
          {invest.ratio != null && watch?.ratioAbove != null && (
            <div className="flex items-baseline justify-between gap-3 py-3 text-[12px] font-medium text-slate-400">
              <span>ETH/BTC {ratioText(invest.ratio)}</span>
              <span className={invest.ratio >= watch.ratioAbove ? 'text-[#16c784]' : ''}>Giro en {ratioText(watch.ratioAbove)}</span>
            </div>
          )}
        </div>
      )}

      <h4 className="mt-5 px-1 text-sm font-semibold">Tandas</h4>
      <div className="mt-2 divide-y divide-slate-100 dark:divide-white/10">
        {buys.map((buy) => {
          const linked = fromMoves(buy);
          const partial = !buy.done && (buy.spent || 0) > 0;
          const when = buy.date ? `el ${dayLabel(buy.date)}` : 'cuando salte un aviso';
          return (
            <button
              key={buy._id || `${buy.asset}-${buy.date}-${buy.amount}`}
              type="button"
              onClick={() => setOpen(buy)}
              className="flex w-full items-center gap-3 px-1 py-3 text-left"
            >
              <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border', buy.done ? 'border-[#16c784] bg-[#16c784] text-white' : partial ? 'border-[#16c784] text-[#16c784]' : 'border-slate-300 dark:border-white/25')}>
                {buy.done && <Check size={14} strokeWidth={3} />}
                {partial && <span className="h-2.5 w-2.5 rounded-full bg-current" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm font-semibold', buy.done && 'text-slate-400')}>{formatEur(buy.amount)} de {assetLabel(buy.asset)}</span>
                <span className="mt-0.5 block text-[12px] font-medium text-slate-400">
                  {buy.done
                    ? `Hecha${buy.doneAt ? ` el ${dayLabel(buy.doneAt)}` : ''}${buy.priceEur ? ` a ${wholeEur(buy.priceEur)}` : ''}${linked ? ' · desde tus compras' : ''}`
                    : partial
                      ? `Llevas ${formatEur(buy.spent || 0)}, faltan ${formatEur(buyLeft(buy))} ${when}`
                      : buy.date ? `El ${dayLabel(buy.date)}` : 'Cuando salte un aviso'}
                </span>
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-slate-400">{buy.done ? 'Ver' : 'Decidir'}</span>
            </button>
          );
        })}
      </div>

      {(rules.length > 0 || zones.length > 0 || watch?.ratioAbove != null) && (
        <p className="mt-4 rounded-2xl bg-slate-50 px-3 py-2.5 text-[13px] font-medium leading-snug text-slate-500 dark:bg-white/5 dark:text-slate-300">
          Te aviso el día antes y el día de cada tanda
          {rules.length > 0 && `, si una moneda ${rules.join(' o ')} desde su referencia`}
          {zones.length > 0 && `, si ${zones.join(' o ')}`}
          {watch?.ratioAbove != null && `, y si ETH/BTC pasa de ${ratioText(watch.ratioAbove)}`}.
          {' '}Toca una tanda para decidir: apuntar la compra, darla por hecha, cambiarla o quitarla. Al apuntar la compra, la tanda se marca sola con tu precio real.
        </p>
      )}

      {open && (
        <TandaSheet
          plan={plan}
          buy={open}
          row={rowOf(open.asset)}
          moment={coinMoments(plan, invest, coins.holdings).find((item) => item.asset === open.asset)}
          serverReady={serverReady}
          onClose={() => setOpen(null)}
          onBought={() => { setBuying(open); setOpen(null); }}
          onChanged={refresh}
        />
      )}
      {buying && (
        <EntrySheet
          accounts={coins.accounts.filter((account) => !account.archived).map((account) => ({ id: String(account._id), name: account.name, kind: account.kind, tracking: account.tracking, currency: account.currency, balance: account.balance }))}
          pieces={coins.holdings.map((item) => ({ id: String(item._id), accountId: String(item.accountId), name: item.name }))}
          accountId={accountId}
          verb="buy"
          allowed={['buy']}
          initial={{
            amount: buyingLeft.toFixed(2),
            date: new Date().toISOString().slice(0, 10),
            description: `Tanda de ${plan.name}`,
            category: 'Inversión',
            fee: '',
            counterAccountId: '',
            holdingId: buyingPiece ? String(buyingPiece._id) : '',
            otherHoldingId: '',
            quantity: buyingRow?.priceEur ? (buyingLeft / buyingRow.priceEur).toFixed(8) : '',
            otherQuantity: '',
          }}
          onClose={() => setBuying(null)}
          onSaved={refresh}
        />
      )}
    </article>
  );
}
