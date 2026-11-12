import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { jelly, quickOut } from '@/lib/motion';
import { EntrySheet } from '@/components/EntrySheet';
import { Modal } from '@/components/Modal';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AccountRow, MovementRow, PlanBuy, PlanInvest, PlanInvestAsset, PlanRow } from '@/lib/types';

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
  buys?: { at: string; spentEur: number; quantity: number }[];
}

export type MomentLevel = 'good' | 'normal' | 'bad';

export type FactorEffect = 'for' | 'against' | 'neutral';

export interface MomentFactor {
  label: string;
  effect: FactorEffect;
}

export interface CoinMoment {
  asset: string;
  name: string;
  level: MomentLevel;
  reasons: string[];
  /** Todo lo que se ha mirado, a favor, en contra o sin peso. */
  factors: MomentFactor[];
  /** Precio por debajo del cual pasaría a buen momento, si no lo es ya. */
  goodBelow: number | null;
  /** Precio por encima del cual pasaría a mal momento. */
  badAbove: number | null;
  /** Precio por debajo del cual se juntan varias señales a favor: una compra muy buena. */
  greatBelow: number | null;
  price: number;
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
const GOOD_SCORE = 1.5;
const GREAT_SCORE = 3;
const BAD_SCORE = -0.5;

function levelOf(score: number): MomentLevel {
  return score >= GOOD_SCORE ? 'good' : score <= BAD_SCORE ? 'bad' : 'normal';
}

/** Puntúa un precio: zona de compra, frente a tu precio medio, desde la referencia y en el día. */
function scoreAt(price: number, input: { zone: number | null; average: number | null; ref: number | null; day: number | null; now: number; drop: number; rise: number }) {
  let score = 0;
  const factors: MomentFactor[] = [];
  if (input.zone != null) {
    const gap = (price / input.zone - 1) * 100;
    if (gap <= 0) {
      score += 2;
      factors.push({ effect: 'for', label: `Está en tu zona de compra (${wholeEur(input.zone)})` });
    } else if (gap <= 5) {
      score += 0.5;
      factors.push({ effect: 'for', label: `Cerca de tu zona de compra: le falta bajar un ${oneDecimal(gap)} %` });
    } else {
      factors.push({ effect: 'neutral', label: `Lejos de tu zona de compra (${wholeEur(input.zone)}): le falta bajar un ${oneDecimal(gap)} %` });
    }
  }
  if (input.average != null) {
    const gap = (price / input.average - 1) * 100;
    if (gap < -5) {
      score += 1;
      factors.push({ effect: 'for', label: `Más barato que lo que pagaste: un ${oneDecimal(gap)} % por debajo de tu precio medio` });
    } else if (gap > 5) {
      score -= 0.5;
      factors.push({ effect: 'against', label: `Más caro que lo que pagaste: un ${oneDecimal(gap)} % por encima de tu precio medio` });
    } else {
      factors.push({ effect: 'neutral', label: 'Parecido a lo que pagaste' });
    }
  }
  if (input.ref != null) {
    const change = (price / input.ref - 1) * 100;
    if (change <= -input.drop) {
      score += 1;
      factors.push({ effect: 'for', label: `Ha caído un ${oneDecimal(change)} % desde la referencia (${wholeEur(input.ref)})` });
    } else if (change <= -2) {
      score += 0.5;
      factors.push({ effect: 'for', label: `Ha bajado un ${oneDecimal(change)} % desde la referencia (${wholeEur(input.ref)})` });
    } else if (change >= input.rise) {
      score -= 1;
      factors.push({ effect: 'against', label: `Ha subido un ${oneDecimal(change)} % desde la referencia (${wholeEur(input.ref)})` });
    } else if (change >= 3) {
      score -= 0.5;
      factors.push({ effect: 'against', label: `Ha subido un ${oneDecimal(change)} % desde la referencia (${wholeEur(input.ref)})` });
    } else {
      factors.push({ effect: 'neutral', label: `Casi igual que la referencia (${wholeEur(input.ref)})` });
    }
  }
  if (input.day != null) {
    const day = ((1 + input.day / 100) * (price / input.now) - 1) * 100;
    if (day <= -3) {
      score += 0.5;
      factors.push({ effect: 'for', label: `Hoy cae un ${oneDecimal(day)} %` });
    } else if (day >= 4) {
      score -= 0.5;
      factors.push({ effect: 'against', label: `Hoy sube un ${oneDecimal(day)} %` });
    } else {
      factors.push({ effect: 'neutral', label: `Hoy ${day < 0 ? 'baja' : 'sube'} un ${oneDecimal(day)} %, un día tranquilo` });
    }
  }
  return { score, factors };
}

/** Primer precio, bajando o subiendo desde hoy, cuya puntuación cumple lo pedido. */
function priceWhere(start: number, step: number, reached: (score: number) => boolean, score: (price: number) => number): number | null {
  for (let i = 1; i <= 240; i += 1) {
    const price = start * (1 + step * i);
    if (reached(score(price))) return price;
  }
  return null;
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
    const input = {
      zone: row.zoneEur,
      average: row.average,
      ref: row.refEur,
      day: coinsOf(plan, row.asset, holdings).find((item) => item.change24hPct != null)?.change24hPct ?? null,
      now: price,
      drop,
      rise,
    };
    const { score, factors } = scoreAt(price, input);
    const level = levelOf(score);
    const at = (value: number) => scoreAt(value, input).score;
    const reasons = factors.filter((item) => item.effect !== 'neutral').map((item) => item.label.charAt(0).toLowerCase() + item.label.slice(1));
    const buy = sortBuys((plan.buys || []).filter((item) => item.asset === row.asset && buyLeft(item) > 0))[0];
    return [{
      asset: row.asset,
      name: row.name,
      level,
      reasons: reasons.length ? reasons : ['nada se sale de lo normal'],
      factors,
      goodBelow: level === 'good' ? null : priceWhere(price, -0.0025, (value) => value >= GOOD_SCORE, at),
      badAbove: level === 'bad' ? null : priceWhere(price, 0.0025, (value) => value <= BAD_SCORE, at),
      greatBelow: score >= GREAT_SCORE ? null : priceWhere(price, -0.0025, (value) => value >= GREAT_SCORE, at),
      price,
      buy,
    }];
  });
}

