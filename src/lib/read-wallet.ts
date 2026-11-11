import { PLATFORMS, type PlatformGroup, type PlatformPreset } from './platforms';

export type PhotoClass = 'crypto' | 'stock' | 'etf' | 'other';

export interface PhotoLine {
  name: string;
  amount: number;
  gain: number | null;
  assetClass: PhotoClass;
  /** Movimiento de liquidez: entra o sale de la cuenta, no es una posición. */
  cash?: boolean;
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

const AMOUNT = /(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+[.,]\d{2})(?!\d)/;
const ETF = /\b(etf|msci|s&p|sp500|nasdaq|vwce|index|acc)\b/i;
const CRYPTO = /\b(bitcoin|btc|ethereum|ether|eth|solana|sol|bnb|xrp|usdc|usdt|beth|oksol|hype|doge|ada|dot|avax|link|ton|pepe)\b/i;
const TICKER = /\b(OKSOL|BETH|USDC|USDT|BTC|ETH|HYPE|SOL|BNB|XRP|EUR|DOGE|ADA|AVAX|LINK|PEPE|PENGU|LINEA|ASTER)\b/i;
const NOISE = /^(spot|earn|cripto|crypto|total|portfolio|activos|acciones|etf|overview|home|hone|menu|wallet)$/i;
const WALLET_GAIN = /\b(ganancias?|beneficio|p[eé]rdidas?|pnl|profit|hoy|24h)\b/i;
const LEAVING = /\b(retiro|retirada|salida|enviad[oa]|pagos?|compras?)\b/i;
const INCOMING = /\b(recibid[oa]|ingresos?|abonos?|inter[eé]s)\b/i;
const REJECTED = /\brechazad[oa]\b/i;
const DATE_LINE = /^(este mes|el mes pasado|\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)(?:\b.*completad[oa])?)$/i;
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

export function isLiquidName(name: string): boolean {
  return isCashName(name) || /^(eur|euro|euros|usd|usdc|usdt|dai)$/i.test(name.trim()) || /\b(retiro|retirada|salida)\b/i.test(name);
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
  const name = value
    .replace(AMOUNT, ' ')
    .replace(/[€$]/g, ' ')
    .replace(/[+\-−]?\s*\d+[.,]\d+\s*%/g, ' ')
    .replace(/[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ&.'()/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(name)) return '';
  return name;
}

const LABELS: Record<string, string> = {
  steam: 'Steam',
  cs2: 'CS2',
  skinport: 'Skinport',
  bem: 'BETH',
  usp: 'USDC',
};

function tidyName(name: string): string {
  let next = name
    .replace(/[€$]/g, ' ')
    .replace(/[.…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[A-Za-z]{1,2}[)\]\]]?\s+(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,})/, '')
    .replace(/(?:\s+[A-Za-z]{1,2})+$/g, '')
    .trim();
  if (/equipamiento/i.test(next)) return 'SP Equipamiento';
  const known = next.match(/\b(steam|cs2|skinport)\b/i);
  if (known && squash(next).length <= squash(known[1]).length + 4) return LABELS[fold(known[1])] || known[1];
  return (LABELS[fold(next)] || next).slice(0, 80);
}

function presentName(raw: string): string | null {
  const ticker = raw.match(TICKER);
  if (ticker && fold(raw).split(/\s+/).length <= 3) return ticker[1].toUpperCase();
  const name = tidyName(raw.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/, ''));
  const words = name.split(/\s+/).filter((word) => {
    const letters = word.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
    return letters.length >= 4 && !/[a-záéíóúüñ][A-ZÁÉÍÓÚÜÑ]/.test(letters);
  });
  if (!words.length || NOISE.test(name) || /^\d/.test(name)) return null;
  return name;
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

function amountOf(raw: string): number | null {
  const token = raw.replace(/[€$\s]/g, '').replace(/^[+\-−]/, '');
  return parseAmount(token);
}

/** Pinta el + o el − de un importe verde o rojo. Si es el único importe de la línea, el tono colorea ese valor. */
export function paintLine(words: { text: string; ink: 'green' | 'red' | 'plain' }[]): { text: string; tone: { value: number; ink: 'up' | 'down' } | null } {
  const valued = words.flatMap((word) => {
    const value = amountOf(word.text);
    return value == null ? [] : [{ ...word, value }];
  });
  const colored = valued.filter((word) => word.ink !== 'plain');
  const plain = valued.filter((word) => word.ink === 'plain');
  const named = words.some((word) => /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3}/.test(word.text));
  let tone: { value: number; ink: 'up' | 'down' } | null = null;
  const parts = words.map((word) => {
    const value = amountOf(word.text);
    if (value == null || word.ink === 'plain' || /^[+\-−]/.test(word.text.trim())) return word.text;
    const sign = word.ink === 'red' ? '−' : '+';
    const secondary = plain.length > 0 && colored.length > 0;
    const alone = valued.length === 1 && !named;
    if (secondary || alone) return `${sign}${word.text.trim()}`;
    if (valued.length === 1) tone = { value, ink: word.ink === 'red' ? 'down' : 'up' };
    return word.text;
  });
  return { text: parts.join(' '), tone };
}

