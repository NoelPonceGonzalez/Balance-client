/**
 * Piezas de Mercado (Bloque F.1): filas de activo, lista agrupada, rejilla de mercados, mayores movimientos,
 * acceso a avisos y la pantalla de detalle de un activo.
 *
 * Semántica de iconos (D054): estrella = seguimiento manual · campana = avisos personalizados ·
 * cartera = posición activa · mira = CSFloat · corazón = «Me interesa».
 * Cifras tabulares en columna de ancho fijo: una cotización nueva no mueve la fila.
 * Las minigráficas son el histórico real del proveedor (7 días en cripto, 5 días en bolsa) sin retocar.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Activity, ArrowLeftRight, Bell, Bitcoin, Building2, ChevronRight, Gem, Globe2, Landmark, Layers, Scroll, Star, Wallet,
} from 'lucide-react';
import { Sparkline } from '@/components/Sparkline';
import { Segmented } from '@/components/Segmented';
import { ChartBone, RowBones } from '@/components/Skeleton';
import { LineRangeTabs, lineDays, type LineRangeId } from '@/components/LineRanges';
import { CashChart, type LinePoint } from '@/views/Wallets';
import { findBrand } from '@/lib/brands';
import { cachedApi, peek } from '@/lib/query';
import { captureFlip, playFlip } from '@/lib/flip';
import { formatAgo, formatDay, formatNumber, formatPct } from '@/lib/format';
import { marketMoney } from '@/lib/marketCurrency';
import { glide } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { MarketCatalogGroupSummary, MarketCatalogItem, MarketCatalogOverview, MarketFollowed, MarketStory, MarketTapeItem } from '@/lib/types';

export function stillMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ───────────── Cifras ───────────── */

/** Precio para enseñar según lo que es: índice en puntos, divisa en tipo de cambio, bono en rentabilidad, el resto en dinero. */
export function quoteAmount(kind: string, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (kind === 'index') return formatNumber(value, 2);
  if (kind === 'fx') return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
  if (kind === 'bond') return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value)} %`;
  return marketMoney(value);
}

/** Unidad del precio para el detalle. */
export function quoteUnit(kind: string): string {
  if (kind === 'index') return 'En puntos';
  if (kind === 'fx') return 'Tipo de cambio';
  if (kind === 'bond') return 'Rentabilidad anual';
  return '';
}

/** Variación con color de rentabilidad legible en claro (D046: verde y rojo AA) y en oscuro. */
export function Pct({ value, className }: { value: number | null | undefined; className?: string }) {
  const up = (value ?? 0) > 0;
  const down = (value ?? 0) < 0;
  return <span className={cn('font-semibold tabular-nums', !up && !down ? 'text-slate-500 dark:text-slate-400' : up ? 'tone-up' : 'tone-down', className)}>{value == null ? '—' : formatPct(value)}</span>;
}

/** Símbolo legible: sin el prefijo de Yahoo para índices, futuros o divisas. */
export function displaySymbol(symbol: string): string {
  if (!symbol) return '';
  if (symbol.endsWith('=X')) {
    const pair = symbol.slice(0, -2);
    return pair.length === 6 ? `${pair.slice(0, 3)}/${pair.slice(3)}` : pair;
  }
  return symbol.replace(/^\^/, '').replace(/=F$/, '');
}

/* ───────────── Logos ───────────── */

/** Logo de un valor de bolsa por su símbolo (servicio público de logos; si no hay, se cae a las iniciales). */
function tickerLogo(ticker: string): string {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker.toUpperCase())}.png`;
}

/** Símbolo para buscar el logo: acciones, ETF e inmobiliario cotizado (las cripto ya traen su imagen). */
export function tickerOf(item: { key?: string; quoteKey?: string | null; kind?: string; assetClass?: string; symbol?: string }): string | null {
  const kind = item.kind || item.assetClass || '';
  if (kind !== 'stock' && kind !== 'etf' && kind !== 'reit') return null;
  const key = item.key || item.quoteKey || '';
  if (key.startsWith('yahoo:')) return key.slice(6);
  return item.symbol || null;
}

const MONO_TINTS = ['from-slate-600 to-slate-800', 'from-sky-600 to-sky-800', 'from-indigo-500 to-indigo-700', 'from-emerald-600 to-emerald-800', 'from-amber-500 to-amber-700', 'from-rose-500 to-rose-700', 'from-violet-500 to-violet-700', 'from-teal-600 to-teal-800'];

