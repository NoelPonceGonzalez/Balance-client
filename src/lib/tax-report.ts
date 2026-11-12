import type { AccountRow, HoldingRow, MovementRow } from './types';
import { TYPE_LABEL } from './labels';
import { createPricer, type Pricer } from './tax-prices';

export interface TaxHolding extends HoldingRow {
  buys?: { at: string; spentEur: number; quantity: number }[];
}

export type IncomeKind = 'Intereses' | 'Staking' | 'Dividendos' | 'Recompensas';

export interface Disposal {
  date: string;
  time: string;
  asset: string;
  name: string;
  crypto: boolean;
  kind: 'Venta' | 'Permuta' | 'Comisión';
  quantity: number;
  proceeds: number;
  cost: number;
  gain: number;
  firstBuy: string;
  lastBuy: string;
  /** Unidades vendidas sin una compra apuntada antes. */
  uncovered: number;
  received: string;
  platform: string;
  priced: boolean;
}

export interface Income {
  month: string;
  kind: IncomeKind;
  asset: string;
  quantity: number;
  count: number;
  eur: number;
  platform: string;
  priced: boolean;
}

export interface Acquisition {
  date: string;
  time: string;
  asset: string;
  name: string;
  quantity: number;
  cost: number;
  origin: string;
  platform: string;
  priced: boolean;
}

/** Cambio entre dos formas del mismo activo (ETH en staking como WBETH, BTC envuelto…). */
export interface Rewrap {
  date: string;
  time: string;
  from: string;
  fromQuantity: number;
  to: string;
  toQuantity: number;
  /** Coste de adquisición que pasa intacto a lo recibido. */
  cost: number;
  platform: string;
}

export interface LedgerLine {
  date: string;
  time: string;
  platform: string;
  operation: string;
  concept: string;
  category: string;
  asset: string;
  quantity: number;
  unitEur: number | null;
  eur: number | null;
  effect: string;
}

export interface TaxReport {
  year: number;
  disposals: Disposal[];
  incomes: Income[];
  acquisitions: Acquisition[];
  rewraps: Rewrap[];
  lines: LedgerLine[];
  warnings: string[];
}

export interface TaxInput {
  movements: MovementRow[];
  accounts: AccountRow[];
  holdings: TaxHolding[];
}

type LegKind = 'in' | 'out' | 'fee' | 'eurIn' | 'eurOut';

interface Leg {
  row: MovementRow;
  kind: LegKind;
  asset: string;
  name: string;
  units: number;
  /** Euros conocidos por el propio apunte. */
  eur: number | null;
  crypto: boolean;
}

interface Trade {
  date: string;
  time: string;
  platform: string;
  legs: Leg[];
}

interface Reward {
  row: MovementRow;
  date: string;
  time: string;
  platform: string;
  asset: string;
  units: number;
  eur: number | null;
  kind: IncomeKind;
  crypto: boolean;
}

interface Lot {
  date: string;
  quantity: number;
  unitCost: number;
}

type Event =
  | { at: string; trade: Trade }
  | { at: string; reward: Reward }
  | { at: string; buy: { date: string; time: string; asset: string; name: string; quantity: number; cost: number; platform: string } };

const DUST = 1e-10;
/** Binance apunta los euros de una compra uno o dos segundos después de la moneda. */
const CASH_GAP_SECONDS = 10;
/** Las dos mitades de una conversión pueden llevar segundos distintos. */
const SPLIT_GAP_SECONDS = 2;
const CASH_TYPES = new Set(['adjustment', 'sell', 'buy', 'fee']);
const MOVE_TYPES = new Set(['transfer', 'deposit', 'withdrawal']);

export const EFFECT = {
  sale: 'Transmisión · tributa',
  buy: 'Adquisición',
  income: 'Rendimiento · tributa',
  fee: 'Comisión · tributa',
  cash: 'Euros de una operación',
  own: 'Traspaso entre cuentas propias',
  euros: 'Movimiento en euros',
  rewrap: 'Mismo activo en otro formato · no tributa',
};

