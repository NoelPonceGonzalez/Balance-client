/**
 * Datos SINTÉTICOS para la vista previa de Carteras y Mercado (Bloque B). Solo los usa preview/app.tsx.
 * No son cotizaciones reales ni pretenden parecerlo: nombres reconocibles con precios inventados y fijos.
 */
import { dashboard, previewResponse } from './fixtures';

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
const hash = (text: string) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const round2 = (value: number) => Math.round(value * 100) / 100;
const TODAY = dashboard.today;

function walk(seed: string, end: number, days: number, drift = 0.0006, vol = 0.016): { day: string; eur: number }[] {
  const rand = random(hash(seed));
  const out: number[] = [];
  let value = end;
  for (let d = 0; d < days; d += 1) {
    out.push(round2(value));
    value = value / (1 + drift + (rand() - 0.5) * vol * 2);
  }
  return out.reverse().map((eur, index) => {
    const date = new Date(`${TODAY}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (days - 1 - index));
    return { day: date.toISOString().slice(0, 10), eur };
  });
}

const holdings = [
  { _id: 'h-etf', accountId: 'acc-tr', assetClass: 'etf', quantity: 127.5, costBasis: 11_200, quoteSource: 'yahoo', quoteId: 'IWDA.AS', unitMarketValue: 101.42 },
  { _id: 'h-sp', accountId: 'acc-tr', assetClass: 'etf', quantity: 7.2, costBasis: 3_900, quoteSource: 'yahoo', quoteId: 'CSPX.AS', unitMarketValue: 598.62 },
  { _id: 'h-aapl', accountId: 'acc-tr', assetClass: 'stock', quantity: 11, costBasis: 2_650, quoteSource: 'yahoo', quoteId: 'AAPL', unitMarketValue: 218.18 },
  { _id: 'h-btc', accountId: 'acc-okx', assetClass: 'crypto', quantity: 0.0947, costBasis: 5_800, quoteSource: 'coingecko', quoteId: 'bitcoin', unitMarketValue: 78_362 },
  { _id: 'h-eth', accountId: 'acc-okx', assetClass: 'crypto', quantity: 0.76, costBasis: 2_430, quoteSource: 'coingecko', quoteId: 'ethereum', unitMarketValue: 2_647 },
];

type Tape = { key: string; kind: string; name: string; symbol: string; price: number; pct: number };
const tape = (kind: string, rows: [string, string, number, number][]): Tape[] => rows.map(([name, symbol, price, pct]) => ({ key: `${kind}:${symbol}`, kind, name, symbol, price, pct }));
const TAPES: Record<string, Tape[]> = {
  cryptos: tape('crypto', [['Bitcoin', 'BTC', 78_362, 1.84], ['Ethereum', 'ETH', 2_647.1, -0.92], ['Solana', 'SOL', 152.4, 3.41], ['XRP', 'XRP', 0.58, -1.2], ['Cardano', 'ADA', 0.41, 0.35], ['Polkadot', 'DOT', 5.92, -2.7], ['Chainlink', 'LINK', 13.8, 4.9], ['Litecoin', 'LTC', 71.2, 0]]),
  stocks: tape('stock', [['Apple', 'AAPL', 218.18, 0.62], ['Microsoft', 'MSFT', 398.5, -0.41], ['Nvidia', 'NVDA', 121.3, 2.85], ['Amazon', 'AMZN', 171.9, 1.12], ['Inditex', 'ITX', 48.7, -0.66], ['Santander', 'SAN', 4.61, 0.94], ['Iberdrola', 'IBE', 13.42, -0.18], ['Tesla', 'TSLA', 212.4, -3.4], ['ASML', 'ASML', 682.1, 1.7], ['Alphabet', 'GOOGL', 157.2, 0.08]]),
  etfs: tape('etf', [['iShares Core MSCI World', 'IWDA', 101.42, 0.51], ['iShares Core S&P 500', 'CSPX', 598.62, 0.73], ['Vanguard FTSE All-World', 'VWCE', 124.8, 0.44], ['iShares MSCI EM', 'EIMI', 32.1, -0.37], ['Xtrackers MSCI Europe', 'XMEU', 88.6, 0.12], ['iShares Global Clean Energy', 'INRG', 7.9, -1.9]]),
  indices: tape('index', [['IBEX 35', 'IBEX', 11_842.3, 0.61], ['S&P 500', 'SPX', 5_912.7, 0.33], ['Euro Stoxx 50', 'SX5E', 4_910.2, -0.21], ['Nasdaq 100', 'NDX', 20_811.4, 0.95]]),
  gold: tape('gold', [['Oro', 'XAU', 2_488.6, 0.27]]),
  silver: tape('silver', [['Plata', 'XAG', 29.4, -0.55]]),
  oil: tape('oil', [['Petróleo Brent', 'BRENT', 68.9, -1.31]]),
  copper: tape('copper', [['Cobre', 'HG', 8.92, 0.64]]),
  cs2: tape('cs2', [['AK-47 | Redline', 'FT', 41.2, 1.3], ['Karambit | Doppler', 'FN', 3_449.8, -0.8], ['AWP | Asiimov', 'FT', 88.4, 0.5], ['M4A1-S | Printstream', 'MW', 212.6, 2.1]]),
};

function tapeItem(row: Tape, updatedAt: string) {
  const line = walk(row.key, row.price, 30, row.pct / 3000, 0.02).map((point) => point.eur);
  return {
    key: row.key, kind: row.kind, name: row.name, symbol: row.symbol, image: null, sourceLabel: 'Datos sintéticos',
    priceEur: row.price, changePct: row.pct, changeLabel: '24 h', sparkline: line, fetchedAt: updatedAt, stale: false, error: null,
  };
}

function board() {
  // updatedAt fijo respecto a la carga: la vista previa no simula cotizaciones en tiempo real.
  const updatedAt = new Date(Date.now() - 45_000).toISOString();
  const out: Record<string, unknown> = { updatedAt, warning: null, items: [], pending: [], icons: { cs2: null, tf2: null }, purchases: [], signals: [], tf2: [] };
  for (const [field, rows] of Object.entries(TAPES)) out[field] = rows.map((row) => tapeItem(row, updatedAt));
  return out;
}

function series(accountId: string, group: string) {
  const account = dashboard.accounts.find((item) => item.id === accountId);
  const parts = (account?.parts || []).filter((part) => group === 'all' || part.group === group || (group === 'valores' && (part.group === 'etf' || part.group === 'stock')));
  const end = parts.reduce((sum, part) => sum + part.eur, 0) || account?.valueEur || 0;
  return { points: walk(`${accountId}:${group}`, end, 420) };
}

function story(key: string, days: number) {
  const row = Object.values(TAPES).flat().find((item) => key.includes(item.symbol)) || null;
  const unit = holdings.find((item) => key.endsWith(item.quoteId))?.unitMarketValue ?? row?.price ?? 100;
  const line = walk(key, unit, Math.min(days || 365, 400));
  return { series: line.map((point) => ({ at: `${point.day}T16:00:00Z`, eur: point.eur })), changePct: row?.pct ?? null, changeLabel: '24 h', floats: [], note: 'Serie sintética de la vista previa.' };
}

export function previewResponseB(path: string, method: string): unknown {
  const url = new URL(path, 'http://preview.local');
  const route = url.pathname;
  if (method !== 'GET') return previewResponse(path, method);
  if (route === '/api/holdings') return { holdings };
  if (route === '/api/wallets/series') return series(url.searchParams.get('accountId') || '', url.searchParams.get('group') || 'all');
  if (route === '/api/market') return board();
  if (route === '/api/market/moves') return { moves: [] };
  if (route === '/api/market/story') return story(url.searchParams.get('key') || '', Number(url.searchParams.get('days') || 365));
  if (route === '/api/movements') return { movements: [], complete: true };
  if (route === '/api/market/csfloat/catalog') return { results: [] };
  if (route === '/api/market/search') return { results: [] };
  return previewResponse(path, method);
}