/**
 * Logo de un activo. Orden: imagen del proveedor (cripto) → imagen propia → logo de marca local →
 * logo por símbolo (acciones/ETF) → iniciales en un cuadrado redondeado con color propio.
 */
export function Mark({ image, symbol, fallback, contain, name, ticker, size = 40, neutral = false }: { image: string | null; symbol: string; fallback?: string | null; contain?: boolean; name?: string; ticker?: string | null; size?: number; neutral?: boolean }) {
  const sources = useMemo(() => {
    const brand = name ? findBrand(name) : undefined;
    const local = brand && brand.kind === 'brand' ? `/brands/${brand.id}.${brand.image}` : null;
    return [image, fallback, local, ticker ? tickerLogo(ticker) : null].filter((src): src is string => Boolean(src));
  }, [image, fallback, name, ticker]);
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  const box = { width: size, height: size };
  if (src) {
    const own = src === image && !contain;
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed((value) => value + 1)}
        style={box}
        className={cn('shrink-0 bg-white', own ? 'rounded-full object-cover' : 'rounded-[12px] object-contain p-1 ring-1 ring-black/[0.06] dark:ring-white/10')}
      />
    );
  }
  const letters = displaySymbol(symbol || '?').split(/[./:\s-]/)[0].replace(/[^A-Za-z0-9]/g, '').slice(0, neutral ? 3 : 2).toUpperCase() || '?';
  if (neutral) return <span aria-hidden style={box} className="grid shrink-0 place-items-center rounded-[12px] bg-slate-200/70 text-[11px] font-semibold tracking-tight text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">{letters}</span>;
  const tint = MONO_TINTS[[...(symbol || '?')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % MONO_TINTS.length];
  return <span aria-hidden style={box} className={cn('grid shrink-0 place-items-center rounded-[12px] bg-gradient-to-b text-[14px] font-semibold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]', tint)}>{letters}</span>;
}

/** Índices, materias primas, divisas y bonos: sin logo de empresa, iniciales en gris (sin colores inventados). */
export function neutralMark(kind: string): boolean {
  return kind === 'index' || kind === 'commodity' || kind === 'fx' || kind === 'bond';
}

/* ───────────── Seguimiento ───────────── */

/** Todo lo que cotiza un proveedor admite estrella y avisos; las skins van por su propio camino. */
export function isFollowable(kind: string, key: string): boolean {
  return kind !== 'cs2' && kind !== 'tf2' && (key.startsWith('yahoo:') || key.startsWith('coingecko:'));
}

export type FollowMap = Map<string, MarketFollowed>;

/** Marcas discretas de una fila: cartera, estrella y campana (con texto para lectores de pantalla). */
function FollowMarks({ follow }: { follow?: MarketFollowed }) {
  if (!follow) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 text-slate-500 dark:text-slate-400">
      {follow.held && <Wallet size={12} strokeWidth={2.3} aria-hidden />}
      {follow.starred && <Star size={12} strokeWidth={2.3} aria-hidden className="fill-current text-slate-900 dark:text-white" />}
      {follow.alerted && <Bell size={12} strokeWidth={2.3} aria-hidden />}
      <span className="sr-only">
        {[follow.held ? 'en cartera' : '', follow.starred ? 'lo sigues' : '', follow.alerted ? 'con aviso de precio' : ''].filter(Boolean).join(', ')}
      </span>
    </span>
  );
}

/* ───────────── Filas ───────────── */

/** Cuántas filas entran con movimiento: el resto aparece quieto (no se animan listas enteras). */
const MOVING_ROWS = 10;