/** Tokens de staking o envueltos que representan la misma moneda de base. */
const SAME_AS: Record<string, string> = {
  WBETH: 'ETH', BETH: 'ETH', WETH: 'ETH', STETH: 'ETH', WSTETH: 'ETH', CBETH: 'ETH', RETH: 'ETH',
  WBTC: 'BTC', BTCB: 'BTC', CBBTC: 'BTC',
  BNSOL: 'SOL', JITOSOL: 'SOL', MSOL: 'SOL', JUPSOL: 'SOL',
  WBNB: 'BNB',
};

export function baseAsset(asset: string): string {
  const code = asset.toUpperCase();
  return SAME_AS[code] ?? code;
}

function clockOf(row: MovementRow): string {
  return (row.description.match(/(\d{2}:\d{2}:\d{2})/) || ['', ''])[1];
}

function secondsOf(time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function conceptOf(row: MovementRow): string {
  return row.description.replace(/\s*·\s*\d{2}:\d{2}:\d{2}\s*$/, '').trim() || TYPE_LABEL[row.type] || row.type;
}

function signOf(row: MovementRow): number {
  if (row.direction === 'out') return -1;
  if (row.direction === 'in') return 1;
  if (row.type === 'expense' || row.type === 'fee' || row.type === 'withdrawal' || row.type === 'sell') return -1;
  return 1;
}

function assetOf(holding: HoldingRow): string {
  const symbol = holding.symbol.trim().toUpperCase();
  return symbol || holding.name.trim();
}

function incomeKind(row: MovementRow): IncomeKind {
  const text = `${row.category} ${row.description}`;
  if (/dividend/i.test(text)) return 'Dividendos';
  if (/staking/i.test(text)) return 'Staking';
  if (/inter[eé]s|earn|remunera/i.test(text) || row.currency === 'EUR') return 'Intereses';
  return 'Recompensas';
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

function units(value: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 8 }).format(value);
}

/**
 * Prepara el informe de la Renta de un año: transmisiones con coste FIFO,
 * rendimientos y todos los apuntes valorados en euros.
 */
