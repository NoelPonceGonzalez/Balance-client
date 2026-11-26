/**
 * Datos SINTÉTICOS para Planes y Movimientos (Bloque C). Solo los usa preview/app.tsx.
 * ?moves=N fija cuántos movimientos sintéticos hay (50, 250, 1000, 5000…). Por defecto, 120.
 */
import { dashboard } from './fixtures';

const TODAY = dashboard.today;
const round2 = (value: number) => Math.round(value * 100) / 100;
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function dayOffset(days: number, from = TODAY): string {
  const date = new Date(`${from}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const accounts = [
  { _id: 'acc-bank', name: 'Cuenta nómina', platform: 'BBVA', kind: 'bank', tracking: 'balance', currency: 'EUR', balance: 6_318.77, eurPerUnit: 1, notes: '', publicAddress: '', archived: false, balanceUpdatedAt: `${TODAY}T08:00:00Z` },
  { _id: 'acc-tr', name: 'Trade Republic', platform: 'Trade Republic', kind: 'broker', tracking: 'positions', currency: 'EUR', balance: 1_840.12, eurPerUnit: 1, notes: '', publicAddress: '', archived: false, balanceUpdatedAt: `${TODAY}T09:00:00Z` },
  { _id: 'acc-okx', name: 'OKX', platform: 'OKX', kind: 'exchange', tracking: 'positions', currency: 'EUR', balance: 212.4, eurPerUnit: 1, notes: '', publicAddress: '', archived: false },
  { _id: 'acc-cash', name: 'Efectivo', platform: 'Efectivo', kind: 'cash', tracking: 'balance', currency: 'EUR', balance: 240, eurPerUnit: 1, notes: '', publicAddress: '', archived: false },
];

/** Previsión mensual simple: saldo que sube con el ahorro y algunos gastos previstos. */
function forecastFor(opening: number, monthly: number, months: number, target: number, startOffset: number) {
  const out = [];
  let balance = opening;
  const start = new Date(`${dayOffset(startOffset)}T12:00:00Z`);
  for (let m = 0; m < months; m += 1) {
    const date = new Date(start);
    date.setUTCMonth(date.getUTCMonth() + m);
    const month = date.toISOString().slice(0, 7);
    const lines = [{ label: 'Saldo inicial', tone: 'plain', amount: null, balance: round2(balance), day: `${month}-01` }];
    balance += monthly;
    lines.push({ label: 'Ahorro del mes', tone: 'in', amount: monthly, balance: round2(balance), day: `${month}-05`, markKey: `save-${month}`, paid: month <= TODAY.slice(0, 7) } as never);
    if (m % 3 === 2) {
      balance -= 180;
      lines.push({ label: 'Seguro del coche', tone: 'out', amount: -180, balance: round2(balance), day: `${month}-15`, markKey: `ins-${month}`, paid: month < TODAY.slice(0, 7) } as never);
    }
    out.push({ month, title: date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }), lines });
  }
  return {
    plannedToday: round2(balance), plannedWithExpectedToday: round2(balance), today: TODAY, realBalance: null, deviationEur: 0, compliancePct: 100,
    onTrack: true, estimatedDate: monthly > 0 ? dayOffset(Math.round(((target - opening) / monthly) * 30.4) + startOffset) : null, extraMonthlyToRecover: null, gapAtTarget: 0,
    series: [], months: out, scenarios: [], notes: [],
  };
}

function plan(id: string, name: string, kind: string, opening: number, monthly: number, target: number, startOffset: number, targetOffset: number, linked: string[]) {
  return {
    _id: id, name, kind, openingBalance: opening, startDate: dayOffset(startOffset), targetAmount: target, targetDate: dayOffset(targetOffset), monthlySavings: monthly,
    linkedAccountIds: linked, manualRealBalance: null, recurring: [{ name: 'Seguro del coche', amount: 180, dayOfMonth: 15, direction: 'out' }], plannedExpenses: [], incomes: [], scenarios: [],
  };
}

const trip = {
  _id: 'p-trip', name: 'Viaje a Lisboa', kind: 'gastos', joinCode: 'LIS42', openingBalance: 0, startDate: dayOffset(-20), targetAmount: 0, targetDate: dayOffset(40), monthlySavings: 0,
  linkedAccountIds: [], manualRealBalance: null, recurring: [], plannedExpenses: [], incomes: [], scenarios: [], tripStatus: 'active',
  members: [
    { userId: 'preview', name: 'Tú', color: '#0a84ff', contributed: 300 },
    { userId: 'u-ana', name: 'Ana', color: '#ff9f0a', contributed: 300 },
    { userId: 'u-leo', name: 'Leo', color: '#30d158', contributed: 200 },
  ],
  tripExpenses: [
    { _id: 'e1', name: 'Apartamento', amount: 420, paidBy: 'preview', date: dayOffset(-6), charge: 'done', splitAmong: ['preview', 'u-ana', 'u-leo'] },
    { _id: 'e2', name: 'Cena en Alfama', amount: 96.4, paidBy: 'u-ana', date: dayOffset(-3), charge: 'none', splitAmong: ['preview', 'u-ana', 'u-leo'] },
    { _id: 'e3', name: 'Tranvía y metro', amount: 31.5, paidBy: 'u-leo', date: dayOffset(-2), charge: 'none', splitAmong: ['preview', 'u-ana', 'u-leo'] },
    { _id: 'e4', name: 'Museo de los Azulejos', amount: 45, paidBy: 'preview', date: dayOffset(-1), charge: 'pending', splitAmong: ['preview', 'u-ana', 'u-leo'] },
  ],
  settlements: [], tripActivity: [],
};
const tripSplit = {
  totalSpent: 592.9,
  people: [
    { id: 'preview', name: 'Tú', color: '#0a84ff', contributed: 300, spent: 465, share: 197.63, net: 267.37 },
    { id: 'u-ana', name: 'Ana', color: '#ff9f0a', contributed: 300, spent: 96.4, share: 197.63, net: -101.23 },
    { id: 'u-leo', name: 'Leo', color: '#30d158', contributed: 200, spent: 31.5, share: 197.64, net: -166.14 },
  ],
  transfers: [{ fromId: 'u-leo', from: 'Leo', toId: 'preview', to: 'Tú', amount: 166.14 }, { fromId: 'u-ana', from: 'Ana', toId: 'preview', to: 'Tú', amount: 101.23 }],
};

export const plans = [
  { plan: plan('p-emerg', 'Fondo de emergencia', 'liquidez', 3_200, 250, 10_000, -300, 520, ['acc-bank']), forecast: forecastFor(3_200, 250, 28, 10_000, -300) },
  { plan: plan('p-casa', 'Entrada del piso', 'patrimonio', 12_400, 600, 40_000, -420, 1_200, ['acc-tr']), forecast: forecastFor(12_400, 600, 40, 40_000, -420) },
  { plan: plan('p-moto', 'Moto', 'liquidez', 1_000, 300, 4_000, -400, -10, ['acc-bank']), forecast: forecastFor(1_000, 300, 12, 4_000, -400) },
  { plan: trip, forecast: forecastFor(0, 0, 1, 0, 0), split: tripSplit },
];

const TITLES = ['Mercadona', 'Nómina', 'Alquiler', 'Netflix', 'Gasolina', 'Café', 'Compra MSCI World', 'Bizum Ana', 'Farmacia', 'Amazon', 'Luz', 'Gimnasio', 'Restaurante', 'Transferencia a OKX'];
const TYPES = ['expense', 'income', 'expense', 'expense', 'expense', 'expense', 'buy', 'income', 'expense', 'expense', 'expense', 'expense', 'expense', 'transfer'];

export function movements(count: number) {
  const rand = random(4242 + count);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const k = Math.floor(rand() * TITLES.length);
    const type = TYPES[k];
    const date = dayOffset(-Math.floor((i / Math.max(1, count)) * Math.min(1_400, count * 1.3)));
    out.push({
      _id: `m${i}`, type, date, amount: round2(type === 'income' ? 200 + rand() * 2_000 : 3 + rand() * 180), currency: 'EUR', category: '',
      description: `${TITLES[k]} · sintético`, accountId: type === 'buy' ? 'acc-tr' : 'acc-bank', counterAccountId: type === 'transfer' ? 'acc-okx' : null,
      direction: type === 'income' ? 'in' : 'out', applyToBalances: true, source: 'manual',
    });
  }
  return out;
}

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const ALL = movements(Number(params.get('moves') || 120));

export function previewResponseC(path: string): unknown | undefined {
  const url = new URL(path, 'http://preview.local');
  const route = url.pathname;
  if (route === '/api/plans') return { plans };
  if (route === '/api/accounts') return { accounts };
  if (route === '/api/limits') return { orders: [] };
  if (route === '/api/movements') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const from = url.searchParams.get('from') || '';
    const to = url.searchParams.get('to') || '';
    const accountId = url.searchParams.get('accountId') || '';
    const type = url.searchParams.get('type') || '';
    const rows = ALL.filter((row) => (!q || row.description.toLowerCase().includes(q)) && (!from || row.date >= from) && (!to || row.date <= to)
      && (!accountId || row.accountId === accountId || row.counterAccountId === accountId) && (!type || row.type === type));
    const page = Number(url.searchParams.get('page') || 0);
    const size = Number(url.searchParams.get('pageSize') || 500);
    const slice = rows.slice(page * size, page * size + size);
    return { movements: slice, complete: page * size + size >= rows.length };
  }
  return undefined;
}
