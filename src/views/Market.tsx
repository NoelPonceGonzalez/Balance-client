import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, ChevronLeft, ChevronRight, Crosshair, Heart, Search, Star, X } from 'lucide-react';
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
import type { AppNotification, MarketBoard, MarketCatalogIndex, MarketCatalogItem, MarketCatalogPage, MarketFollowed, MarketItem, MarketPending, MarketSignal, MarketStory, MarketTapeItem, QuoteCandidate } from '@/lib/types';
import {
  AlertsEntry, AssetList, AssetPage, AssetRow, CategoryBones, EmptyNote, MARKET_LOOK, Mark, MarketTiles, MoversPanel, Pct, SectionTitle,
  canSpan, displaySymbol, isFollowable, quoteAmount, stillMotion, tickerOf, type AssetOpen, type FollowMap, type MarketTile,
} from '@/components/market/MarketParts';

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
        <Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} kind={item.kind} assetKey={item.key} />
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
      <Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} kind={item.kind} assetKey={item.key} fallback={fallback} contain={game} />
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

/** Categorías del catálogo (F.1) que crean avisos como acciones. */
const STOCK_MARKETS = new Set(['us', 'eu', 'es', 'asia', 'reit']);

function kindFromMarket(market: string): CreateKind | null {
  if (STOCK_MARKETS.has(market)) return 'stock';
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
                <Mark image={item.image} symbol={item.symbol} kind={item.kind} assetKey={item.key} fallback={item.image ? null : icon} contain={game} />
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

/* ───────────── Pantalla de Mercado (Bloque F.1) ───────────── */

/** Categorías que existían antes del catálogo y su sitio ahora. */
const LEGACY_MARKET: Record<string, string> = { stock: 'us', gold: 'commodity', silver: 'commodity', oil: 'commodity', copper: 'commodity' };
const GAME_MARKETS = new Set(['cs2', 'tf2']);
/** Orden por defecto de los mercados (luego se adelantan los que el usuario tiene o sigue). */
const TILE_ORDER = ['crypto', 'us', 'es', 'eu', 'etf', 'index', 'commodity', 'asia', 'fx', 'bond', 'reit', 'cs2', 'tf2'];

function screenMarket(saved: string): string {
  const id = LEGACY_MARKET[saved] || saved;
  return id === 'all' || id in MARKET_LOOK || GAME_MARKETS.has(id) ? id : 'all';
}

/** Categoría del catálogo a la que pertenece un activo que sigues (para ordenar la portada a su medida). */
function affinityOf(item: MarketTapeItem): string | null {
  if (item.kind === 'crypto') return 'crypto';
  if (item.kind === 'etf') return 'etf';
  if (item.kind === 'index') return 'index';
  if (item.kind === 'cs2' || item.kind === 'tf2') return item.kind;
  if (item.kind === 'gold' || item.kind === 'silver' || item.kind === 'oil' || item.kind === 'copper' || item.kind === 'commodity') return 'commodity';
  if (item.kind === 'stock' || item.kind === 'reit') {
    const symbol = item.key.startsWith('yahoo:') ? item.key.slice(6) : item.symbol;
    if (symbol.endsWith('.MC')) return 'es';
    if (/\.(DE|PA|AS|MI|SW|CO|L|BR|LS|HE|ST|OL)$/.test(symbol)) return 'eu';
    if (/\.(T|HK|KS|NS|SS|SZ)$/.test(symbol)) return 'asia';
    return item.kind === 'reit' ? 'reit' : 'us';
  }
  return null;
}

/** Minigráfica de la categoría y variación que la acompaña (para no confundir 7 días con 24 h). */
function sparkNote(kind: string): string {
  if (kind === 'crypto') return 'Minigráfica: 7 días · variación: 24 h';
  if (GAME_MARKETS.has(kind)) return '';
  return 'Minigráfica: 5 días · variación: el día';
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
  const [market, setMarket] = useState(() => screenMarket(sessionStorage.getItem('pat_market') || 'all'));
  const [skinDesk, setSkinDesk] = useState<SkinHit | null>(null);
  const [asset, setAsset] = useState<AssetOpen | null>(null);
  // Buscador único del dock (D025): el texto llega de ahí; setQuery lo vacía al cambiar de mercado.
  const [query, setQuery] = useDockSearch(asset ? null : market === 'all' ? 'Activos y mercados' : skinDesk ? 'Otra skin o desgaste…' : MARKET_LOOK[market]?.search || MARKET_TONE[market]?.search || 'Buscar activos');
  const [wearPick, setWearPick] = useState('all');
  const [tapeFilter, setTapeFilter] = useState<TapeFilter>('all');
  const [desk, setDesk] = useState<'saved' | 'alerts' | 'csfloat' | null>(focusListing ? 'csfloat' : null);
  const [csDirty, setCsDirty] = useState(false);
  const [listingFocus, setListingFocus] = useState<string | null>(focusListing || null);
  const [moverSide, setMoverSide] = useState<'bolsa' | 'cripto' | null>(null);
  const [page, setPage] = useState<MarketCatalogPage | null>(null);
  const [pageFailed, setPageFailed] = useState(false);
  const [index, setIndex] = useState<MarketCatalogIndex | null>(() => peek<MarketCatalogIndex>('/api/market/catalog-index', 10 * 60_000) ?? null);
  const dir = useRef(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollMemo = useRef(new Map<string, number>());
  const scrollNext = useRef<number | null>(null);
  const instantExit = useRef(false);

  useEffect(() => {
    if (!focusListing) return;
    setListingFocus(focusListing);
    setDesk('csfloat');
    setSkinDesk(null);
  }, [focusListing, focusTick]);
  useEffect(() => {
    if (!focusSkin?.name) return;
    setDesk(null);
    setAsset(null);
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
  useEffect(() => { sessionStorage.setItem('pat_market', market); }, [market]);
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

  // Categoría del catálogo: lo guardado se enseña al momento; lo nuevo llega aparte. Una respuesta de una
  // categoría que ya no está abierta se descarta (sin respuestas fuera de orden).
  useEffect(() => {
    if (market === 'all' || GAME_MARKETS.has(market)) {
      setPage(null);
      setPageFailed(false);
      return;
    }
    const path = `/api/market/catalog?group=${market}`;
    setPage(peek<MarketCatalogPage>(path, 10 * 60_000) ?? null);
    setPageFailed(false);
    let cancelled = false;
    let timer = 0;
    let tries = 0;
    const pull = (force: boolean) => {
      cachedApi<MarketCatalogPage>(path, { maxAge: 60_000, force })
        .then((next) => {
          if (cancelled) return;
          setPage(next);
          // Mientras el servidor sigue cotizando la categoría, se vuelve a mirar (sin animar nada).
          if (next.loading && tries++ < 6) timer = window.setTimeout(() => pull(true), 2_500);
        })
        .catch(() => { if (!cancelled) setPageFailed(true); });
    };
    pull(false);
    const refresh = window.setInterval(() => pull(true), 60_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(refresh);
    };
  }, [market]);

  // Índice del catálogo para buscar desde la portada: se pide la primera vez que se escribe.
  const searching = query.trim().length >= 2;
  useEffect(() => {
    if (!searching || index) return;
    let cancelled = false;
    cachedApi<MarketCatalogIndex>('/api/market/catalog-index', { maxAge: 10 * 60_000 })
      .then((next) => { if (!cancelled) setIndex(next); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [searching, index]);

  // Al volver atrás, el scroll vuelve donde estaba; al entrar, arriba. Se aplica cuando la pantalla nueva
  // entra en el DOM (tras la salida de la anterior) y se reintenta unos fotogramas mientras la lista crece.
  const stageKey = asset ? `asset:${asset.key}` : skinDesk ? `skin:${skinDesk.name}:${skinDesk.paintIndex ?? ''}` : market;
  const scrollFrame = useRef(0);
  const placeStage = (node: HTMLDivElement | null) => {
    if (!node) return;
    const scroller = node.closest<HTMLElement>('.app-scroll');
    const target = scrollNext.current;
    scrollNext.current = null;
    if (!scroller || target == null) return;
    window.cancelAnimationFrame(scrollFrame.current);
    let tries = 0;
    const apply = () => {
      scroller.scrollTop = target;
      if (Math.abs(scroller.scrollTop - target) > 1 && tries++ < 30) scrollFrame.current = window.requestAnimationFrame(apply);
    };
    apply();
  };
  useEffect(() => () => window.cancelAnimationFrame(scrollFrame.current), []);
  const remember = (to: number | null) => {
    const scroller = rootRef.current?.closest<HTMLElement>('.app-scroll');
    if (scroller) scrollMemo.current.set(stageKey, scroller.scrollTop);
    scrollNext.current = to;
  };

  if (error && !data) return <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>;
  if (!data) return <MarketSkeleton />;

  const needle = query.trim();
  const still = stillMotion();
  const followed = data.followed || [];
  const follows: FollowMap = new Map(followed.map((row) => [row.key, row]));
  const signals = data.signals || [];
  const catalog = data.catalog;
  const games = [
    { id: 'cs2', title: 'CS2', kind: 'cs2', image: data.icons?.cs2 || '/platforms/cs2.svg', raw: data.cs2 || [] },
    { id: 'tf2', title: 'TF2', kind: 'tf2', image: data.icons?.tf2 || '/extras/tf2.svg', raw: data.tf2 || [] },
  ];
  // Sin catálogo (servidor anterior a F.1), las categorías salen del tablero de siempre.
  const legacy: Record<string, MarketTapeItem[]> = {
    crypto: data.cryptos || [], us: data.stocks || [], etf: data.etfs || [], index: data.indices || [],
    commodity: [...(data.gold || []), ...(data.silver || []), ...(data.oil || []), ...(data.copper || [])],
  };
  const affinity = new Map<string, number>();
  for (const row of followed) {
    const id = affinityOf(row);
    if (id) affinity.set(id, (affinity.get(id) || 0) + (row.held ? 2 : 1));
  }
  const baseTiles: MarketTile[] = catalog
    ? catalog.groups.map((group) => ({ ...group }))
    : Object.entries(legacy).filter(([, rows]) => rows.length > 0).map(([id, rows]) => ({ id, title: { crypto: 'Cripto', us: 'Acciones', etf: 'ETF', index: 'Índices', commodity: 'Materias primas' }[id] || id, kind: id, total: rows.length, priced: rows.length, lead: null }));
  const tiles: MarketTile[] = [
    ...baseTiles,
    ...games.filter((game) => game.raw.length > 0).map((game) => ({ id: game.id, title: game.title, kind: game.kind, total: game.raw.length, priced: game.raw.length, lead: null, image: game.image })),
  ].sort((a, b) => (affinity.get(b.id) || 0) - (affinity.get(a.id) || 0) || TILE_ORDER.indexOf(a.id) - TILE_ORDER.indexOf(b.id));
  // Movimientos: por defecto, el mercado que más pesa en lo que sigues.
  const cryptoWeight = affinity.get('crypto') || 0;
  const stockWeight = ['us', 'eu', 'es', 'asia', 'etf', 'reit'].reduce((sum, id) => sum + (affinity.get(id) || 0), 0);
  const side = moverSide ?? (cryptoWeight > stockWeight ? 'cripto' : 'bolsa');

  const isGame = GAME_MARKETS.has(market);
  const tile = tiles.find((row) => row.id === market);
  const look = MARKET_LOOK[market];
  const gamePack = games.find((game) => game.id === market);
  const pageItems: MarketTapeItem[] = page?.items ?? (pageFailed || market === 'crypto' ? legacy[market] || [] : []);
  const loadingPage = !isGame && market !== 'all' && !page && !pageFailed && pageItems.length === 0;
  const categoryItems = isGame ? gamePack?.raw || [] : pageItems;
  const keepRow = (item: MarketTapeItem) => matches(needle, [item.name, item.symbol, displaySymbol(item.symbol), item.sourceLabel, (item as MarketCatalogItem).sub]);
  const shown = byMove(isGame ? categoryItems : categoryItems.filter(keepRow), tapeFilter);
  const filtered = needle.length > 0 || tapeFilter !== 'all';
  const heading = asset ? (market === 'all' ? 'Mercado' : tile?.title || page?.title || 'Mercado') : skinDesk ? skinDesk.label : market === 'all' ? 'Mercado' : tile?.title || page?.title || 'Mercado';
  const updatedAt = market !== 'all' && !isGame && page?.updatedAt ? page.updatedAt : data.updatedAt;
  const fresh = [...followed, ...categoryItems, ...data.items].some((item) => !item.stale && !item.error);
  const pricing = page && page.loading && page.items.length < page.total ? `Cotizando ${page.items.length} de ${page.total}` : '';
  const status = cached ? `Actualizando · datos de ${formatAgo(data.updatedAt)}` : pricing ? `${pricing} · ${formatAgo(updatedAt)}` : fresh ? `En vivo · ${formatAgo(updatedAt)}` : `Último dato ${formatAgo(updatedAt)}`;

  const star = async (key: string, on: boolean) => {
    const cut = key.indexOf(':');
    await api('/api/market/star', { method: 'POST', body: JSON.stringify({ source: key.slice(0, cut), externalId: key.slice(cut + 1), on }) });
    load();
  };
  const openAsset = (item: MarketTapeItem) => {
    remember(0);
    dir.current = 1;
    instantExit.current = true;
    const meta = item as MarketCatalogItem;
    setAsset({ kind: item.kind, key: item.key, name: item.name, symbol: item.symbol, image: item.image, priceEur: item.priceEur, changePct: item.changePct, changeLabel: item.changeLabel, sparkline: item.sparkline, sourceLabel: item.sourceLabel, fetchedAt: item.fetchedAt, stale: item.stale, sub: meta.sub });
  };
  const enter = (id: string) => {
    remember(0);
    dir.current = 1;
    instantExit.current = false;
    const target = tiles.find((row) => row.id === id);
    const titleHit = Boolean(target && needle && fold(`${target.title} ${MARKET_LOOK[id]?.hint || ''}`).includes(fold(needle)));
    if (needle && titleHit) setQuery('');
    setTapeFilter('all');
    setSkinDesk(null);
    setWearPick('all');
    setMarket(id);
  };
  const back = () => {
    dir.current = -1;
    instantExit.current = false;
    if (asset) {
      scrollNext.current = scrollMemo.current.get(market) ?? 0;
      setAsset(null);
      return;
    }
    if (skinDesk) {
      scrollNext.current = scrollMemo.current.get('cs2') ?? 0;
      setSkinDesk(null);
      setWearPick('all');
      setQuery('');
      setMarket('cs2');
      return;
    }
    scrollNext.current = scrollMemo.current.get('all') ?? 0;
    setMarket('all');
    setTapeFilter('all');
  };
  const openSkin = (hit: SkinHit, wear: string | null) => {
    remember(0);
    dir.current = market === 'cs2' ? dir.current : 1;
    setAsset(null);
    setMarket('cs2');
    setSkinDesk(hit);
    setWearPick(wear && hit.wears.some((row) => row.wear === wear) ? wear : 'all');
  };

  // Búsqueda desde la portada: lo que sigues, los mercados y el catálogo (sin precio hasta abrirlo).
  const foundFollowed = needle ? followed.filter(keepRow) : followed;
  const foundTiles = needle ? tiles.filter((row) => matches(needle, [row.title, MARKET_LOOK[row.id]?.hint])) : [];
  const seen = new Set(foundFollowed.map((row) => row.key));
  const foundIndex = needle.length >= 2 && index
    ? index.entries.filter((entry) => !seen.has(entry.key) && matches(needle, [entry.name, entry.symbol, displaySymbol(entry.symbol)])).slice(0, 20)
    : [];
  // Las skins solo se consultan si el catálogo no encuentra nada (así no tapan un «Santander» con «ninguna skin»).
  const homeQuiet = foundFollowed.length === 0 && foundTiles.length === 0 && foundIndex.length === 0;
  const noMatch = market === 'all' && needle.length > 0 && !skinMatch && foundFollowed.length === 0 && foundTiles.length === 0 && foundIndex.length === 0 && (needle.length < 2 || index != null);
  const assetAlerts = asset ? signals.filter((signal) => signal.quoteKey === asset.key).length : 0;
  const knownTape = [...Object.values(legacy).flat(), ...(page?.items || []), ...followed];
  // Lista → detalle: la lista se va al instante (el vuelo de logo, nombre y precio da la continuidad);
  // en el resto de pasos, el desplazamiento lateral de siempre.
  const variants = {
    enter: (d: number) => (asset ? { opacity: 0 } : shift.enter(d)),
    center: shift.center,
    exit: (d: number) => (instantExit.current ? { opacity: 0, transition: { duration: 0 } } : shift.exit(d)),
  };

  return (
    <div ref={rootRef} className="relative mx-auto min-w-0 max-w-3xl space-y-5">
      {/* Cabecera neutra: sin tintes por categoría ni degradados. El color va en los iconos. */}
      <div className="sticky -top-2 z-30 -mt-2 mx-[calc(50%-50vw)] bg-[var(--app-bg)] px-4 pb-2.5 pt-3 md:px-8">
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-1">
          <div className="flex min-h-10 min-w-0 items-center gap-2">
            {(market !== 'all' || asset) && (
              <button type="button" onClick={back} className="-ml-1.5 inline-flex min-h-10 min-w-10 shrink-0 items-center gap-0.5 rounded-full pl-1 pr-1.5 text-[15px] font-semibold text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 dark:text-slate-300" aria-label={asset ? `Volver a ${heading}` : skinDesk ? 'Volver a CS2' : 'Volver a mercados'}>
                <ChevronLeft size={20} aria-hidden />
                {asset ? <span className="max-w-[9rem] truncate">{heading}</span> : null}
              </button>
            )}
            {!asset && (
              <>
                {skinDesk?.image ? (
                  <img src={skinDesk.image} alt="" referrerPolicy="no-referrer" className="h-7 w-9 shrink-0 object-contain" />
                ) : market !== 'all' && look ? (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-slate-200/70 max-[359px]:hidden dark:bg-white/[0.08]"><look.icon size={15} strokeWidth={2.1} color={look.color} aria-hidden /></span>
                ) : market !== 'all' && gamePack ? (
                  <img src={gamePack.image} alt="" referrerPolicy="no-referrer" className="h-7 w-7 shrink-0 rounded-[9px] bg-white object-cover" />
                ) : null}
                <h1 className={cn('min-w-0 flex-1 truncate font-semibold tracking-tight text-slate-950 dark:text-white', market === 'all' ? 'text-[clamp(24px,7.4vw,28px)]' : 'text-[17px]')}>{heading}</h1>
              </>
            )}
            {asset && <span className="flex-1" />}
            <GlassGroup className="shrink-0 p-[3px]">
              <button type="button" aria-label="CSFloat: buscar ofertas de skins" title="CSFloat" onClick={() => setDesk('csfloat')} className={cn('grid h-8 w-8 place-items-center rounded-full transition-colors active:bg-white/40', desk === 'csfloat' ? 'text-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>
                <Crosshair size={16} aria-hidden />
              </button>
              <button type="button" aria-label="Me interesa" title="Me interesa" onClick={() => setDesk('saved')} className={cn('grid h-8 w-8 place-items-center rounded-full transition-colors active:bg-white/40', desk === 'saved' ? 'text-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>
                <Heart size={16} aria-hidden />
              </button>
              <button type="button" aria-label={signals.length ? `Avisos: ${signals.length} activos` : 'Avisos'} title="Avisos" onClick={() => setDesk('alerts')} className={cn('relative grid h-8 w-8 place-items-center rounded-full transition-colors active:bg-white/40', desk === 'alerts' ? 'text-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>
                <Bell size={16} aria-hidden />
                {signals.length > 0 && <span aria-hidden className="absolute right-0.5 top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-slate-950 px-1 text-[10px] font-bold leading-none text-white dark:bg-white dark:text-slate-950">{signals.length}</span>}
              </button>
            </GlassGroup>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[13px] font-medium text-slate-500 dark:text-slate-400" aria-live="polite">
              {asset ? (asset.sourceLabel || '') : status}
              {code === 'USD' && !marketReady() ? ' · buscando el cambio del dólar' : code === 'USD' ? ' · en dólares' : ''}
            </p>
            <GlassGroup className="shrink-0 p-[3px] text-[12px] font-bold" role="group" aria-label="Moneda de los precios">
              {(['EUR', 'USD'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={code === id}
                  aria-label={id === 'EUR' ? 'Precios en euros' : 'Precios en dólares'}
                  onClick={() => setCode(id)}
                  className={cn('min-h-8 min-w-8 rounded-full px-2 tabular-nums transition-colors', code === id ? 'bg-white/95 text-slate-950 shadow-[0_1px_4px_rgba(15,23,42,0.14)] dark:bg-white/25 dark:text-white' : 'text-slate-600 dark:text-slate-300')}
                >
                  {id === 'EUR' ? '€' : '$'}
                </button>
              ))}
            </GlassGroup>
          </div>
          {!asset && (market === 'cs2' || (market === 'all' && homeQuiet)) && needle.length >= 2 && (
            <div className="relative mt-1">
              <SkinSuggest query={needle} onMatch={setSkinMatch} onPick={openSkin} />
            </div>
          )}
        </div>
      </div>
      {data.warning && !quietWarning(data.warning) && !skinDesk && !asset && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{data.warning}</p>}
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
      {desk === 'alerts' && (
        <Modal title="Avisos" onClose={() => setDesk(null)}>
          <AlertDesk
            items={signals}
            catalog={knownTape}
            hashes={Object.fromEntries((data.purchases || []).flatMap((row) => (row.hash ? [[row.id, row.hash] as const] : [])))}
            market={asset ? affinityOf(asset as unknown as MarketTapeItem) || market : market}
            onChanged={load}
          />
        </Modal>
      )}
      <AnimatePresence mode="wait" initial={false} custom={dir.current}>
        <motion.div
          key={stageKey}
          ref={placeStage}
          custom={dir.current}
          variants={variants}
          initial={still ? false : 'enter'}
          animate="center"
          exit={still ? undefined : 'exit'}
          transition={softSpring}
          className="space-y-5"
        >
          {asset ? (
            <AssetPage
              item={asset}
              follow={follows.get(asset.key) ?? null}
              alerts={assetAlerts}
              onStar={isFollowable(asset.kind, asset.key) ? (on) => star(asset.key, on) : undefined}
              onAlerts={() => setDesk('alerts')}
            />
          ) : market === 'all' ? (
            needle ? (
              noMatch ? <EmptyNote>{`Nada coincide con «${needle}».`}</EmptyNote> : (
                <div className="space-y-6">
                  {foundFollowed.length > 0 && (
                    <section aria-label="Siguiendo">
                      <SectionTitle title="Siguiendo" />
                      <div className="divide-y divide-slate-200/70 dark:divide-white/[0.08]">
                        {foundFollowed.map((item, row) => <AssetRow key={item.key} item={item} follow={{ ...item, held: false }} index={row} detail={item.held ? `En cartera${item.accounts ? ` · ${item.accounts}` : ''}` : 'La sigues'} onOpen={openAsset} />)}
                      </div>
                    </section>
                  )}
                  {foundTiles.length > 0 && (
                    <section aria-label="Mercados">
                      <SectionTitle title="Mercados" />
                      <MarketTiles tiles={foundTiles} onEnter={enter} />
                    </section>
                  )}
                  {foundIndex.length > 0 && (
                    <section aria-label="Activos">
                      <SectionTitle title="Activos" detail="Del catálogo: el precio se pide al abrirlo" />
                      <div className="divide-y divide-slate-200/70 dark:divide-white/[0.08]">
                        {foundIndex.map((entry, row) => (
                          <AssetRow
                            key={entry.key}
                            index={row}
                            item={{ key: entry.key, kind: entry.kind as MarketTapeItem['kind'], name: entry.name, symbol: entry.symbol, image: entry.image, sourceLabel: entry.key.startsWith('coingecko:') ? 'CoinGecko' : 'Yahoo Finance', priceEur: null, changePct: null, changeLabel: '', sparkline: [], fetchedAt: null, stale: false, error: null }}
                            follow={follows.get(entry.key)}
                            detail={`${displaySymbol(entry.symbol)} · ${tiles.find((row2) => row2.id === entry.group)?.title || entry.sub || ''}`}
                            onOpen={openAsset}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                  {needle.length >= 2 && !index && <CategoryBones count={3} />}
                </div>
              )
            ) : (
              <div className="space-y-7">
                {followed.length > 0 && (
                  <section aria-label="Siguiendo">
                    <SectionTitle title="Siguiendo" detail={`En cartera y con estrella · ${followed.length}`} />
                    <div className="divide-y divide-slate-200/70 dark:divide-white/[0.08]">
                      {followed.map((item, row) => <AssetRow key={item.key} item={item} follow={{ ...item, held: false }} index={row} detail={item.held ? `En cartera${item.accounts ? ` · ${item.accounts}` : ''}` : 'La sigues'} onOpen={openAsset} />)}
                    </div>
                  </section>
                )}
                <AlertsEntry count={signals.length} onOpen={() => setDesk('alerts')} />
                {tiles.length > 0 ? (
                  <section aria-label="Mercados">
                    <SectionTitle title="Mercados" detail={catalog ? `${tiles.reduce((sum, row) => sum + row.total, 0)} valores en ${tiles.length} mercados` : undefined} />
                    <MarketTiles tiles={tiles} onEnter={enter} />
                  </section>
                ) : (
                  <EmptyNote>El mercado no ha respondido todavía.</EmptyNote>
                )}
                {catalog && <MoversPanel movers={catalog.movers} side={side} onSide={setMoverSide} follows={follows} onOpen={openAsset} />}
              </div>
            )
          ) : skinDesk ? (
            <>
              <DragRow className="-mx-4 flex max-w-full flex-nowrap gap-1.5 px-4">
                <button type="button" onClick={() => setWearPick('all')} className={cn('shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-black uppercase tracking-wide', wearPick === 'all' ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-white/10')}>General</button>
                {skinDesk.wears.map((option) => (
                  <button key={option.wear} type="button" onClick={() => setWearPick(option.wear)} className={cn('shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-black uppercase tracking-wide', wearPick === option.wear ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-white/10')}>
                    {WEAR_CHIP[option.wear] || option.wear}
                  </button>
                ))}
              </DragRow>
              <SkinMarket skin={skinDesk} wear={wearPick} />
            </>
          ) : isGame ? (
            <GameBoard items={shown} filtered={filtered} quiet={market === 'cs2' && skinMatch && shown.length === 0} warm={market === 'cs2'} onOpen={openAsset} />
          ) : (
            <>
              {categoryItems.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <MoveFilter value={tapeFilter} onChange={setTapeFilter} />
                  <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{sparkNote(market === 'crypto' ? 'crypto' : 'yahoo')}</span>
                </div>
              )}
              {loadingPage ? (
                <CategoryBones count={Math.min(tile?.total || 8, 10)} />
              ) : shown.length === 0 ? (
                <EmptyNote>{filtered ? 'Nada coincide en esta categoría.' : pageFailed ? 'Esta categoría no ha respondido. Prueba en un momento.' : page?.loading ? 'Pidiendo los precios de esta categoría…' : 'Todavía no hay precios en esta categoría.'}</EmptyNote>
              ) : (
                <AssetList items={shown} follows={follows} onOpen={openAsset} grouped={!filtered && shown.some((item) => Boolean((item as MarketCatalogItem).sub))} />
              )}
              {page && page.items.length < page.total && !page.loading && !filtered && (
                <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{page.total - page.items.length} de {page.total} sin precio ahora mismo: el proveedor no los ha devuelto.</p>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
