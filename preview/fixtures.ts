/**
 * Datos sintéticos para la vista previa del Resumen. Solo se usan en preview/resumen.tsx;
 * nunca en la app ni en producción. Deterministas: mismo resultado en cada carga.
 */
import type { DashboardData } from '@/lib/types';

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

const round2 = (value: number) => Math.round(value * 100) / 100;
const TODAY = '2026-11-25';

function dayBefore(days: number): string {
  const date = new Date(`${TODAY}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const accounts: DashboardData['accounts'] = [
  {
    id: 'acc-tr', name: 'Trade Republic', platform: 'Trade Republic', kind: 'broker', tracking: 'positions', currency: 'EUR',
    balance: 1840.12, valueEur: 21_480.55, updatedAt: `${TODAY}T09:12:00Z`, stale: false,
    parts: [
      { label: 'Efectivo', eur: 1840.12, group: 'cash' },
      { label: 'MSCI World', eur: 12_930.4, group: 'etf', costEur: 11_200, quantity: 127.5, detail: '127,5 participaciones', id: 'h-etf', followMarket: true },
      { label: 'S&P 500', eur: 4_310.03, group: 'etf', costEur: 3_900, quantity: 7.2, detail: '7,2 participaciones', id: 'h-sp', followMarket: true },
      { label: 'Apple', eur: 2_400, group: 'stock', costEur: 2_650, quantity: 11, detail: '11 acciones', id: 'h-aapl', followMarket: true },
    ],
  },
  {
    id: 'acc-okx', name: 'OKX', platform: 'OKX', kind: 'exchange', tracking: 'positions', currency: 'EUR',
    balance: 212.4, valueEur: 9_645.3, updatedAt: `${TODAY}T09:10:00Z`, stale: false,
    parts: [
      { label: 'Efectivo', eur: 212.4, group: 'cash' },
      { label: 'Bitcoin', eur: 7_420.9, group: 'crypto', costEur: 5_800, quantity: 0.0947, detail: '0,0947 BTC', id: 'h-btc', followMarket: true },
      { label: 'Ethereum', eur: 2_012, group: 'crypto', costEur: 2_430, quantity: 0.76, detail: '0,76 ETH', id: 'h-eth', followMarket: true },
    ],
  },
  {
    id: 'acc-bank', name: 'Cuenta nómina', platform: 'BBVA', kind: 'bank', tracking: 'balance', currency: 'EUR',
    balance: 6_318.77, valueEur: 6_318.77, updatedAt: `${TODAY}T08:00:00Z`, stale: false, parts: [],
  },
  {
    id: 'acc-cs2', name: 'CS2', platform: 'CS2', kind: 'other', tracking: 'positions', currency: 'EUR',
    balance: 0, valueEur: 3_491, updatedAt: `${TODAY}T07:00:00Z`, stale: false,
    parts: [
      { label: 'AK-47 | Redline', eur: 41.2, group: 'other', costEur: 38, detail: 'Field-Tested', id: 'h-ak' },
      { label: 'Karambit | Doppler', eur: 3_449.8, group: 'other', costEur: 3_620, detail: 'Factory New · Phase 2', id: 'h-kar' },
    ],
  },
  {
    id: 'acc-cash', name: 'Efectivo', platform: 'Efectivo', kind: 'cash', tracking: 'balance', currency: 'EUR',
    balance: 240, valueEur: 240, updatedAt: `${TODAY}T08:00:00Z`, stale: false, parts: [],
  },
];

const netWorth = round2(accounts.reduce((sum, account) => sum + (account.valueEur ?? 0), 0));

function buildSeries(): DashboardData['series'] {
  const rand = random(20261125);
  const days = 540;
  const values: number[] = [];
  let value = netWorth;
  for (let d = 0; d < days; d += 1) {
    values.push(round2(value));
    const drift = 1 + 0.00085 + (rand() - 0.5) * 0.018;
    value = value / drift;
  }
  return values.reverse().map((eur, index) => ({ day: dayBefore(days - 1 - index), eur, complete: true }));
}

const series = buildSeries();
series[series.length - 1] = { day: TODAY, eur: netWorth, complete: true };
const base30 = series[series.length - 31].eur;

export const dashboard: DashboardData = {
  today: TODAY,
  period: '30d',
  hasAccounts: true,
  netWorth: { eur: netWorth, complete: true } as DashboardData['netWorth'],
  available: { eur: 8_611.29, complete: true } as DashboardData['available'],
  invested: { eur: 19_640.43, complete: true } as DashboardData['invested'],
  crypto: { eur: 9_432.9, complete: true } as DashboardData['crypto'],
  personalGoods: { eur: 3_491, complete: true } as DashboardData['personalGoods'],
  unrealized: { eur: 3_312.7, complete: true } as DashboardData['unrealized'],
  contributions: { eur: 650, complete: true } as DashboardData['contributions'],
  realized: { eur: 120.4, complete: true } as DashboardData['realized'],
  fees: { eur: 18.5, complete: true } as DashboardData['fees'],
  variation: {
    available: true,
    amount: round2(netWorth - base30),
    percent: round2(((netWorth - base30) / base30) * 100),
    baseDay: series[series.length - 31].day,
    note: '',
  },
  series,
  allocation: [],
  pnl: [
    { key: 'acc-tr', label: 'Trade Republic', eur: 1_890.43, accountName: 'Trade Republic', platform: 'Trade Republic' },
    { key: 'acc-okx', label: 'OKX', eur: 1_202.9, accountName: 'OKX', platform: 'OKX' },
    { key: 'acc-cs2', label: 'CS2', eur: -167, accountName: 'CS2', platform: 'CS2' },
  ],
  extras: [
    { id: 'x-watch', place: 'objeto', name: 'Seiko Presage', valueEur: 690, costEur: 520, counts: true },
  ],
  accounts,
  warnings: [],
};

/** Respuestas de la API simulada (solo vista previa). */
export function previewResponse(path: string, method: string): unknown {
  const url = new URL(path, 'http://preview.local');
  const route = url.pathname;
  if (method !== 'GET') return { ok: true };
  if (route === '/api/dashboard') return dashboard;
  if (route === '/api/holdings') return { holdings: [] };
  if (route === '/api/plans/due') return { prompts: [{ label: 'Nómina', amount: 2_300, direction: 'in' }] };
  if (route === '/api/plans') return { plans: [] };
  if (route === '/api/market/notifications') return { notifications: [] };
  if (route === '/api/market/skin-stars') return { skins: [{ name: 'Karambit | Doppler', wear: 'Factory New', label: 'Karambit | Doppler', image: null, lastBestEur: 3_420 }] };
  if (route === '/api/market/tracked') return { tracked: [] };
  if (route === '/api/market/saved') return { saved: [] };
  if (route === '/api/wallets') return { wallets: [] };
  if (route === '/api/movements') return { movements: [], total: 0 };
  if (route === '/api/movements/count') return { count: 0 };
  return {};
}
