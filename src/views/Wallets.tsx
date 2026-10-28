import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Minus, Plus, Search, Trash2, X } from 'lucide-react';
import { PlatformLogo } from '@/components/PlatformLogo';
import { SpendIcon } from '@/components/SpendIcon';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { OriginGlyph, OriginPicker } from '@/components/OriginMark';
import { formatDay, formatEur, formatNumber, formatPct, formatSignedEur } from '@/lib/format';
import { glide, jelly, quickOut, softSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { AccountProducts, ProductSection } from '@/lib/products';

export interface CarteraMove {
  at: string;
  spentEur: number;
  quantity: number;
}

export interface CarteraItem {
  id?: string;
  label: string;
  eur: number;
  detail?: string;
  image?: string | null;
  costEur?: number | null;
  group?: string;
  moves?: CarteraMove[];
  boughtOn?: string | null;
}

export interface CarteraSide {
  group: string;
  title: string;
  total: number;
  invested: number | null;
  gain: number | null;
  icon?: string;
  items: CarteraItem[];
}

export interface CashFlow {
  day: string;
  label: string;
  amount: number;
  key: string;
  surprise: boolean;
  absorbed?: boolean;
  open?: boolean;
  automatic?: boolean;
  image?: string;
}

export interface FixedRule {
  label: string;
  amount: number;
  rhythm: string;
  key?: string;
}

export interface CarteraAccount {
  key: string;
  name: string;
  logoName: string;
  value: number | null;
  gainEur?: number | null;
  gainPct?: number | null;
  cash: number;
  planId: string | null;
  flows: CashFlow[];
  fixed: FixedRule[];
  purchases?: { name: string; amount: number; date: string; image?: string | null }[];
  sides: CarteraSide[];
  products?: AccountProducts;
  sections?: string[];
  extras?: boolean;
  image?: string | null;
}

interface WalletEntry {
  _id: string;
  name: string;
  amount: number;
  date: string;
  direction: 'in' | 'out';
  origin: string;
  image?: string;
}

interface WalletRow {
  _id: string;
  accountId: string;
  entries: WalletEntry[];
}

interface FixedDraft {
  name: string;
  amount: string;
  direction: 'in' | 'out';
  rhythm: 'month' | 'weeks';
  dayOfMonth: string;
  everyWeeks: string;
  startDate: string;
}

interface EntryDraft {
  id: string | null;
  name: string;
  amount: string;
  date: string;
  direction: 'in' | 'out';
  origin: string;
  image: string;
  source: 'plan' | 'wallet';
  key: string;
  surprise: boolean;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function toneClass(value: number): string {
  if (value > 0) return 'text-[#16c784]';
  if (value < 0) return 'text-[#ea3943]';
  return 'text-slate-400';
}

function ItemPicture({ src, large, round, label }: { src?: string | null; large?: boolean; round?: boolean; label: string }) {
  const local = Boolean(src && (src.startsWith('https://') || src.startsWith('/')));
  const [visible, setVisible] = useState(local);
  if (!local || !visible || !src) return <SpendIcon label={label} />;
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setVisible(false)} className={cn('shrink-0 bg-white object-contain', round ? 'h-11 w-11 rounded-full border border-slate-200/80 p-1 dark:border-white/10' : 'rounded-xl', !round && (large ? 'h-28 w-44 p-1' : 'h-11 w-11 object-cover'))} />;
}

function money(value: number, hidden: boolean): string {
  return hidden ? '*****' : formatEur(value);
}

function SpentMark({ label, image }: { label: string; image?: string | null }) {
  return <OriginGlyph name={label} image={image} className="h-11 w-11" />;
}

interface Activity {
  id: string;
  day: string;
  label: string;
  note: string;
  amount: number;
  image?: string | null;
  checked?: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
}

export interface LinePoint {
  day: string;
  eur: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function matchesActivity(label: string, note: string, amount: number, query: string): boolean {
  const text = fold(query.trim());
  if (!text) return true;
  if (fold(label).includes(text) || fold(note).includes(text)) return true;
  const numeric = text.replace(/€/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(numeric)) return false;
  const abs = Math.abs(amount);
  const plain = abs.toFixed(2).replace('.', ',');
  return plain.startsWith(text) || String(abs).startsWith(numeric) || Math.abs(abs - Number(numeric)) < 0.001;
}

function cashPath(cash: number, events: { day: string; amount: number; absorbed?: boolean; open?: boolean }[], today: string): LinePoint[] {
  const ordered = [...events].filter((row) => !row.open).sort((a, b) => a.day.localeCompare(b.day));
  if (!ordered.length) return [];
  const absorbed = ordered.filter((row) => row.absorbed).reduce((sum, row) => sum + row.amount, 0);
  let balance = round2(cash - absorbed);
  const points: LinePoint[] = [{ day: ordered[0].day, eur: balance }];
  for (const row of ordered) {
    balance = round2(balance + row.amount);
    points.push({ day: row.day, eur: balance });
  }
  if (points[points.length - 1].day !== today) points.push({ day: today, eur: balance });
  return points;
}

function holdingPath(items: { day?: string | null; cost?: number | null; value: number }[], today: string): LinePoint[] {
  const dated = items.filter((item) => item.day).sort((a, b) => (a.day || '').localeCompare(b.day || ''));
  if (!dated.length) return [];
  let held = 0;
  const points: LinePoint[] = [{ day: dated[0].day || today, eur: 0 }];
  for (const item of dated) {
    const step = item.cost != null && item.cost > 0 ? item.cost : item.value;
    held = round2(held + step);
    points.push({ day: item.day || today, eur: held });
  }
  const now = round2(items.reduce((sum, item) => sum + item.value, 0));
  if (points[points.length - 1].day !== today || points[points.length - 1].eur !== now) points.push({ day: today, eur: now });
  return points;
}

function groupIcon(group: string): string {
  if (group === 'crypto') return '/markets/crypto.svg';
  if (group === 'stock') return '/markets/stock.svg';
  if (group === 'etf' || group === 'valores') return '/markets/etf.svg';
  if (group === 'personal_good') return '/platforms/cs2.svg';
  if (group === 'cash') return '/platforms/efectivo.svg';
  return '/extras/objeto.svg';
}

function smoothPath(xy: [number, number][]): string {
  const n = xy.length;
  const h = xy.slice(1).map(([x], index) => x - xy[index][0]);
  const s = xy.slice(1).map(([, y], index) => (h[index] ? (y - xy[index][1]) / h[index] : 0));
  const m = xy.map((_, index) => {
    if (index === 0) return s[0];
    if (index === n - 1) return s[n - 2];
    const s0 = s[index - 1];
    const s1 = s[index];
    if (s0 * s1 <= 0) return 0;
    const p = (s0 * h[index] + s1 * h[index - 1]) / (h[index - 1] + h[index]);
    return Math.sign(s0) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) * 2;
  });
  let d = `M${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
  for (let index = 0; index < n - 1; index += 1) {
    const [x0, y0] = xy[index];
    const [x1, y1] = xy[index + 1];
    const step = h[index] / 3;
    d += ` C${(x0 + step).toFixed(1)} ${(y0 + m[index] * step).toFixed(1)} ${(x1 - step).toFixed(1)} ${(y1 - m[index + 1] * step).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

const MONTH = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' });

function monthTicks(t0: number, t1: number): { at: number; label: string }[] {
  const out: { at: number; label: string }[] = [];
  const start = new Date(t0);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const months: number[] = [];
  while (cursor.getTime() <= t1) {
    months.push(cursor.getTime());
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const step = Math.max(1, Math.ceil(months.length / 5));
  months.forEach((time, index) => {
    if (index % step !== 0) return;
    const date = new Date(time);
    const label = MONTH.format(date).replace('.', '');
    out.push({ at: time, label: date.getUTCMonth() === 0 ? `${label} ${String(date.getUTCFullYear()).slice(2)}` : label });
  });
  return out;
}

const KNOWN_ACCENT: Record<string, string> = {
  bitcoin: '#f7931a',
  btc: '#f7931a',
  ethereum: '#627eea',
  eth: '#627eea',
  solana: '#9945ff',
  sol: '#9945ff',
  cardano: '#0033ad',
  ada: '#0033ad',
  ripple: '#23292f',
  xrp: '#23292f',
  dogecoin: '#c2a633',
  doge: '#c2a633',
};
const ACCENT_PALETTE = ['#f7931a', '#627eea', '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#f43f5e', '#6366f1', '#84cc16'];

function accentFor(label: string): string {
  const key = label.trim().toLowerCase();
  if (KNOWN_ACCENT[key]) return KNOWN_ACCENT[key];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

export function CashChart({ points, now, hidden, base = null, label, showPct = false, beside = false, tall = false, plain = false, quiet = false, tone, beforePlot, onValue, onDay, emptyText = 'La gráfica aparece con el primer movimiento.' }: { points: LinePoint[]; now: number; hidden: boolean; base?: number | null; label?: string; showPct?: boolean; beside?: boolean; tall?: boolean; plain?: boolean; quiet?: boolean; tone?: 'ink' | string; beforePlot?: ReactNode; onValue?: (eur: number) => void; onDay?: (day: string | null) => void; emptyText?: string }) {
  const fillId = `fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const pastId = `${fillId}-past`;
  const futureId = `${fillId}-future`;
  const tailId = `${fillId}-tail`;
  const guideId = `${fillId}-guide`;
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const pressed = useRef(false);
  useEffect(() => {
    if (!box) return;
    const watch = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    watch.observe(box);
    return () => watch.disconnect();
  }, [box]);
  const byDay = new Map<string, number>();
  for (const point of points) byDay.set(point.day.slice(0, 10), point.eur);
  const line = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, eur]) => ({ day, eur }));
  const height = plain ? 300 : tall ? 228 : 168;
  const still = stillMotion();
  const enough = line.length >= 2 && width > 0;
  const times = line.map((point) => Date.parse(`${point.day}T00:00:00Z`));
  const t0 = times[0] ?? 0;
  const tSpan = (times[times.length - 1] ?? 0) - t0 || 1;
  const values = line.map((point) => point.eur);
  const reference = base != null && base > 0 ? base : null;
  const low = Math.min(...values, ...(reference != null ? [reference] : []));
  const high = Math.max(...values, ...(reference != null ? [reference] : []));
  const pad = (high - low || Math.max(1, Math.abs(high) * 0.1)) * 0.12;
  const top = high + pad;
  const bottom = low - pad;
  const xy: [number, number][] = line.map((point, index) => [
    ((times[index] - t0) / tSpan) * width,
    height - ((point.eur - bottom) / (top - bottom)) * height,
  ]);
  const d = enough ? smoothPath(xy) : '';
  const area = enough ? `${d} L${width} ${height} L0 ${height} Z` : '';
  const first = reference ?? line[0]?.eur ?? now;
  const focus = active != null ? line[active] : null;
  const value = focus ? focus.eur : now;
  const change = value - first;
  const pct = first > 0 ? (change / first) * 100 : null;
  const up = (line[line.length - 1]?.eur ?? now) >= first;
  const baseY = enough ? height - ((first - bottom) / (top - bottom)) * height : 0;
  const ticks = enough ? monthTicks(t0, t0 + tSpan) : [];
  const lined = Boolean(tone);
  const accent = tone && tone !== 'ink' ? tone : null;
  const color = accent || (up ? '#16c784' : '#ea3943');
  const stroke = lined && !accent ? 'currentColor' : color;
  const mark = active != null ? xy[active] : xy[xy.length - 1];
  const cut = active != null ? mark?.[0] ?? null : null;
  const pick = (clientX: number) => {
    if (!box || !enough) return;
    const rect = box.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    let best = 0;
    xy.forEach(([px], index) => {
      if (Math.abs(px - x) < Math.abs(xy[best][0] - x)) best = index;
    });
    setActive(best);
  };
  const shownDay = focus?.day || line[line.length - 1]?.day || null;
  useEffect(() => { onValue?.(value); }, [onValue, value]);
  useEffect(() => { if (shownDay) onDay?.(shownDay); }, [onDay, shownDay]);
  return (
    <div>
      {quiet ? (
        label ? <p className="text-sm font-medium text-slate-400">{label}</p> : null
      ) : beside ? (
        <div>
          {(label || focus) && <p className="mb-1 text-sm font-medium text-slate-400">{focus ? formatDay(focus.day) : label}</p>}
          <p className="flex items-baseline gap-2">
            <span className="text-[34px] font-black leading-none tracking-tight tabular-nums">{money(value, hidden)}</span>
            {pct != null && (line.length >= 2 || reference != null) && (
              <span className={cn('text-base font-black tabular-nums', toneClass(change))}>
                {up ? '▲' : '▼'} {hidden ? '*****' : formatPct(Math.abs(pct)).replace(/^[+-]/, '')}
              </span>
            )}
          </p>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-3">
          <div>
            {label && <p className="mb-1.5 text-sm font-semibold text-slate-400">{focus ? formatDay(focus.day) : label}</p>}
            <p className={cn('font-black leading-none tabular-nums', label ? 'text-[34px] tracking-tight' : 'text-[28px]')}>{money(value, hidden)}</p>
          </div>
          {(line.length >= 2 || reference != null) && (
            <p className={cn('text-right text-xs font-black tabular-nums', toneClass(change))}>
              {hidden ? '*****' : formatSignedEur(change)}
              {pct != null && (reference != null || showPct) && <span className="ml-1">{hidden ? '' : formatPct(pct)}</span>}
              <span className="block font-semibold text-slate-400">{focus ? formatDay(focus.day) : reference != null ? 'desde la compra' : `desde ${formatDay(line[0].day)}`}</span>
            </p>
          )}
        </div>
      )}
      {beforePlot}
      <div
        ref={setBox}
        className={cn('relative select-none', plain ? '-mx-5 mt-1' : 'mt-4')}
        style={{ height: enough || width === 0 ? height : 48, touchAction: 'pan-y' }}
        onPointerDown={(event) => { pressed.current = true; pick(event.clientX); try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* un puntero sintético no se puede capturar */ } }}
        onPointerMove={(event) => { if (pressed.current) pick(event.clientX); }}
        onPointerUp={() => { pressed.current = false; setActive(null); }}
        onPointerCancel={() => { pressed.current = false; setActive(null); }}
      >
        {enough ? (
          <>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn('absolute inset-0 overflow-visible', lined && !accent && 'text-slate-950 dark:text-white')} aria-label="Cómo ha ido el valor">
              <defs>
                <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
                <clipPath id={pastId}>
                  <rect x={-24} y={-24} width={(cut ?? width) + 26} height={height + 48} />
                </clipPath>
                <clipPath id={futureId}>
                  <rect x={cut ?? width} y={-24} width={Math.max(0, width - (cut ?? width)) + 24} height={height + 48} />
                </clipPath>
                <linearGradient id={tailId} gradientUnits="userSpaceOnUse" x1={cut ?? 0} x2={(cut ?? 0) + 72} y1="0" y2="0">
                  <stop offset="0%" stopColor={stroke} stopOpacity="0.55" />
                  <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
                <linearGradient id={guideId} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2={height}>
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                  <stop offset="16%" stopColor="currentColor" stopOpacity="0.35" />
                  <stop offset="84%" stopColor="currentColor" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1={0} x2={width} y1={baseY} y2={baseY} stroke="currentColor" strokeOpacity={lined ? 0.16 : 0.22} strokeDasharray="1 5" strokeLinecap="round" className="text-slate-400 dark:text-white" />
              {!lined && !plain && (
                <motion.path
                  d={area}
                  fill={`url(#${fillId})`}
                  clipPath={cut != null ? `url(#${pastId})` : undefined}
                  initial={still ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
              <motion.path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={lined ? 1.75 : 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                clipPath={cut != null ? `url(#${pastId})` : undefined}
                initial={still ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.3, ease: [0.65, 0, 0.35, 1] }}
              />
              {cut != null && (
                <path
                  d={d}
                  fill="none"
                  stroke={`url(#${tailId})`}
                  strokeWidth={lined ? 1.75 : 2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  clipPath={`url(#${futureId})`}
                />
              )}
              {active != null && mark && <line x1={mark[0]} x2={mark[0]} y1={0} y2={height} stroke={`url(#${guideId})`} strokeWidth={1} className="text-slate-500 dark:text-white" />}
            </svg>
            {mark && !plain && (!lined || active != null) && (
              <motion.span
                aria-hidden
                className={cn('pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white dark:border-slate-900', lined && !accent && 'bg-slate-950 dark:bg-white')}
                style={{ left: mark[0], top: mark[1], background: lined && !accent ? undefined : color }}
                initial={still ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...jelly, delay: active != null || still ? 0 : 1.25 }}
              >
                {active == null && !still && (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ background: color }}
                    animate={{ scale: [1, 2.6], opacity: [0.45, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, delay: 1.6, ease: 'easeOut' }}
                  />
                )}
              </motion.span>
            )}
          </>
        ) : (
          <p className="pt-4 text-center text-xs font-medium text-slate-400">{line.length < 2 ? emptyText : ''}</p>
        )}
      </div>
      {enough && !plain && (
        <div className="relative mt-2 h-4 text-[11px] font-semibold text-slate-400">
          {ticks.map((tick) => {
            const x = ((tick.at - t0) / tSpan) * width;
            if (x < 14 || x > width - 14) return null;
            const gone = cut != null ? Math.min(1, Math.max(0, (x - cut) / 64)) : 0;
            return <span key={tick.at} className="absolute -translate-x-1/2" style={{ left: x, opacity: 1 - gone }}>{tick.label}</span>;
          })}
        </div>
      )}
    </div>
  );
}

function useSeries(accountKey: string | null, group: string, holdingId: string | null = null): LinePoint[] | null {
  const [points, setPoints] = useState<LinePoint[] | null>(null);
  useEffect(() => {
    setPoints(null);
    if (!accountKey) return;
    let cancelled = false;
    const holding = holdingId ? `&holdingId=${encodeURIComponent(holdingId)}` : '';
    api<{ points: LinePoint[] }>(`/api/wallets/series?accountId=${encodeURIComponent(accountKey)}&group=${encodeURIComponent(group)}${holding}`)
      .then((data) => { if (!cancelled) setPoints(data.points || []); })
      .catch(() => { if (!cancelled) setPoints([]); });
    return () => { cancelled = true; };
  }, [accountKey, group, holdingId]);
  return points;
}

function GainTag({ value, cost, mode, hidden }: { value: number; cost?: number | null; mode: 'eur' | 'pct'; hidden: boolean }) {
  if (cost == null || !(cost > 0)) return <span className="shrink-0 text-sm font-black text-slate-300">—</span>;
  const gain = value - cost;
  const up = gain >= 0;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-[15px] font-black tabular-nums', toneClass(gain))}>
      <span className="text-[11px]">{up ? '▲' : '▼'}</span>
      {hidden ? '*****' : mode === 'eur' ? formatEur(Math.abs(gain)) : formatPct(Math.abs((gain / cost) * 100)).replace(/^[+-]/, '')}
    </span>
  );
}

function CashDock({ onSearch, onIn, onOut }: { onSearch: () => void; onIn: () => void; onOut: () => void }) {
  const [open, setOpen] = useState(false);
  const still = stillMotion();
  const pill = 'flex items-center justify-between gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-bold shadow-[0_10px_30px_rgba(15,23,42,0.14)]';
  const actions = [
    { label: 'Ingresar', Icon: Plus, run: onIn },
    { label: 'Enviar', Icon: Minus, run: onOut },
  ];
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: 'calc(max(1rem, env(safe-area-inset-bottom)) + 4.4rem)' }}>
      <AnimatePresence>
        {open && (
          <motion.div
            key="veil"
            className="pointer-events-auto fixed inset-0 bg-white/50 backdrop-blur-[3px] dark:bg-black/50"
            onClick={() => setOpen(false)}
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: quickOut }}
          />
        )}
      </AnimatePresence>
      <motion.div
        className="pointer-events-auto relative grid w-full max-w-md grid-cols-2 gap-3"
        initial={still ? false : { opacity: 0, y: 28, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={still ? { duration: 0 } : jelly}
      >
        <button type="button" onClick={onSearch} className={cn(pill, 'border border-slate-200/80 bg-white/95 text-slate-900 backdrop-blur dark:border-white/10 dark:bg-slate-900/95 dark:text-white')}>
          Buscar <Search size={17} />
        </button>
        <div className="relative flex justify-end">
          <AnimatePresence>
            {open && (
              <div className="absolute bottom-full right-0 mb-3 w-full space-y-2.5">
                {actions.map(({ label, Icon, run }, index) => (
                  <motion.button
                    key={label}
                    type="button"
                    onClick={() => { setOpen(false); run(); }}
                    initial={still ? false : { opacity: 0, y: 18, scale: 0.86 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={still ? undefined : { opacity: 0, y: 12, scale: 0.92, transition: quickOut }}
                    transition={{ ...jelly, delay: still ? 0 : (actions.length - 1 - index) * 0.05 }}
                    style={{ transformOrigin: 'bottom right' }}
                    className={cn(pill, 'w-full border border-slate-200/80 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white')}
                  >
                    {label} <Icon size={17} />
                  </motion.button>
                ))}
              </div>
            )}
          </AnimatePresence>
          <motion.button
            type="button"
            layout
            aria-expanded={open}
            aria-label={open ? 'Cerrar' : 'Transferir'}
            onClick={() => setOpen(!open)}
            transition={still ? { duration: 0 } : jelly}
            className={cn(pill, 'bg-slate-950 text-white dark:bg-white dark:text-slate-950', open ? 'w-[3.25rem] justify-center px-0' : 'w-full')}
          >
            {open ? <X size={18} /> : <>Transferir <ChevronRight size={17} /></>}
          </motion.button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function PairDock({ onSearch, onMoves }: { onSearch: () => void; onMoves: () => void }) {
  const still = stillMotion();
  const pill = 'flex items-center justify-between gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-bold shadow-[0_10px_30px_rgba(15,23,42,0.14)]';
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: 'calc(max(1rem, env(safe-area-inset-bottom)) + 4.4rem)' }}>
      <motion.div
        className="pointer-events-auto grid w-full max-w-md grid-cols-2 gap-3"
        initial={still ? false : { opacity: 0, y: 28, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={still ? { duration: 0 } : jelly}
      >
        <button type="button" onClick={onSearch} className={cn(pill, 'border border-slate-200/80 bg-white/95 text-slate-900 backdrop-blur dark:border-white/10 dark:bg-slate-900/95 dark:text-white')}>
          Buscar <Search size={17} />
        </button>
        <button type="button" onClick={onMoves} className={cn(pill, 'bg-slate-950 text-white dark:bg-white dark:text-slate-950')}>
          Transacciones <ChevronRight size={17} />
        </button>
      </motion.div>
    </div>,
    document.body,
  );
}

function ActivityList({ rows, hidden, mode, autoFocus = false }: { rows: Activity[]; hidden: boolean; mode: 'peek' | 'all'; autoFocus?: boolean }) {
  const [query, setQuery] = useState('');
  const matched = rows.filter((row) => matchesActivity(row.label, row.note, row.amount, query));
  const shown = mode === 'all' ? matched : rows.slice(0, 8);
  const fade = mode === 'peek' && shown.length >= 4;
  const still = stillMotion();
  const className = 'flex w-full items-center gap-3 border-t border-slate-200/70 py-2.5 text-left first:border-t-0 dark:border-white/10';
  return (
    <div>
      {mode === 'all' && (
        <motion.label
          className="mb-1 flex items-center gap-2 py-2"
          initial={still ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={still ? { duration: 0 } : jelly}
        >
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar"
            autoFocus={autoFocus}
            className="w-full bg-transparent text-[17px] font-semibold outline-none placeholder:font-medium placeholder:text-slate-300"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="squishy is-jelly grid h-7 w-7 shrink-0 place-items-center text-slate-400">
              <X size={16} />
            </button>
          )}
        </motion.label>
      )}
      <div className={fade ? '[-webkit-mask-image:linear-gradient(to_bottom,#000_0,#000_calc(100%-9rem),transparent)] [mask-image:linear-gradient(to_bottom,#000_0,#000_calc(100%-9rem),transparent)]' : undefined}>
        <ul>
          <AnimatePresence initial={false}>
          {shown.length === 0 && <motion.li key="empty" initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: quickOut }} transition={glide} className="py-2 text-sm font-medium text-slate-400">{rows.length === 0 ? 'Todavía no hay transacciones.' : 'Ninguna transacción coincide.'}</motion.li>}
          {shown.map((row, index) => {
            const body = (
              <>
                <SpentMark label={row.label} image={row.image} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{row.label}</span>
                  <span className="block truncate text-[11px] font-medium text-slate-400">{row.note}</span>
                </span>
                <span className={cn('shrink-0 text-sm font-black tabular-nums', row.amount > 0 ? 'text-[#16c784]' : row.amount < 0 ? 'text-[#ea3943]' : 'text-slate-400')}>
                  {hidden ? '*****' : formatSignedEur(row.amount)}
                </span>
              </>
            );
            const mark = row.onToggle ? (
              <button
                type="button"
                aria-pressed={row.checked === true}
                aria-label={row.checked ? `Quitar marca de ${row.label}` : `Marcar ${row.label}`}
                onClick={row.onToggle}
                className={cn('grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 bg-white dark:bg-transparent', row.checked ? 'border-[#16c784] bg-[#16c784] text-white dark:bg-[#16c784]' : 'border-slate-300 text-transparent dark:border-slate-500')}
              >
                <Check size={13} strokeWidth={3} />
              </button>
            ) : null;
            return (
              <motion.li
                key={row.id}
                layout={mode === 'all'}
                initial={still ? false : { opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={still ? undefined : { opacity: 0, scale: 0.96, transition: quickOut }}
                transition={{ ...glide, delay: query ? 0 : Math.min(index, 8) * 0.03 }}
              >
                <div className={className}>
                  {mark}
                  {row.onOpen ? (
                    <button type="button" onClick={row.onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">{body}</button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
                  )}
                </div>
              </motion.li>
            );
          })}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

const paneMove = glide;

function stillMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function PaneSwitch({ tabs, value, onChange }: { tabs: { id: 0 | 1; label: string }[]; value: 0 | 1; onChange: (next: 0 | 1) => void }) {
  const still = stillMotion();
  return (
    <div className="grid shrink-0 grid-cols-2 rounded-full bg-slate-900/5 p-0.5 dark:bg-white/10">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.id)}
            className={cn('relative rounded-full px-3 py-1 text-[13px] font-bold', active ? 'text-white dark:text-slate-900' : 'text-slate-500')}
          >
            {active && <motion.span layoutId="wallet-pane-pill" transition={still ? { duration: 0 } : softSpring} className="pointer-events-none absolute inset-0 rounded-full bg-slate-900 dark:bg-white" />}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface PageGroup {
  group: string;
  title: string;
  total: number;
  invested: number | null;
  gain: number | null;
  items: CarteraItem[];
  icon: string;
  hint: string;
  empty: boolean;
}

const SERIES_OF: Record<string, string> = { crypto: 'crypto', etf: 'valores', stock: 'valores', personal_good: 'personal_good' };

type RangeId = '1S' | '1M' | '1A' | 'MAX';
const RANGES: { id: RangeId; label: string; days: number | null }[] = [
  { id: '1S', label: '1S', days: 7 },
  { id: '1M', label: '1M', days: 30 },
  { id: '1A', label: '1A', days: 365 },
  { id: 'MAX', label: 'Máx', days: null },
];

function inRange(points: LinePoint[], range: RangeId): LinePoint[] {
  const days = RANGES.find((item) => item.id === range)?.days;
  if (!days || points.length < 2) return points;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const kept = points.filter((point) => point.day.slice(0, 10) >= cutoff);
  return kept.length >= 2 ? kept : points.slice(-2);
}

function RangeTabs({ value, onChange }: { value: RangeId; onChange: (next: RangeId) => void }) {
  return (
    <div className="mt-2 flex justify-between">
      {RANGES.map((item) => {
        const on = item.id === value;
        return (
          <button key={item.id} type="button" aria-pressed={on} onClick={() => onChange(item.id)} className={cn('px-1 py-1 text-[15px] transition-colors', on ? 'font-black text-slate-950 dark:text-white' : 'font-semibold text-slate-300 dark:text-slate-600')}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

const card = 'rounded-[24px] border border-white/70 bg-white/80 p-4 dark:border-white/10 dark:bg-white/10';

export function Wallets({ accounts, hidden, beat = 0, openId, paneSlot = null, onOpen, onAdd, onSections, onSaved, onKeep, onEditExtra, onFigure, onDay }: { accounts: CarteraAccount[]; hidden: boolean; beat?: number; openId: string | null; paneSlot?: HTMLElement | null; onOpen: (id: string | null) => void; onAdd?: (accountKey: string, section?: string) => void; onSections?: (accountKey: string, sections: string[]) => Promise<void>; onSaved?: () => Promise<void> | void; onKeep?: (name: string, amount: number) => void; onEditExtra?: (id: string) => void; onFigure?: (amount: number | null) => void; onDay?: (day: string | null) => void }) {
  const [notes, setNotes] = useState<WalletRow[]>([]);
  const [error, setError] = useState('');
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [entryMore, setEntryMore] = useState(false);
  const [fixedDraft, setFixedDraft] = useState<FixedDraft | null>(null);
  const [ledger, setLedger] = useState<null | 'cash' | 'moves'>(null);
  const [detail, setDetail] = useState<{ label: string; note: string; amount: number; image?: string | null } | null>(null);
  const [pane, setPane] = useState<0 | 1>(0);
  const [switching, setSwitching] = useState('');
  const [focus, setFocus] = useState('all');
  const [range, setRange] = useState<RangeId>('MAX');
  const [picking, setPicking] = useState(false);
  const [searching, setSearching] = useState(false);
  const [gainMode, setGainMode] = useState<'eur' | 'pct'>('eur');
  const [asset, setAsset] = useState<CarteraItem | null>(null);
  const [live, setLive] = useState<number | null>(null);

  const load = async () => {
    const data = await api<{ wallets: WalletRow[] }>('/api/wallets');
    setNotes(data.wallets);
  };

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const pull = (attempt: number) => {
      api<{ wallets: WalletRow[] }>('/api/wallets')
        .then((data) => {
          if (cancelled) return;
          setNotes(data.wallets);
          setError('');
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const status = err instanceof ApiError ? err.status : 0;
          const message = err instanceof Error ? err.message : 'No se ha podido completar.';
          if ((status === 0 || status >= 500) && attempt < 6) {
            timer = window.setTimeout(() => pull(attempt + 1), Math.min(2000, 350 * (attempt + 1)));
            return;
          }
          setError(message);
        });
    };
    pull(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!ledger) setSearching(false);
  }, [ledger]);

  useEffect(() => {
    setLedger(null);
    setDetail(null);
    const opened = accounts.find((account) => account.key === openId);
    const opensCash = Boolean(opened && !opened.extras && opened.sides.some((side) => side.group === 'cash'));
    setPane(opensCash ? 0 : 1);
    setFocus('all');
    setAsset(null);
    setLive(null);
    setRange('MAX');
    setPicking(false);
  }, [openId]);

  const current = accounts.find((account) => account.key === openId) || null;
  const book = notes.find((wallet) => String(wallet.accountId) === openId);
  const lines = [...(book?.entries || [])].sort((a, b) => b.date.localeCompare(a.date) || b._id.localeCompare(a._id));
  const statement = (() => {
    if (!current) return [];
    const rows = [
      ...(current.flows || []).map((flow) => ({
        id: `plan:${flow.key}`,
        day: flow.day.slice(0, 10),
        label: flow.label,
        name: flow.label,
        origin: '',
        amount: flow.amount,
        source: 'plan' as const,
        key: flow.key,
        surprise: flow.surprise,
        absorbed: flow.absorbed === true,
        open: flow.open === true,
        automatic: flow.automatic === true,
        image: flow.image || null,
      })),
      ...(current.purchases || []).map((item) => ({
        id: `buy:${item.date}:${item.name}`,
        day: item.date.slice(0, 10),
        label: item.name,
        name: item.name,
        origin: '',
        amount: item.amount,
        source: 'plan' as const,
        key: '',
        surprise: false,
        absorbed: true,
        open: false,
        automatic: false,
        image: item.image || null,
      })),
      ...lines.map((line) => ({
        id: line._id,
        day: line.date.slice(0, 10),
        label: line.origin ? `${line.name} · ${line.origin}` : line.name,
        name: line.name,
        origin: line.origin || '',
        amount: line.direction === 'in' ? line.amount : -line.amount,
        source: 'wallet' as const,
        key: '',
        surprise: true,
        absorbed: false,
        open: false,
        automatic: false,
        image: line.image || null,
      })),
    ].sort((a, b) => a.day.localeCompare(b.day) || a.label.localeCompare(b.label));
    let balance = current.cash;
    const walked = rows.map((row) => {
      if (!row.absorbed && !row.open) balance = Math.round((balance + row.amount) * 100) / 100;
      return { ...row, balance };
    });
    return walked.sort((a, b) => b.day.localeCompare(a.day) || a.label.localeCompare(b.label));
  })();
  const cashSide = current?.sides.find((side) => side.group === 'cash') ?? null;
  const hasCash = Boolean(cashSide && current && !current.extras);
  const investmentSides = (current?.sides || []).filter((side) => side.group !== 'cash' && side.items.length > 0);
  const detailSides = current?.extras ? current.sides : investmentSides;
  const products = current?.products;
  const catalog: ProductSection[] = (products?.sections || []).filter((section, index, list) => list.findIndex((item) => item.id === section.id) === index);
  const saved = current?.sections || [];
  const used = new Set(investmentSides.map((side) => side.group));
  const shelf: { section: ProductSection | null; side: CarteraSide | null; key: string }[] = products?.auto
    ? investmentSides.map((side) => ({ section: catalog.find((item) => item.id === side.group) || null, side, key: side.group }))
    : [
      ...catalog.filter((section) => used.has(section.id) || saved.includes(section.id)).map((section) => ({ section, side: investmentSides.find((side) => side.group === section.id) || null, key: section.id })),
      ...investmentSides.filter((side) => !catalog.some((section) => section.id === side.group)).map((side) => ({ section: null, side, key: side.group })),
    ];
  const hasPortfolio = !current?.extras && (catalog.length > 0 || investmentSides.length > 0);
  const split = hasCash && hasPortfolio;
  const showCash = hasCash && (!split || pane === 0);
  const showPortfolio = Boolean(current) && (current?.extras || (hasPortfolio && (!hasCash || pane === 1)));
  const portfolioTotal = investmentSides.reduce((sum, side) => sum + side.total, 0);
  const portfolioInvested = investmentSides.reduce((sum, side) => sum + (side.invested || 0), 0);
  const extraItems = current?.extras ? current.sides.flatMap((side) => side.items) : [];
  const extraCost = extraItems.length > 0 && extraItems.every((item) => item.costEur != null) ? extraItems.reduce((sum, item) => sum + (item.costEur || 0), 0) : null;
  const groups: PageGroup[] = current?.extras
    ? []
    : shelf.map(({ side, section }) => side
      ? { ...side, icon: section?.icon || side.icon || groupIcon(side.group), hint: '', empty: false }
      : { group: section?.id || '', title: section?.label || '', total: 0, invested: null, gain: null, items: [], icon: section?.icon || groupIcon(section?.id || ''), hint: section?.hint || '', empty: true });
  const known = new Map(groups.map((group) => [group.group, group]));
  const listed: PageGroup[] = products?.auto
    ? groups
    : [
      ...catalog.map((section) => known.get(section.id) || { group: section.id, title: section.label, total: 0, invested: null, gain: null, items: [], icon: section.icon, hint: section.hint, empty: true }),
      ...groups.filter((group) => !catalog.some((section) => section.id === group.group)),
    ];
  const page: PageGroup | null = current?.extras
    ? { group: 'extras', title: 'Total', total: extraItems.reduce((sum, item) => sum + item.eur, 0), invested: extraCost, gain: extraCost == null ? null : extraItems.reduce((sum, item) => sum + item.eur, 0) - extraCost, items: extraItems, icon: '', hint: '', empty: false }
    : listed.find((group) => group.group === focus) || null;
  const pageSeriesKey = (() => {
    if (!page || page.empty || current?.extras) return null;
    const keys = new Set(page.items.map((item) => SERIES_OF[item.group || ''] || ''));
    if (keys.size !== 1 || keys.has('')) return null;
    const key = [...keys][0];
    const shared = investmentSides.some((side) => side.group !== page.group && side.items.some((item) => SERIES_OF[item.group || ''] === key));
    return shared ? null : key;
  })();
  const pageSeries = useSeries(pageSeriesKey && current ? current.key : null, pageSeriesKey || '');
  const ownPath = page ? holdingPath(page.items.map((item) => ({ day: item.boughtOn, cost: item.costEur, value: item.eur })), todayKey()) : null;
  const pagePoints = pageSeriesKey ? (pageSeries && pageSeries.length < 2 && (ownPath?.length || 0) >= 2 ? ownPath : pageSeries) : ownPath;
  const rangedPoints = pagePoints ? inRange(pagePoints, range) : null;
  const assetGroup = asset ? (SERIES_OF[asset.group || ''] || pageSeriesKey || 'all') : '';
  const assetSeries = useSeries(asset && current && !current.extras ? current.key : null, assetGroup || 'all', asset?.id || null);
  const assetOwn = asset ? holdingPath([{ day: asset.boughtOn, cost: asset.costEur, value: asset.eur }], todayKey()) : null;
  const assetPoints = assetSeries && assetSeries.length >= 2 ? assetSeries : assetOwn;
  const assetRanged = assetPoints ? inRange(assetPoints, range) : null;
  const inventory = Boolean(products?.auto);
  const skinItems = inventory ? groups.flatMap((group) => group.items) : [];
  const totalSeries = useSeries(current && !current.extras && !inventory && !page ? current.key : null, 'all');
  const totalOwn = holdingPath(investmentSides.flatMap((side) => side.items).map((item) => ({ day: item.boughtOn, cost: item.costEur, value: item.eur })), todayKey());
  const totalPoints = totalSeries && totalSeries.length >= 2 ? totalSeries : totalOwn;
  const totalRanged = totalPoints.length >= 2 ? inRange(totalPoints, range) : null;
  const figure = asset ? (live ?? asset.eur) : page ? (live ?? page.total) : showCash && cashSide ? (live ?? cashSide.total) : showPortfolio ? (live ?? portfolioTotal) : null;
  useEffect(() => { onFigure?.(figure); }, [figure, onFigure]);
  useEffect(() => { if (!current || ledger) onDay?.(null); }, [current, ledger, onDay]);
  useEffect(() => {
    if (current?.extras || (!asset && !page)) return;
    const scroller = document.querySelector('.app-scroll');
    if (!(scroller instanceof HTMLElement)) return;
    let startX = 0;
    let startY = 0;
    let armed = false;
    const start = (event: TouchEvent) => {
      armed = scroller.scrollTop <= 1;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };
    const end = (event: TouchEvent) => {
      if (!armed) return;
      const dy = event.changedTouches[0].clientY - startY;
      const dx = event.changedTouches[0].clientX - startX;
      if (dy > 88 && dy > Math.abs(dx) * 1.4 && scroller.scrollTop <= 2) {
        setLive(null);
        if (asset) setAsset(null);
        else setFocus('all');
      }
    };
    scroller.addEventListener('touchstart', start, { passive: true });
    scroller.addEventListener('touchend', end);
    return () => {
      scroller.removeEventListener('touchstart', start);
      scroller.removeEventListener('touchend', end);
    };
  }, [asset, page?.group, current?.extras]);
  const toggleSection = async (id: string, on: boolean) => {
    if (!current || !onSections || switching) return;
    setSwitching(id);
    setError('');
    try {
      await onSections(current.key, on ? [...new Set([...saved, id])] : saved.filter((item) => item !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido cambiar el apartado.');
    } finally {
      setSwitching('');
    }
  };
  const openEntry = (direction: 'in' | 'out') => {
    if (!current) return;
    setEntryMore(false);
    setEntryDraft({ id: null, name: '', amount: '', date: todayKey(), direction, origin: '', image: '', source: current.planId ? 'plan' : 'wallet', key: '', surprise: true });
  };
  const positionMoves = detailSides
    .filter((side) => side.group !== 'cash')
    .flatMap((side) => side.items.flatMap((item) => (item.moves || []).map((move) => ({ ...move, label: item.label, image: item.image }))))
    .sort((a, b) => b.at.localeCompare(a.at) || a.label.localeCompare(b.label));
  const cashRows: Activity[] = statement.map((row) => {
    const note = row.absorbed ? `${formatDay(row.day)} · ${row.open ? 'Falta confirmarlo' : 'ya en el efectivo'}` : `${formatDay(row.day)} · queda ${money(row.balance, hidden)}`;
    return {
      id: row.id,
      day: row.day,
      label: row.label,
      note,
      amount: row.amount,
      image: row.image,
      onOpen: () => {
        if (row.source === 'wallet' || row.key) {
          setEntryMore(true);
          setEntryDraft({
            id: row.source === 'wallet' ? row.id : null,
            name: row.name,
            amount: String(Math.abs(row.amount)),
            date: row.day,
            direction: row.amount >= 0 ? 'in' : 'out',
            origin: row.origin,
            image: row.image || '',
            source: row.source,
            key: row.key,
            surprise: row.surprise,
          });
          return;
        }
        setDetail({ label: row.label, note, amount: row.amount, image: row.image });
      },
    };
  });
  const moveRows: Activity[] = (positionMoves.length > 0
    ? positionMoves.map((move) => ({
      id: `${move.label}:${move.at}:${move.spentEur}`,
      day: move.at.slice(0, 10),
      label: move.label,
      note: `${formatDay(move.at)} · ${formatNumber(move.quantity, 8)}`,
      amount: -move.spentEur,
      image: move.image,
    }))
    : detailSides.flatMap((side) => side.items).filter((item) => item.costEur != null && item.costEur > 0).map((item) => ({
      id: item.id || item.label,
      day: '',
      label: item.label,
      note: 'Lo metido',
      amount: -(item.costEur || 0),
      image: item.image,
    }))
  ).map((row) => ({
    ...row,
    onOpen: () => setDetail({ label: row.label, note: row.note, amount: row.amount, image: row.image }),
  }));
  const pageMoves = page && !current?.extras ? moveRows.filter((row) => page.items.some((item) => item.label === row.label)) : [];
  const ledgerRows = ledger === 'cash' ? cashRows : asset ? pageMoves.filter((row) => row.label === asset.label) : page ? pageMoves : moveRows;

  const saveEntry = async () => {
    if (!entryDraft || !current) return;
    setError('');
    try {
      const amount = Number(entryDraft.amount);
      if (!entryDraft.name.trim()) throw new Error('Escribe qué es.');
      if (!(amount > 0)) throw new Error('El importe tiene que ser mayor que cero.');
      if (!entryDraft.date) throw new Error('Falta la fecha.');
      const origin = entryDraft.origin.trim();
      const name = (origin ? `${entryDraft.name.trim()} · ${origin}` : entryDraft.name.trim()).slice(0, 80);
      if (entryDraft.source === 'plan' && current.planId) {
        if (entryDraft.key) {
          await api(`/api/plans/${current.planId}/entry`, {
            method: 'POST',
            body: JSON.stringify({ key: entryDraft.key, name, amount, date: entryDraft.date, image: entryDraft.image }),
          });
        } else {
          await api(`/api/plans/${current.planId}/extra`, {
            method: 'POST',
            body: JSON.stringify({ name, amount, date: entryDraft.date, direction: entryDraft.direction, paid: true, image: entryDraft.image }),
          });
        }
      } else {
        const path = entryDraft.id ? `/api/wallets/${current.key}/entries/${entryDraft.id}` : `/api/wallets/${current.key}/entries`;
        await api(path, {
          method: entryDraft.id ? 'PATCH' : 'POST',
          body: JSON.stringify({ accountName: current.name, name: entryDraft.name.trim(), amount, date: entryDraft.date, direction: entryDraft.direction, origin, image: entryDraft.image }),
        });
      }
      const fresh = !entryDraft.id && !entryDraft.key;
      const freshOut = fresh && entryDraft.direction === 'out';
      const keptName = name;
      const keptAmount = amount;
      const direction = entryDraft.direction;
      const source = entryDraft.source;
      if (fresh) {
        setEntryMore(false);
        setEntryDraft({ id: null, name: '', amount: '', date: todayKey(), direction, origin: '', image: '', source, key: '', surprise: true });
      } else setEntryDraft(null);
      await load();
      await onSaved?.();
      if (freshOut) onKeep?.(keptName, keptAmount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar el apunte.');
    }
  };

  const saveFixed = async () => {
    if (!fixedDraft || !current?.planId) return;
    setError('');
    try {
      const amount = Number(fixedDraft.amount);
      if (!fixedDraft.name.trim()) throw new Error('Escribe qué es.');
      if (!(amount > 0)) throw new Error('El importe tiene que ser mayor que cero.');
      await api(`/api/plans/${current.planId}/fixed`, {
        method: 'POST',
        body: JSON.stringify({
          name: fixedDraft.name.trim(),
          amount,
          direction: fixedDraft.direction,
          rhythm: fixedDraft.rhythm,
          dayOfMonth: Number(fixedDraft.dayOfMonth || 1),
          everyWeeks: Number(fixedDraft.everyWeeks || 12),
          startDate: fixedDraft.startDate,
        }),
      });
      setFixedDraft(null);
      await onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar el fijo.');
    }
  };

  const removeFixed = async (key: string) => {
    if (!current?.planId || !key) return;
    setError('');
    try {
      await api(`/api/plans/${current.planId}/entry`, { method: 'POST', body: JSON.stringify({ key, remove: true }) });
      await onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido quitar el fijo.');
    }
  };

  const removeEntry = async () => {
    if (!entryDraft || !current) return;
    setError('');
    try {
      if (entryDraft.source === 'plan' && current.planId && entryDraft.key) {
        if (entryDraft.surprise) {
          await api(`/api/plans/${current.planId}/entry`, { method: 'POST', body: JSON.stringify({ key: entryDraft.key, remove: true }) });
        } else {
          await api(`/api/plans/${current.planId}/mark`, { method: 'POST', body: JSON.stringify({ key: entryDraft.key, paid: false }) });
        }
      } else if (entryDraft.id) {
        await api(`/api/wallets/${current.key}/entries/${entryDraft.id}`, { method: 'DELETE' });
      }
      setEntryDraft(null);
      await load();
      await onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido quitar.');
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
      {!current && (
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          {accounts.map((account, index) => (
            <motion.button
              key={account.key}
              type="button"
              onClick={() => onOpen(account.key)}
              initial={window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...glide, delay: Math.min(index, 5) * 0.04 }}
              className="rounded-[24px] border border-white/70 bg-white/70 p-3 text-left shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  {account.image ? <img src={account.image} alt="" className="h-[22px] w-[22px] rounded-lg object-cover" /> : <PlatformLogo name={account.logoName} size={22} />}
                  <span className="min-w-0 truncate text-sm font-black">{account.name}</span>
                </span>
                {(() => {
                  const frames = [
                    ...(account.gainPct != null ? [{ text: formatPct(account.gainPct), tone: toneClass(account.gainPct) }] : []),
                    ...(account.gainEur != null ? [{ text: formatSignedEur(account.gainEur), tone: toneClass(account.gainEur) }] : []),
                  ];
                  const frame = frames.length ? frames[beat % frames.length] : { text: '—', tone: 'text-slate-300' };
                  const text = hidden && frames.length ? '*****' : frame.text;
                  if (stillMotion()) return <span className={cn('shrink-0 text-sm font-black tabular-nums', frame.tone)}>{text}</span>;
                  return (
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={text}
                        initial={{ opacity: 0, y: 8, scale: 0.85 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.9, transition: quickOut }}
                        transition={jelly}
                        className={cn('inline-block shrink-0 text-sm font-black tabular-nums', frame.tone)}
                      >
                        {text}
                      </motion.span>
                    </AnimatePresence>
                  );
                })()}
              </span>
              <span className="mt-2 block whitespace-nowrap text-[clamp(1.35rem,6.2vw,1.85rem)] font-black leading-none tabular-nums sm:text-[26px]">{account.value == null ? '—' : money(account.value, hidden)}</span>
              <span className="mt-2 block text-[11px] font-semibold text-slate-400">
                {(account.sides || []).map((side) => side.title).join(' · ') || 'Sin desglose'}
              </span>
            </motion.button>
          ))}
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
      {current && ledger && (
        <motion.section
          key="ledger"
          className="px-1"
          initial={stillMotion() ? false : { opacity: 0, y: 22, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={stillMotion() ? undefined : { opacity: 0, y: 14, scale: 0.98, transition: quickOut }}
          transition={jelly}
        >
          <button type="button" onClick={() => setLedger(null)} className="inline-flex items-center gap-1 text-sm font-bold text-slate-500">
            <ChevronLeft size={16} /> Volver
          </button>
          <h2 className="mt-3 text-xl font-black">Transacciones</h2>
          <div className="mt-3">
            <ActivityList mode="all" hidden={hidden} rows={ledgerRows} autoFocus={searching} />
          </div>
        </motion.section>
      )}
      {current && !ledger && (
        <motion.div
          key="account"
          className="space-y-3"
          initial={stillMotion() ? false : { opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={stillMotion() ? undefined : { opacity: 0, y: -10, transition: quickOut }}
          transition={softSpring}
        >
          {split && paneSlot && createPortal(
            <PaneSwitch tabs={[{ id: 0, label: products?.cash?.tab || 'Efectivo' }, { id: 1, label: 'Cartera' }]} value={pane} onChange={(next) => { if (next === 1 && pane === 1) { setFocus('all'); setAsset(null); } setPicking(false); setLive(null); setPane(next); }} />,
            paneSlot,
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={showCash ? 'cash' : 'cartera'}
              initial={stillMotion() ? false : { opacity: 0, x: pane === 1 ? 24 : -24, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={stillMotion() ? undefined : { opacity: 0, x: pane === 1 ? -16 : 16, transition: quickOut }}
              transition={paneMove}
              className="space-y-3"
            >
          {showCash && cashSide && (
            <section className="px-1">
              <CashChart
                key={current.key}
                label="Disponible"
                quiet
                onValue={setLive}
                onDay={onDay}
                hidden={hidden}
                now={cashSide.total}
                points={cashPath(current.cash, statement.map((row) => ({ day: row.day, amount: row.amount, absorbed: row.absorbed, open: row.open })), todayKey())}
              />
            </section>
          )}
          {showCash && cashSide && (
            <section className="px-1 pt-4">
              <button type="button" onClick={() => setLedger('cash')} className="inline-flex items-center gap-1 text-left">
                <h3 className="text-xl font-black">Transacciones</h3>
                <ChevronRight size={18} className="shrink-0 text-slate-400" />
              </button>
              <div className="mt-2">
                <ActivityList mode="peek" hidden={hidden} rows={cashRows} />
              </div>
            </section>
          )}
          {showCash && cashSide && <div aria-hidden className="h-16" />}
          {showCash && cashSide && !entryDraft && !detail && !fixedDraft && (
            <CashDock onSearch={() => { setSearching(true); setLedger('cash'); }} onIn={() => openEntry('in')} onOut={() => openEntry('out')} />
          )}
          {showPortfolio && inventory && (
            <section className="px-1">
              {skinItems.length > 0 && (
                <div className="flex justify-end">
                  <button type="button" onClick={() => setGainMode(gainMode === 'eur' ? 'pct' : 'eur')} className="inline-flex items-center gap-1 text-[15px] font-semibold text-slate-400">
                    {gainMode === 'eur' ? 'Desde la compra' : 'En porcentaje'}
                    <ChevronDown size={16} />
                  </button>
                </div>
              )}
              {skinItems.length === 0 ? (
                <p className="pt-2 text-sm font-medium text-slate-400">Todavía no hay skins.</p>
              ) : (
                <ul className="mt-1">
                  {skinItems.map((item, index) => (
                    <motion.li
                      key={item.id || item.label}
                      initial={stillMotion() ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...glide, delay: stillMotion() ? 0 : Math.min(index, 8) * 0.035 }}
                    >
                      <button type="button" onClick={() => { if (item.id) onEditExtra?.(item.id); }} className="flex w-full items-center gap-3 py-3.5 text-left">
                        <ItemPicture round src={item.image} label={item.label} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold leading-tight">{item.label}</span>
                          <span className="mt-0.5 block truncate text-xs font-semibold tabular-nums text-slate-400">
                            {money(item.eur, hidden)}{item.detail ? ` · ${item.detail}` : ''}
                          </span>
                        </span>
                        <GainTag value={item.eur} cost={item.costEur} mode={gainMode} hidden={hidden} />
                      </button>
                    </motion.li>
                  ))}
                </ul>
              )}
              {onAdd && (
                <button type="button" onClick={() => onAdd(current.key)} className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-slate-500">
                  <Plus size={14} /> Añadir skin
                </button>
              )}
            </section>
          )}
          {showPortfolio && !inventory && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={page ? `page:${page.group}` : 'total'}
                initial={stillMotion() ? false : { opacity: 0, x: page ? 28 : -28, scale: 0.985 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={stillMotion() ? undefined : { opacity: 0, x: page ? -18 : 18, transition: quickOut }}
                transition={paneMove}
                className="space-y-3"
              >
                {page ? (
                  <>
                    <section className="px-1">
                      <div className="relative">
                        <button
                          type="button"
                          disabled={Boolean(current.extras)}
                          aria-expanded={picking}
                          onClick={() => { if (asset) { setLive(null); setAsset(null); return; } setPicking(!picking); }}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <span className="truncate text-sm font-semibold text-slate-400">{asset ? asset.label : page.title}</span>
                          {!current.extras && !asset && (
                            <motion.span animate={{ rotate: picking ? 180 : 0 }} transition={softSpring} className="shrink-0 text-slate-400">
                              <ChevronDown size={20} />
                            </motion.span>
                          )}
                        </button>
                        <AnimatePresence>
                          {picking && (
                            <motion.ul
                              initial={stillMotion() ? false : { opacity: 0, scaleX: 0.7, scaleY: 0.55, y: -8 }}
                              animate={{ opacity: 1, scaleX: 1, scaleY: 1, y: 0 }}
                              exit={stillMotion() ? undefined : { opacity: 0, scaleY: 0.8, y: -6, transition: quickOut }}
                              transition={jelly}
                              style={{ transformOrigin: 'top right' }}
                              className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1 shadow-[0_18px_40px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-slate-900"
                            >
                              {[{ group: 'all', title: 'Total', total: portfolioTotal }, ...listed].map((option) => (
                                <li key={option.group}>
                                  <button
                                    type="button"
                                    onClick={() => { setFocus(option.group); setAsset(null); setLive(null); setPicking(false); setRange('MAX'); }}
                                    className={cn('flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold', option.group === page.group ? 'bg-slate-900/[0.05] dark:bg-white/10' : '')}
                                  >
                                    <span className="truncate">{option.title}</span>
                                    <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-400">{money(option.total, hidden)}</span>
                                  </button>
                                </li>
                              ))}
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="mt-1.5">
                        {asset ? (
                          <CashChart
                            key={`${asset.id}:${range}:${assetRanged ? 'ready' : 'wait'}`}
                            quiet
                            tall
                            tone={accentFor(asset.label)}
                            onValue={setLive}
                            onDay={onDay}
                            hidden={hidden}
                            now={asset.eur}
                            base={range === 'MAX' ? (asset.costEur ?? null) : null}
                            beforePlot={(assetRanged?.length || 0) >= 2 ? <RangeTabs value={range} onChange={setRange} /> : undefined}
                            points={assetRanged || []}
                            emptyText={assetRanged ? 'La gráfica aparece cuando haya más de un día.' : 'Cargando…'}
                          />
                        ) : (
                          <CashChart
                            key={`${current.key}:${page.group}:${range}:${rangedPoints ? 'ready' : 'wait'}`}
                            quiet
                            tall
                            tone="ink"
                            onValue={setLive}
                            onDay={onDay}
                            hidden={hidden}
                            now={page.total}
                            base={range === 'MAX' ? page.invested : null}
                            beforePlot={!page.empty && (pagePoints?.length || 0) >= 2 ? <RangeTabs value={range} onChange={setRange} /> : undefined}
                            points={rangedPoints || []}
                            emptyText={page.empty ? 'Todavía no hay nada aquí.' : rangedPoints ? 'La gráfica aparece cuando haya más de un día.' : 'Cargando…'}
                          />
                        )}
                      </div>
                    </section>
                    {!asset && <section className="px-1 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-xl font-black">{current.extras ? 'Tus cosas' : 'Inversiones'}</h3>
                        {!page.empty && (
                          <button type="button" onClick={() => setGainMode(gainMode === 'eur' ? 'pct' : 'eur')} className="inline-flex items-center gap-1 text-[15px] font-semibold text-slate-400">
                            {gainMode === 'eur' ? 'Desde la compra' : 'En porcentaje'}
                            <ChevronDown size={16} />
                          </button>
                        )}
                      </div>
                      {page.empty ? (
                        <div className="pt-2">
                          <p className="text-sm font-medium text-slate-400">{page.hint || 'Activado, todavía vacío.'}</p>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            {onAdd && (
                              <button type="button" onClick={() => onAdd(current.key, page.group)} className="inline-flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                                <Plus size={14} /> Añadir
                              </button>
                            )}
                            {onSections && saved.includes(page.group) && (
                              <button
                                type="button"
                                disabled={Boolean(switching)}
                                onClick={() => { void toggleSection(page.group, false); setFocus('all'); }}
                                className="text-xs font-bold text-slate-400 disabled:opacity-50"
                              >
                                Quitar apartado
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <ul className="mt-1">
                          {page.items.map((item, index) => (
                            <motion.li
                              key={item.id || item.label}
                              initial={stillMotion() ? false : { opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ ...glide, delay: stillMotion() ? 0 : Math.min(index, 8) * 0.035 }}
                            >
                              <button type="button" onClick={() => { if (current.extras) { if (item.id) onEditExtra?.(item.id); return; } if (item.id) { setLive(null); setRange('MAX'); setAsset(item); } }} className="flex w-full items-center gap-3 py-3.5 text-left">
                                <ItemPicture round src={item.image || (current.extras ? null : page.icon)} label={item.label} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[15px] font-bold leading-tight">{item.label}</span>
                                  <span className="mt-0.5 block truncate text-xs font-semibold tabular-nums text-slate-400">
                                    {money(item.eur, hidden)}{item.detail ? ` · ${item.detail}` : ''}
                                  </span>
                                </span>
                                <GainTag value={item.eur} cost={item.costEur} mode={gainMode} hidden={hidden} />
                              </button>
                            </motion.li>
                          ))}
                        </ul>
                      )}
                      {!page.empty && onAdd && (
                        <button
                          type="button"
                          onClick={() => current.extras || products?.auto ? onAdd(current.key) : onAdd(current.key, catalog.some((section) => section.id === page.group) ? page.group : undefined)}
                          className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-slate-500"
                        >
                          <Plus size={14} /> {products?.auto ? 'Añadir skin' : 'Añadir'}
                        </button>
                      )}
                    </section>}
                  </>
                ) : (
                  <div className="px-1">
                    <CashChart
                      key={`${current.key}:all:${range}:${totalRanged ? 'ready' : 'wait'}`}
                      quiet
                      tall
                      tone="ink"
                      onValue={setLive}
                      onDay={onDay}
                      hidden={hidden}
                      now={portfolioTotal}
                      base={range === 'MAX' && portfolioInvested > 0 ? portfolioInvested : null}
                      beforePlot={totalRanged ? <RangeTabs value={range} onChange={setRange} /> : undefined}
                      points={totalRanged || []}
                      emptyText={totalSeries ? 'La gráfica aparece cuando haya más de un día.' : 'Cargando…'}
                    />
                    {listed.length > 0 && (
                      <div className="pt-6">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-xl font-black">{products?.auto ? 'Inventario' : 'Inversiones'}</h3>
                          <button type="button" onClick={() => setGainMode(gainMode === 'eur' ? 'pct' : 'eur')} className="inline-flex items-center gap-1 text-[15px] font-semibold text-slate-400">
                            {gainMode === 'eur' ? 'Desde la compra' : 'En porcentaje'}
                            <ChevronDown size={16} />
                          </button>
                        </div>
                        <ul className="mt-2">
                          {listed.map((group, index) => (
                            <motion.li
                              key={group.group}
                              initial={stillMotion() ? false : { opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ ...glide, delay: stillMotion() ? 0 : Math.min(index, 8) * 0.04 }}
                            >
                              <button type="button" onClick={() => { setFocus(group.group); setRange('MAX'); }} className="flex w-full items-center gap-3 py-4 text-left">
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[17px] font-bold leading-tight">{group.title}</span>
                                  <span className="mt-0.5 block text-sm font-medium tabular-nums text-slate-400">{money(group.total, hidden)}</span>
                                </span>
                                {!group.empty && group.invested != null && <GainTag value={group.total} cost={group.invested} mode={gainMode} hidden={hidden} />}
                              </button>
                            </motion.li>
                          ))}
                        </ul>
                        {products?.auto && onAdd && (
                          <button type="button" onClick={() => onAdd(current.key)} className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-slate-500">
                            <Plus size={14} /> Añadir skin
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
          {showPortfolio && <div aria-hidden className="h-16" />}
          {showPortfolio && !entryDraft && !detail && !fixedDraft && (
            <PairDock onSearch={() => { setSearching(true); setLedger('moves'); }} onMoves={() => { setSearching(false); setLedger('moves'); }} />
          )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
      </AnimatePresence>
      {fixedDraft && current && (
        <Modal title="Fijo" onClose={() => setFixedDraft(null)}>
          <div className="grid gap-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setFixedDraft({ ...fixedDraft, direction: 'out' })} className={cn('flex-1 rounded-full border py-2 text-sm font-bold', fixedDraft.direction === 'out' ? 'border-[#ea3943] text-[#ea3943]' : 'border-slate-200 text-slate-400')}>Sale</button>
              <button type="button" onClick={() => setFixedDraft({ ...fixedDraft, direction: 'in' })} className={cn('flex-1 rounded-full border py-2 text-sm font-bold', fixedDraft.direction === 'in' ? 'border-[#16c784] text-[#16c784]' : 'border-slate-200 text-slate-400')}>Entra</button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setFixedDraft({ ...fixedDraft, rhythm: 'month' })} className={cn('flex-1 rounded-full border py-2 text-sm font-bold', fixedDraft.rhythm === 'month' ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-400')}>Cada mes</button>
              <button type="button" onClick={() => setFixedDraft({ ...fixedDraft, rhythm: 'weeks' })} className={cn('flex-1 rounded-full border py-2 text-sm font-bold', fixedDraft.rhythm === 'weeks' ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-400')}>Cada X semanas</button>
            </div>
            <Input label="Qué es" value={fixedDraft.name} onChange={(event) => setFixedDraft({ ...fixedDraft, name: event.target.value })} placeholder="Entrenador" />
            <OriginPicker name={fixedDraft.name} />
            <Input label="Importe €" type="number" min="0" step="any" value={fixedDraft.amount} onChange={(event) => setFixedDraft({ ...fixedDraft, amount: event.target.value })} />
            {fixedDraft.rhythm === 'month' ? (
              <Input label="Día del mes" type="number" min="1" max="31" value={fixedDraft.dayOfMonth} onChange={(event) => setFixedDraft({ ...fixedDraft, dayOfMonth: event.target.value })} />
            ) : (
              <>
                <Input label="Cada cuántas semanas" type="number" min="1" max="52" value={fixedDraft.everyWeeks} onChange={(event) => setFixedDraft({ ...fixedDraft, everyWeeks: event.target.value })} />
                <Input label="Desde" type="date" value={fixedDraft.startDate} onChange={(event) => setFixedDraft({ ...fixedDraft, startDate: event.target.value })} />
              </>
            )}
            <Button onClick={() => void saveFixed()}>Guardar</Button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.label} onClose={() => setDetail(null)}>
          <div className="flex items-center gap-3">
            <SpentMark label={detail.label} image={detail.image} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">{detail.note}</p>
              <p className={cn('mt-1 text-2xl font-black tabular-nums', detail.amount > 0 ? 'text-[#16c784]' : detail.amount < 0 ? 'text-[#ea3943]' : 'text-slate-400')}>
                {hidden ? '*****' : formatSignedEur(detail.amount)}
              </p>
            </div>
          </div>
        </Modal>
      )}
      {entryDraft && current && (
        <Modal title={entryDraft.name || (entryDraft.direction === 'in' ? 'Extra' : 'Gasto')} onClose={() => setEntryDraft(null)}>
          <div className="grid gap-3">
            <div className="flex gap-2">
              {([['out', 'Sale', '#ea3943'], ['in', 'Entra', '#16c784']] as const).map(([id, label, color]) => (
                <button key={id} type="button" onClick={() => setEntryDraft({ ...entryDraft, direction: id })} className={cn('relative flex-1 overflow-hidden rounded-full border py-2 text-sm font-bold', entryDraft.direction === id ? 'text-white' : 'border-slate-200 text-slate-400')} style={entryDraft.direction === id ? { borderColor: color } : undefined}>
                  {entryDraft.direction === id && <motion.span layoutId="entry-way" transition={stillMotion() ? { duration: 0 } : jelly} className="absolute inset-0" style={{ background: color }} />}
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>
            <Input label="Qué es" value={entryDraft.name} onChange={(event) => setEntryDraft({ ...entryDraft, name: event.target.value })} />
            <Input label="Importe €" type="number" min="0" step="any" value={entryDraft.amount} onChange={(event) => setEntryDraft({ ...entryDraft, amount: event.target.value })} />
            {entryMore ? (
              <>
                <OriginPicker name={`${entryDraft.name} ${entryDraft.origin}`} image={entryDraft.image} onImage={(image) => setEntryDraft({ ...entryDraft, image })} />
                <Input label="Fecha" type="date" value={entryDraft.date} onChange={(event) => setEntryDraft({ ...entryDraft, date: event.target.value })} />
                <Input
                  label={entryDraft.direction === 'in' ? 'De dónde entra' : 'Para qué'}
                  placeholder={entryDraft.direction === 'in' ? 'Nómina, familia…' : 'Para aguantar el mes'}
                  value={entryDraft.origin}
                  onChange={(event) => setEntryDraft({ ...entryDraft, origin: event.target.value })}
                />
              </>
            ) : (
              <button type="button" onClick={() => setEntryMore(true)} className="text-left text-sm font-bold text-slate-500">Fecha y para qué</button>
            )}
            {(entryDraft.id || /^(expense|income):/.test(entryDraft.key)) && (
              <button
                type="button"
                onClick={() => {
                  setEntryMore(true);
                  setEntryDraft({ ...entryDraft, id: null, key: '', date: todayKey(), surprise: true });
                }}
                className="text-left text-sm font-bold text-slate-500"
              >
                Otra vez, hoy
              </button>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void saveEntry()}>Guardar</Button>
              {(entryDraft.id || entryDraft.key) && (
                <Button variant="danger" onClick={() => void removeEntry()} aria-label="Eliminar">
                  <Trash2 size={16} />
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
