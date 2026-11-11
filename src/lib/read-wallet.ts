import { PLATFORMS, type PlatformGroup, type PlatformPreset } from './platforms';

export type PhotoClass = 'crypto' | 'stock' | 'etf' | 'other';

export interface PhotoLine {
  name: string;
  amount: number;
  assetClass: PhotoClass;
}

export interface PhotoAccount {
  id: string;
  name: string;
  kind?: string;
  platform?: string;
}

export interface PhotoRead {
  walletName: string;
  accountId: string | null;
  preset: PlatformPreset | null;
  lines: PhotoLine[];
}

export function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();
}

const AMOUNT = /(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+[.,]\d{2})/;
const ETF = /\b(etf|msci|s&p|sp500|nasdaq|vwce|index|acc)\b/i;
const CRYPTO = /\b(bitcoin|btc|ethereum|ether|eth|solana|sol|bnb|xrp|usdc|usdt|beth|oksol|hype|doge|ada|dot|avax|link|ton|pepe)\b/i;
const TICKER = /\b(OKSOL|BETH|USDC|USDT|BTC|ETH|HYPE|SOL|BNB|XRP|EUR|DOGE|ADA|AVAX|LINK|PEPE)\b/i;
const NOISE = /^(spot|earn|cripto|crypto|total|portfolio|activos|acciones|etf|overview|home|hone|menu|wallet)$/i;
const CLUES: { test: RegExp; keys: string[] }[] = [
  { test: /\boksol\b|\bokx\b|\b0kx\b/i, keys: ['okx'] },
  { test: /\btrade republic\b|\btraderepublic\b/i, keys: ['trade republic'] },
  { test: /\bbinance\b|\bbeth\b/i, keys: ['binance'] },
  { test: /\bcoinbase\b/i, keys: ['coinbase'] },
  { test: /\bkraken\b/i, keys: ['kraken'] },
  { test: /\brevolut\b/i, keys: ['revolut'] },
  { test: /\bcs2\b|\bsteam\b|\bskinport\b/i, keys: ['cs2', 'steam'] },
];

export function isCashName(name: string): boolean {
  return /saldo|efectivo|disponible|cuenta remunerada|l[ií]quido/i.test(name);
}

export function parseAmount(raw: string): number | null {
  const token = raw.replace(/\s/g, '');
  let num: number;
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(token)) num = Number(token.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(token)) num = Number(token.replace(/,/g, ''));
  else if (/^\d+,\d{2}$/.test(token)) num = Number(token.replace(',', '.'));
  else if (/^\d+\.\d{2}$/.test(token)) num = Number(token);
  else return null;
  if (!Number.isFinite(num) || num <= 0 || num > 10_000_000) return null;
  return Math.round(num * 100) / 100;
}

export function classifyLine(name: string, group: PlatformGroup | null): PhotoClass {
  if (isCashName(name)) return 'other';
  if (CRYPTO.test(name)) return 'crypto';
  if (ETF.test(name)) return 'etf';
  if (group === 'Cripto') return 'crypto';
  if (group === 'Inversión') return 'stock';
  return 'other';
}

export function groupForKind(kind: string | undefined, walletName: string): PlatformGroup | null {
  if (kind === 'exchange') return 'Cripto';
  if (kind === 'broker') return 'Inversión';
  if (kind === 'bank') return 'Banca';
  return PLATFORMS.find((item) => fold(item.name) === fold(walletName))?.group || null;
}

function cleanName(value: string): string {
  return value
    .replace(AMOUNT, ' ')
    .replace(/[€$]/g, ' ')
    .replace(/[+\-−]?\s*\d+[.,]\d+\s*%/g, ' ')
    .replace(/[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ&.'()/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function presentName(raw: string): string | null {
  const ticker = raw.match(TICKER);
  if (ticker) return ticker[1].toUpperCase();
  const name = raw.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/, '').replace(/\s+/g, ' ').trim();
  const letters = name.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  if (letters.length < 3 || NOISE.test(name) || /^\d/.test(name)) return null;
  return name.slice(0, 40);
}

function blob(account: PhotoAccount): string {
  return fold(`${account.name} ${account.platform || ''}`);
}

function mentions(folded: string, name: string): boolean {
  const key = fold(name);
  if (key.length < 2 || key === 'otra') return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(folded);
}

function findAccount(text: string, accounts: PhotoAccount[]): PhotoAccount | null {
  const folded = fold(text);
  const named = accounts
    .filter((item) => mentions(folded, item.name) || mentions(folded, item.platform || ''))
    .sort((a, b) => blob(b).length - blob(a).length);
  if (named[0]) return named[0];
  const preset = findPreset(text);
  if (!preset) return null;
  const key = fold(preset.name);
  return accounts.find((item) => fold(item.name) === key || fold(item.platform || '') === key) || null;
}

function findPreset(text: string): PlatformPreset | null {
  const folded = fold(text);
  const named = PLATFORMS
    .filter((item) => mentions(folded, item.name))
    .sort((a, b) => b.name.length - a.name.length);
  if (named[0]) return named[0];
  for (const clue of CLUES) {
    if (!clue.test.test(text)) continue;
    const found = PLATFORMS.find((item) => clue.keys.some((key) => item.id === key || fold(item.name) === key));
    if (found) return found;
  }
  return null;
}

function amountIn(chunk: string): number | null {
  const after = chunk.match(new RegExp(`€\\s*${AMOUNT.source}`));
  if (after?.[1]) return parseAmount(after[1]);
  const before = chunk.match(new RegExp(`${AMOUNT.source}\\s*€`));
  if (before?.[1]) return parseAmount(before[1]);
  const plain = chunk.match(AMOUNT);
  return plain?.[1] ? parseAmount(plain[1]) : null;
}

export function looksLikeWallet(read: PhotoRead, text: string): boolean {
  if (!read.lines.length) return false;
  if (read.accountId || read.preset) return true;
  if (read.lines.filter((line) => TICKER.test(line.name)).length >= 2) return true;
  return /\b(cripto|crypto|portfolio)\b/i.test(text) && read.lines.length >= 2;
}

export function readWalletText(text: string, accounts: PhotoAccount[]): PhotoRead {
  const guessed = findPreset(text);
  const account = findAccount(text, accounts);
  const walletName = account?.name || '';
  const group = account ? groupForKind(account.kind, account.name) : (guessed?.group || null);
  const lines: PhotoLine[] = [];
  const seen = new Set<string>();
  let pending = '';
  const push = (raw: string, amount: number) => {
    const name = presentName(raw);
    if (!name || (walletName && fold(name) === fold(walletName))) return;
    if (amount < 1 && (isCashName(name) || name === 'EUR')) return;
    const key = fold(name);
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ name, amount, assetClass: classifyLine(name, group) });
  };
  for (const chunk of text.split(/\n/)) {
    if (lines.length >= 40) break;
    if (/%/.test(chunk) && !/€/.test(chunk)) continue;
    const amount = amountIn(chunk);
    const name = cleanName(chunk);
    if (name && amount != null) {
      push(name, amount);
      pending = '';
      continue;
    }
    if (name && amount == null) {
      if (!walletName || fold(name) !== fold(walletName)) pending = name;
      continue;
    }
    if (amount != null && pending) {
      push(pending, amount);
      pending = '';
    }
  }
  lines.sort((a, b) => b.amount - a.amount);
  const readable = lines.length > 0;
  return {
    walletName: readable ? walletName : '',
    accountId: readable ? account?.id || null : null,
    preset: readable && !account ? guessed : null,
    lines,
  };
}