function moneyHits(chunk: string): { value: number; signed: boolean; euro: boolean }[] {
  const re = new RegExp(`(?:^|[^\\d.,])([+\\-−])?\\s*([€$])?\\s*${AMOUNT.source}(\\s*%)?`, 'g');
  const hits: { value: number; signed: boolean; euro: boolean }[] = [];
  for (const match of chunk.matchAll(re)) {
    if (match[4]) continue;
    const magnitude = parseAmount(match[3] || '');
    if (magnitude == null) continue;
    const sign = match[1];
    const negative = sign === '-' || sign === '−';
    hits.push({ value: negative ? -magnitude : magnitude, signed: sign === '+' || negative, euro: match[2] === '€' || match[2] === '$' });
  }
  return hits;
}

function isMoveList(text: string): boolean {
  return /\b(enviad|rechazad|completad|inter[eé]s)\b/i.test(text);
}

function squash(value: string): string {
  return fold(value).replace(/\s/g, '');
}

function repairText(text: string): string {
  return text
    .replace(/(\d)\s*:\s*(\d{2})(?!\d)/g, '$1,$2')
    .replace(/([€$])\s*</g, '$1')
    .replace(/(^|[^\d])\.(\d{3},\d{2})(?!\d)/g, '$11.$2')
    .replace(/[€$](\d{4,7})(?![\d.,])/g, (_match, digits: string) => `€${digits.slice(0, -2)},${digits.slice(-2)}`);
}

function expandNames(lines: PhotoLine[]) {
  const full = lines.map((line) => line.name).filter((name) => squash(name).length >= 8);
  lines.forEach((line) => {
    const key = squash(line.name);
    if (key.length < 8) return;
    const better = full
      .filter((name) => squash(name).length > key.length && squash(name).startsWith(key))
      .sort((a, b) => squash(b).length - squash(a).length)[0];
    if (better) line.name = better;
  });
}

function shareGain(lines: PhotoLine[], walletGain: number) {
  const open = lines.filter((line) => line.amount > 0 && line.gain == null && !isLiquidName(line.name));
  if (!open.length || lines.some((line) => line.gain != null)) return;
  const sum = open.reduce((total, line) => total + line.amount, 0);
  if (sum <= 0) return;
  let used = 0;
  open.forEach((line, index) => {
    if (index === open.length - 1) {
      line.gain = Math.round((walletGain - used) * 100) / 100;
      return;
    }
    const share = Math.round((walletGain * line.amount / sum) * 100) / 100;
    line.gain = share;
    used += share;
  });
}

export function looksLikeWallet(read: PhotoRead, text: string): boolean {
  if (!read.lines.length) return false;
  if (read.lines.some((line) => line.cash)) return true;
  if (read.accountId || read.preset) return true;
  if (read.lines.filter((line) => TICKER.test(line.name)).length >= 2) return true;
  return /\b(cripto|crypto|portfolio)\b/i.test(text) && read.lines.length >= 2;
}

