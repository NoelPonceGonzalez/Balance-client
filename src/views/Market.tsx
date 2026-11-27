import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, ChevronLeft, ChevronRight, Heart, Search, Star, X } from 'lucide-react';
import { GlassButton, GlassGroup } from '@/components/GlassButton';
import { findBrand } from '@/lib/brands';
import { AnimatePresence, motion } from 'motion/react';
import { CsfloatFinder, SkinMarket, SkinSuggest, type SkinHit } from '@/components/CsfloatFinder';
import { DragRow } from '@/components/DragRow';
import { Modal } from '@/components/Modal';
import { markReady, arriveTokenNow } from '@/components/QuietLoad';
import { Segmented } from '@/components/Segmented';
import { Bone, ChartBone, RowBones } from '@/components/Skeleton';
import { cachedApi, peek } from '@/lib/query';
import { Sparkline } from '@/components/Sparkline';
import { useOpenOffer } from '@/components/offer-focus';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useDockSearch } from '@/components/dock/dock-search';
import { api } from '@/lib/api';
import { activatePush } from '@/lib/device';
import { formatAgo, formatDay, formatNumber, formatPct } from '@/lib/format';
import { marketDisplay, marketMark, marketMoney, marketReady, marketToEur, MarketCurrency, useMarketCode, useRescaleAmounts } from '@/lib/marketCurrency';
import { glide, quickOut, softSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { LineRangeTabs, lineDays, type LineRangeId } from '@/components/LineRanges';
import { CashChart, type LinePoint } from '@/views/Wallets';
import type { AppNotification, MarketBoard, MarketFollowed, MarketItem, MarketPending, MarketSignal, MarketStory, MarketTapeItem, QuoteCandidate } from '@/lib/types';

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

/** Logo de un valor de bolsa por su símbolo (servicio público de logos; si no hay, se cae a las iniciales). */
function tickerLogo(ticker: string): string {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker.toUpperCase())}.png`;
}

/** Símbolo para buscar el logo: solo acciones y ETF (las cripto ya traen su imagen). */
function tickerOf(item: { key?: string; quoteKey?: string | null; kind?: string; assetClass?: string; symbol?: string }): string | null {
  const kind = item.kind || item.assetClass || '';
  if (kind !== 'stock' && kind !== 'etf') return null;
  const key = item.key || item.quoteKey || '';
  if (key.startsWith('yahoo:')) return key.slice(6);
  return item.symbol || null;
}

const MONO_TINTS = ['from-slate-600 to-slate-800', 'from-sky-600 to-sky-800', 'from-indigo-500 to-indigo-700', 'from-emerald-600 to-emerald-800', 'from-amber-500 to-amber-700', 'from-rose-500 to-rose-700', 'from-violet-500 to-violet-700', 'from-teal-600 to-teal-800'];

/**
 * Logo de un activo. Orden: imagen del proveedor (cripto) → imagen propia → logo de marca local →
 * logo por símbolo (acciones/ETF) → iniciales en un cuadrado redondeado con color propio.
 */
function Mark({ image, symbol, fallback, contain, name, ticker }: { image: string | null; symbol: string; fallback?: string | null; contain?: boolean; name?: string; ticker?: string | null }) {
  const sources = useMemo(() => {
    const brand = name ? findBrand(name) : undefined;
    const local = brand && brand.kind === 'brand' ? `/brands/${brand.id}.${brand.image}` : null;
    return [image, fallback, local, ticker ? tickerLogo(ticker) : null].filter((src): src is string => Boolean(src));
  }, [image, fallback, name, ticker]);
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  if (src) {
    const own = src === image && !contain;
    return (
      <img
        src={src}
        alt=""
        width={40}
        height={40}
        referrerPolicy="no-referrer"
        onError={() => setFailed((value) => value + 1)}
        className={cn('h-10 w-10 shrink-0 bg-white', own ? 'rounded-full object-cover' : 'rounded-[12px] object-contain p-1 ring-1 ring-black/[0.06] dark:ring-white/10')}
      />
    );
  }
  const letters = (symbol || '?').split(/[.:\s-]/)[0].replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  const tint = MONO_TINTS[[...(symbol || '?')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % MONO_TINTS.length];
  return <span aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-gradient-to-b text-[14px] font-semibold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]', tint)}>{letters}</span>;
}

function QuoteSearch({ assetClass, onPick }: { assetClass: string; onPick: (item: QuoteCandidate) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuoteCandidate[]>([]);
  const [error, setError] = useState('');
  const latest = useRef<AbortController | null>(null);

  const search = async () => {
    setError('');
    latest.current?.abort();
    const abort = new AbortController();
    latest.current = abort;
    try {
      const data = await api<{ results: QuoteCandidate[] }>(`/api/market/search?q=${encodeURIComponent(query)}&assetClass=${encodeURIComponent(assetClass)}`, { signal: abort.signal });
      if (latest.current !== abort) return;
      setResults(data.results);
      if (!data.results.length) setError('No hay una cotización con ese nombre.');
    } catch (err) {
      if (latest.current !== abort) return;
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
            <Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} />
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

function inPoints(externalId?: string | null, quoteKey?: string | null): boolean {
  return Boolean(externalId?.startsWith('^') || quoteKey?.startsWith('yahoo:^'));
}

function pointText(value: number): string {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value)} pts`;
}

function canSpan(kind: string) {
  return kind === 'crypto' || kind === 'etf' || kind === 'stock' || kind === 'gold' || kind === 'silver' || kind === 'oil' || kind === 'copper' || kind === 'index' || kind === 'cs2';
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
  return <span className={cn('font-semibold tabular-nums', !up && !down ? 'text-slate-400' : up ? 'text-[#16c784]' : 'text-[#ea3943]', className)}>{value == null ? '—' : formatPct(value)}</span>;
}

function EmptyNote({ children }: { children: string }) {
  return <p className="px-4 py-12 text-center text-[15px] font-medium text-slate-400 dark:text-slate-500">{children}</p>;
}

function MoveFilter({ value, onChange }: { tone?: 'pills' | 'segment'; value: TapeFilter; onChange: (id: TapeFilter) => void }) {
  return (
    <Segmented
      id="market-move"
      label="Filtrar por variación"
      value={value}
      onChange={onChange}
      options={TAPE_FILTERS.map((filter) => ({ id: filter.id, label: filter.label, tone: filter.id === 'up' ? 'up' : filter.id === 'down' ? 'down' : undefined }))}
    />
  );
}

/**
 * Lista de cotizaciones estilo Trade Republic: logo, nombre y símbolo, minigráfica y precio con variación.
 * La columna de cifras tiene ancho fijo y números tabulares: una cotización nueva no mueve la fila.
 * Solo las 12 primeras filas entran con movimiento (no se animan listas enteras).
 */