/** Piezas y cuentas para leer el plan de tandas desde tu cartera. */
/** Piezas, cuentas y compras que necesitan los planes por tandas, cargadas una vez para todos. */
export function usePlanCoins(plans: PlanRow[], books = 0) {
  const [holdings, setHoldings] = useState<CoinHolding[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const since = plans.map((plan) => plan.startDate.slice(0, 10)).sort()[0] || '';
  const reload = useCallback(async () => {
    if (!since) return;
    const [holdingData, accountData, movementData] = await Promise.all([
      api<{ holdings: CoinHolding[] }>('/api/holdings'),
      api<{ accounts: AccountRow[] }>('/api/accounts'),
      api<{ movements: MovementRow[] }>(`/api/movements?type=buy&from=${since}`),
    ]);
    setHoldings(holdingData.holdings);
    setAccounts(accountData.accounts);
    setMovements(movementData.movements);
  }, [since]);
  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload, books]);
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') reload().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [reload]);
  return { holdings, accounts, movements, reload };
}

interface PlanMove { id: string; asset: string; date: string; eur: number; quantity: number }

function localDay(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Compras de las monedas del plan en su cuenta desde que empezó, igual que las cuenta el servidor. */
function planMoves(plan: PlanRow, holdings: CoinHolding[], movements: MovementRow[]): PlanMove[] {
  const since = plan.startDate.slice(0, 10);
  const accountId = String(plan.linkedAccountIds?.[0] || '');
  const assetOf = new Map<string, string>();
  for (const asset of new Set((plan.buys || []).map((buy) => buy.asset))) {
    for (const holding of coinsOf(plan, asset, holdings)) assetOf.set(String(holding._id), asset);
  }
  const fromMoves = movements.flatMap((row) => {
    const asset = row.holdingId ? assetOf.get(String(row.holdingId)) : undefined;
    if (!asset || row.type !== 'buy' || String(row.accountId) !== accountId || row.date.slice(0, 10) < since) return [];
    const eur = row.currency === 'EUR' ? row.amount : row.eurPerUnit ? row.amount * row.eurPerUnit : null;
    if (!eur || !(eur > 0) || !(row.quantity && row.quantity > 0)) return [];
    return [{ id: row._id, asset, date: row.date.slice(0, 10), eur, quantity: row.quantity }];
  });
  const fromHoldings = holdings.flatMap((holding) => {
    const asset = assetOf.get(String(holding._id));
    if (!asset) return [];
    return (holding.buys || []).flatMap((buy) => {
      const day = localDay(buy.at);
      if (day < since || !(buy.spentEur > 0) || !(buy.quantity > 0)) return [];
      return [{ id: `h-${holding._id}-${new Date(buy.at).getTime()}`, asset, date: day, eur: buy.spentEur, quantity: buy.quantity }];
    });
  });
  return [...fromMoves, ...fromHoldings].sort((a, b) => a.date.localeCompare(b.date));
}

const DUE_WINDOW_DAYS = 2;
const FULL_SHARE = 0.95;

function dayNumber(day: string): number {
  const [year, month, date] = day.slice(0, 10).split('-').map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

/**
 * Reparte las compras entre las tandas con la misma regla que el servidor, para que el plan
 * se vea al día aunque el servidor todavía no lo haga.
 */
export function fillPlan(plan: PlanRow, holdings: CoinHolding[], movements: MovementRow[]): PlanRow {
  const buys = plan.buys || [];
  if (!buys.length || !holdings.length) return plan;
  const handMarked = (buy: PlanBuy) => buy.manual === true || (buy.done && !(buy.movementIds || []).length);
  const state = buys.map(() => ({ movementIds: [] as string[], spent: 0, quantity: 0, lastDay: '' }));
  const rank = (index: number, day: number): [number, number] => {
    const buy = buys[index];
    if (state[index].spent > 0) return [0, 0];
    if (handMarked(buy)) return [1, buy.doneAt ? Math.abs(dayNumber(buy.doneAt) - day) : 0];
    if (!buy.date) return [3, 0];
    const gap = dayNumber(buy.date) - day;
    return gap <= DUE_WINDOW_DAYS ? [2, Math.abs(gap)] : [4, gap];
  };
  for (const move of planMoves(plan, holdings, movements)) {
    const day = dayNumber(move.date);
    let left = move.eur;
    let last = -1;
    while (left > 0.005) {
      const pick = buys
        .map((buy, index) => ({ buy, index, cap: buy.amount - state[index].spent }))
        .filter((item) => item.buy.asset === move.asset && item.cap > 0.005)
        .sort((a, b) => {
          const ra = rank(a.index, day);
          const rb = rank(b.index, day);
          return ra[0] - rb[0] || ra[1] - rb[1];
        })[0];
      if (!pick) {
        if (last >= 0) {
          state[last].spent += left;
          state[last].quantity += move.quantity * (left / move.eur);
        }
        break;
      }
      const take = left - pick.cap <= move.eur * (1 - FULL_SHARE) ? left : pick.cap;
      const row = state[pick.index];
      row.spent += take;
      row.quantity += move.quantity * (take / move.eur);
      if (!row.movementIds.includes(move.id)) row.movementIds.push(move.id);
      if (move.date > row.lastDay) row.lastDay = move.date;
      left -= take;
      last = pick.index;
    }
  }
  return {
    ...plan,
    buys: buys.map((buy, index) => {
      const row = state[index];
      const filled = row.movementIds.length > 0;
      const hand = handMarked(buy);
      const spent = Math.round(row.spent * 100) / 100;
      const done = hand || (filled && spent >= buy.amount * FULL_SHARE);
      return {
        ...buy,
        movementIds: row.movementIds,
        spent,
        quantity: row.quantity,
        done,
        doneAt: filled && done ? row.lastDay : hand ? buy.doneAt : '',
        priceEur: row.quantity > 0 ? spent / row.quantity : hand ? buy.priceEur : null,
      };
    }),
  };
}

export interface PlanOutcome {
  invested: number;
  value: number;
  result: number;
  /** Lo que vale frente a lo metido: 110 es un 10 % por encima. */
  share: number;
}

/** Cómo va solo el dinero metido en las tandas del plan, al precio de hoy. */
export function planOutcome(plan: PlanRow, holdings: CoinHolding[]): PlanOutcome | null {
  let invested = 0;
  let value = 0;
  for (const buy of plan.buys || []) {
    const spent = (buy.spent || 0) > 0 ? (buy.spent as number) : buy.done ? buy.amount : 0;
    if (!(spent > 0)) continue;
    const quantity = (buy.quantity || 0) > 0 ? (buy.quantity as number) : buy.priceEur ? spent / buy.priceEur : 0;
    const price = coinsOf(plan, buy.asset, holdings).find((item) => item.unitMarketValue != null)?.unitMarketValue;
    if (!quantity || price == null) return null;
    invested += spent;
    value += quantity * price;
  }
  return { invested, value, result: value - invested, share: invested > 0 ? (value / invested) * 100 : 0 };
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

function daysUntil(day: string): string {
  const today = localDay(new Date().toISOString());
  const gap = Math.round(dayNumber(day) - dayNumber(today));
  if (gap < 0) return 'Pasada';
  if (gap === 0) return 'Hoy';
  if (gap === 1) return 'Mañana';
  return `En ${gap} días`;
}

/** Lo máximo que se mete en el plan: la suma de sus tandas. */
function planBudget(plan: PlanRow): number {
  return (plan.buys || []).reduce((sum, buy) => sum + buy.amount, 0);
}

function coinAmount(value: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: value >= 1 ? 4 : 5 }).format(value);
}

export function wholeEur(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: Math.abs(value) >= 100 || Math.abs(value) < 0.005 ? 0 : 2, useGrouping: 'always' as unknown as boolean }).format(value);
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

