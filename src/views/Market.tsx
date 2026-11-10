import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Heart, Search, Star, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CsfloatFinder, SkinMarket, SkinSuggest, type SkinHit } from '@/components/CsfloatFinder';
import { DragRow } from '@/components/DragRow';
import { Modal } from '@/components/Modal';
import { QuietLoad } from '@/components/QuietLoad';
import { Sparkline } from '@/components/Sparkline';
import { useOpenOffer } from '@/components/offer-focus';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { activatePush } from '@/lib/device';
import { formatAgo, formatDay, formatEur, formatNumber, formatPct, formatPrice } from '@/lib/format';
import { quickOut, softSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { CashChart, type LinePoint } from '@/views/Wallets';
import type { AppNotification, MarketBoard, MarketItem, MarketPending, MarketSignal, MarketStory, MarketTapeItem, QuoteCandidate } from '@/lib/types';

function fold(value: string): string {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matches(query: string, parts: Array<string | null | undefined>): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  return parts.some((part) => fold(part || '').includes(needle));
}

function keepSkinMoves(next: MarketBoard, prev: MarketBoard | null): MarketBoard {
  if (!prev?.cs2?.length) return next;
  const prior = new Map(prev.cs2.map((item) => [item.key, item]));
  return {
    ...next,
    cs2: (next.cs2 || []).map((item) => {
      const old = prior.get(item.key);
      if (!old || item.sparkline.length > 1) return item;
      return { ...item, changePct: old.changePct, changeLabel: old.changeLabel, sparkline: old.sparkline };
    }),
  };
}

function applySkinMoves(
  board: MarketBoard,
  moves: { key: string; changePct: number | null; changeLabel: string; sparkline: number[] }[],
): MarketBoard {
  const byKey = new Map(moves.map((item) => [item.key, item]));
  return {
    ...board,
    cs2: (board.cs2 || []).map((item) => {
      const move = byKey.get(item.key);
      if (!move || move.sparkline.length < 2) return item;
      return { ...item, changePct: move.changePct, changeLabel: move.changeLabel, sparkline: move.sparkline };
    }),
  };
}

function Mark({ image, symbol, fallback, contain }: { image: string | null; symbol: string; fallback?: string | null; contain?: boolean }) {
  const [broken, setBroken] = useState(false);
  const [fallbackBroken, setFallbackBroken] = useState(false);
  const src = image && !broken ? image : fallback && !fallbackBroken ? fallback : null;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={40}
        height={40}
        referrerPolicy="no-referrer"
        onError={() => {
          if (image && !broken) setBroken(true);
          else setFallbackBroken(true);
        }}
        className={cn('h-10 w-10 bg-white', contain || (!image && fallback) ? 'rounded-xl object-contain p-0.5' : 'rounded-full object-cover')}
      />
    );
  }
  return <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-800 text-[11px] font-black text-white">{(symbol || '?').slice(0, 3)}</span>;
}