export function AssetRow({ item, follow, index = 0, detail, onOpen }: {
  item: MarketTapeItem;
  follow?: MarketFollowed;
  index?: number;
  /** Segunda línea propia (p. ej. «En cartera · OKX»); por defecto, el símbolo. */
  detail?: string;
  onOpen: (item: MarketTapeItem) => void;
}) {
  const still = stillMotion();
  const moving = !still && index < MOVING_ROWS;
  const up = (item.changePct ?? 0) > 0;
  const game = item.kind === 'cs2' || item.kind === 'tf2';
  const old = item.stale && item.fetchedAt ? ` · de ${formatAgo(item.fetchedAt)}` : '';
  const line = detail ?? `${displaySymbol(item.symbol)}${old}`;
  // Resultado del catálogo sin precio todavía: se abre para pedirlo (sin «—» que parezcan un fallo).
  const unpriced = item.priceEur == null && item.changePct == null && item.sparkline.length === 0;
  return (
    <button
      type="button"
      onClick={(event) => {
        captureFlip(event.currentTarget);
        onOpen(item);
      }}
      style={moving ? { animationDelay: `${index * 22}ms` } : undefined}
      className={cn(moving && 'market-row-in', "market-press -mx-2 grid min-h-[64px] w-[calc(100%+1rem)] grid-cols-[2.5rem_minmax(0,1fr)_6.5rem] items-center gap-3 rounded-2xl px-2 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 active:bg-slate-200/50 min-[360px]:grid-cols-[2.5rem_minmax(0,1fr)_4rem_6.5rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_7rem_6.5rem] dark:focus-visible:ring-white/40 dark:active:bg-white/[0.05]")}
    >
      <span data-flip="logo" className="block"><Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} contain={game || item.kind === 'index'} neutral={neutralMark(item.kind)} /></span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span data-flip="name" className="truncate text-[15px] font-semibold leading-tight text-slate-950 dark:text-white">{item.name}</span>
          <FollowMarks follow={follow} />
        </span>
        <span className="mt-0.5 block truncate text-[13px] font-medium text-slate-500 dark:text-slate-400">{line}</span>
      </span>
      {/* Sparkline intacta (D013): solo se le da un ancho fijo desde fuera. En 320 px no cabe y se oculta. */}
      <span aria-hidden className="hidden w-16 min-[360px]:block sm:w-28 [&_span]:max-w-none [&_svg]:max-w-none">
        {unpriced ? null : <Sparkline values={item.sparkline} up={up} />}
      </span>
      {unpriced ? (
        <span className="flex justify-end text-slate-400" aria-hidden><ChevronRight size={16} /></span>
      ) : (
        <span data-flip="value" className="text-right">
          <span className={cn('block truncate text-[15px] font-semibold leading-tight tabular-nums tracking-tight', item.stale ? 'text-slate-500 dark:text-slate-400' : 'text-slate-950 dark:text-white')}>{quoteAmount(item.kind, item.priceEur)}</span>
          <Pct value={item.changePct} className="mt-0.5 block text-[13px]" />
        </span>
      )}
    </button>
  );
}