const COIN_LOOK: Record<string, { glyph: string; color: string }> = {
  bitcoin: { glyph: '₿', color: '#F7931A' },
  ethereum: { glyph: 'Ξ', color: '#627EEA' },
  solana: { glyph: 'S', color: '#9945FF' },
  ripple: { glyph: 'X', color: '#23292F' },
  binancecoin: { glyph: 'B', color: '#F3BA2F' },
  cardano: { glyph: 'A', color: '#0033AD' },
};

export function CoinMark({ asset, size = 36, done = false }: { asset: string; size?: number; done?: boolean }) {
  const look = COIN_LOOK[asset] || { glyph: (SYMBOL[asset] || asset).slice(0, 1).toUpperCase(), color: '#334155' };
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: look.color, fontSize: size * 0.48 }} aria-hidden>
      {look.glyph}
      {done && (
        <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#16c784] text-white ring-2 ring-white dark:ring-slate-900">
          <Check size={10} strokeWidth={3.5} />
        </span>
      )}
    </span>
  );
}

function shareOf(value: number, lo: number, hi: number): number {
  return hi > lo ? Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100)) : 50;
}

/** Dónde está el precio de hoy entre tu zona de compra y tu precio medio. */
function PriceTrack({ row }: { row: PlanInvestAsset }) {
  if (row.priceEur == null || row.zoneEur == null || row.average == null) return null;
  const lo = Math.min(row.zoneEur, row.priceEur) * 0.985;
  const hi = Math.max(row.average, row.priceEur) * 1.015;
  const zone = shareOf(row.zoneEur, lo, hi);
  const now = shareOf(row.priceEur, lo, hi);
  const avg = shareOf(row.average, lo, hi);
  const inZone = row.priceEur <= row.zoneEur;
  return (
    <div className="mt-4">
      <div className="relative h-1.5 rounded-full bg-slate-100 dark:bg-white/10">
        <span className="absolute inset-y-0 left-0 rounded-full bg-[#16c784]/25" style={{ width: `${zone}%` }} />
        <span className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400 dark:bg-white/50" style={{ left: `${avg}%` }} />
        <span
          className={cn('absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-white dark:ring-slate-900', inZone ? 'bg-[#16c784]' : 'bg-slate-900 dark:bg-white')}
          style={{ left: `${now}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium tabular-nums text-slate-400">
        <span>Zona de compra <span className="text-slate-600 dark:text-slate-300">{wholeEur(row.zoneEur)}</span></span>
        <span>Para no perder <span className="text-slate-600 dark:text-slate-300">{wholeEur(row.average)}</span></span>
      </div>
    </div>
  );
}

function useBeat(ms = 3200): number {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setBeat((value) => value + 1), ms);
    return () => window.clearInterval(timer);
  }, [ms]);
  return beat;
}

/** Pastilla que va enseñando por turnos el porcentaje, los euros y el precio a superar. */
function TurnPill({ frames, beat, up }: { frames: string[]; beat: number; up: boolean }) {
  const text = frames[beat % frames.length];
  const tone = up ? 'bg-[#16c784]/12 text-[#0f9f68] dark:text-[#3ee0a1]' : 'bg-[#ea3943]/10 text-[#d0303a] dark:text-[#ff6b73]';
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <span className={cn('inline-flex h-6 min-w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-full px-2.5 text-[12px] font-bold tabular-nums', tone)}>
      {still ? text : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={text}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: quickOut }}
            transition={jelly}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      )}
    </span>
  );
}

function signedEur(value: number): string {
  return `${value >= 0 ? '+' : '−'}${wholeEur(Math.abs(value))}`;
}

/** Dónde compensa comprar cada moneda, con la misma puntuación que el buen o mal momento. */
function BuyZones({ moment }: { moment: CoinMoment }) {
  const gap = (value: number) => `${value < moment.price ? '−' : '+'}${oneDecimal((value / moment.price - 1) * 100)} %`;
  const cells = [
    {
      label: 'Buena compra',
      value: moment.level === 'good' ? 'Ya lo es' : moment.goodBelow != null ? `< ${wholeEur(moment.goodBelow)}` : '—',
      note: moment.level !== 'good' && moment.goodBelow != null ? gap(moment.goodBelow) : moment.level === 'good' ? 'a este precio' : '',
      tone: 'text-[#0f9f68] dark:text-[#3ee0a1]',
    },
    {
      label: 'Muy buena',
      value: moment.greatBelow == null ? (moment.level === 'good' ? 'Ya lo es' : '—') : `< ${wholeEur(moment.greatBelow)}`,
      note: moment.greatBelow != null ? gap(moment.greatBelow) : '',
      tone: 'text-[#0f9f68] dark:text-[#3ee0a1]',
    },
    {
      label: 'Mejor esperar',
      value: moment.level === 'bad' ? 'Ahora' : moment.badAbove != null ? `> ${wholeEur(moment.badAbove)}` : '—',
      note: moment.level !== 'bad' && moment.badAbove != null ? gap(moment.badAbove) : '',
      tone: 'text-[#d0303a] dark:text-[#ff6b73]',
    },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-2xl bg-slate-50 px-2.5 py-2 dark:bg-white/5">
          <span className="block text-[10px] font-semibold text-slate-400">{cell.label}</span>
          <span className={cn('mt-0.5 block text-[13px] font-semibold tabular-nums tracking-tight', cell.tone)}>{cell.value}</span>
          {cell.note && <span className="block text-[10px] font-medium tabular-nums text-slate-400">{cell.note}</span>}
        </div>
      ))}
    </div>
  );
}

function AssetRow({ row, beat, moment }: { row: PlanInvestAsset; beat: number; moment?: CoinMoment }) {
  const price = row.priceEur;
  const value = price != null ? row.quantity * price : null;
  const result = value != null ? value - row.cost : null;
  const pct = value != null && row.cost > 0 ? (value / row.cost - 1) * 100 : null;
  const up = (result ?? 0) >= 0;
  const needPct = price != null && row.average != null && price < row.average ? (row.average / price - 1) * 100 : null;
  const zoneGap = price != null && row.zoneEur != null ? (price / row.zoneEur - 1) * 100 : null;
  const frames = pct != null && result != null
    ? [pctText(pct), signedEur(result), ...(needPct != null && row.average != null ? [`Meta ${wholeEur(row.average)}`] : [])]
    : [];
  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <CoinMark asset={row.asset} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold tracking-tight">{row.name}</span>
            <span className="text-[15px] font-semibold tabular-nums tracking-tight">{wholeEur(price)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-[12px] font-medium tabular-nums text-slate-400">
            <span className="truncate">
              {row.quantity > 0
                ? `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 }).format(row.quantity)} ${SYMBOL[row.asset] || ''} · ${wholeEur(value)}`
                : 'Sin monedas todavía'}
            </span>
            {frames.length > 0 && <TurnPill frames={frames} beat={beat} up={up} />}
          </div>
        </div>
      </div>

      {result != null && row.cost > 0 && (
        <p className="mt-3 text-[13px] font-medium leading-snug text-slate-500 dark:text-slate-400">
          {up ? (
            <>Vas <span className="font-semibold text-[#16c784]">ganando {wholeEur(result)}</span>: pagaste {wholeEur(row.cost)} y hoy valen {wholeEur(value)}.</>
          ) : (
            <>
              Vas <span className="font-semibold text-[#ea3943]">perdiendo {wholeEur(-result)}</span>.
              {needPct != null && row.average != null && (
                <> Para no perder, {row.name} tiene que subir un <span className="font-semibold text-slate-800 dark:text-slate-100">{oneDecimal(needPct)} %</span>, hasta {wholeEur(row.average)}.</>
              )}
            </>
          )}
        </p>
      )}

      <PriceTrack row={row} />
      {moment && <BuyZones moment={moment} />}

      {zoneGap != null && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', zoneGap <= 0 ? 'bg-[#16c784]/12 text-[#0f9f68] dark:text-[#3ee0a1]' : 'bg-slate-900/[0.05] text-slate-500 dark:bg-white/10 dark:text-slate-300')}>
            {zoneGap <= 0 ? 'En tu zona de compra' : `A un ${oneDecimal(zoneGap)} % de tu zona de compra`}
          </span>
          {row.changePct != null && Math.abs(row.changePct) >= 0.5 && (
            <span className="rounded-full bg-slate-900/[0.05] px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {row.changePct < 0 ? 'Baja' : 'Sube'} un {oneDecimal(row.changePct)} % desde la referencia
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Lo que tienen que hacer todas las monedas juntas para dejar de perder. */
function CoinsTotal({ rows, beat }: { rows: PlanInvestAsset[]; beat: number }) {
  if (rows.some((row) => row.priceEur == null) || rows.length < 2) return null;
  const value = rows.reduce((sum, row) => sum + row.quantity * (row.priceEur as number), 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  if (!(cost > 0)) return null;
  const result = value - cost;
  const up = result >= 0;
  const needPct = !up && value > 0 ? (cost / value - 1) * 100 : null;
  const frames = [pctText((value / cost - 1) * 100), signedEur(result), ...(needPct != null ? [`Meta ${wholeEur(cost)}`] : [])];
  return (
    <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold">En total</span>
        <TurnPill frames={frames} beat={beat} up={up} />
      </div>
      <p className="mt-1 text-[12px] font-medium leading-snug text-slate-500 dark:text-slate-400">
        Pagaste {wholeEur(cost)} y hoy valen {wholeEur(value)}.
        {needPct != null && <> Juntas tienen que subir un <span className="font-semibold text-slate-800 dark:text-slate-100">{oneDecimal(needPct)} %</span> para no perder.</>}
      </p>
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
  const symbol = SYMBOL[buy.asset] || assetLabel(buy.asset);
  const when = buy.date ? `el ${dayLabel(buy.date)}` : 'cuando salte un aviso';
  const others = (plan.buys || []).filter((item) => item._id !== buy._id);
  const budget = planBudget(plan);
  const othersLeft = others.reduce((sum, item) => sum + buyLeft(item), 0);
  const maxAmount = Math.max(0, budget - others.reduce((sum, item) => sum + item.amount, 0));
  const share = budget > 0 ? (buy.amount / budget) * 100 : 0;

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

  const action = 'flex w-full items-center gap-3 rounded-2xl bg-slate-50 px-3.5 py-3 text-left transition-colors active:bg-slate-100 disabled:opacity-45 dark:bg-white/5 dark:active:bg-white/10';

  return (
    <Modal title={`${wholeEur(buy.amount)} de ${assetLabel(buy.asset)}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <CoinMark asset={buy.asset} size={40} done={buy.done} />
          <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-slate-500 dark:text-slate-400">
            {buy.done
              ? `Hecha${buy.doneAt ? ` el ${dayLabel(buy.doneAt)}` : ''}${buy.priceEur ? ` a ${wholeEur(buy.priceEur)}` : ''}${linked ? ', con tus compras' : ', marcada a mano'}`
              : (buy.spent || 0) > 0
                ? `Llevas ${wholeEur(buy.spent || 0)} · faltan ${wholeEur(left)}, ${when}`
                : buy.date ? `Toca el ${dayLabel(buy.date)} · ${daysUntil(buy.date).toLowerCase()}` : 'Cuando salte un aviso'}
            <span className="mt-0.5 block text-[12px] text-slate-400">{oneDecimal(share)} % de los {wholeEur(budget)} del plan</span>
          </p>
        </div>

        {coins != null && price != null && (
          <div className="rounded-2xl bg-slate-50 px-4 py-3.5 dark:bg-white/5">
            <p className="text-[11px] font-semibold text-slate-400">Si la compras hoy</p>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Con {wholeEur(left)} compras</span>
              <span className="text-[15px] font-semibold tabular-nums tracking-tight">{coinAmount(coins)} {symbol}</span>
            </div>
            <p className="mt-0.5 text-right text-[11px] font-medium tabular-nums text-slate-400">a {wholeEur(price)} cada {symbol}</p>
            {row && (
              <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-slate-200/70 pt-2.5 dark:border-white/10">
                <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Después tendrás</span>
                <span className="text-right">
                  <span className="block text-[15px] font-semibold tabular-nums tracking-tight">{coinAmount(row.quantity + coins)} {symbol}</span>
                  <span className="block text-[11px] font-medium tabular-nums text-slate-400">ahora tienes {coinAmount(row.quantity)}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {moment && (
          <div className="rounded-2xl bg-slate-50 px-4 py-3.5 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold text-slate-400">¿Es buen momento?</span>
              <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-bold', MOMENT_TONE[moment.level])}>{MOMENT_LABEL[moment.level]}</span>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {moment.factors.map((factor) => (
                <li key={factor.label} className="flex items-start gap-2 text-[12px] font-medium leading-snug text-slate-600 dark:text-slate-300">
                  <span className={cn('mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[9px] font-black text-white', factor.effect === 'for' ? 'bg-[#16c784]' : factor.effect === 'against' ? 'bg-[#ea3943]' : 'bg-slate-300 dark:bg-white/25')}>
                    {factor.effect === 'for' ? '+' : factor.effect === 'against' ? '−' : '·'}
                  </span>
                  {factor.label}
                </li>
              ))}
            </ul>
            {(moment.goodBelow != null || moment.badAbove != null) && (
              <p className="mt-2.5 border-t border-slate-200/70 pt-2.5 text-[12px] font-medium leading-snug text-slate-500 dark:border-white/10 dark:text-slate-400">
                {moment.goodBelow != null && <>Pasa a <span className="font-semibold text-[#0f9f68] dark:text-[#3ee0a1]">buen momento</span> si baja de <span className="font-semibold text-slate-800 dark:text-slate-100">{wholeEur(moment.goodBelow)}</span>{price ? ` (un ${oneDecimal((moment.goodBelow / price - 1) * 100)} % menos)` : ''}. </>}
                {moment.badAbove != null && <>Pasa a <span className="font-semibold text-[#d0303a] dark:text-[#ff6b73]">mal momento</span> si sube de <span className="font-semibold text-slate-800 dark:text-slate-100">{wholeEur(moment.badAbove)}</span>.</>}
              </p>
            )}
          </div>
        )}

        {left > 0 && (
          <p className="text-[12px] font-medium leading-snug text-slate-400">
            Puedes meterla hoy u otro día, y más o menos de lo previsto, sin pasar de los <span className="font-semibold text-slate-600 dark:text-slate-300">{wholeEur(budget)}</span> del plan.
            {othersLeft > 0.5 ? ` Las otras tandas guardan ${wholeEur(othersLeft)}.` : ''}
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
                <span className="block text-[12px] font-medium text-slate-400">Se apunta con el importe y la cantidad ya puestos.</span>
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
              <Input label={`Importe (máximo ${wholeEur(maxAmount)})`} type="number" step="any" max={maxAmount} value={amount} onChange={(event) => setAmount(event.target.value)} />
              {Number(amount) > maxAmount + 0.005 && (
                <p className="text-[12px] font-medium leading-snug text-[#d0303a]">
                  Te pasas de los {wholeEur(budget)} del plan. Para meter más aquí, baja antes otra tanda.
                </p>
              )}
              <Input label="Fecha (vacía: cuando salte un aviso)" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              <button
                type="button"
                disabled={busy || !(Number(amount) > 0) || Number(amount) > maxAmount + 0.005}
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

export function InvestPlan({ plan, invest, serverReady, coins, focus, showCoins = true, onChanged }: {
  plan: PlanRow;
  invest?: PlanInvest;
  serverReady: boolean;
  coins: Coins;
  /** Tanda que se abre al tocar una etiqueta de arriba. */
  focus?: { id: string; at: number } | null;
  /** Tus monedas se despliega al tocar la cabecera del plan. */
  showCoins?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState<PlanBuy | null>(null);
  const moments = coinMoments(plan, invest, coins.holdings);
  useEffect(() => {
    if (!focus) return;
    const found = (plan.buys || []).find((buy) => buy._id === focus.id);
    if (found) setOpen(found);
  }, [focus?.at]);
  const [buying, setBuying] = useState<PlanBuy | null>(null);
  const beat = useBeat();
  const buys = sortBuys(plan.buys || []);
  const watch = plan.watch;
  const waiting = buys.reduce((sum, buy) => sum + buyLeft(buy), 0);
  const rowOf = (asset: string) => invest?.assets.find((row) => row.asset === asset);
  const accountId = String(plan.linkedAccountIds?.[0] || '');
  const refresh = async () => {
    await Promise.all([onChanged(), coins.reload().catch(() => undefined)]);
  };
  const buyingRow = buying ? rowOf(buying.asset) : undefined;
  const buyingLeft = buying ? buyLeft(buying) : 0;
  const buyingPiece = buying ? coinsOf(plan, buying.asset, coins.holdings)[0] : undefined;

  const total = buys.reduce((sum, buy) => sum + buy.amount, 0);
  const card = 'rounded-[28px] bg-white p-5 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10';

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {showCoins && invest && invest.assets.length > 0 && (
          <motion.div
            key="coins"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <article className={card}>
              <h3 className="mb-4 text-[13px] font-semibold text-slate-400">Tus monedas</h3>
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {invest.assets.map((row) => <AssetRow key={row.asset} row={row} beat={beat} moment={moments.find((item) => item.asset === row.asset)} />)}
              </div>
              <CoinsTotal rows={invest.assets} beat={beat} />
              {invest.ratio != null && watch?.ratioAbove != null && (
                <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-slate-100 pt-3 text-[12px] font-medium tabular-nums text-slate-400 dark:border-white/10">
                  <span>ETH/BTC <span className="text-slate-600 dark:text-slate-300">{ratioText(invest.ratio)}</span></span>
                  <span className={invest.ratio >= watch.ratioAbove ? 'text-[#16c784]' : ''}>Aviso de giro en {ratioText(watch.ratioAbove)}</span>
                </div>
              )}
            </article>
          </motion.div>
        )}
      </AnimatePresence>

      <article className={card}>
        <h3 className="text-[13px] font-semibold text-slate-400">{waiting > 0 ? 'Por meter' : 'Tandas'}</h3>
        <p className="mt-1.5 text-[1.65rem] font-semibold leading-none tabular-nums tracking-tight">
          {waiting > 0 ? wholeEur(waiting) : 'Todo dentro'}
        </p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
          <div className="h-full rounded-full bg-[#16c784] transition-[width] duration-700 ease-out" style={{ width: `${total > 0 ? ((total - waiting) / total) * 100 : 0}%` }} />
        </div>
        <p className="mt-2 text-[12px] font-medium tabular-nums text-slate-400">
          {wholeEur(total - waiting)} de {wholeEur(total)} · se descuenta solo al apuntar una compra o subir una foto
        </p>

        <div className="mt-4 space-y-1">
          {buys.map((buy) => {
            const got = buy.done ? buy.amount : Math.min(buy.amount, buy.spent || 0);
            return (
              <button
                key={buy._id || `${buy.asset}-${buy.date}-${buy.amount}`}
                type="button"
                onClick={() => setOpen(buy)}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors active:bg-slate-50 dark:active:bg-white/5"
              >
                <CoinMark asset={buy.asset} size={32} done={buy.done} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn('text-[15px] font-semibold tabular-nums tracking-tight', buy.done && 'text-slate-400')}>{wholeEur(buy.amount)}</span>
                    <span className={cn('shrink-0 text-[12px] font-semibold tabular-nums', buy.done ? 'text-[#16c784]' : got > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400')}>
                      {buy.done ? 'Hecha' : got > 0 ? `Faltan ${wholeEur(buy.amount - got)}` : 'Pendiente'}
                    </span>
                  </span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <span className="block h-full rounded-full bg-[#16c784] transition-[width] duration-700 ease-out" style={{ width: `${buy.amount > 0 ? (got / buy.amount) * 100 : 0}%` }} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </article>

      {open && (
        <TandaSheet
          plan={plan}
          buy={open}
          row={rowOf(open.asset)}
          moment={moments.find((item) => item.asset === open.asset)}
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
    </div>
  );
}