function QuoteSearch({ assetClass, onPick }: { assetClass: string; onPick: (item: QuoteCandidate) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuoteCandidate[]>([]);
  const [error, setError] = useState('');

  const search = async () => {
    setError('');
    try {
      const data = await api<{ results: QuoteCandidate[] }>(`/api/market/search?q=${encodeURIComponent(query)}&assetClass=${encodeURIComponent(assetClass)}`);
      setResults(data.results);
      if (!data.results.length) setError('No hay una cotización con ese nombre.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La búsqueda no ha respondido.');
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="BTC, VWCE.DE, AAPL…" />
        <Button type="button" size="sm" variant="outline" onClick={() => void search()} disabled={query.trim().length < 2}>Buscar</Button>
      </div>
      {error && <p className="text-xs font-medium text-amber-600">{error}</p>}
      <div className="space-y-1">
        {results.map((item) => (
          <button key={`${item.source}:${item.externalId}`} type="button" onClick={() => onPick(item)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
            <Mark image={item.image} symbol={item.symbol} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{item.name}</span>
              <span className="block text-xs font-bold text-slate-500">{item.symbol} · {item.source === 'coingecko' ? 'CoinGecko' : 'Yahoo Finance'}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function quoteOf(key: string): { source: 'coingecko' | 'yahoo'; externalId: string } | null {
  if (key.startsWith('coingecko:')) return { source: 'coingecko', externalId: key.slice('coingecko:'.length) };
  if (key.startsWith('yahoo:')) return { source: 'yahoo', externalId: key.slice('yahoo:'.length) };
  return null;
}

const STORY_SPANS = [
  { days: 7, label: '7 días' },
  { days: 30, label: '1 mes' },
  { days: 90, label: '3 meses' },
  { days: 365, label: '1 año' },
] as const;

function canSpan(kind: string) {
  return kind === 'crypto' || kind === 'etf' || kind === 'stock' || kind === 'gold' || kind === 'silver' || kind === 'oil' || kind === 'copper' || kind === 'index';
}

function stillMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const WEAR_CHIP: Record<string, string> = { 'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS' };
const TAPE_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'up', label: 'Suben' },
  { id: 'down', label: 'Bajan' },
] as const;

type TapeFilter = (typeof TAPE_FILTERS)[number]['id'];

const MARKET_TONE: Record<string, { accent: string; search: string; wash: string }> = {
  crypto: { accent: '#f7931a', search: 'Bitcoin, ether, solana…', wash: 'rgba(247,147,26,0.38)' },
  stock: { accent: '#0a84ff', search: 'Apple, NVIDIA, ASML…', wash: 'rgba(10,132,255,0.28)' },
  etf: { accent: '#30d158', search: 'VWCE, S&P 500, Nasdaq…', wash: 'rgba(48,209,88,0.28)' },
  index: { accent: '#5e5ce6', search: 'IBEX, DAX, Nasdaq…', wash: 'rgba(94,92,230,0.28)' },
  gold: { accent: '#c6a15b', search: 'Oro', wash: 'rgba(198,161,91,0.42)' },
  silver: { accent: '#8e8e93', search: 'Plata', wash: 'rgba(174,174,178,0.34)' },
  oil: { accent: '#8d6e63', search: 'Petróleo', wash: 'rgba(141,110,99,0.34)' },
  copper: { accent: '#b87333', search: 'Cobre', wash: 'rgba(184,115,51,0.36)' },
  cs2: { accent: '#de9b35', search: 'Pandora, guantes, AK…', wash: 'rgba(222,155,53,0.36)' },
  tf2: { accent: '#c17f3e', search: 'Llave, gorra, australium…', wash: 'rgba(193,127,62,0.36)' },
};

const HERO_MARKETS = new Set(['gold', 'silver', 'oil', 'copper']);

function initialMarket() {
  const saved = sessionStorage.getItem('pat_market') || 'all';
  return saved === 'all' || saved in MARKET_TONE ? saved : 'all';
}

function quietWarning(warning: string | null | undefined) {
  if (!warning) return true;
  return warning === '429' || /^429\b/.test(warning) || /ha respondido \d+/.test(warning);
}

const shift = {
  enter: (d: number) => ({ opacity: 0, x: 32 * d, scale: 0.985 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (d: number) => ({ opacity: 0, x: -24 * d, scale: 0.985, transition: quickOut }),
};

function byMove(items: MarketTapeItem[], filter: TapeFilter): MarketTapeItem[] {
  if (filter === 'all') return items;
  return items.filter((item) => item.changePct != null && (filter === 'up' ? item.changePct > 0 : item.changePct < 0));
}

function Pct({ value, className }: { value: number | null; className?: string }) {
  const up = (value ?? 0) > 0;
  const down = (value ?? 0) < 0;
  return <span className={cn('font-black tabular-nums', !up && !down ? 'text-slate-400' : up ? 'text-[#16c784]' : 'text-[#ea3943]', className)}>{value == null ? '—' : formatPct(value)}</span>;
}

function EmptyNote({ children }: { children: string }) {
  return <p className="rounded-3xl bg-white px-4 py-10 text-center text-sm font-medium text-slate-500 dark:bg-slate-900">{children}</p>;
}

function MoveFilter({ tone, value, onChange }: { tone: 'pills' | 'segment'; value: TapeFilter; onChange: (id: TapeFilter) => void }) {
  if (tone === 'pills') {
    return (
      <div className="grid grid-cols-3 gap-2">
        {TAPE_FILTERS.map((filter) => {
          const on = value === filter.id;
          const face = filter.id === 'up'
            ? (on ? 'bg-[#16c784] text-white' : 'bg-white text-[#16c784] dark:bg-white/10')
            : filter.id === 'down'
              ? (on ? 'bg-[#ea3943] text-white' : 'bg-white text-[#ea3943] dark:bg-white/10')
              : (on ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-700 dark:bg-white/10 dark:text-white');
          return (
            <button key={filter.id} type="button" onClick={() => onChange(filter.id)} className={cn('rounded-2xl py-2.5 text-sm font-black transition-transform active:scale-[0.98]', face)}>
              {filter.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 rounded-full bg-white p-1 ring-1 ring-slate-200/80 dark:bg-white/10 dark:ring-white/10">
      {TAPE_FILTERS.map((filter) => (
        <button key={filter.id} type="button" onClick={() => onChange(filter.id)} className={cn('rounded-full py-1.5 text-sm font-bold', value === filter.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500')}>
          {filter.label}
        </button>
      ))}
    </div>
  );
}

function CryptoBoard({ items, filtered, quiet, onOpen }: { items: MarketTapeItem[]; filtered: boolean; quiet: boolean; onOpen: (item: MarketTapeItem) => void }) {
  const still = stillMotion();
  if (!items.length) {
    if (quiet) return null;
    return <EmptyNote>{filtered ? 'Ninguna cripto coincide.' : 'Todavía no hay criptos con precio.'}</EmptyNote>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item, index) => {
        const up = (item.changePct ?? 0) > 0;
        return (
          <motion.button
            key={item.key}
            type="button"
            onClick={() => onOpen(item)}
            initial={still ? false : { opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            whileTap={still ? undefined : { scale: 0.985 }}
            transition={still ? { duration: 0 } : { ...softSpring, delay: Math.min(index, 10) * 0.035 }}
            className="min-w-0 overflow-hidden rounded-[28px] bg-white p-4 text-left text-slate-900 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:text-white dark:ring-white/10"
          >
            <span className="flex items-center gap-3">
              <Mark image={item.image} symbol={item.symbol} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold">{item.name}</span>
                <span className="block truncate font-mono text-[11px] font-bold uppercase text-slate-400">{item.symbol}</span>
              </span>
              <Pct value={item.changePct} className={cn('rounded-full px-2.5 py-1 text-xs', (item.changePct ?? 0) === 0 || item.changePct == null ? 'bg-slate-100 text-slate-500 dark:bg-white/10' : (item.changePct ?? 0) > 0 ? 'bg-[#16c784]/15' : 'bg-[#ea3943]/15')} />
            </span>
            <span className="mt-5 flex min-w-0 items-end justify-between gap-2">
              <span className="min-w-0 truncate text-[clamp(1.2rem,5vw,1.7rem)] font-black tabular-nums tracking-tight">{quoteAmount(item.kind, item.priceEur)}</span>
              <Sparkline values={item.sparkline} up={up} />
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

function StockBoard({ items, filtered, onOpen }: { items: MarketTapeItem[]; filtered: boolean; onOpen: (item: MarketTapeItem) => void }) {
  const still = stillMotion();
  if (!items.length) return <EmptyNote>{filtered ? 'Ninguna acción coincide.' : 'Todavía no hay acciones.'}</EmptyNote>;
  return (
    <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-white/10">
      {items.map((item, index) => (
        <motion.button
          key={item.key}
          type="button"
          onClick={() => onOpen(item)}
          initial={still ? false : { opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={still ? { duration: 0 } : { ...softSpring, delay: Math.min(index, 12) * 0.02 }}
          className="flex w-full items-center gap-3 border-b border-slate-100 px-3.5 py-3 text-left last:border-0 dark:border-white/10"
        >
          <Mark image={item.image} symbol={item.symbol} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{item.name}</span>
            <span className="block truncate text-[11px] font-bold uppercase text-slate-400">{item.symbol}</span>
          </span>
          <span className="text-right">
            <span className="block text-sm font-black tabular-nums">{quoteAmount(item.kind, item.priceEur)}</span>
            <Pct value={item.changePct} className="text-[11px]" />
          </span>
        </motion.button>
      ))}
    </div>
  );
}

function EtfBoard({ items, filtered, onOpen }: { items: MarketTapeItem[]; filtered: boolean; onOpen: (item: MarketTapeItem) => void }) {
  const still = stillMotion();
  if (!items.length) return <EmptyNote>{filtered ? 'Ningún ETF coincide.' : 'Todavía no hay ETF.'}</EmptyNote>;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {items.map((item, index) => (
        <motion.button
          key={item.key}
          type="button"
          onClick={() => onOpen(item)}
          initial={still ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={still ? undefined : { scale: 0.985 }}
          transition={still ? { duration: 0 } : { ...softSpring, delay: Math.min(index, 8) * 0.03 }}
          className="flex flex-col rounded-[28px] bg-white p-3.5 text-left ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10"
          style={{ boxShadow: 'inset 0 2px 0 #30d158' }}
        >
          <Mark image={item.image} symbol={item.symbol} />
          <span className="mt-3 line-clamp-2 text-sm font-semibold leading-tight">{item.name}</span>
          <span className="mt-auto pt-3 text-lg font-black tabular-nums">{quoteAmount(item.kind, item.priceEur)}</span>
          <Pct value={item.changePct} className="text-xs" />
        </motion.button>
      ))}
    </div>
  );
}

function IndexBoard({ items, filtered, onOpen }: { items: MarketTapeItem[]; filtered: boolean; onOpen: (item: MarketTapeItem) => void }) {
  const still = stillMotion();
  if (!items.length) return <EmptyNote>{filtered ? 'Ningún índice coincide.' : 'Todavía no hay índices.'}</EmptyNote>;
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {items.map((item, index) => (
        <motion.button
          key={item.key}
          type="button"
          onClick={() => onOpen(item)}
          initial={still ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={still ? undefined : { scale: 0.985 }}
          transition={still ? { duration: 0 } : { ...softSpring, delay: Math.min(index, 8) * 0.03 }}
          className="rounded-[28px] bg-white px-4 py-4 text-left ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10"
        >
          <span className="block truncate text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{item.name}</span>
          <span className="mt-1 block text-3xl font-black tabular-nums tracking-tight">{quoteAmount(item.kind, item.priceEur)}</span>
          <Pct value={item.changePct} className="mt-1 block text-sm" />
        </motion.button>
      ))}
    </div>
  );
}

function HeroBoard({ item, accent, onOpen }: { item: MarketTapeItem | undefined; accent: string; onOpen: (item: MarketTapeItem) => void }) {
  const still = stillMotion();
  if (!item) return <EmptyNote>Todavía no hay cotización.</EmptyNote>;
  const up = (item.changePct ?? 0) > 0;
  return (
    <motion.button
      type="button"
      onClick={() => onOpen(item)}
      initial={still ? false : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileTap={still ? undefined : { scale: 0.99 }}
      transition={softSpring}
      className="w-full rounded-[32px] bg-white p-6 text-left ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10"
    >
      <span className="flex items-center gap-3">
        <Mark image={item.image} symbol={item.symbol} />
        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold">{item.name}</span>
          <span className="block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>{item.symbol}</span>
        </span>
      </span>
      <span className="mt-8 block text-5xl font-black tabular-nums tracking-tight" style={{ color: accent }}>{quoteAmount(item.kind, item.priceEur)}</span>
      <span className="mt-2 block"><Pct value={item.changePct} className="text-base" /></span>
      <span className="mt-6 block"><Sparkline values={item.sparkline} up={up} /></span>
    </motion.button>
  );
}

function GameBoard({ items, filtered, quiet, warm, onOpen }: { items: MarketTapeItem[]; filtered: boolean; quiet: boolean; warm?: boolean; onOpen: (item: MarketTapeItem) => void }) {
  const still = stillMotion();
  if (!items.length) {
    if (quiet) return null;
    return <EmptyNote>{filtered ? 'Nada coincide con esa búsqueda.' : 'Escribe el nombre para entrar.'}</EmptyNote>;
  }
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {items.map((item, index) => (
        <motion.button
          key={item.key}
          type="button"
          onClick={() => onOpen(item)}
          initial={still ? false : { opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileTap={still ? undefined : { scale: 0.98 }}
          transition={still ? { duration: 0 } : { ...softSpring, delay: Math.min(index, 8) * 0.04 }}
          className="overflow-hidden rounded-[28px] bg-white text-left text-slate-900 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:text-white dark:ring-white/10"
        >
          <span className="grid aspect-[5/4] place-items-center bg-slate-50 dark:bg-white/5" style={{ background: warm ? 'radial-gradient(circle at 50% 42%, rgba(222,155,53,0.35), transparent 70%)' : 'radial-gradient(circle at 50% 42%, rgba(148,163,184,0.35), transparent 70%)' }}>
            {item.image ? <img src={item.image} alt="" referrerPolicy="no-referrer" className="h-[72%] w-[72%] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.45)]" /> : <Mark image={null} symbol={item.symbol} />}
          </span>
          <span className="block px-3 py-2.5">
            <span className="block truncate text-sm font-semibold">{item.name}</span>
            <span className="mt-1 flex items-center justify-between gap-2">
              <span className="text-sm font-black tabular-nums">{quoteAmount(item.kind, item.priceEur)}</span>
              <Pct value={item.changePct} className="text-[11px]" />
            </span>
          </span>
        </motion.button>
      ))}
    </div>
  );
}

function quoteAmount(kind: string, value: number | null | undefined): string {
  if (kind === 'index') return formatNumber(value, 2);
  return formatPrice(value);
}

function QuoteRow({ item, onOpen, onChanged }: { item: MarketItem; onOpen: () => void; onChanged: () => void }) {
  const up = (item.changePct ?? 0) >= 0;
  return (
    <article className="border-b border-slate-100 py-4 last:border-0 dark:border-slate-800">
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-left sm:grid-cols-[auto_minmax(0,1fr)_5.5rem_auto]">
        <Mark image={item.image} symbol={item.symbol} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.name}</p>
          <p className="truncate text-[11px] font-bold uppercase text-slate-400">{item.symbol} · {item.accountName}</p>
        </div>
        <span className="hidden sm:block"><Sparkline values={item.sparkline} up={up && item.changePct !== 0} /></span>
        <div className="text-right">
          <p className="font-black tabular-nums">{formatPrice(item.priceEur)}</p>
          <p className="text-[11px] font-medium text-slate-500">{item.quantity > 0 ? `${formatNumber(item.quantity, 8)} · ${formatEur(item.valueEur)}` : 'Sin cantidad'}</p>
          <p className={cn('text-[11px] font-black tabular-nums', item.changePct == null ? 'text-slate-400' : up ? 'text-[#16c784]' : 'text-[#ea3943]')}>
            {item.changePct == null ? '—' : formatPct(item.changePct)}
            <span className="ml-1 font-bold opacity-80">{item.changeLabel}</span>
          </p>
        </div>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="text-[11px] font-bold text-slate-400"
          onClick={async () => {
            await api('/api/market/unlink', { method: 'POST', body: JSON.stringify({ holdingId: item.holdingId }) });
            onChanged();
          }}
        >
          Dejar el último precio como manual
        </button>
      </div>
      {item.error && <p className="mt-2 text-xs font-medium text-amber-600">{item.error} Se mantiene el último precio real.</p>}
      {item.stale && !item.error && <p className="mt-2 text-xs font-medium text-amber-600">Última lectura {formatAgo(item.fetchedAt)}. La fuente no ha mandado un precio nuevo.</p>}
    </article>
  );
}

function TapeRow({ item, fallback, onOpen }: { item: MarketTapeItem; fallback?: string | null; onOpen: () => void }) {
  const up = (item.changePct ?? 0) > 0;
  const down = (item.changePct ?? 0) < 0;
  const game = item.kind === 'cs2' || item.kind === 'tf2';
  return (
    <button type="button" onClick={onOpen} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-slate-100 py-3 text-left last:border-0 dark:border-slate-800 sm:items-center sm:grid-cols-[auto_minmax(0,1fr)_5.5rem_auto]">
      <Mark image={item.image} symbol={item.symbol} fallback={fallback} contain={game} />
      <div className="min-w-0">
        <p className={cn('font-semibold leading-snug', game ? 'break-words' : 'truncate')}>{item.name}</p>
        <p className="truncate text-[11px] font-bold uppercase text-slate-400">{item.symbol} · {item.sourceLabel}</p>
      </div>
      <span className="hidden sm:block"><Sparkline values={item.sparkline} up={up} /></span>
      <div className="text-right">
        <p className="font-black tabular-nums">{quoteAmount(item.kind, item.priceEur)}</p>
        <p className={cn('text-[11px] font-black tabular-nums', !up && !down ? 'text-slate-400' : up ? 'text-[#16c784]' : 'text-[#ea3943]')}>
          {item.changePct == null ? '—' : formatPct(item.changePct)}
          {item.changePct != null && <span className="ml-1 font-bold opacity-80">{item.changeLabel}</span>}
        </p>
      </div>
      {item.error && <p className="col-span-full text-xs font-medium text-amber-600">{item.error} Se mantiene el último precio real.</p>}
      {item.stale && !item.error && <p className="col-span-full text-xs font-medium text-amber-600">Última lectura {formatAgo(item.fetchedAt)}.</p>}
    </button>
  );
}

type SavedOffer = {
  id: string;
  label: string;
  priceEur: number | null;
  floatValue: number | null;
  image: string | null;
  url: string;
};

function SavedDesk({ needle }: { needle: string }) {
  const [offers, setOffers] = useState<SavedOffer[]>([]);

  const load = () => {
    api<{ offers: SavedOffer[] }>('/api/market/saved')
      .then((data) => setOffers(data.offers || []))
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const visible = offers.filter((offer) => matches(needle, [offer.label]));
  if (needle && visible.length === 0) return null;
  const remove = (id: string) => {
    void api(`/api/market/saved/${id}`, { method: 'DELETE' }).then(load);
  };

  return (
    <Card className="px-4 py-4">
        {visible.length === 0 ? (
          <p className="text-sm font-medium text-slate-500">Cuando un guante te interese, se queda aquí. El enlace sigue abierto para entrar cuando quieras.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((offer) => (
              <article key={offer.id} className="flex items-center gap-3 py-3">
                {offer.image && <img src={offer.image} alt="" referrerPolicy="no-referrer" className="h-14 w-20 shrink-0 object-contain" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{offer.label}</p>
                  <p className="text-sm font-bold tabular-nums text-slate-500">{offer.priceEur == null ? '—' : formatEur(offer.priceEur)}{offer.floatValue == null ? '' : ` · float ${offer.floatValue.toFixed(4)}`}</p>
                </div>
                <a href={offer.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-slate-900 px-3 py-2 text-xs font-black text-white dark:bg-white dark:text-slate-900">Abrir</a>
                <button type="button" onClick={() => remove(offer.id)} className="shrink-0 text-[11px] font-bold text-slate-400">Quitar</button>
              </article>
            ))}
          </div>
        )}
      </Card>
  );
}
type Picked =
  | { kind: 'quote'; source: 'coingecko' | 'yahoo'; externalId: string; name: string; priceEur: number | null; image: string | null }
  | { kind: 'skin'; name: string; wear: string; wears: string[]; image: string | null };

function sameAlert(item: MarketSignal, note: AppNotification): boolean {
  if (!note.quoteKey) return false;
  if (item.kind === 'compra') return note.quoteKey.startsWith(`listing:${item.id}:`);
  return Boolean(item.quoteKey) && note.quoteKey === item.quoteKey;
}

function AlertDesk({ items, catalog, onChanged }: { items: MarketSignal[]; catalog: MarketTapeItem[]; onChanged: () => void }) {
  const openOffer = useOpenOffer();
  const [query, setQuery] = useState('');
  const [quotes, setQuotes] = useState<QuoteCandidate[]>([]);
  const [skins, setSkins] = useState<{ name: string; wears: string[]; image: string | null }[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [above, setAbove] = useState('');
  const [below, setBelow] = useState('');
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');
  const [history, setHistory] = useState<MarketSignal | null>(null);
  const [notes, setNotes] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    if (!history) {
      setNotes(null);
      return;
    }
    let cancel = false;
    api<{ notifications: AppNotification[] }>('/api/market/notifications')
      .then((data) => {
        if (!cancel) setNotes((data.notifications || []).filter((note) => sameAlert(history, note)));
      })
      .catch(() => {
        if (!cancel) setNotes([]);
      });
    return () => { cancel = true; };
  }, [history]);

  const search = async (value: string) => {
    setQuery(value);
    setPicked(null);
    const text = value.trim();
    if (text.length < 2) {
      setQuotes([]);
      setSkins([]);
      return;
    }
    const [found, gloves] = await Promise.all([
      api<{ results: QuoteCandidate[] }>(`/api/market/search?q=${encodeURIComponent(text)}`).catch(() => ({ results: [] })),
      api<{ results: { name: string; wears: string[]; image: string | null }[] }>(`/api/market/skins?q=${encodeURIComponent(text)}`).catch(() => ({ results: [] })),
    ]);
    setQuotes(found.results || []);
    setSkins(gloves.results || []);
  };

  const local = query.trim().length < 2 ? [] : catalog.filter((item) => matches(query, [item.name, item.symbol])).slice(0, 6);
  const adding = query.trim().length > 0 || picked != null;

  const amount = (value: string) => {
    const number = Number(value.replace(',', '.'));
    return number > 0 ? number : null;
  };

  const save = async () => {
    if (!picked) return;
    setNote('');
    try {
      if (picked.kind === 'skin') {
        const price = amount(below);
        if (price == null) {
          setNote('Pon el precio por debajo del cual avisar.');
          return;
        }
        const marketHashName = picked.wear ? `${picked.name} (${picked.wear})` : picked.name;
        await api('/api/market/watch', {
          method: 'POST',
          body: JSON.stringify({ label: picked.name.replace(/^★\s*/, ''), marketHashName, below: price }),
        });
      } else {
        const high = amount(above);
        const low = amount(below);
        if (high == null && low == null) {
          setNote('Pon un precio por encima, por debajo, o los dos.');
          return;
        }
        await api('/api/market/listen', {
          method: 'POST',
          body: JSON.stringify({ source: picked.source, externalId: picked.externalId, above: high, below: low }),
        });
      }
      setPicked(null);
      setQuery('');
      setAbove('');
      setBelow('');
      setQuotes([]);
      setSkins([]);
      onChanged();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se ha podido guardar el aviso.');
    }
  };

  const remove = (item: MarketSignal) => {
    const path = item.kind === 'compra' ? `/api/market/watch/${item.id}` : `/api/market/listen/${item.id}`;
    void api(path, { method: 'DELETE' }).then(onChanged);
  };

  return (
    <Card className="px-4 py-4">
        {history && (
          <div>
            <button type="button" onClick={() => setHistory(null)} className="text-[13px] font-semibold text-slate-500">Volver</button>
            <div className="mt-3 flex items-center gap-3">
              <Mark image={history.image || null} symbol={history.name} contain={history.kind === 'compra'} fallback={history.kind === 'compra' ? '/platforms/cs2.svg' : null} />
              <div className="min-w-0">
                <p className="font-semibold">{history.name}</p>
                <p className="text-[11px] font-bold uppercase text-slate-400">Escuchando{history.priceEur == null ? '' : ` · ahora ${formatEur(history.priceEur)}`}</p>
              </div>
            </div>
            {notes == null && <p className="mt-4 text-sm font-medium text-slate-400">Cargando…</p>}
            {notes && notes.length === 0 && <p className="mt-4 text-sm font-medium text-slate-500">Todavía no ha saltado ninguno.</p>}
            {notes && notes.length > 0 && (
              <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => { if (note.quoteKey?.startsWith('listing:')) openOffer(note); }}
                    className="block w-full py-3 text-left"
                  >
                    <p className="font-black text-[#ea3943]">{note.priceEur == null ? note.title : formatEur(note.priceEur)}</p>
                    <p className="text-xs font-medium text-slate-500">{note.body}</p>
                    {note.floatValue != null && <p className="text-[11px] font-medium text-slate-400">Float {note.floatValue.toFixed(4)}</p>}
                    <p className="mt-1 text-[11px] font-bold text-slate-400">{formatAgo(note.createdAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!history && !adding && <p className="text-sm font-medium text-slate-500">Cada aviso se queda escuchando. Si el precio pasa por encima o por debajo del tuyo, llega en el momento. Vale para todo el mercado, no solo para CS2.</p>}
        {!history && !adding && items.length > 0 && (
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((item) => (
              <article key={`${item.kind}:${item.id}`} className="flex items-center gap-3 py-3">
                <button type="button" onClick={() => setHistory(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Mark image={item.image || null} symbol={item.name} contain={item.kind === 'compra'} fallback={item.kind === 'compra' ? '/platforms/cs2.svg' : null} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.name}</span>
                    <span className="block text-[11px] font-bold uppercase text-slate-400">Escuchando{item.priceEur == null ? '' : ` · ahora ${formatEur(item.priceEur)}`}</span>
                    <span className="mt-1 block text-xs font-medium text-slate-500">{item.note}</span>
                  </span>
                </button>
                <button type="button" onClick={() => remove(item)} className="shrink-0 text-[11px] font-bold text-slate-400">Quitar</button>
              </article>
            ))}
          </div>
        )}
        {!history && (
        <div className={cn('grid gap-2', adding ? '' : 'mt-3')}>
          <Input value={query} onChange={(event) => void search(event.target.value)} placeholder="Bitcoin, oro, VWCE, Pandora…" aria-label="Buscar para un aviso" />
          {!picked && (local.length > 0 || quotes.length > 0 || skins.length > 0) && (
            <div className="grid gap-1">
              {local.map((item) => {
                const quote = quoteOf(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (quote) setPicked({ kind: 'quote', ...quote, name: item.name, priceEur: item.priceEur, image: item.image });
                      else if (item.kind === 'cs2') setPicked({ kind: 'skin', name: item.name, wear: '', wears: [], image: item.image });
                    }}
                    className="flex items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <Mark image={item.image} symbol={item.symbol} contain={item.kind === 'cs2' || item.kind === 'tf2'} />
                    <span className="min-w-0">
                      {item.name}
                      <span className="ml-2 text-[11px] font-bold uppercase text-slate-400">{item.priceEur == null ? item.symbol : formatEur(item.priceEur)}</span>
                    </span>
                  </button>
                );
              })}
              {quotes.filter((item) => !local.some((row) => row.key === `${item.source}:${item.externalId}`)).map((item) => (
                <button key={`${item.source}:${item.externalId}`} type="button" onClick={() => setPicked({ kind: 'quote', source: item.source, externalId: item.externalId, name: item.name, priceEur: null, image: item.image })} className="flex items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5">
                  <Mark image={item.image} symbol={item.symbol} />
                  <span className="min-w-0">{item.name}<span className="ml-2 text-[11px] font-bold uppercase text-slate-400">{item.symbol}</span></span>
                </button>
              ))}
              {skins.map((item) => (
                <button key={item.name} type="button" onClick={() => setPicked({ kind: 'skin', name: item.name, wear: item.wears[0] || '', wears: item.wears, image: item.image })} className="flex items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5">
                  <Mark image={item.image} symbol="CS2" contain fallback="/platforms/cs2.svg" />
                  <span className="min-w-0">{item.name}<span className="ml-2 text-[11px] font-bold uppercase text-slate-400">a la venta</span></span>
                </button>
              ))}
            </div>
          )}
          {picked && (
            <div className="grid gap-2">
              <p className="flex items-center gap-3 text-sm font-semibold">
                <Mark image={picked.image} symbol={picked.name} contain={picked.kind === 'skin'} fallback={picked.kind === 'skin' ? '/platforms/cs2.svg' : null} />
                <span>{picked.name}{picked.kind === 'quote' && picked.priceEur != null ? ` · ${formatEur(picked.priceEur)}` : ''}</span>
              </p>
              {picked.kind === 'skin' && picked.wears.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {picked.wears.map((wear) => (
                    <button key={wear} type="button" onClick={() => setPicked({ ...picked, wear })} className={cn('rounded-full border px-3 py-1 text-xs font-bold', picked.wear === wear ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-400')}>{wear}</button>
                  ))}
                </div>
              )}
              {picked.kind === 'quote' && <Input label="Avisar si pasa por encima de (€)" type="number" min="0" step="any" value={above} onChange={(event) => setAbove(event.target.value)} placeholder="Opcional" />}
              <Input label={picked.kind === 'skin' ? 'Avisar si alguien lo pone por debajo de (€)' : 'Avisar si baja de (€)'} type="number" min="0" step="any" value={below} onChange={(event) => setBelow(event.target.value)} placeholder={picked.kind === 'quote' ? 'Opcional' : ''} />
              <Button type="button" onClick={() => void save()}>Escuchar</Button>
            </div>
          )}
          {note && <p className="text-xs font-medium text-rose-600">{note}</p>}
        </div>
        )}
        {!history && !adding && <button type="button" onClick={() => void activatePush().then(setPhone).catch((err: Error) => setPhone(err.message))} className="mt-4 text-xs font-bold text-slate-500">Avisos en el móvil</button>}
        {phone && <p className="mt-1 text-xs font-medium text-slate-500">{phone}</p>}
      </Card>
  );
}

function TapeSection({ title, icon, items, onOpen, onPick }: { title: string; icon: string; items: MarketTapeItem[]; onOpen: (item: MarketTapeItem) => void; onPick?: () => void }) {
  if (!items.length) return null;
  const heading = (
    <>
      <img src={icon} alt="" width={32} height={32} referrerPolicy="no-referrer" className="h-8 w-8 rounded-xl bg-white object-cover" />
      {title}
    </>
  );
  return (
    <section className="space-y-2">
      {onPick ? (
        <button type="button" onClick={onPick} className="flex items-center gap-2 text-lg font-semibold">{heading}</button>
      ) : (
        <h2 className="flex items-center gap-2 text-lg font-semibold">{heading}</h2>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const up = (item.changePct ?? 0) > 0;
          const down = (item.changePct ?? 0) < 0;
          const game = item.kind === 'cs2' || item.kind === 'tf2';
          return (
            <button key={item.key} type="button" onClick={() => onOpen(item)} className="flex flex-col rounded-3xl bg-white p-3 text-left ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10">
              <span className="flex items-center justify-between gap-2">
                <Mark image={item.image} symbol={item.symbol} fallback={item.image ? null : icon} contain={game} />
                <span className={cn('rounded-full px-2 py-1 text-[11px] font-black tabular-nums', !up && !down ? 'bg-slate-100 text-slate-500 dark:bg-white/10' : up ? 'bg-[#16c784]/15 text-[#16c784]' : 'bg-[#ea3943]/15 text-[#ea3943]')}>
                  {item.changePct == null ? '—' : formatPct(item.changePct)}
                </span>
              </span>
              <span className="mt-3 line-clamp-2 text-sm font-semibold leading-tight">{item.name}</span>
              <span className="mt-1 text-lg font-black tabular-nums">{quoteAmount(item.kind, item.priceEur)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PendingRow({ item, onChanged }: { item: MarketPending; onChanged: () => void }) {
  const link = async (candidate: QuoteCandidate) => {
    await api('/api/market/link', { method: 'POST', body: JSON.stringify({ holdingId: item.holdingId, source: candidate.source, externalId: candidate.externalId }) });
    onChanged();
  };
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 p-3 dark:border-slate-700">
      <p className="font-semibold">{item.name} <span className="text-slate-400">{item.symbol}</span></p>
      <p className="text-xs font-medium text-slate-500">{item.accountName}. Elige la cotización exacta para empezar a seguirla.</p>
      <QuoteSearch assetClass={item.assetClass} onPick={(candidate) => void link(candidate)} />
    </div>
  );
}

function StoryDialog({ item, onClose }: { item: { kind: string; key: string; name: string; symbol: string; priceEur: number | null; changePct: number | null; changeLabel: string; sparkline: number[] }; onClose: () => void }) {
  const [story, setStory] = useState<MarketStory | null>(null);
  const [failed, setFailed] = useState('');
  const [days, setDays] = useState(30);
  const [loadedDays, setLoadedDays] = useState(30);
  const [live, setLive] = useState<number | null>(null);
  const [liveDay, setLiveDay] = useState<string | null>(null);
  const spans = canSpan(item.kind);
  useEffect(() => {
    if (!item.key) return;
    let cancelled = false;
    const params = new URLSearchParams({ kind: item.kind, key: item.key, name: item.name, symbol: item.symbol });
    if (spans) params.set('days', String(days));
    api<MarketStory>(`/api/market/story?${params}`)
      .then((next) => { if (!cancelled) { setStory(next); setLoadedDays(days); setFailed(''); } })
      .catch((err: Error) => { if (!cancelled) setFailed(err.message); });
    return () => { cancelled = true; };
  }, [item.kind, item.key, item.name, item.symbol, days, spans]);
  const fromStory: LinePoint[] = story && story.series.length >= 2 ? story.series.map((point) => ({ day: point.at, eur: point.eur })) : [];
  const fromSpark: LinePoint[] = item.sparkline.length >= 2
    ? item.sparkline.map((eur, index) => {
        const day = new Date(Date.now() - (item.sparkline.length - 1 - index) * 86_400_000).toISOString().slice(0, 10);
        return { day, eur };
      })
    : [];
  const points: LinePoint[] = fromStory.length >= 2 ? fromStory : fromSpark;
  const matched = fromStory.length >= 2;
  const change = matched ? story?.changePct : item.changePct;
  const label = matched ? story?.changeLabel : item.changeLabel;
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;
  const waiting = Boolean(item.key) && !story && !failed;
  return (
    <Modal title={item.name} onClose={onClose} wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-black tabular-nums sm:text-3xl">{quoteAmount(item.kind, live ?? item.priceEur)}</p>
          {liveDay && <p className="mt-1 text-[13px] font-semibold text-slate-400">{formatDay(liveDay)}</p>}
          {story && story.series.length > 0 && <p className="mt-1 text-[13px] font-medium text-slate-400">Precio de {formatAgo(story.series[story.series.length - 1].at)}</p>}
        </div>
        <span className={cn('rounded-xl px-3 py-1.5 text-sm font-black', !up && !down ? 'bg-slate-100 text-slate-500' : up ? 'bg-[#16c784]/15 text-[#16c784]' : 'bg-[#ea3943]/15 text-[#ea3943]')}>
          {change == null ? '—' : formatPct(change)}
          {change != null && <span className="ml-1 text-[10px] font-bold opacity-80">{label}</span>}
        </span>
      </div>
      {spans && (
        <div className="mt-4 flex gap-2">
          {STORY_SPANS.map((span) => (
            <button
              key={span.days}
              type="button"
              onClick={() => setDays(span.days)}
              className={cn('rounded-full px-3 py-1.5 text-sm font-bold', days === span.days ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-white/10')}
            >
              {span.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4">
        {waiting && points.length < 2 ? <QuietLoad kind="chart" /> : points.length >= 2 ? (
          <CashChart
            key={`${item.key}:${loadedDays}:${points.length}`}
            quiet
            tall
            points={points}
            now={item.priceEur ?? points[points.length - 1].eur}
            hidden={false}
            onValue={setLive}
            onDay={setLiveDay}
            emptyText=""
          />
        ) : null}
        {story?.note && points.length < 2 && !waiting && <p className="text-sm font-medium text-slate-400">{story.note}</p>}
        {spans && days !== loadedDays && <p className="mt-1 text-[11px] font-bold text-slate-400">Cargando este tramo…</p>}
      </div>
      {story && story.floats.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-black">Floats</p>
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {story.floats.map((band) => (
              <li key={band.label} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="block text-sm font-bold">{band.label}{band.yours ? ' · el tuyo' : ''}</span>
                  <span className="block text-[11px] font-medium text-slate-400">{band.sales > 0 ? `${band.range} · ${band.sales} ventas` : band.range}</span>
                </span>
                <span className="font-black tabular-nums">{formatPrice(band.priceEur)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs font-medium text-slate-400">{(failed && failed !== '429' && !/^429\b/.test(failed) ? failed : '') || (!item.key ? 'Este valor no está enlazado a un mercado, así que no hay histórico.' : story?.note) || 'El verde es subida y el rojo es bajada. El porcentaje es el de la gráfica, del primer punto al último.'}</p>
    </Modal>
  );
}

function Followed({ onOpenListing }: { onOpenListing: (id: string) => void }) {
  const [skins, setSkins] = useState<{ name: string; wear: string; label: string; image: string | null; lastBestEur: number | null }[]>([]);
  const [ads, setAds] = useState<{ id: string; label: string; image: string | null; priceEur: number | null }[]>([]);

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<{ skins: { name: string; wear: string; label: string; image: string | null; lastBestEur: number | null }[] }>('/api/market/skin-stars').catch(() => ({ skins: [] })),
      api<{ tracked: { id: string; label: string; image: string | null; priceEur: number | null }[] }>('/api/market/tracked').catch(() => ({ tracked: [] })),
    ]).then(([stars, tracked]) => {
      if (cancel) return;
      setSkins(stars.skins || []);
      setAds(tracked.tracked || []);
    });
    return () => { cancel = true; };
  }, []);

  const dropSkin = (row: { name: string; wear: string }) => {
    const params = new URLSearchParams({ name: row.name, wear: row.wear });
    void api(`/api/market/skin-stars?${params}`, { method: 'DELETE' }).then(() => {
      setSkins((rows) => rows.filter((item) => !(item.name === row.name && item.wear === row.wear)));
    });
  };

  const dropAd = (id: string) => {
    void api(`/api/market/tracked/${id}`, { method: 'DELETE' }).then(() => {
      setAds((rows) => rows.filter((item) => item.id !== id));
    });
  };

  if (skins.length === 0 && ads.length === 0) return null;
  return (
    <div className="mb-4 space-y-4">
      {skins.length > 0 && (
        <div>
          <p className="px-1 pb-1 text-[11px] font-semibold text-slate-400">Skins destacadas</p>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {skins.map((row) => (
              <div key={`${row.name}:${row.wear}`} className="flex items-center gap-3 py-2.5">
                {row.image && <img src={row.image} alt="" referrerPolicy="no-referrer" className="h-10 w-14 shrink-0 object-contain" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{row.label}</span>
                  <span className="block text-xs font-medium text-slate-500">{row.wear || 'Cualquier desgaste'}{row.lastBestEur == null ? '' : ` · más barata ${formatEur(row.lastBestEur)}`}</span>
                </span>
                <button type="button" onClick={() => dropSkin(row)} className="shrink-0 text-[11px] font-semibold text-slate-400">Quitar</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {ads.length > 0 && (
        <div>
          <p className="px-1 pb-1 text-[11px] font-semibold text-slate-400">Anuncios</p>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {ads.map((row) => (
              <div key={row.id} className="flex items-center gap-3 py-2.5">
                <button type="button" onClick={() => onOpenListing(row.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  {row.image && <img src={row.image} alt="" referrerPolicy="no-referrer" className="h-10 w-14 shrink-0 object-contain" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{row.label}</span>
                    <span className="block text-xs font-medium text-slate-500">{row.priceEur == null ? 'Anuncio seguido' : formatEur(row.priceEur)}</span>
                  </span>
                </button>
                <button type="button" onClick={() => dropAd(row.id)} className="shrink-0 text-[11px] font-semibold text-slate-400">Quitar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Market({ focusListing, focusTick = 0 }: { focusListing?: string | null; focusTick?: number }) {
  const [data, setData] = useState<MarketBoard | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [skinMatch, setSkinMatch] = useState(false);
  const [market, setMarket] = useState(initialMarket);
  const [skinDesk, setSkinDesk] = useState<SkinHit | null>(null);
  const [wearPick, setWearPick] = useState('all');
  const [tapeFilter, setTapeFilter] = useState<TapeFilter>('all');
  const [open, setOpen] = useState<{ kind: string; key: string; name: string; symbol: string; priceEur: number | null; changePct: number | null; changeLabel: string; sparkline: number[] } | null>(null);
  const [desk, setDesk] = useState<'saved' | 'alerts' | 'csfloat' | null>(focusListing ? 'csfloat' : null);
  const [listingFocus, setListingFocus] = useState<string | null>(focusListing || null);
  const dir = useRef(1);

  useEffect(() => {
    if (!focusListing) return;
    setListingFocus(focusListing);
    setDesk('csfloat');
  }, [focusListing, focusTick]);
  useEffect(() => {
    sessionStorage.setItem('pat_market', market);
    const root = document.documentElement;
    const accent = market === 'all' ? '#8e8e93' : MARKET_TONE[market]?.accent || '#8e8e93';
    root.style.setProperty('--market-tint', `color-mix(in srgb, ${accent} 15%, var(--app-bg))`);
  }, [market]);
  useEffect(() => () => {
    document.documentElement.style.removeProperty('--market-tint');
  }, []);
  const [, setTick] = useState(0);

  const load = () => {
    api<MarketBoard>('/api/market')
      .then((next) => {
        setData((prev) => keepSkinMoves(next, prev));
        setError('');
        api<{ moves: { key: string; changePct: number | null; changeLabel: string; sparkline: number[] }[] }>('/api/market/moves')
          .then((pack) => {
            setData((current) => (current ? applySkinMoves(current, pack.moves) : current));
          })
          .catch(() => undefined);
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    load();
    const refresh = window.setInterval(load, 20_000);
    const clock = window.setInterval(() => setTick((value) => value + 1), 15_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, []);

  if (error && !data) return <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>;
  if (!data) return <QuietLoad />;

  const needle = query.trim();
  const still = stillMotion();
  const keep = (items: MarketTapeItem[]) => items.filter((item) => matches(needle, [item.name, item.symbol, item.sourceLabel]));
  const ranked = (items: MarketTapeItem[]) => [...items].sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
  const packs = [
    { id: 'crypto', title: 'Cripto', hint: 'criptomonedas bitcoin', icon: data.cryptos?.find((item) => item.image)?.image || '/markets/crypto.svg', raw: data.cryptos || [] },
    { id: 'stock', title: 'Acciones', hint: 'bolsa', icon: '/markets/stock.svg', raw: data.stocks || [] },
    { id: 'etf', title: 'ETF', hint: 'fondos', icon: '/markets/etf.svg', raw: data.etfs || [] },
    { id: 'index', title: 'Índices', hint: 'indice ibex', icon: '/markets/index.svg', raw: data.indices || [] },
    { id: 'gold', title: 'Oro', hint: 'gold', icon: '/platforms/oro.svg', raw: data.gold || [] },
    { id: 'silver', title: 'Plata', hint: 'silver', icon: '/markets/silver.svg', raw: data.silver || [] },
    { id: 'oil', title: 'Petróleo', hint: 'petroleo brent', icon: '/markets/oil.svg', raw: data.oil || [] },
    { id: 'copper', title: 'Cobre', hint: 'copper', icon: '/markets/copper.svg', raw: data.copper || [] },
    { id: 'cs2', title: 'CS2', hint: 'skins counter strike', icon: data.icons?.cs2 || '/platforms/cs2.svg', raw: data.cs2 || [] },
    { id: 'tf2', title: 'TF2', hint: 'team fortress', icon: data.icons?.tf2 || '/extras/tf2.svg', raw: data.tf2 || [] },
  ];
  const sections = packs.map((pack) => {
    const items = keep(pack.raw);
    const titleHit = needle.length > 0 && fold(`${pack.title} ${pack.hint}`).includes(fold(needle));
    return { ...pack, items, ready: pack.raw.length > 0, show: pack.raw.length > 0 && (!needle || titleHit || items.length > 0), preview: ranked(items.length ? items : pack.raw).slice(0, 2) };
  });
  const doors = sections.filter((section) => section.show);
  const active = sections.find((section) => section.id === market);
  const hero = HERO_MARKETS.has(market);
  const listed = hero || market === 'cs2' ? (active?.raw || []) : (active?.items || []);
  const shown = byMove(listed, tapeFilter);
  const showMoves = !skinDesk && !hero && market !== 'all' && market !== 'cs2' && (active?.raw.length || 0) > 1;
  const searchOn = market === 'all' || !hero;
  const tone = MARKET_TONE[market];
  const placeholder = market === 'all' ? 'Un mercado, Bitcoin o Pandora' : skinDesk ? 'Otra skin o desgaste…' : tone?.search || 'Buscar';
  const heading = skinDesk ? skinDesk.label : market === 'all' ? 'Mercado' : active?.title || 'Mercado';
  const stageKey = skinDesk ? `skin:${skinDesk.name}:${skinDesk.paintIndex ?? ''}` : market;
  const openTape = (item: MarketTapeItem) => setOpen({ kind: item.kind, key: item.key, name: item.name, symbol: item.symbol, priceEur: item.priceEur, changePct: item.changePct, changeLabel: item.changeLabel, sparkline: item.sparkline });
  const enter = (id: string) => {
    const section = sections.find((item) => item.id === id);
    const titleHit = Boolean(section && needle && fold(`${section.title} ${section.hint}`).includes(fold(needle)));
    dir.current = 1;
    if (needle && titleHit && section && section.items.length === 0) setQuery('');
    setTapeFilter('all');
    setSkinDesk(null);
    setWearPick('all');
    setMarket(id);
  };
  const back = () => {
    dir.current = -1;
    if (skinDesk) {
      setSkinDesk(null);
      setWearPick('all');
      setQuery('');
      setMarket('cs2');
      return;
    }
    setMarket('all');
    setTapeFilter('all');
  };
  const openSkin = (hit: SkinHit, wear: string | null) => {
    dir.current = market === 'cs2' ? dir.current : 1;
    setMarket('cs2');
    setSkinDesk(hit);
    setWearPick(wear && hit.wears.some((row) => row.wear === wear) ? wear : 'all');
  };
  const fresh = [...sections.flatMap((section) => section.raw), ...data.items].some((item) => !item.stale && !item.error);
  const empty = sections.every((section) => !section.ready) && data.items.length === 0;
  const noMatch = market === 'all' && !empty && needle.length > 0 && !skinMatch && doors.length === 0;
  const filtered = needle.length > 0 || tapeFilter !== 'all';

  return (
    <div className="relative mx-auto min-w-0 max-w-5xl space-y-5">
      <div
        className="sticky -top-2 z-30 -mt-2 mx-[calc(50%-50vw)] px-3 pb-3 pt-4 sm:px-4 md:px-8"
        style={{ background: 'linear-gradient(to bottom, var(--market-tint, var(--app-bg)) 0%, var(--market-tint, var(--app-bg)) 58%, var(--app-bg) 100%)' }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-8 bg-gradient-to-b from-[var(--app-bg)] to-transparent" />
        <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          {market !== 'all' && (
            <button type="button" onClick={back} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-slate-500" aria-label={skinDesk ? 'Volver a CS2' : 'Volver a mercados'}>
              <ChevronLeft size={16} />
              {skinDesk ? 'CS2' : 'Mercados'}
            </button>
          )}
          {skinDesk?.image ? (
            <img src={skinDesk.image} alt="" referrerPolicy="no-referrer" className="h-7 w-9 shrink-0 object-contain" />
          ) : active ? (
            <img src={active.icon} alt="" referrerPolicy="no-referrer" className="h-7 w-7 shrink-0 rounded-lg bg-white object-cover" />
          ) : null}
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{heading}</h1>
          <div className="flex shrink-0 items-center">
            <button type="button" aria-label="CSFloat" onClick={() => setDesk('csfloat')} className={cn('grid h-8 w-8 place-items-center rounded-full', desk === 'csfloat' ? 'text-slate-950 dark:text-white' : 'text-slate-400')}>
              <Star size={16} />
            </button>
            <button type="button" aria-label="Me interesa" onClick={() => setDesk('saved')} className={cn('grid h-8 w-8 place-items-center rounded-full', desk === 'saved' ? 'text-slate-950 dark:text-white' : 'text-slate-400')}>
              <Heart size={16} />
            </button>
          </div>
        </div>
        <p className="truncate text-[13px] font-semibold text-slate-500 dark:text-slate-400">
          {fresh ? `En vivo · ${formatAgo(data.updatedAt)}` : `Último intento ${formatAgo(data.updatedAt)}`}
        </p>
      {searchOn && (
          <div className="relative mt-1">
            <Input
              icon={<Search size={16} />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              aria-label="Buscar en este mercado"
              style={tone && market !== 'all' ? { boxShadow: `inset 3px 0 0 ${tone.accent}` } : undefined}
              trailing={
                query ? (
                  <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
                    <X size={16} />
                  </button>
                ) : undefined
              }
            />
            {(market === 'all' || market === 'cs2') && needle.length >= 2 && (
              <SkinSuggest query={needle} onMatch={setSkinMatch} onPick={openSkin} />
            )}
          </div>
      )}
        </div>
      </div>
      {data.warning && !quietWarning(data.warning) && !skinDesk && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{data.warning}</p>}
      {desk === 'saved' && (
        <Modal title="Me interesa" onClose={() => setDesk(null)}>
          <SavedDesk needle={needle} />
        </Modal>
      )}
      {desk === 'csfloat' && (
        <Modal title="CSFloat" onClose={() => { setDesk(null); setListingFocus(null); }}>
          <CsfloatFinder key={focusTick} focusId={listingFocus} />
        </Modal>
      )}
      {!desk && !open && createPortal(
        <button
          type="button"
          onClick={() => setDesk('alerts')}
          className="fixed z-50 rounded-full bg-slate-950 px-4 py-2.5 text-[15px] font-semibold text-white shadow-[0_10px_28px_rgba(15,23,42,0.18)] dark:bg-white dark:text-slate-950"
          style={{ right: '1.15rem', bottom: 'calc(env(safe-area-inset-bottom) + 6.25rem)' }}
        >
          Aviso
        </button>,
        document.body,
      )}
      {desk === 'alerts' && (
        <Modal title="Aviso" onClose={() => setDesk(null)}>
          <Followed onOpenListing={(id) => { setListingFocus(id); setDesk('csfloat'); }} />
          <AlertDesk items={data.signals || []} catalog={sections.flatMap((section) => section.items)} onChanged={load} />
        </Modal>
      )}
      <AnimatePresence mode="wait" initial={false} custom={dir.current}>
        <motion.div
          key={stageKey}
          custom={dir.current}
          variants={shift}
          initial={still ? false : 'enter'}
          animate="center"
          exit={still ? undefined : 'exit'}
          transition={softSpring}
          className="space-y-4"
        >
          {skinDesk ? (
            <DragRow className="-mx-4 flex max-w-full flex-nowrap gap-1.5 px-4">
              <button type="button" onClick={() => setWearPick('all')} className={cn('shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-black uppercase tracking-wide', wearPick === 'all' ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-white/10')}>General</button>
              {skinDesk.wears.map((option) => (
                <button key={option.wear} type="button" onClick={() => setWearPick(option.wear)} className={cn('shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-black uppercase tracking-wide', wearPick === option.wear ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-white/10')}>
                  {WEAR_CHIP[option.wear] || option.wear}
                </button>
              ))}
            </DragRow>
          ) : showMoves ? (
            <MoveFilter tone={market === 'crypto' ? 'pills' : 'segment'} value={tapeFilter} onChange={setTapeFilter} />
          ) : null}
          {market === 'all' ? (
            empty ? <EmptyNote>El mercado no ha respondido todavía.</EmptyNote>
            : noMatch ? <EmptyNote>{`Nada coincide con «${needle}».`}</EmptyNote>
            : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {doors.map((section, index) => {
                  const paint = MARKET_TONE[section.id]?.accent || '#94a3b8';
                  const lead = section.preview[0];
                  const solo = section.raw.length <= 1;
                  return (
                    <motion.button
                      key={section.id}
                      type="button"
                      onClick={() => enter(section.id)}
                      initial={still ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileTap={still ? undefined : { scale: 0.98 }}
                      transition={still ? { duration: 0 } : { ...softSpring, delay: Math.min(index, 9) * 0.028 }}
                      className="flex min-h-[9.25rem] flex-col rounded-[28px] bg-white p-3.5 text-left ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10"
                      style={{ boxShadow: `inset 0 2px 0 ${paint}` }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <img src={section.icon} alt="" width={36} height={36} referrerPolicy="no-referrer" className="h-9 w-9 rounded-2xl bg-white object-cover" />
                        {section.raw.length > 1 && <span className="text-[11px] font-bold tabular-nums text-slate-400">{section.raw.length}</span>}
                      </span>
                      <span className="mt-3 block text-base font-semibold">{section.title}</span>
                      {solo && lead ? (
                        <span className="mt-auto pt-2">
                          <span className="block text-lg font-black tabular-nums">{quoteAmount(lead.kind, lead.priceEur)}</span>
                          <Pct value={lead.changePct} className="text-xs" />
                        </span>
                      ) : (
                        <span className="mt-auto block space-y-1 pt-2">
                          {section.preview.map((item) => (
                            <span key={item.key} className="flex items-center justify-between gap-2 text-[11px] font-bold">
                              <span className="truncate text-slate-500">{item.symbol}</span>
                              <Pct value={item.changePct} className="text-[11px]" />
                            </span>
                          ))}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )
          ) : skinDesk ? (
            <SkinMarket skin={skinDesk} wear={wearPick} />
          ) : market === 'crypto' ? (
            <CryptoBoard items={shown} filtered={filtered} quiet={skinMatch && shown.length === 0} onOpen={openTape} />
          ) : market === 'stock' ? (
            <StockBoard items={shown} filtered={filtered} onOpen={openTape} />
          ) : market === 'etf' ? (
            <EtfBoard items={shown} filtered={filtered} onOpen={openTape} />
          ) : market === 'index' ? (
            <IndexBoard items={shown} filtered={filtered} onOpen={openTape} />
          ) : hero ? (
            <HeroBoard item={active?.raw[0]} accent={tone?.accent || '#94a3b8'} onOpen={openTape} />
          ) : market === 'cs2' ? (
            <GameBoard items={shown} filtered={filtered} quiet={skinMatch && shown.length === 0} onOpen={openTape} />
          ) : (
            <GameBoard items={shown} filtered={filtered} quiet={false} warm onOpen={openTape} />
          )}
        </motion.div>
      </AnimatePresence>
      {open && <StoryDialog item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