function QuoteList({ items, onOpen }: { items: MarketTapeItem[]; onOpen: (item: MarketTapeItem) => void }) {
  const still = stillMotion();
  return (
    <div className="divide-y divide-slate-100 dark:divide-white/[0.08]">
      {items.map((item, index) => {
        const up = (item.changePct ?? 0) > 0;
        const moving = !still && index < 12;
        return (
          <motion.button
            key={item.key}
            type="button"
            onClick={() => onOpen(item)}
            initial={moving ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={moving ? { ...glide, delay: index * 0.025 } : { duration: 0 }}
            className="-mx-2 grid w-[calc(100%+1rem)] grid-cols-[auto_minmax(0,1fr)_auto_6.5rem] items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors duration-150 active:bg-slate-50 dark:active:bg-white/[0.04]"
          >
            <Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} contain={item.kind === 'index'} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-tight text-slate-950 dark:text-white">{item.name}</span>
              <span className="mt-0.5 block truncate text-[13px] font-medium uppercase text-slate-400 dark:text-slate-500">{item.symbol}</span>
            </span>
            {/* Sparkline intacta (D013): solo se le da un ancho fijo desde fuera. */}
            <span className="block w-16 sm:w-28 [&_svg]:max-w-none [&_span]:max-w-none"><Sparkline values={item.sparkline} up={up} /></span>
            <span className="text-right">
              <span className="block truncate text-[15px] font-semibold leading-tight tabular-nums tracking-tight text-slate-950 dark:text-white">{quoteAmount(item.kind, item.priceEur)}</span>
              <Pct value={item.changePct} className="mt-0.5 block text-[13px]" />
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

function CryptoBoard({ items, filtered, quiet, onOpen }: { items: MarketTapeItem[]; filtered: boolean; quiet: boolean; onOpen: (item: MarketTapeItem) => void }) {
  if (!items.length) {
    if (quiet) return null;
    return <EmptyNote>{filtered ? 'Ninguna cripto coincide.' : 'Todavía no hay criptos con precio.'}</EmptyNote>;
  }
  return <QuoteList items={items} onOpen={onOpen} />;
}

function StockBoard({ items, filtered, onOpen }: { items: MarketTapeItem[]; filtered: boolean; onOpen: (item: MarketTapeItem) => void }) {
  if (!items.length) return <EmptyNote>{filtered ? 'Ninguna acción coincide.' : 'Todavía no hay acciones.'}</EmptyNote>;
  return <QuoteList items={items} onOpen={onOpen} />;
}

function EtfBoard({ items, filtered, onOpen }: { items: MarketTapeItem[]; filtered: boolean; onOpen: (item: MarketTapeItem) => void }) {
  if (!items.length) return <EmptyNote>{filtered ? 'Ningún ETF coincide.' : 'Todavía no hay ETF.'}</EmptyNote>;
  return <QuoteList items={items} onOpen={onOpen} />;
}

function IndexBoard({ items, filtered, onOpen }: { items: MarketTapeItem[]; filtered: boolean; onOpen: (item: MarketTapeItem) => void }) {
  if (!items.length) return <EmptyNote>{filtered ? 'Ningún índice coincide.' : 'Todavía no hay índices.'}</EmptyNote>;
  return <QuoteList items={items} onOpen={onOpen} />;
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
      className="w-full rounded-3xl px-1 py-2 text-left"
    >
      <span className="flex items-center gap-3">
        <Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} />
        <span className="min-w-0">
          <span className="block truncate text-lg font-semibold">{item.name}</span>
          <span className="block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>{item.symbol}</span>
        </span>
      </span>
      <span className="mt-6 block text-[clamp(2.35rem,10.5vw,3.25rem)] font-semibold leading-[1.04] tabular-nums tracking-[-0.035em] text-slate-950 dark:text-white">{quoteAmount(item.kind, item.priceEur)}</span>
      <span className="mt-2 block"><Pct value={item.changePct} className="text-[15px]" /></span>
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
          initial={still || index > 11 ? false : { opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileTap={still ? undefined : { scale: 0.98 }}
          transition={still ? { duration: 0 } : { ...softSpring, delay: Math.min(index, 8) * 0.04 }}
          className="overflow-hidden rounded-3xl bg-slate-50 text-left text-slate-900 dark:bg-white/[0.05] dark:text-white"
        >
          <span className="grid aspect-[5/4] place-items-center bg-slate-50 dark:bg-white/5" style={{ background: warm ? 'radial-gradient(circle at 50% 42%, rgba(222,155,53,0.35), transparent 70%)' : 'radial-gradient(circle at 50% 42%, rgba(148,163,184,0.35), transparent 70%)' }}>
            {item.image ? <img src={item.image} alt="" referrerPolicy="no-referrer" className="h-[72%] w-[72%] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.45)]" /> : <Mark image={null} symbol={item.symbol} />}
          </span>
          <span className="block px-3 py-2.5">
            <span className="block truncate text-sm font-semibold">{item.name}</span>
            <span className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold tabular-nums">{quoteAmount(item.kind, item.priceEur)}</span>
              {item.changePct != null && <Pct value={item.changePct} className="text-[13px]" />}
            </span>
          </span>
        </motion.button>
      ))}
    </div>
  );
}

/** Activos que admiten seguimiento y avisos de cotización. */
const FOLLOWABLE = new Set(['crypto', 'stock', 'etf']);

/**
 * «Siguiendo»: lo que tienes en cartera y lo que sigues con estrella, una fila por activo. Marcas discretas:
 * la línea de abajo dice si está en cartera o lo sigues; estrella si lo sigues a mano; campana si tiene aviso
 * de precio.
 */
function FollowList({ items, onOpen }: { items: MarketFollowed[]; onOpen: (item: MarketFollowed) => void }) {
  if (!items.length) return null;
  return (
    <section aria-label="Siguiendo">
      <p className="px-1 pb-1 text-[13px] font-semibold text-slate-500 dark:text-slate-400">Siguiendo · {items.length}</p>
      <div className="divide-y divide-slate-100 dark:divide-white/[0.08]">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onOpen(item)}
            className="-mx-2 grid w-[calc(100%+1rem)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors duration-150 active:bg-slate-50 dark:active:bg-white/[0.04]"
          >
            <Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold leading-tight text-slate-950 dark:text-white">{item.name}</span>
                {item.starred && <Star size={12} strokeWidth={2.4} aria-hidden className="shrink-0 fill-current text-slate-900 dark:text-white" />}
                {item.alerted && <Bell size={12} strokeWidth={2.4} aria-hidden className="shrink-0 text-slate-400" />}
              </span>
              <span className="mt-0.5 block truncate text-[13px] font-medium text-slate-400 dark:text-slate-500">
                {item.held ? `En cartera${item.accounts ? ` · ${item.accounts}` : ''}` : 'La sigues'}
                {item.held && item.starred ? <span className="sr-only"> · también con estrella</span> : null}
                {item.alerted ? <span className="sr-only"> · con aviso de precio</span> : null}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-[15px] font-semibold leading-tight tabular-nums tracking-tight text-slate-950 dark:text-white">{quoteAmount(item.kind, item.priceEur)}</span>
              <Pct value={item.changePct} className="mt-0.5 block text-[13px]" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function quoteAmount(kind: string, value: number | null | undefined): string {
  if (kind === 'index') return formatNumber(value, 2);
  return marketMoney(value);
}

function QuoteRow({ item, onOpen, onChanged }: { item: MarketItem; onOpen: () => void; onChanged: () => void }) {
  const up = (item.changePct ?? 0) >= 0;
  return (
    <article className="border-b border-slate-100 py-4 last:border-0 dark:border-slate-800">
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-left sm:grid-cols-[auto_minmax(0,1fr)_5.5rem_auto]">
        <Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.name}</p>
          <p className="truncate text-[11px] font-bold uppercase text-slate-400">{item.symbol} · {item.accountName}</p>
        </div>
        <span className="hidden sm:block"><Sparkline values={item.sparkline} up={up && item.changePct !== 0} /></span>
        <div className="text-right">
          <p className="font-black tabular-nums">{marketMoney(item.priceEur)}</p>
          <p className="text-[11px] font-medium text-slate-500">{item.quantity > 0 ? `${formatNumber(item.quantity, 8)} · ${marketMoney(item.valueEur)}` : 'Sin cantidad'}</p>
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
      <Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} fallback={fallback} contain={game} />
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
                  <p className="text-sm font-bold tabular-nums text-slate-500">{offer.priceEur == null ? '—' : marketMoney(offer.priceEur)}{offer.floatValue == null ? '' : ` · float ${offer.floatValue.toFixed(4)}`}</p>
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
  | { kind: 'quote'; source: 'coingecko' | 'yahoo'; externalId: string; name: string; symbol: string; priceEur: number | null; image: string | null }
  | { kind: 'skin'; name: string; wear: string; wears: string[]; image: string | null };

function sameAlert(item: MarketSignal, note: AppNotification): boolean {
  if (!note.quoteKey) return false;
  if (item.kind === 'compra') return note.quoteKey.startsWith(`listing:${item.id}:`);
  return Boolean(item.quoteKey) && note.quoteKey === item.quoteKey;
}

function ruleLine(item: MarketSignal): string {
  const shown = (value: number) => inPoints(null, item.quoteKey) ? pointText(value) : marketMoney(value);
  const parts = [
    item.above != null ? `Por encima de ${shown(item.above)}` : '',
    item.below != null ? `Por debajo de ${shown(item.below)}` : '',
    item.maxFloat != null ? `Float hasta ${item.maxFloat}` : '',
    item.paintSeed != null ? `Patrón ${item.paintSeed}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'Escuchando';
}

function withCeiling(text: string, ceiling: number | null): string {
  if (ceiling == null) return text;
  return text.replace(/por debajo de\s+\d[\d.\s]*,\d{2}\s*€/gi, `por debajo de ${marketMoney(ceiling)}`);
}

function optionalBound(value: string, min: number, max: number, integer = false): number | null {
  const text = value.trim().replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) return Number.NaN;
  return number;
}

type CreateKind = 'cs2' | 'crypto' | 'stock' | 'etf' | 'index' | 'gold' | 'silver' | 'oil' | 'copper';

const CREATE_KINDS: { id: CreateKind; label: string }[] = [
  { id: 'crypto', label: 'Cripto' },
  { id: 'stock', label: 'Acciones' },
  { id: 'etf', label: 'ETF' },
  { id: 'index', label: 'Índices' },
  { id: 'gold', label: 'Oro' },
  { id: 'silver', label: 'Plata' },
  { id: 'oil', label: 'Petróleo' },
  { id: 'copper', label: 'Cobre' },
  { id: 'cs2', label: 'CS2' },
];

function kindFromMarket(market: string): CreateKind | null {
  return CREATE_KINDS.some((item) => item.id === market) ? market as CreateKind : null;
}

function groupOf(item: MarketSignal, catalog: MarketTapeItem[]): { id: string; label: string } {
  if (item.kind === 'compra') return { id: 'cs2', label: 'CS2' };
  const known = CREATE_KINDS.find((row) => catalog.some((entry) => entry.key === item.quoteKey && entry.kind === row.id));
  if (known) return { id: known.id, label: known.label };
  if (item.quoteKey?.startsWith('coingecko:')) return { id: 'crypto', label: 'Cripto' };
  return { id: 'otros', label: 'Otros' };
}

function groupAlerts(items: MarketSignal[], catalog: MarketTapeItem[]) {
  const order = ['cs2', 'crypto', 'stock', 'etf', 'index', 'gold', 'silver', 'oil', 'copper', 'otros'];
  const buckets = new Map<string, { label: string; items: MarketSignal[] }>();
  for (const item of items) {
    const group = groupOf(item, catalog);
    const bucket = buckets.get(group.id) || { label: group.label, items: [] };
    bucket.items.push(item);
    buckets.set(group.id, bucket);
  }
  return order.flatMap((id) => {
    const bucket = buckets.get(id);
    return bucket ? [{ id, ...bucket }] : [];
  });
}

function AlertDesk({ items, catalog, hashes, market, onChanged }: { items: MarketSignal[]; catalog: MarketTapeItem[]; hashes: Record<string, string>; market: string; onChanged: () => void }) {
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
  const [editing, setEditing] = useState<MarketSignal | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<AppNotification[] | null>(null);
  const [pane, setPane] = useState<'list' | 'create'>('list');
  const [createFor, setCreateFor] = useState<CreateKind | null>(() => kindFromMarket(market));
  const [maxFloat, setMaxFloat] = useState('');
  const [pattern, setPattern] = useState('');
  const [priceWait, setPriceWait] = useState(false);
  const [dropping, setDropping] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  useRescaleAmounts(setAbove, setBelow);

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
    if (text.length < 2 || !createFor) {
      setQuotes([]);
      setSkins([]);
      return;
    }
    if (createFor === 'cs2') {
      try {
        const gloves = await api<{ results: { name: string; wears: string[]; image: string | null }[] }>(`/api/market/skins?q=${encodeURIComponent(text)}`);
        setSkins(gloves.results || []);
        setNote('');
      } catch (err) {
        setSkins([]);
        setNote(err instanceof Error ? err.message : 'La búsqueda no ha respondido.');
      }
      setQuotes([]);
      return;
    }
    if (createFor === 'crypto' || createFor === 'stock' || createFor === 'etf' || createFor === 'index') {
      try {
        const found = await api<{ results: QuoteCandidate[] }>(`/api/market/search?q=${encodeURIComponent(text)}&assetClass=${encodeURIComponent(createFor)}`);
        setQuotes(found.results || []);
        setNote('');
      } catch (err) {
        setQuotes([]);
        setNote(err instanceof Error ? err.message : 'La búsqueda no ha respondido.');
      }
      setSkins([]);
      return;
    }
    setQuotes([]);
    setSkins([]);
  };

  const local = query.trim().length < 2 || !createFor || createFor === 'cs2'
    ? []
    : catalog.filter((item) => item.kind === createFor && matches(query, [item.name, item.symbol])).slice(0, 6);
  const fixed = createFor && createFor !== 'cs2' && createFor !== 'crypto' && createFor !== 'stock' && createFor !== 'etf'
    ? catalog.filter((item) => item.kind === createFor)
    : [];
  const createPlaceholder = createFor === 'cs2' ? 'Pandora, guantes, AK…' : createFor === 'crypto' ? 'Bitcoin, ether, solana…' : createFor === 'stock' ? 'Apple, NVIDIA, ASML…' : createFor === 'etf' ? 'VWCE, S&P 500…' : createFor === 'index' ? 'Ibex, S&P, Nasdaq…' : 'Buscar en este mercado';
  const lockedKind = kindFromMarket(market);
  const shownFixed = query.trim().length >= 2 ? local : fixed;

  useEffect(() => {
    if (pane !== 'create' || !createFor || createFor === 'cs2' || createFor === 'crypto' || createFor === 'stock' || createFor === 'etf') return;
    const rows = catalog.filter((item) => item.kind === createFor);
    if (rows.length !== 1) return;
    const quote = quoteOf(rows[0].key);
    if (!quote) return;
    const row = rows[0];
    setPicked((current) => current ?? { kind: 'quote', ...quote, name: row.name, symbol: row.symbol, priceEur: row.priceEur, image: row.image });
  }, [pane, createFor, catalog]);

  const amount = (value: string) => {
    const number = Number(value.replace(',', '.'));
    return number > 0 ? number : null;
  };
  const priced = (value: string) => {
    const number = amount(value);
    return number == null ? null : marketToEur(number);
  };
  const rateReady = () => {
    if (marketReady()) return true;
    setNote('El cambio del dólar no ha llegado. Espera un momento.');
    return false;
  };

  const beginEdit = (item: MarketSignal) => {
    setHistory(null);
    setPicked(null);
    setQuery('');
    setQuotes([]);
    setSkins([]);
    setEditing(item);
    const points = inPoints(null, item.quoteKey);
    const written = (value: number) => points ? String(Math.round(value * 100) / 100) : marketDisplay(value);
    setAbove(item.above != null ? written(item.above) : '');
    setBelow(item.below != null ? written(item.below) : '');
    setMaxFloat(item.maxFloat != null ? String(item.maxFloat) : '');
    setPattern(item.paintSeed != null ? String(item.paintSeed) : '');
    setDropping(null);
    setNote('');
  };

  const finish = () => {
    setPicked(null);
    setEditing(null);
    setHistory(null);
    setQuery('');
    setAbove('');
    setBelow('');
    setMaxFloat('');
    setPattern('');
    setPriceWait(false);
    setDropping(null);
    setQuotes([]);
    setSkins([]);
    setPane('list');
    window.dispatchEvent(new Event('pat-alerts'));
    onChanged();
  };

  const save = async () => {
    if (!picked || busy) return;
    const quotePoints = picked.kind === 'quote' && inPoints(picked.externalId);
    if (!quotePoints && !rateReady()) return;
    setNote('');
    setBusy(true);
    try {
      if (picked.kind === 'skin') {
        const price = priced(below);
        if (price == null) {
          setNote('Pon el precio por debajo del cual avisar.');
          return;
        }
        const cap = optionalBound(maxFloat, 0, 1);
        const seed = optionalBound(pattern, 0, 1000, true);
        if (Number.isNaN(cap) || Number.isNaN(seed)) {
          setNote('El float va de 0 a 1 y el patrón es un número entero.');
          return;
        }
        const marketHashName = picked.wear ? `${picked.name} (${picked.wear})` : picked.name;
        await api('/api/market/watch', {
          method: 'POST',
          body: JSON.stringify({ label: picked.name.replace(/^★\s*/, ''), marketHashName, below: price, maxFloat: cap, paintSeed: seed }),
        });
      } else {
        const high = quotePoints ? amount(above) : priced(above);
        const low = quotePoints ? amount(below) : priced(below);
        if (high == null && low == null) {
          setNote(quotePoints ? 'Pon los puntos por encima, por debajo, o los dos.' : 'Pon un precio por encima, por debajo, o los dos.');
          return;
        }
        await api('/api/market/listen', {
          method: 'POST',
          body: JSON.stringify({ source: picked.source, externalId: picked.externalId, above: high, below: low }),
        });
      }
      finish();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se ha podido guardar el aviso.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing || busy) return;
    const quotePoints = editing.kind !== 'compra' && inPoints(null, editing.quoteKey);
    if (!quotePoints && !rateReady()) return;
    setNote('');
    const low = quotePoints ? amount(below) : priced(below);
    const high = quotePoints ? amount(above) : priced(above);
    setBusy(true);
    try {
      if (editing.kind === 'compra') {
        const marketHashName = hashes[editing.id];
        if (!marketHashName) {
          setNote('Este aviso no se puede cambiar desde aquí.');
          return;
        }
        if (low == null) {
          setNote('Pon el precio por debajo del cual avisar.');
          return;
        }
        const cap = optionalBound(maxFloat, 0, 1);
        const seed = optionalBound(pattern, 0, 1000, true);
        if (Number.isNaN(cap) || Number.isNaN(seed)) {
          setNote('El float va de 0 a 1 y el patrón es un número entero.');
          return;
        }
        await api('/api/market/watch', {
          method: 'POST',
          body: JSON.stringify({ label: editing.name, marketHashName, below: low, maxFloat: cap, paintSeed: seed }),
        });
      } else {
        const quote = editing.quoteKey ? quoteOf(editing.quoteKey) : null;
        if (!quote) {
          setNote('Este aviso no se puede cambiar desde aquí.');
          return;
        }
        if (high == null && low == null) {
          setNote(quotePoints ? 'Pon los puntos por encima, por debajo, o los dos.' : 'Pon un precio por encima, por debajo, o los dos.');
          return;
        }
        await api('/api/market/listen', {
          method: 'POST',
          body: JSON.stringify({ source: quote.source, externalId: quote.externalId, above: high, below: low }),
        });
      }
      finish();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se ha podido guardar el aviso.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (item: MarketSignal) => {
    const key = `${item.kind}:${item.id}`;
    setGone((current) => new Set(current).add(key));
    setDropping(null);
    setNote('');
    const path = item.kind === 'compra' ? `/api/market/watch/${item.id}` : `/api/market/listen/${encodeURIComponent(item.id)}`;
    void api(path, { method: 'DELETE' }).then(() => {
      window.dispatchEvent(new Event('pat-alerts'));
      onChanged();
    }).catch((err: Error) => {
      setGone((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setNote(err.message || 'No se ha podido quitar el aviso.');
    });
  };

  const pickKind = (kind: CreateKind) => {
    setCreateFor(kind);
    setPicked(null);
    setQuery('');
    setQuotes([]);
    setSkins([]);
    setAbove('');
    setBelow('');
    setMaxFloat('');
    setPattern('');
    setPriceWait(false);
    setNote('');
  };

  const revealPrice = (row: { source: 'coingecko' | 'yahoo'; externalId: string; name: string; symbol: string; image: string | null; priceEur: number | null }) => {
    setPicked({ kind: 'quote', ...row });
    if (row.priceEur != null || !createFor) return;
    const key = `${row.source}:${row.externalId}`;
    setPriceWait(true);
    void api<{ series: { eur: number }[] }>(`/api/market/story?kind=${encodeURIComponent(createFor)}&key=${encodeURIComponent(key)}&name=${encodeURIComponent(row.name)}&symbol=${encodeURIComponent(row.symbol)}&days=7`)
      .then((story) => {
        const last = story.series?.at(-1)?.eur;
        if (last == null) return;
        setPicked((current) => current && current.kind === 'quote' && current.externalId === row.externalId ? { ...current, priceEur: last } : current);
      })
      .catch(() => undefined)
      .finally(() => setPriceWait(false));
  };

  const openPane = (next: 'list' | 'create') => {
    setPane(next);
    setEditing(null);
    setHistory(null);
    setNote('');
  };

  const visible = items.filter((item) => !gone.has(`${item.kind}:${item.id}`));
  const editPoints = editing != null && inPoints(null, editing.quoteKey);
  const editUnit = editPoints ? 'puntos' : marketMark();
  const createPoints = picked?.kind === 'quote' && inPoints(picked.externalId);
  const createUnit = createPoints ? 'puntos' : marketMark();
  const resultClass = 'flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm font-semibold hover:bg-slate-50 dark:hover:bg-white/5';

  return (
    <div>
      <div className="grid grid-cols-2 rounded-full bg-slate-200/90 p-1 dark:bg-white/10">
        {([['list', 'Tus avisos'], ['create', 'Crear']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={pane === id}
            onClick={() => openPane(id)}
            className={cn('rounded-full px-4 py-1.5 text-center text-[13px] font-semibold', pane === id ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 dark:text-slate-300')}
          >
            {label}
          </button>
        ))}
      </div>

      {pane === 'list' && editing && (
        <div className="mt-4 grid gap-3">
          <button type="button" onClick={() => { setEditing(null); setNote(''); }} className="justify-self-start text-[13px] font-semibold text-slate-500">Volver</button>
          <p className="flex items-center gap-3 text-sm font-semibold">
            <Mark image={editing.image || null} symbol={editing.name} contain={editing.kind === 'compra'} fallback={editing.kind === 'compra' ? '/platforms/cs2.svg' : null} />
            <span className="min-w-0">{editing.name}</span>
          </p>
          <p className="text-xs font-medium text-slate-400">Ahora: {ruleLine(editing)}{editing.priceEur == null ? '' : ` · ${editPoints ? pointText(editing.priceEur) : `precio ${marketMoney(editing.priceEur)}`}`}</p>
          {editing.kind === 'precio' && <Input label={`Avisar si pasa por encima de (${editUnit})`} type="number" min="0" step="any" value={above} onChange={(event) => setAbove(event.target.value)} placeholder="Opcional" />}
          <Input label={editing.kind === 'compra' ? `Avisar si alguien lo pone por debajo de (${marketMark()})` : `Avisar si baja de (${editUnit})`} type="number" min="0" step="any" value={below} onChange={(event) => setBelow(event.target.value)} placeholder={editing.kind === 'precio' ? 'Opcional' : ''} />
          {editing.kind === 'compra' && (
            <>
              <Input label="Float máximo" type="number" min="0" max="1" step="0.0001" value={maxFloat} onChange={(event) => setMaxFloat(event.target.value)} placeholder="Opcional" />
              <Input label="Patrón" type="number" min="0" max="1000" step="1" value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="Opcional" />
            </>
          )}
          <Button type="button" disabled={busy} onClick={() => void saveEdit()}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          {note && <p className="text-xs font-medium text-rose-600">{note}</p>}
        </div>
      )}

      {pane === 'list' && history && !editing && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setHistory(null)} className="text-[13px] font-semibold text-slate-500">Volver</button>
            <button type="button" onClick={() => beginEdit(history)} className="text-[13px] font-semibold text-slate-900 dark:text-white">Editar</button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Mark image={history.image || null} symbol={history.name} contain={history.kind === 'compra'} fallback={history.kind === 'compra' ? '/platforms/cs2.svg' : null} />
            <div className="min-w-0">
              <p className="font-semibold">{history.name}</p>
              <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">{ruleLine(history)}</p>
              <p className="text-xs font-medium text-slate-400">{history.priceEur == null ? 'Sin precio ahora' : `Ahora ${marketMoney(history.priceEur)}`}</p>
            </div>
          </div>
          {notes == null && <p className="mt-4 text-sm font-medium text-slate-400">Cargando…</p>}
          {notes && notes.length === 0 && <p className="mt-4 text-sm font-medium text-slate-500">Todavía no ha saltado ninguno.</p>}
          {notes && notes.length > 0 && (
            <div className="mt-2 divide-y divide-slate-100 dark:divide-white/10">
              {notes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { if (item.quoteKey?.startsWith('listing:')) openOffer(item); }}
                  className="block w-full py-3 text-left"
                >
                  <p className="font-black text-[#ea3943]">{item.priceEur == null ? withCeiling(item.title, history.below) : marketMoney(item.priceEur)}</p>
                  {item.priceEur != null && <p className="text-xs font-medium text-slate-500">{withCeiling(item.title, history.below)}</p>}
                  <p className="text-xs font-medium text-slate-500">{withCeiling(item.body, history.below)}</p>
                  {item.floatValue != null && <p className="text-[11px] font-medium text-slate-400">Float {item.floatValue.toFixed(4)}</p>}
                  <p className="mt-1 text-[11px] font-bold text-slate-400">{formatAgo(item.createdAt)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {pane === 'list' && !history && !editing && (
        <div className="mt-4">
          {visible.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center dark:bg-white/5">
              <p className="text-sm font-medium text-slate-500">Todavía no tienes avisos.</p>
              <button type="button" onClick={() => openPane('create')} className="mt-3 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">Crear aviso</button>
            </div>
          ) : (
            <div className="space-y-4">
              {groupAlerts(visible, catalog).map((group) => (
                <section key={group.id} className="space-y-2">
                  <p className="px-1 text-[13px] font-semibold text-slate-500">{group.label} · {group.items.length}</p>
                  {group.items.map((item) => {
                    const key = `${item.kind}:${item.id}`;
                    return (
                      <article key={key} className="rounded-2xl bg-slate-50 px-3 py-3 dark:bg-white/5">
                        <button type="button" onClick={() => setHistory(item)} className="flex w-full items-center gap-3 text-left">
                          <Mark image={item.image || null} symbol={item.name} contain={item.kind === 'compra'} fallback={item.kind === 'compra' ? '/platforms/cs2.svg' : null} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{item.name}</span>
                            <span className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200">{ruleLine(item)}</span>
                            <span className="block text-xs font-medium text-slate-400">{item.priceEur == null ? 'Sin precio ahora' : `Ahora ${marketMoney(item.priceEur)}`}</span>
                          </span>
                        </button>
                        {dropping === key ? (
                          <div className="mt-2.5 flex items-center gap-2">
                            <p className="text-xs font-medium text-slate-500">Se deja de escuchar.</p>
                            <button type="button" onClick={() => { setDropping(null); remove(item); }} className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">Quitar</button>
                            <button type="button" onClick={() => setDropping(null)} className="px-2 py-1 text-xs font-semibold text-slate-500">Cancelar</button>
                          </div>
                        ) : (
                          <div className="mt-2.5 flex items-center gap-2">
                            <button type="button" onClick={() => beginEdit(item)} className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">Editar</button>
                            <button type="button" onClick={() => setHistory(item)} className="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Historial</button>
                            <button type="button" onClick={() => setDropping(key)} className="ml-auto px-2 py-1 text-xs font-semibold text-slate-400">Quitar</button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              ))}
            </div>
          )}
          {note && <p className="mt-3 text-xs font-medium text-rose-600">{note}</p>}
          <button type="button" onClick={() => void activatePush().then(setPhone).catch((err: Error) => setPhone(err.message))} className="mt-4 text-xs font-semibold text-slate-500">Avisos en el móvil</button>
          {phone && <p className="mt-1 text-xs font-medium text-slate-500">{phone}</p>}
        </div>
      )}

      {pane === 'create' && (
        <div className="mt-4 grid gap-3">
          {!lockedKind && (
            <div className="flex flex-wrap gap-1.5">
              {CREATE_KINDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={createFor === item.id}
                  onClick={() => pickKind(item.id)}
                  className={cn('rounded-full px-3 py-1 text-xs font-semibold', createFor === item.id ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300')}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {!createFor && <p className="text-sm font-medium text-slate-500">Elige el mercado del aviso.</p>}
          {createFor && !picked && (
            <>
              {(createFor === 'cs2' || createFor === 'crypto' || createFor === 'stock' || createFor === 'etf' || createFor === 'index') && (
                <Input value={query} onChange={(event) => void search(event.target.value)} placeholder={createPlaceholder} aria-label="Buscar para un aviso" />
              )}
              {shownFixed.length > 0 && (
                <div className="grid gap-1">
                  {shownFixed.map((item) => {
                    const quote = quoteOf(item.key);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          if (!quote) {
                            setNote('Ese mercado no tiene cotización todavía.');
                            return;
                          }
                          revealPrice({ ...quote, name: item.name, symbol: item.symbol, priceEur: item.priceEur, image: item.image });
                        }}
                        className={resultClass}
                      >
                        <Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} />
                        <span className="min-w-0">
                          {item.name}
                          <span className="ml-2 text-[11px] font-bold uppercase text-slate-400">{item.priceEur == null ? item.symbol : inPoints(quote?.externalId, item.key) ? pointText(item.priceEur) : marketMoney(item.priceEur)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {(quotes.length > 0 || skins.length > 0) && (
                <div className="grid gap-1">
                  {quotes.filter((item) => !local.some((row) => row.key === `${item.source}:${item.externalId}`)).map((item) => (
                    <button key={`${item.source}:${item.externalId}`} type="button" onClick={() => revealPrice({ source: item.source, externalId: item.externalId, name: item.name, symbol: item.symbol, priceEur: null, image: item.image })} className={resultClass}>
                      <Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} />
                      <span className="min-w-0">{item.name}<span className="ml-2 text-[11px] font-bold uppercase text-slate-400">{item.symbol}</span></span>
                    </button>
                  ))}
                  {skins.map((item) => (
                    <button key={item.name} type="button" onClick={() => setPicked({ kind: 'skin', name: item.name, wear: item.wears[0] || '', wears: item.wears, image: item.image })} className={resultClass}>
                      <Mark image={item.image} symbol="CS2" contain fallback="/platforms/cs2.svg" />
                      <span className="min-w-0">{item.name}<span className="ml-2 text-[11px] font-bold uppercase text-slate-400">a la venta</span></span>
                    </button>
                  ))}
                </div>
              )}
              {query.trim().length >= 2 && shownFixed.length === 0 && quotes.length === 0 && skins.length === 0 && (
                <p className="text-sm font-medium text-slate-500">Nada con ese nombre en este mercado.</p>
              )}
              {query.trim().length < 2 && shownFixed.length === 0 && createFor !== 'cs2' && createFor !== 'crypto' && createFor !== 'stock' && createFor !== 'etf' && (
                <p className="text-sm font-medium text-slate-500">No hay precio de este mercado ahora.</p>
              )}
            </>
          )}
          {createFor && picked && (
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <Mark image={picked.image} symbol={picked.name} contain={picked.kind === 'skin'} fallback={picked.kind === 'skin' ? '/platforms/cs2.svg' : null} />
                <p className="min-w-0 flex-1 text-sm font-semibold">
                  {picked.name}
                  {picked.kind === 'quote' ? <span className="mt-0.5 block text-xs font-medium text-slate-400">{picked.priceEur != null ? (createPoints ? pointText(picked.priceEur) : marketMoney(picked.priceEur)) : priceWait ? 'Buscando el precio…' : 'Sin precio ahora'}</span> : null}
                </p>
                {fixed.length !== 1 && (
                  <button type="button" onClick={() => setPicked(null)} className="shrink-0 text-[13px] font-semibold text-slate-500">Cambiar</button>
                )}
              </div>
              {picked.kind === 'skin' && picked.wears.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {picked.wears.map((wear) => (
                    <button key={wear} type="button" onClick={() => setPicked({ ...picked, wear })} className={cn('rounded-full px-3 py-1 text-xs font-semibold', picked.wear === wear ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-500 dark:bg-white/10')}>{wear}</button>
                  ))}
                </div>
              )}
              {picked.kind === 'quote' && <Input label={`Avisar si pasa por encima de (${createUnit})`} type="number" min="0" step="any" value={above} onChange={(event) => setAbove(event.target.value)} placeholder="Opcional" />}
              <Input label={picked.kind === 'skin' ? `Avisar si alguien lo pone por debajo de (${marketMark()})` : `Avisar si baja de (${createUnit})`} type="number" min="0" step="any" value={below} onChange={(event) => setBelow(event.target.value)} placeholder={picked.kind === 'quote' ? 'Opcional' : ''} />
              {picked.kind === 'skin' && (
                <>
                  <Input label="Float máximo" type="number" min="0" max="1" step="0.0001" value={maxFloat} onChange={(event) => setMaxFloat(event.target.value)} placeholder="Opcional" />
                  <Input label="Patrón" type="number" min="0" max="1000" step="1" value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="Opcional" />
                </>
              )}
              <Button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Guardando…' : 'Crear aviso'}</Button>
            </div>
          )}
          {pane === 'create' && note && <p className="text-xs font-medium text-rose-600">{note}</p>}
        </div>
      )}
    </div>
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

function StoryDialog({ item, onClose, follow = null, onStar }: { item: { kind: string; key: string; name: string; symbol: string; priceEur: number | null; changePct: number | null; changeLabel: string; sparkline: number[] }; onClose: () => void; follow?: MarketFollowed | null; onStar?: (on: boolean) => Promise<void> }) {
  // Estrella = seguimiento voluntario. El estado cambia cuando el servidor lo confirma (sin adelantarse).
  const [starred, setStarred] = useState(Boolean(follow?.starred));
  const [starBusy, setStarBusy] = useState(false);
  const [starError, setStarError] = useState('');
  const held = Boolean(follow?.held);
  const toggleStar = async () => {
    if (!onStar || starBusy) return;
    setStarBusy(true);
    setStarError('');
    try {
      await onStar(!starred);
      setStarred(!starred);
    } catch (err) {
      setStarError(err instanceof Error ? err.message : 'No se ha podido cambiar.');
    } finally {
      setStarBusy(false);
    }
  };
  const spansAtStart = canSpan(item.kind);
  const storyPath = (span: number) => {
    const params = new URLSearchParams({ kind: item.kind, key: item.key, name: item.name, symbol: item.symbol });
    if (spansAtStart) params.set('days', String(span));
    return `/api/market/story?${params}`;
  };
  const [story, setStory] = useState<MarketStory | null>(() => (item.key ? peek<MarketStory>(storyPath(30), 60_000) ?? null : null));
  const [failed, setFailed] = useState('');
  const [range, setRange] = useState<LineRangeId>('1M');
  const days = lineDays(range) ?? 365;
  const [loadedDays, setLoadedDays] = useState(30);
  const [live, setLive] = useState<number | null>(null);
  const [liveDay, setLiveDay] = useState<string | null>(null);
  const spans = canSpan(item.kind);
  useEffect(() => {
    if (!item.key) return;
    let cancelled = false;
    cachedApi<MarketStory>(storyPath(days), { maxAge: 60_000 })
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
  const waiting = Boolean(item.key) && !story && !failed;
  const points: LinePoint[] = fromStory.length >= 2 ? fromStory : waiting ? [] : fromSpark;
  const matched = fromStory.length >= 2;
  const change = matched ? story?.changePct : item.changePct;
  const label = matched ? story?.changeLabel : item.changeLabel;
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;
  return (
    <Modal title={item.name} onClose={onClose} wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[clamp(1.9rem,8vw,2.4rem)] font-semibold leading-none tabular-nums tracking-[-0.03em]">{quoteAmount(item.kind, live ?? item.priceEur)}</p>
          {liveDay && <p className="mt-1 text-[13px] font-semibold text-slate-400">{formatDay(liveDay)}</p>}
          {story && story.series.length > 0 && <p className="mt-1 text-[13px] font-medium text-slate-400">Precio de {formatAgo(story.series[story.series.length - 1].at)}</p>}
        </div>
        <span className={cn('text-[15px] font-semibold tabular-nums', !up && !down ? 'text-slate-400' : up ? 'text-[#16c784]' : 'text-[#ea3943]')}>
          {change == null ? '—' : formatPct(change)}
          {change != null && <span className="ml-1 text-[10px] font-bold opacity-80">{label}</span>}
        </span>
      </div>
      {onStar && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            aria-pressed={starred}
            disabled={starBusy}
            onClick={() => void toggleStar()}
            className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ring-1 transition-colors disabled:opacity-60', starred ? 'bg-slate-950 text-white ring-slate-950 dark:bg-white dark:text-slate-950 dark:ring-white' : 'text-slate-700 ring-slate-200 dark:text-slate-200 dark:ring-white/15')}
          >
            <Star size={14} strokeWidth={2.4} aria-hidden className={cn(starred && 'fill-current')} />
            {starred ? 'Siguiendo' : 'Seguir'}
          </button>
          <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
            {held
              ? 'En tu cartera: te avisamos si se mueve con fuerza.'
              : starred
                ? 'Lo sigues: te avisamos si se mueve con fuerza aunque no lo tengas.'
                : 'No lo sigues: no te avisaremos de sus movimientos.'}
            {follow?.alerted ? ' Tiene un aviso de precio activo.' : ''}
          </p>
          {starError && <p role="alert" className="w-full text-[13px] font-medium text-rose-600">{starError}</p>}
        </div>
      )}
      {spans && <LineRangeTabs value={range} onChange={setRange} />}
      <div className="mt-4">
        {item.key && waiting ? (
          <ChartBone tall ranges={false} />
        ) : item.key ? (
          <CashChart
            quiet
            tall
            pending={waiting}
            points={points}
            now={item.priceEur ?? points[points.length - 1]?.eur ?? 0}
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
                <span className="font-black tabular-nums">{marketMoney(band.priceEur)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs font-medium text-slate-400">{(failed && failed !== '429' && !/^429\b/.test(failed) ? failed : '') || (!item.key ? 'Este valor no está enlazado a un mercado, así que no hay histórico.' : story?.note) || 'El verde es subida y el rojo es bajada. El porcentaje es el de la gráfica, del primer punto al último.'}</p>
    </Modal>
  );
}

const BOARD_PATH = '/api/market';
const MOVES_PATH = '/api/market/moves';
/** Hasta 10 min se enseña lo último conocido al volver (con su antigüedad); más viejo, se espera. */
const BOARD_KEEP = 10 * 60_000;
type SkinMoveRow = { key: string; changePct: number | null; changeLabel: string; sparkline: number[] };

/** Hueco del tablero con la geometría de la cabecera y de la lista de mercados. */
function MarketSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-4">
      <div className="flex items-center gap-2">
        <Bone className="h-5 w-24" />
        <span className="flex-1" />
        <Bone className="h-7 w-16 rounded-full" />
      </div>
      <Bone className="h-3.5 w-36" />
      <RowBones count={8} />
    </div>
  );
}

export function Market(props: { focusListing?: string | null; focusTick?: number; focusSkin?: { name: string; wear: string; label: string; image: string | null } | null }) {
  return (
    <MarketCurrency>
      <MarketScreen {...props} />
    </MarketCurrency>
  );
}

function MarketScreen({ focusListing, focusTick = 0, focusSkin = null }: { focusListing?: string | null; focusTick?: number; focusSkin?: { name: string; wear: string; label: string; image: string | null } | null }) {
  const { code, setCode } = useMarketCode();
  const [data, setData] = useState<MarketBoard | null>(() => {
    const board = peek<MarketBoard>(BOARD_PATH, BOARD_KEEP);
    const moves = peek<{ moves: SkinMoveRow[] }>(MOVES_PATH, BOARD_KEEP);
    return board ? (moves ? applySkinMoves(board, moves.moves) : board) : null;
  });
  // true mientras lo que se ve sale de la caché: la cabecera dice «Actualizando» en vez de «En vivo».
  const [cached, setCached] = useState(() => peek<MarketBoard>(BOARD_PATH, BOARD_KEEP) != null);
  const [error, setError] = useState('');
  const [skinMatch, setSkinMatch] = useState(false);
  const [market, setMarket] = useState(initialMarket);
  const [skinDesk, setSkinDesk] = useState<SkinHit | null>(null);
  // Buscador único del dock (D025): el texto llega de ahí; setQuery lo vacía al cambiar de mercado.
  const [query, setQuery] = useDockSearch(market === 'all' ? 'Activos y mercados' : skinDesk ? 'Otra skin o desgaste…' : MARKET_TONE[market]?.search || 'Buscar activos');
  const [wearPick, setWearPick] = useState('all');
  const [tapeFilter, setTapeFilter] = useState<TapeFilter>('all');
  const [open, setOpen] = useState<{ kind: string; key: string; name: string; symbol: string; priceEur: number | null; changePct: number | null; changeLabel: string; sparkline: number[] } | null>(null);
  const [desk, setDesk] = useState<'saved' | 'alerts' | 'csfloat' | null>(focusListing ? 'csfloat' : null);
  const [csDirty, setCsDirty] = useState(false);
  const [listingFocus, setListingFocus] = useState<string | null>(focusListing || null);
  const dir = useRef(1);

  useEffect(() => {
    if (!focusListing) return;
    setListingFocus(focusListing);
    setDesk('csfloat');
    setSkinDesk(null);
  }, [focusListing, focusTick]);
  useEffect(() => {
    if (!focusSkin?.name) return;
    setDesk(null);
    setMarket('cs2');
    setSkinDesk({
      name: focusSkin.name,
      label: focusSkin.label || focusSkin.name,
      kind: 'skin',
      paintIndex: null,
      image: focusSkin.image,
      wears: focusSkin.wear ? [{ wear: focusSkin.wear, refEur: null }] : [],
    });
    setWearPick(focusSkin.wear || 'all');
  }, [focusSkin, focusTick]);
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
    const token = arriveTokenNow();
    const board = cachedApi<MarketBoard>(BOARD_PATH, { force: true });
    const moves = cachedApi<{ moves: SkinMoveRow[] }>(MOVES_PATH, { force: true }).catch(() => null);
    board
      .then((next) => {
        setData((prev) => keepSkinMoves(next, prev));
        setCached(false);
        setError('');
        if (arriveTokenNow() === token) markReady();
        void moves.then((pack) => {
          if (pack) setData((current) => (current ? applySkinMoves(current, pack.moves) : current));
        });
      })
      .catch((err: Error) => {
        setError(err.message);
        if (arriveTokenNow() === token) markReady();
      });
  };

  useEffect(() => {
    if (data) markReady();
    load();
    const refresh = window.setInterval(load, 20_000);
    const clock = window.setInterval(() => setTick((value) => value + 1), 15_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, []);

  if (error && !data) return <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>;
  if (!data) return <MarketSkeleton />;

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
  const heading = skinDesk ? skinDesk.label : market === 'all' ? 'Mercado' : active?.title || 'Mercado';
  const stageKey = skinDesk ? `skin:${skinDesk.name}:${skinDesk.paintIndex ?? ''}` : market;
  const followed = data.followed || [];
  const followOf = new Map(followed.map((row) => [row.key, row]));
  const star = async (key: string, on: boolean) => {
    const cut = key.indexOf(':');
    await api('/api/market/star', { method: 'POST', body: JSON.stringify({ source: key.slice(0, cut), externalId: key.slice(cut + 1), on }) });
    load();
  };
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
    <div className="relative mx-auto min-w-0 max-w-3xl space-y-5">
      <div
        className="sticky -top-2 z-30 -mt-2 mx-[calc(50%-50vw)] px-3 pb-3 pt-4 sm:px-4 md:px-8"
        style={{ background: 'linear-gradient(to bottom, var(--market-tint, var(--app-bg)) 0%, var(--market-tint, var(--app-bg)) 58%, var(--app-bg) 100%)' }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-8 bg-gradient-to-b from-[var(--app-bg)] to-transparent" />
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-1.5">
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
          <GlassGroup className="shrink-0 p-[3px] text-[12px] font-bold" role="group" aria-label="Moneda de los precios">
            {(['EUR', 'USD'] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={code === id}
                onClick={() => setCode(id)}
                className={cn('min-w-7 rounded-full px-2 py-1 tabular-nums transition-colors', code === id ? 'bg-white/95 text-slate-950 shadow-[0_1px_4px_rgba(15,23,42,0.14)] dark:bg-white/25 dark:text-white' : 'text-slate-600 dark:text-slate-300')}
              >
                {id === 'EUR' ? '€' : '$'}
              </button>
            ))}
          </GlassGroup>
          <GlassGroup className="shrink-0 p-[3px]">
            <button type="button" aria-label="CSFloat" onClick={() => setDesk('csfloat')} className={cn('grid h-8 w-8 place-items-center rounded-full transition-colors active:bg-white/40', desk === 'csfloat' ? 'text-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>
              <Star size={16} />
            </button>
            <button type="button" aria-label="Me interesa" onClick={() => setDesk('saved')} className={cn('grid h-8 w-8 place-items-center rounded-full transition-colors active:bg-white/40', desk === 'saved' ? 'text-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>
              <Heart size={16} />
            </button>
          </GlassGroup>
        </div>
        <p className="truncate text-[13px] font-semibold text-slate-500 dark:text-slate-400">
          {cached ? `Actualizando · datos de ${formatAgo(data.updatedAt)}` : fresh ? `En vivo · ${formatAgo(data.updatedAt)}` : `Último intento ${formatAgo(data.updatedAt)}`}
          {code === 'USD' && !marketReady() ? ' · buscando el cambio del dólar' : code === 'USD' ? ' · en dólares' : ''}
        </p>
      {searchOn && (market === 'all' || market === 'cs2') && needle.length >= 2 && (
          <div className="relative mt-1">
            <SkinSuggest query={needle} onMatch={setSkinMatch} onPick={openSkin} />
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
        <Modal title="CSFloat" onClose={() => { setDesk(null); setListingFocus(null); setCsDirty(false); }} dirty={csDirty}>
          <CsfloatFinder key={focusTick} focusId={listingFocus} onDirty={setCsDirty} />
        </Modal>
      )}
      {!desk && !open && createPortal(
        <GlassButton
          onClick={() => setDesk('alerts')}
          className="fixed z-50 h-11 px-4 text-[15px] font-semibold"
          style={{ right: '1.15rem', bottom: 'calc(env(safe-area-inset-bottom) + 6.25rem)' }}
        >
          <Bell size={16} strokeWidth={2.3} aria-hidden />
          Aviso
        </GlassButton>,
        document.body,
      )}
      {desk === 'alerts' && (
        <Modal title="Avisos" onClose={() => setDesk(null)}>
          <AlertDesk
            items={data.signals || []}
            catalog={sections.flatMap((section) => section.items)}
            hashes={Object.fromEntries((data.purchases || []).flatMap((row) => (row.hash ? [[row.id, row.hash] as const] : [])))}
            market={market}
            onChanged={load}
          />
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
            <MoveFilter value={tapeFilter} onChange={setTapeFilter} />
          ) : null}
          {market === 'all' ? (
            empty ? <EmptyNote>El mercado no ha respondido todavía.</EmptyNote>
            : noMatch ? <EmptyNote>{`Nada coincide con «${needle}».`}</EmptyNote>
            : (
              <div className="space-y-5">
              <FollowList items={followed.filter((item) => matches(needle, [item.name, item.symbol, item.sourceLabel]))} onOpen={openTape} />
              <div className="divide-y divide-slate-100 dark:divide-white/[0.08]">
                {doors.map((section, index) => {
                  const lead = section.preview[0];
                  const solo = section.raw.length <= 1;
                  const moving = !still && index < 12;
                  return (
                    <motion.button
                      key={section.id}
                      type="button"
                      onClick={() => enter(section.id)}
                      initial={moving ? { opacity: 0, y: 6 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={moving ? { ...glide, delay: index * 0.03 } : { duration: 0 }}
                      className="-mx-2 grid w-[calc(100%+1rem)] grid-cols-[auto_minmax(0,1fr)_6.5rem_auto] items-center gap-3 rounded-2xl px-2 py-3.5 text-left transition-colors duration-150 active:bg-slate-50 dark:active:bg-white/[0.04]"
                    >
                      <img src={section.icon} alt="" width={38} height={38} referrerPolicy="no-referrer" className="h-[38px] w-[38px] rounded-xl bg-white object-cover" />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold leading-tight text-slate-950 dark:text-white">{section.title}</span>
                        <span className="mt-0.5 block truncate text-[13px] font-medium text-slate-400 dark:text-slate-500">
                          {solo ? (lead?.sourceLabel || '1 valor') : `${section.raw.length} valores${lead && lead.kind !== 'cs2' && lead.kind !== 'tf2' ? ` · más se mueve ${lead.symbol}` : ''}`}
                        </span>
                      </span>
                      <span className="text-right">
                        {lead ? (
                          <>
                            <span className="block truncate text-[15px] font-semibold leading-tight tabular-nums tracking-tight text-slate-950 dark:text-white">{solo || lead.kind === 'cs2' || lead.kind === 'tf2' ? quoteAmount(lead.kind, lead.priceEur) : lead.symbol}</span>
                            <Pct value={lead.changePct} className="mt-0.5 block text-[13px]" />
                          </>
                        ) : null}
                      </span>
                      <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
                    </motion.button>
                  );
                })}
              </div>
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
          ) : (
            <GameBoard items={shown} filtered={filtered} quiet={market === 'cs2' && skinMatch && shown.length === 0} warm={market === 'cs2'} onOpen={openTape} />
          )}
        </motion.div>
      </AnimatePresence>
      {open && (
        <StoryDialog
          key={open.key}
          item={open}
          onClose={() => setOpen(null)}
          follow={followOf.get(open.key) ?? null}
          onStar={FOLLOWABLE.has(open.kind) && open.key.includes(':') ? (on) => star(open.key, on) : undefined}
        />
      )}
    </div>
  );
}