export function readWalletText(text: string, accounts: PhotoAccount[]): PhotoRead {
  text = repairText(text);
  const moves = isMoveList(text);
  const guessed = moves ? null : findPreset(text);
  const account = moves ? null : findAccount(text, accounts);
  const walletName = account?.name || '';
  const group = account ? groupForKind(account.kind, account.name) : (guessed?.group || null);
  const lines: PhotoLine[] = [];
  let pending = '';
  let walletGain: number | null = null;
  let last: PhotoLine | null = null;
  let lastEuro = false;
  let skipped = false;
  const remember = (raw: string, amount: number, gain: number | null, euro = false, signedIn = false): PhotoLine | null => {
    let signedAmount = amount;
    if (LEAVING.test(raw) && signedAmount > 0) signedAmount = -signedAmount;
    else if (moves && !signedIn && !INCOMING.test(raw) && signedAmount > 0) signedAmount = -signedAmount;
    else if (moves && INCOMING.test(raw) && signedAmount < 0) signedAmount = Math.abs(signedAmount);
    const name = presentName(raw);
    if (!name || (walletName && fold(name) === fold(walletName))) return null;
    if (WALLET_GAIN.test(name)) {
      walletGain = gain ?? signedAmount;
      return null;
    }
    if (Math.abs(signedAmount) < 1 && (isCashName(name) || name === 'EUR' || name === 'USD')) return null;
    const line: PhotoLine = {
      name,
      amount: Math.round(signedAmount * 100) / 100,
      gain: gain == null ? null : Math.round(gain * 100) / 100,
      assetClass: classifyLine(name, group),
      cash: moves || undefined,
    };
    lines.push(line);
    lastEuro = euro;
    return line;
  };
  for (const chunk of text.split(/\n/)) {
    if (lines.length >= 40) break;
    if (/^--+$/.test(chunk.trim()) || chunk.trim() === '—') continue;
    if (/%/.test(chunk) && !/[€$]/.test(chunk) && !moneyHits(chunk).some((hit) => !hit.signed)) continue;
    const hits = moneyHits(chunk);
    const unsigned = hits.filter((hit) => !hit.signed);
    const euros = unsigned.filter((hit) => hit.euro).sort((a, b) => b.value - a.value);
    const plain = unsigned.filter((hit) => !hit.euro).sort((a, b) => b.value - a.value);
    const signed = hits.filter((hit) => hit.signed);
    const rawName = cleanName(chunk);
    const name = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(rawName) ? rawName : '';
    const valueHit = euros[0] || plain[0];
    const gainHit = signed[0];
    if (!hits.length && REJECTED.test(chunk)) {
      if (last?.cash) {
        lines.pop();
        last = lines[lines.length - 1] || null;
      }
      pending = '';
      continue;
    }
    if (!hits.length && moves && LEAVING.test(chunk) && last?.cash && last.amount > 0) {
      last.amount = -last.amount;
      pending = '';
      continue;
    }
    if (!hits.length && (DATE_LINE.test(chunk.trim()) || DATE_LINE.test(name))) {
      pending = '';
      continue;
    }
    if (name && NOISE.test(name)) {
      if (!valueHit && gainHit) walletGain = gainHit.value;
      skipped = true;
      pending = '';
      continue;
    }
    if (valueHit && name) {
      const created = remember(name, valueHit.value, gainHit ? gainHit.value : null, valueHit.euro, valueHit.signed);
      if (created) last = created;
      pending = '';
      skipped = false;
      continue;
    }
    if (!valueHit && gainHit && name) {
      const created = remember(name, gainHit.value, null, gainHit.euro, true);
      if (created) last = created;
      pending = '';
      skipped = false;
      continue;
    }
    if (!name && valueHit?.euro && last && !lastEuro && !moves) {
      last.amount = Math.round(valueHit.value * 100) / 100;
      if (gainHit) last.gain = Math.round(gainHit.value * 100) / 100;
      lastEuro = true;
      pending = '';
      continue;
    }
    if (!valueHit && gainHit && pending) {
      if (WALLET_GAIN.test(pending)) walletGain = gainHit.value;
      else if (moves || isLiquidName(pending) || LEAVING.test(pending) || INCOMING.test(pending)) {
        const created = remember(pending, gainHit.value, null, gainHit.euro, true);
        if (created) last = created;
      } else if (last && fold(last.name) === fold(presentName(pending) || '')) last.gain = Math.round(gainHit.value * 100) / 100;
      pending = '';
      skipped = false;
      continue;
    }
    if (!valueHit && gainHit && !name && skipped) {
      walletGain = gainHit.value;
      skipped = false;
      continue;
    }
    if (!valueHit && gainHit && !name && last && last.gain == null) {
      last.gain = Math.round(gainHit.value * 100) / 100;
      continue;
    }
    if (name && !valueHit && !gainHit) {
      if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(name)) continue;
      if (!walletName || fold(name) !== fold(walletName)) pending = name;
      skipped = false;
      continue;
    }
    if (valueHit && pending) {
      const created = remember(pending, valueHit.value, gainHit ? gainHit.value : null, valueHit.euro, valueHit.signed);
      if (created) last = created;
      pending = '';
      skipped = false;
    }
  }
  if (walletGain != null) shareGain(lines, walletGain);
  expandNames(lines);
  lines.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const readable = lines.length > 0;
  return {
    walletName: readable ? walletName : '',
    accountId: readable ? account?.id || null : null,
    preset: readable && !account ? guessed : null,
    lines,
  };
}