/** Lista de activos; con `grouped`, por subgrupo (Europa / América / Asia, Metales / Energía…). */
export function AssetList({ items, follows, onOpen, grouped = false }: { items: MarketCatalogItem[] | MarketTapeItem[]; follows: FollowMap; onOpen: (item: MarketTapeItem) => void; grouped?: boolean }) {
  const groups = useMemo(() => {
    if (!grouped) return [{ title: '', rows: items as MarketCatalogItem[] }];
    const out: { title: string; rows: MarketCatalogItem[] }[] = [];
    for (const item of items as MarketCatalogItem[]) {
      const title = item.sub || '';
      const last = out[out.length - 1];
      const found = out.find((group) => group.title === title);
      if (found) found.rows.push(item);
      else if (last && !title && !last.title) last.rows.push(item);
      else out.push({ title, rows: [item] });
    }
    return out;
  }, [items, grouped]);
  let index = 0;
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.title || 'all'} aria-label={group.title || undefined}>
          {group.title && <h3 className="px-0.5 pb-1 text-[13px] font-semibold text-slate-500 dark:text-slate-400">{group.title}</h3>}
          <div className="divide-y divide-slate-200/70 dark:divide-white/[0.08]">
            {group.rows.map((item) => <AssetRow key={item.key} item={item} follow={follows.get(item.key)} index={index++} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

export function SectionTitle({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-0.5 pb-1.5">
      <div className="min-w-0">
        <h2 className="text-[20px] font-semibold leading-tight tracking-tight text-slate-950 dark:text-white">{title}</h2>
        {detail && <p className="mt-0.5 truncate text-[13px] font-medium text-slate-500 dark:text-slate-400">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyNote({ children }: { children: string }) {
  return <p className="px-4 py-12 text-center text-[15px] font-medium text-slate-500 dark:text-slate-400">{children}</p>;
}

/* ───────────── Mercados ───────────── */

type TileLook = { icon: typeof Bitcoin; color: string; hint: string; search: string };

/** Icono y color de cada mercado: el color va solo en el icono (sin fondos teñidos). */
export const MARKET_LOOK: Record<string, TileLook> = {
  crypto: { icon: Bitcoin, color: '#f7931a', hint: 'criptomonedas bitcoin ether', search: 'Bitcoin, ether, solana…' },
  us: { icon: Landmark, color: '#0a84ff', hint: 'acciones estados unidos eeuu usa nasdaq', search: 'Apple, NVIDIA, Tesla…' },
  eu: { icon: Globe2, color: '#0a84ff', hint: 'acciones europa', search: 'ASML, LVMH, SAP…' },
  es: { icon: Building2, color: '#ff453a', hint: 'acciones españa ibex bolsa madrid', search: 'Santander, Inditex, Iberdrola…' },
  asia: { icon: Globe2, color: '#bf5af2', hint: 'acciones asia japon china corea india', search: 'Toyota, Tencent, TSMC…' },
  etf: { icon: Layers, color: '#30d158', hint: 'etf fondos indexados', search: 'VWCE, S&P 500, Nasdaq…' },
  index: { icon: Activity, color: '#5e5ce6', hint: 'indices ibex dax nasdaq', search: 'IBEX, DAX, Nikkei…' },
  commodity: { icon: Gem, color: '#c6a15b', hint: 'materias primas oro plata petroleo gas cobre trigo cafe', search: 'Oro, petróleo, gas…' },
  fx: { icon: ArrowLeftRight, color: '#64d2ff', hint: 'divisas monedas dolar libra yen', search: 'Dólar, libra, yen…' },
  bond: { icon: Scroll, color: '#8e8e93', hint: 'bonos renta fija rentabilidad tesoro', search: 'Bono a 10 años…' },
  reit: { icon: Building2, color: '#ff9f0a', hint: 'inmobiliario reit socimi', search: 'Realty Income, Merlin…' },
};

export type MarketTile = MarketCatalogGroupSummary & { image?: string | null };

export function MarketTiles({ tiles, onEnter }: { tiles: MarketTile[]; onEnter: (id: string) => void }) {
  const still = stillMotion();
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {tiles.map((tile, index) => {
        const look = MARKET_LOOK[tile.id];
        const Icon = look?.icon;
        const count = tile.total === 1 ? '1 valor' : `${tile.total} valores`;
        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => onEnter(tile.id)}
            style={still || index > 11 ? undefined : { animationDelay: `${Math.min(index, 11) * 20}ms` }}
            className={cn(!still && index <= 11 && 'market-row-in', "market-press flex min-h-[96px] flex-col justify-between rounded-[20px] bg-white p-3.5 text-left ring-1 ring-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 dark:bg-white/[0.06] dark:ring-white/[0.06] dark:focus-visible:ring-white/40")}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-slate-100 dark:bg-white/[0.08]">
                {tile.image ? <img src={tile.image} alt="" referrerPolicy="no-referrer" className="h-6 w-6 object-contain" /> : Icon ? <Icon size={19} strokeWidth={2} color={look.color} aria-hidden /> : null}
              </span>
              {tile.lead?.changePct != null && <Pct value={tile.lead.changePct} className="text-[13px]" />}
            </span>
            <span className="mt-3 block min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-tight text-slate-950 dark:text-white">{tile.title}</span>
              <span className="mt-0.5 block truncate text-[12px] font-medium text-slate-500 dark:text-slate-400">
                {tile.lead ? `${count} · ${displaySymbol(tile.lead.symbol)}` : tile.priced === 0 && tile.total > 0 ? `${count} · al abrir` : count}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── Mayores movimientos ───────────── */

export function MoversPanel({ movers, side, onSide, follows, onOpen }: {
  movers: MarketCatalogOverview['movers'];
  side: 'bolsa' | 'cripto';
  onSide: (side: 'bolsa' | 'cripto') => void;
  follows: FollowMap;
  onOpen: (item: MarketTapeItem) => void;
}) {
  const pack = movers[side];
  const empty = pack.up.length === 0 && pack.down.length === 0;
  return (
    <section aria-label="Mayores movimientos">
      <SectionTitle
        title="Hoy se mueven"
        detail={side === 'bolsa' ? 'Acciones del catálogo · última sesión' : 'Cripto · últimas 24 h'}
        action={(
          <Segmented
            id="market-movers"
            label="Mercado de los movimientos"
            value={side}
            onChange={onSide}
            options={[{ id: 'bolsa', label: 'Bolsa' }, { id: 'cripto', label: 'Cripto' }]}
          />
        )}
      />
      {empty ? (
        <p className="px-0.5 py-4 text-[13px] font-medium text-slate-500 dark:text-slate-400">Sin cotizaciones recientes: abre una categoría para pedirlas.</p>
      ) : (
        <div className="space-y-3">
          {[{ title: 'Suben', rows: pack.up }, { title: 'Bajan', rows: pack.down }].map((block) => block.rows.length > 0 && (
            <div key={block.title}>
              <h3 className="px-0.5 pb-0.5 text-[13px] font-semibold text-slate-500 dark:text-slate-400">{block.title}</h3>
              <div className="divide-y divide-slate-200/70 dark:divide-white/[0.08]">
                {block.rows.slice(0, 4).map((item, index) => <AssetRow key={item.key} item={item} follow={follows.get(item.key)} index={index} detail={`${displaySymbol(item.symbol)}${item.sub ? ` · ${item.sub}` : ''}`} onOpen={onOpen} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ───────────── Avisos ───────────── */

export function AlertsEntry({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[60px] w-full items-center gap-3 rounded-[20px] bg-white px-3.5 py-3 text-left ring-1 ring-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 dark:bg-white/[0.06] dark:ring-white/[0.06]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200"><Bell size={17} strokeWidth={2.2} aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-slate-950 dark:text-white">{count > 0 ? (count === 1 ? '1 aviso activo' : `${count} avisos activos`) : 'Avisos de precio'}</span>
        <span className="block truncate text-[13px] font-medium text-slate-500 dark:text-slate-400">{count > 0 ? 'Precio objetivo y variación, aparte de tu cartera' : 'Te avisamos cuando un activo llegue a tu precio'}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-slate-400" aria-hidden />
    </button>
  );
}

/* ───────────── Detalle de un activo ───────────── */

const KIND_LABEL: Record<string, string> = {
  crypto: 'Criptomoneda', stock: 'Acción', etf: 'ETF', index: 'Índice', commodity: 'Materia prima', fx: 'Divisa', bond: 'Bono',
  reit: 'Inmobiliario cotizado', gold: 'Metal', silver: 'Metal', oil: 'Energía', copper: 'Metal', cs2: 'Skin de CS2', tf2: 'Objeto de TF2',
};

export function canSpan(kind: string) {
  return kind !== 'tf2';
}

export type AssetOpen = { kind: string; key: string; name: string; symbol: string; image: string | null; priceEur: number | null; changePct: number | null; changeLabel: string; sparkline: number[]; sourceLabel?: string; fetchedAt?: string | null; stale?: boolean; sub?: string };

/**
 * Detalle de un activo como pantalla (no modal): logo, nombre y precio llegan volando desde la fila
 * (captureFlip/playFlip). La gráfica es CashChart tal cual: el scrub y el pulso no cambian (D023).
 */
export function AssetPage({ item, follow, alerts, onStar, onAlerts }: {
  item: AssetOpen;
  follow: MarketFollowed | null;
  /** Avisos de precio activos de este activo. */
  alerts: number;
  onStar?: (on: boolean) => Promise<void>;
  onAlerts: () => void;
}) {
  const topRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { playFlip(topRef.current); }, []);
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
  const spans = canSpan(item.kind);
  const storyPath = (span: number) => {
    const params = new URLSearchParams({ kind: item.kind, key: item.key, name: item.name, symbol: item.symbol });
    if (spans) params.set('days', String(span));
    return `/api/market/story?${params}`;
  };
  const [range, setRange] = useState<LineRangeId>('1M');
  const days = lineDays(range) ?? 365;
  const [story, setStory] = useState<MarketStory | null>(() => (item.key ? peek<MarketStory>(storyPath(days), 60_000) ?? null : null));
  const [failed, setFailed] = useState('');
  const [loadedDays, setLoadedDays] = useState(() => (story ? days : 0));
  const [live, setLive] = useState<number | null>(null);
  const [liveDay, setLiveDay] = useState<string | null>(null);
  useEffect(() => {
    if (!item.key) return;
    let cancelled = false;
    cachedApi<MarketStory>(storyPath(days), { maxAge: 60_000 })
      .then((next) => { if (!cancelled) { setStory(next); setLoadedDays(days); setFailed(''); } })
      .catch((err: Error) => { if (!cancelled) setFailed(err.message); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.kind, item.key, days]);
  const fromStory: LinePoint[] = story && story.series.length >= 2 ? story.series.map((point) => ({ day: point.at, eur: point.eur })) : [];
  const waiting = Boolean(item.key) && !story && !failed;
  const points: LinePoint[] = fromStory;
  const matched = fromStory.length >= 2;
  const lastPrice = item.priceEur ?? (matched ? fromStory[fromStory.length - 1].eur : null);
  const change = matched ? story?.changePct : item.changePct;
  const label = matched ? story?.changeLabel : item.changeLabel;
  const updated = story && story.series.length > 0 ? story.series[story.series.length - 1].at : item.fetchedAt ?? null;
  const unit = quoteUnit(item.kind);
  const busy = failed === '429' || /^429\b/.test(failed);
  const facts: [string, string][] = [
    ['Tipo', KIND_LABEL[item.kind] || 'Activo'],
    ...(item.sub ? [['Grupo', item.sub] as [string, string]] : []),
    ['Símbolo', displaySymbol(item.symbol) || '—'],
    ['Fuente', item.sourceLabel || (item.key.startsWith('coingecko:') ? 'CoinGecko' : item.key.startsWith('yahoo:') ? 'Yahoo Finance' : '—')],
    ['Actualizado', updated ? formatAgo(updated) : '—'],
  ];
  return (
    <div ref={topRef} className="space-y-5">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <span data-flip-to="logo" className="block"><Mark image={item.image} symbol={item.symbol} name={item.name} ticker={tickerOf(item)} contain={item.kind === 'index' || item.kind === 'cs2' || item.kind === 'tf2'} size={44} neutral={neutralMark(item.kind)} /></span>
          <div className="min-w-0">
            <h1 data-flip-to="name" className="truncate text-[20px] font-semibold leading-tight tracking-tight text-slate-950 dark:text-white">{item.name}</h1>
            <p className="truncate text-[13px] font-medium text-slate-500 dark:text-slate-400">{[displaySymbol(item.symbol), item.sub].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div>
          <p data-flip-to="value" className="text-[clamp(2rem,9vw,2.6rem)] font-semibold leading-none tabular-nums tracking-[-0.03em] text-slate-950 dark:text-white">{quoteAmount(item.kind, live ?? lastPrice)}</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium text-slate-500 dark:text-slate-400">
            {change != null && <Pct value={change} className="text-[15px]" />}
            {change != null && label && <span>{label}</span>}
            {liveDay ? <span>{change != null ? '· ' : ''}{formatDay(liveDay)}</span> : unit ? <span>{change != null ? '· ' : ''}{unit}</span> : null}
          </p>
          {item.stale && item.fetchedAt && <p className="mt-1.5 text-[13px] font-medium text-amber-700 dark:text-amber-300">Dato de {formatAgo(item.fetchedAt)}: el proveedor no ha mandado uno nuevo.</p>}
        </div>
        {(onStar || item.key) && (
          <div className="flex flex-wrap gap-2">
            {onStar && (
              <button
                type="button"
                aria-pressed={starred}
                disabled={starBusy}
                onClick={() => void toggleStar()}
                className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ring-1 transition-colors disabled:opacity-60', starred ? 'bg-slate-950 text-white ring-slate-950 dark:bg-white dark:text-slate-950 dark:ring-white' : 'bg-white text-slate-800 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-100 dark:ring-white/15')}
              >
                <Star size={15} strokeWidth={2.3} aria-hidden className={cn(starred && 'fill-current')} />
                {starred ? 'Siguiendo' : 'Seguir'}
              </button>
            )}
            {isFollowable(item.kind, item.key) && (
              <button
                type="button"
                onClick={onAlerts}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-[14px] font-semibold text-slate-800 ring-1 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-100 dark:ring-white/15"
              >
                <Bell size={15} strokeWidth={2.3} aria-hidden />
                {alerts > 0 ? (alerts === 1 ? '1 aviso' : `${alerts} avisos`) : 'Crear aviso'}
              </button>
            )}
          </div>
        )}
        {starError && <p role="alert" className="text-[13px] font-medium text-rose-700 dark:text-rose-300">{starError}</p>}
      </header>

      <section aria-label="Gráfica">
        {spans && <LineRangeTabs value={range} onChange={setRange} />}
        <div className="mt-3">
          {item.key && waiting ? (
            <ChartBone tall ranges={false} />
          ) : item.key && points.length >= 2 ? (
            <CashChart quiet tall pending={false} points={points} now={lastPrice ?? points[points.length - 1]?.eur ?? 0} hidden={false} onValue={setLive} onDay={setLiveDay} emptyText="" />
          ) : (
            <p className="py-10 text-center text-[13px] font-medium text-slate-500 dark:text-slate-400">
              {!item.key ? 'Este valor no está enlazado a un mercado, así que no hay histórico.' : busy ? 'El proveedor pide esperar un momento. Vuelve a intentarlo en unos segundos.' : failed || story?.note || 'Sin histórico para este tramo.'}
            </p>
          )}
          {spans && loadedDays !== 0 && days !== loadedDays && <p className="mt-1 text-[12px] font-semibold text-slate-500">Cargando este tramo…</p>}
        </div>
      </section>

      {(held || starred || follow?.alerted) && (
        <section aria-label="Tu seguimiento" className="rounded-[20px] bg-white p-4 ring-1 ring-black/[0.04] dark:bg-white/[0.06] dark:ring-white/[0.06]">
          {held && (
            <p className="flex items-start gap-2.5 text-[14px] font-medium text-slate-700 dark:text-slate-200">
              <Wallet size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-slate-500" />
              <span>En tu cartera{follow?.accounts ? ` · ${follow.accounts}` : ''}. Te avisamos si se mueve con fuerza.</span>
            </p>
          )}
          {!held && starred && (
            <p className="flex items-start gap-2.5 text-[14px] font-medium text-slate-700 dark:text-slate-200">
              <Star size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 fill-current text-slate-900 dark:text-white" />
              <span>Lo sigues: te avisamos si se mueve con fuerza aunque no lo tengas.</span>
            </p>
          )}
          {follow?.alerted && (
            <p className="mt-2 flex items-start gap-2.5 text-[14px] font-medium text-slate-700 dark:text-slate-200">
              <Bell size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-slate-500" />
              <span>Tiene un aviso de precio activo, aparte de la cartera y la estrella.</span>
            </p>
          )}
        </section>
      )}

      {story && story.floats.length > 0 && (
        <section aria-label="Floats">
          <h2 className="text-[17px] font-semibold">Floats</h2>
          <ul className="mt-1 divide-y divide-slate-200/70 dark:divide-white/[0.08]">
            {story.floats.map((band) => (
              <li key={band.label} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  <span className="block text-[14px] font-semibold">{band.label}{band.yours ? ' · el tuyo' : ''}</span>
                  <span className="block text-[12px] font-medium text-slate-500 dark:text-slate-400">{band.sales > 0 ? `${band.range} · ${band.sales} ventas` : band.range}</span>
                </span>
                <span className="text-[15px] font-semibold tabular-nums">{marketMoney(band.priceEur)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Información">
        <h2 className="pb-1 text-[17px] font-semibold text-slate-950 dark:text-white">Información</h2>
        <dl className="divide-y divide-slate-200/70 dark:divide-white/[0.08]">
          {facts.map(([term, value]) => (
            <div key={term} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
              <dt className="font-medium text-slate-500 dark:text-slate-400">{term}</dt>
              <dd className="truncate font-semibold text-slate-900 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[12px] font-medium text-slate-500 dark:text-slate-400">
          {story?.note || 'El porcentaje es el de la gráfica, del primer punto al último.'} Balance registra tus movimientos; no compra ni vende.
        </p>
      </section>
    </div>
  );
}

/* ───────────── Huecos de carga ───────────── */

export function CategoryBones({ count = 8 }: { count?: number }) {
  return <RowBones count={count} logo={40} />;
}

export function asTape(item: MarketFollowed | MarketCatalogItem | MarketTapeItem): MarketTapeItem {
  return item;
}

export type { MarketCatalogItem };