export async function buildTaxReport(
  input: TaxInput,
  year: number,
  onProgress?: (done: number, total: number) => void,
  pricer: Pricer = createPricer(),
): Promise<TaxReport> {
  const end = `${year}-12-31`;
  const inYear = (date: string) => date.startsWith(String(year));
  const holdingById = new Map(input.holdings.map((item) => [String(item._id), item]));
  const platformOf = (id?: string | null) => input.accounts.find((account) => String(account._id) === String(id))?.name || '—';
  const rows = input.movements
    .filter((row) => row.date <= end)
    .map((row, index) => ({ row, index, time: clockOf(row) }))
    .sort((a, b) => a.row.date.localeCompare(b.row.date) || a.time.localeCompare(b.time) || b.index - a.index);

  const trades = new Map<string, Trade>();
  const rewards: Reward[] = [];
  const effects = new Map<string, string>();
  const legOf = new Map<string, Leg>();

  for (const { row, time } of rows) {
    const id = String(row._id);
    const holding = row.holdingId ? holdingById.get(String(row.holdingId)) : undefined;
    const money = row.currency === 'EUR' ? row.amount : row.eurPerUnit && row.eurPerUnit > 0 ? row.amount * row.eurPerUnit : null;
    const platform = platformOf(row.accountId);
    const tradeFor = (key: string) => {
      const found = trades.get(key);
      if (found) return found;
      const next: Trade = { date: row.date, time, platform, legs: [] };
      trades.set(key, next);
      return next;
    };
    const addLeg = (key: string, leg: Leg) => {
      tradeFor(key).legs.push(leg);
      legOf.set(id, leg);
    };

    if (holding && (row.type === 'buy' || row.type === 'sell')) {
      const feeEur = row.fee && row.fee > 0 ? (row.currency === 'EUR' ? row.fee : row.eurPerUnit ? row.fee * row.eurPerUnit : 0) : 0;
      const eur = money == null ? null : row.type === 'buy' ? money + feeEur : money - feeEur;
      addLeg(id, { row, kind: row.type === 'buy' ? 'in' : 'out', asset: assetOf(holding), name: holding.name, units: Math.abs(row.quantity ?? 0), eur, crypto: holding.assetClass === 'crypto' });
      effects.set(id, row.type === 'buy' ? EFFECT.buy : EFFECT.sale);
      continue;
    }

    if (row.type === 'reward' || (row.type === 'income' && /inter[eé]s|dividend|remunera/i.test(`${row.category} ${row.description}`))) {
      const asset = holding ? assetOf(holding) : row.currency.toUpperCase();
      const crypto = holding ? holding.assetClass === 'crypto' : row.currency !== 'EUR';
      const amount = holding ? Math.abs(row.quantity ?? row.amount) : Math.abs(row.amount);
      rewards.push({ row, date: row.date, time, platform, asset, units: amount, eur: money == null ? null : Math.abs(money), kind: incomeKind(row), crypto });
      effects.set(id, EFFECT.income);
      continue;
    }

    if (row.currency === 'EUR') {
      if (time && CASH_TYPES.has(row.type)) {
        addLeg(`${row.accountId}|${row.date}|${time}`, { row, kind: signOf(row) < 0 ? 'eurOut' : 'eurIn', asset: 'EUR', name: 'Euros', units: Math.abs(row.amount), eur: Math.abs(row.amount), crypto: false });
        effects.set(id, EFFECT.cash);
      } else {
        effects.set(id, EFFECT.euros);
      }
      continue;
    }

    if (MOVE_TYPES.has(row.type)) {
      effects.set(id, EFFECT.own);
      continue;
    }

    const kind: LegKind = row.type === 'fee' ? 'fee' : signOf(row) < 0 ? 'out' : 'in';
    const asset = holding ? assetOf(holding) : row.currency.toUpperCase();
    const amount = holding ? Math.abs(row.quantity ?? row.amount) : Math.abs(row.amount);
    addLeg(time ? `${row.accountId}|${row.date}|${time}` : id, {
      row,
      kind,
      asset,
      name: holding?.name || asset,
      units: amount,
      eur: money == null ? null : Math.abs(money),
      crypto: holding ? holding.assetClass === 'crypto' : true,
    });
    effects.set(id, kind === 'fee' ? EFFECT.fee : kind === 'out' ? EFFECT.sale : EFFECT.buy);
  }

  const isCash = (leg: Leg) => leg.kind === 'eurIn' || leg.kind === 'eurOut';
  const has = (trade: Trade, kind: LegKind) => trade.legs.some((leg) => leg.kind === kind);
  const accountOf = (trade: Trade) => String(trade.legs[0]?.row.accountId);
  const cashOnly = (trade: Trade) => trade.legs.every(isCash);
  const outOnly = (trade: Trade) => has(trade, 'out') && !has(trade, 'in') && !trade.legs.some(isCash);
  const inOnly = (trade: Trade) => has(trade, 'in') && !has(trade, 'out') && !trade.legs.some(isCash);
  const join = (fits: (trade: Trade) => boolean, partner: (trade: Trade) => boolean, maxGap: number) => {
    for (const [key, trade] of [...trades]) {
      if (!trade.time || !trades.has(key) || !fits(trade)) continue;
      let best: Trade | null = null;
      let bestGap = maxGap + 1;
      for (const other of trades.values()) {
        if (other === trade || other.date !== trade.date || accountOf(other) !== accountOf(trade) || !other.time || !partner(other)) continue;
        const gap = Math.abs(secondsOf(other.time) - secondsOf(trade.time));
        if (gap < bestGap) {
          best = other;
          bestGap = gap;
        }
      }
      if (best) {
        best.legs.push(...trade.legs);
        trades.delete(key);
      }
    }
  };
  join(outOnly, inOnly, SPLIT_GAP_SECONDS);
  join(cashOnly, (trade) => !trade.legs.some(isCash) && (has(trade, 'in') || has(trade, 'out')), CASH_GAP_SECONDS);

  const buys: Extract<Event, { buy: unknown }>['buy'][] = [];
  for (const holding of input.holdings) {
    for (const buy of holding.buys || []) {
      const at = new Date(buy.at);
      if (Number.isNaN(at.getTime()) || !(buy.quantity > 0)) continue;
      const date = at.toISOString().slice(0, 10);
      if (date > end) continue;
      buys.push({ date, time: at.toISOString().slice(11, 19), asset: assetOf(holding), name: holding.name, quantity: buy.quantity, cost: buy.spentEur, platform: platformOf(holding.accountId) });
    }
  }

  await pricer.prepare();
  for (const trade of trades.values()) {
    for (const leg of trade.legs) if (leg.crypto && leg.eur == null) pricer.need(leg.asset, trade.date, trade.time || null);
  }
  for (const reward of rewards) if (reward.crypto && reward.eur == null) pricer.need(reward.asset, reward.date, null);
  for (const { row } of rows) {
    if (!inYear(row.date) || row.currency === 'EUR') continue;
    const holding = row.holdingId ? holdingById.get(String(row.holdingId)) : undefined;
    pricer.need(holding ? assetOf(holding) : row.currency, row.date, null);
  }
  await pricer.load(onProgress);

  const legValue = (leg: Leg, trade: Trade): number | null => {
    if (leg.eur != null) return leg.eur;
    if (!leg.crypto) return null;
    const price = pricer.get(leg.asset, trade.date, trade.time || null);
    return price == null ? null : price * leg.units;
  };

  const lots = new Map<string, Lot[]>();
  const disposals: Disposal[] = [];
  const acquisitions: Acquisition[] = [];
  const incomeMap = new Map<string, Income>();
  const unpriced = new Set<string>();
  const exactEur = new Map<string, number>();

  const addLot = (asset: string, date: string, quantity: number, cost: number) => {
    if (!(quantity > DUST)) return;
    const list = lots.get(asset) || [];
    list.push({ date, quantity, unitCost: cost / quantity });
    lots.set(asset, list);
  };

  const takeLots = (asset: string, quantity: number) => {
    const list = lots.get(asset) || [];
    let left = quantity;
    let cost = 0;
    let first = '';
    let last = '';
    const pieces: Lot[] = [];
    while (left > DUST && list.length) {
      const lot = list[0];
      const used = Math.min(lot.quantity, left);
      cost += used * lot.unitCost;
      pieces.push({ date: lot.date, quantity: used, unitCost: lot.unitCost });
      if (!first) first = lot.date;
      last = lot.date;
      lot.quantity -= used;
      left -= used;
      if (lot.quantity <= DUST) list.shift();
    }
    return { cost, first, last, pieces, uncovered: left > DUST ? left : 0 };
  };

  const rewraps: Rewrap[] = [];
  const rewrap = (trade: Trade, outs: Leg[], ins: Leg[]) => {
    const pieces: Lot[] = [];
    let uncovered = 0;
    for (const leg of outs) {
      const taken = takeLots(leg.asset, leg.units);
      pieces.push(...taken.pieces);
      uncovered += taken.uncovered;
    }
    const given = sum(outs, (leg) => leg.units);
    const got = sum(ins, (leg) => leg.units);
    const ratio = given > 0 ? got / given : 0;
    const cost = pieces.reduce((acc, piece) => acc + piece.quantity * piece.unitCost, 0);
    for (const leg of ins) {
      const share = got > 0 ? leg.units / got : 0;
      for (const piece of pieces) addLot(leg.asset, piece.date, piece.quantity * ratio * share, piece.quantity * piece.unitCost * share);
      addLot(leg.asset, trade.date, uncovered * ratio * share, 0);
    }
    for (const leg of [...outs, ...ins]) effects.set(String(leg.row._id), EFFECT.rewrap);
    if (!inYear(trade.date)) return;
    rewraps.push({
      date: trade.date,
      time: trade.time,
      from: outs.map((leg) => leg.asset).join(' + '),
      fromQuantity: given,
      to: ins.map((leg) => leg.asset).join(' + '),
      toQuantity: got,
      cost: round(cost),
      platform: trade.platform,
    });
  };

  const dispose = (trade: Trade, leg: Leg, proceeds: number, kind: Disposal['kind'], received: string, priced: boolean) => {
    const taken = takeLots(leg.asset, leg.units);
    exactEur.set(String(leg.row._id), proceeds);
    if (!inYear(trade.date)) return;
    disposals.push({
      date: trade.date,
      time: trade.time,
      asset: leg.asset,
      name: leg.name,
      crypto: leg.crypto,
      kind,
      quantity: leg.units,
      proceeds: round(proceeds),
      cost: round(taken.cost),
      gain: round(proceeds) - round(taken.cost),
      firstBuy: taken.first,
      lastBuy: taken.last,
      uncovered: taken.uncovered,
      received,
      platform: trade.platform,
      priced,
    });
  };

  const acquire = (trade: Trade, leg: Leg, cost: number, origin: string, priced: boolean) => {
    addLot(leg.asset, trade.date, leg.units, cost);
    exactEur.set(String(leg.row._id), cost);
    if (!inYear(trade.date)) return;
    acquisitions.push({ date: trade.date, time: trade.time, asset: leg.asset, name: leg.name, quantity: leg.units, cost: round(cost), origin, platform: trade.platform, priced });
  };

  const split = (legs: Leg[], values: (number | null)[], total: number): number[] => {
    const known = values.every((value) => value != null && value > 0);
    const sum = known ? values.reduce<number>((acc, value) => acc + (value ?? 0), 0) : 0;
    return legs.map((_, index) => (known && sum > 0 ? total * ((values[index] as number) / sum) : total / legs.length));
  };

  const events: Event[] = [
    ...[...trades.values()].map((trade) => ({ at: `${trade.date} ${trade.time}`, trade })),
    ...rewards.map((reward) => ({ at: `${reward.date} ${reward.time}`, reward })),
    ...buys.map((buy) => ({ at: `${buy.date} ${buy.time}`, buy })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  for (const event of events) {
    if ('buy' in event) {
      const { buy } = event;
      addLot(buy.asset, buy.date, buy.quantity, buy.cost);
      if (inYear(buy.date)) acquisitions.push({ date: buy.date, time: buy.time, asset: buy.asset, name: buy.name, quantity: buy.quantity, cost: round(buy.cost), origin: 'Compra apuntada en Cartera', platform: buy.platform, priced: true });
      continue;
    }

    if ('reward' in event) {
      const { reward } = event;
      const price = reward.eur == null && reward.crypto ? pricer.get(reward.asset, reward.date, null) : null;
      const eur = reward.eur ?? (price == null ? null : price * reward.units);
      if (eur == null) unpriced.add(reward.asset);
      if (reward.crypto) addLot(reward.asset, reward.date, reward.units, eur ?? 0);
      exactEur.set(String(reward.row._id), eur ?? 0);
      if (!inYear(reward.date)) continue;
      const key = `${reward.date.slice(0, 7)}|${reward.kind}|${reward.asset}|${reward.platform}`;
      const bucket = incomeMap.get(key) || { month: reward.date.slice(0, 7), kind: reward.kind, asset: reward.asset, quantity: 0, count: 0, eur: 0, platform: reward.platform, priced: true };
      bucket.quantity += reward.crypto ? reward.units : 0;
      bucket.count += 1;
      bucket.eur += eur ?? 0;
      bucket.priced = bucket.priced && eur != null;
      incomeMap.set(key, bucket);
      continue;
    }

    const { trade } = event;
    const ins = trade.legs.filter((leg) => leg.kind === 'in');
    const outs = trade.legs.filter((leg) => leg.kind === 'out');
    const fees = trade.legs.filter((leg) => leg.kind === 'fee');
    const eurIn = trade.legs.filter((leg) => leg.kind === 'eurIn').reduce((sum, leg) => sum + leg.units, 0);
    const eurOut = trade.legs.filter((leg) => leg.kind === 'eurOut').reduce((sum, leg) => sum + leg.units, 0);
    const family = ins[0] ? baseAsset(ins[0].asset) : '';
    if (ins.length && outs.length && eurIn === 0 && eurOut === 0 && [...ins, ...outs].every((leg) => leg.crypto && baseAsset(leg.asset) === family)) {
      rewrap(trade, outs, ins);
      for (const leg of fees) {
        const value = legValue(leg, trade);
        if (value == null) unpriced.add(leg.asset);
        dispose(trade, leg, value ?? 0, 'Comisión', 'Pago de la comisión', value != null);
      }
      continue;
    }
    const inValues = ins.map((leg) => legValue(leg, trade));
    const outValues = outs.map((leg) => legValue(leg, trade));
    const got = inValues.every((value) => value != null) ? eurIn + inValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
    const given = outValues.every((value) => value != null) ? eurOut + outValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;

    if (ins.length || outs.length) {
      let total: number | null;
      if (!outs.length) total = eurOut > 0 ? eurOut - eurIn : got;
      else if (!ins.length) total = eurIn > 0 ? eurIn - eurOut : given;
      else total = given != null && got != null ? Math.max(given, got) : given ?? got;
      const priced = total != null;
      if (!priced) for (const leg of [...ins, ...outs]) if (legValue(leg, trade) == null) unpriced.add(leg.asset);
      const value = Math.max(0, total ?? 0);
      const received = ins.length ? ins.map((leg) => `${units(leg.units)} ${leg.asset}`).join(' + ') : eurIn > 0 ? `${units(round(eurIn))} €` : '—';
      const delivered = outs.length ? outs.map((leg) => leg.asset).join(' + ') : '';
      const outShares = split(outs, outValues, value);
      outs.forEach((leg, index) => dispose(trade, leg, outShares[index], ins.length ? 'Permuta' : 'Venta', received, priced));
      const inShares = split(ins, inValues, value);
      ins.forEach((leg, index) => acquire(trade, leg, inShares[index], delivered ? `Cambio desde ${delivered}` : eurOut > 0 ? 'Compra con euros' : leg.eur != null ? 'Compra' : 'Entrada a precio de mercado', priced));
    }

    for (const leg of fees) {
      const value = legValue(leg, trade);
      if (value == null) unpriced.add(leg.asset);
      dispose(trade, leg, value ?? 0, 'Comisión', 'Pago de la comisión', value != null);
    }
  }

  const lines: LedgerLine[] = rows
    .filter(({ row }) => inYear(row.date))
    .map(({ row, time }) => {
      const id = String(row._id);
      const holding = row.holdingId ? holdingById.get(String(row.holdingId)) : undefined;
      const leg = legOf.get(id);
      const asset = leg?.asset || (holding ? assetOf(holding) : row.currency.toUpperCase());
      const quantity = (holding && row.quantity != null ? Math.abs(row.quantity) : Math.abs(row.amount)) * signOf(row);
      const known = row.currency === 'EUR' && !holding ? Math.abs(row.amount) : exactEur.get(id) ?? (row.eurPerUnit && row.eurPerUnit > 0 ? Math.abs(row.amount * row.eurPerUnit) : null);
      const daily = known == null && asset !== 'EUR' ? pricer.get(asset, row.date, null) : null;
      const eur = known ?? (daily == null ? null : daily * Math.abs(quantity));
      return {
        date: row.date,
        time,
        platform: platformOf(row.accountId),
        operation: TYPE_LABEL[row.type] || row.type,
        concept: conceptOf(row),
        category: row.category || '',
        asset,
        quantity,
        unitEur: eur != null && quantity !== 0 ? eur / Math.abs(quantity) : null,
        eur: eur == null ? null : round(eur * Math.sign(quantity || 1)),
        effect: effects.get(id) || EFFECT.euros,
      };
    });

  const warnings: string[] = [];
  const uncovered = disposals.filter((item) => item.uncovered > 0);
  if (uncovered.length) {
    const extra = uncovered.reduce((sum, item) => sum + (item.quantity > 0 ? (item.proceeds * item.uncovered) / item.quantity : 0), 0);
    const assets = [...new Set(uncovered.map((item) => item.asset))].join(', ');
    warnings.push(`${uncovered.length} ${uncovered.length === 1 ? 'transmisión lleva' : 'transmisiones llevan'} unidades sin compra apuntada antes (${assets}), con coste 0 €. Suman ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(extra)} de ganancia; suele ser interés de Earn que Binance suma sin apunte aparte.`);
  }
  if (unpriced.size) warnings.push(`Precio histórico pendiente para ${[...unpriced].join(', ')}. Esas filas llevan 0 € y conviene completarlas a mano.`);

  return {
    year,
    disposals,
    incomes: [...incomeMap.values()].map((item) => ({ ...item, eur: round(item.eur) })).sort((a, b) => a.month.localeCompare(b.month) || a.kind.localeCompare(b.kind) || a.asset.localeCompare(b.asset)),
    acquisitions,
    rewraps,
    lines,
    warnings,
  };
}
