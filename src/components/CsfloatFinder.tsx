import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Search, Star } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DragRow } from '@/components/DragRow';
import { Modal } from '@/components/Modal';
import { Input } from '@/components/ui/Input';
import { CashChart, type LinePoint } from '@/views/Wallets';
import { api, ApiError } from '@/lib/api';
import { formatAgo, formatDay } from '@/lib/format';
import { marketMark, marketMoney, marketReady, marketToEur, useRescaleAmounts } from '@/lib/marketCurrency';
import { quickOut, softSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';

type Listing = {
  id: string;
  label: string;
  marketHashName: string;
  wear: string | null;
  state: string;
  priceEur: number;
  referenceEur: number | null;
  floatValue: number | null;
  paintSeed: number | null;
  phase: string | null;
  lowRank: number | null;
  stattrak: boolean;
  souvenir: boolean;
  stickers: string[];
  watchers: number | null;
  createdAt: string | null;
  soldAt: string | null;
  image: string | null;
  photos: string[];
  url: string;
  tracked?: boolean;
};

type Detail = {
  listing: Listing;
  tracked: boolean;
  sales: {
    medianEur: number | null;
    count: number;
    nearMedianEur: number | null;
    nearCount: number;
    last: { at: string; eur: number; floatValue: number | null }[];
  };
};

type Tracked = {
  id: string;
  label: string;
  image: string | null;
  floatValue: number | null;
  paintSeed: number | null;
  priceEur: number | null;
  firstPriceEur: number | null;
  state: 'listed' | 'sold' | 'gone';
  endedAt: string | null;
  lastCheckedAt: string | null;
  url: string;
};

export type SkinHit = { name: string; label: string; kind: string; paintIndex: number | null; image: string | null; wears: { wear: string; refEur: number | null }[] };

const WEAR_SHORT: Record<string, string> = { 'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS' };
const KIND_LABEL: Record<string, string> = { Gloves: 'Guantes', Knives: 'Cuchillo', Weapons: 'Arma' };

const SORTS = [
  { id: 'best_deal', label: 'Mejor precio' },
  { id: 'lowest_price', label: 'Más barato' },
  { id: 'lowest_float', label: 'Menos float' },
  { id: 'highest_float', label: 'Más float' },
  { id: 'most_recent', label: 'Lo último' },
] as const;

type Catalog = { results: SkinHit[]; wear: string | null };

function stillMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const STATE_LABEL: Record<Tracked['state'], string> = { listed: 'A la venta', sold: 'Vendido', gone: 'Quitado' };

function float(value: number | null): string {
  return value == null ? '—' : value.toFixed(value < 0.01 ? 6 : 4);
}

function floatFull(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}

function deal(listing: Listing): number | null {
  if (!(listing.referenceEur && listing.referenceEur > 0)) return null;
  return Math.round(((listing.priceEur - listing.referenceEur) / listing.referenceEur) * 1000) / 10;
}

function shown(value: string): number | null {
  const number = Number(value.replace(',', '.'));
  return value.trim() && Number.isFinite(number) ? number : null;
}

function FloatBar({ value }: { value: number | null }) {
  if (value == null) return null;
  const stops = [0.07, 0.15, 0.38, 0.45];
  return (
    <div className="relative mt-2 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500">
      {stops.map((stop) => <span key={stop} className="absolute top-0 h-1.5 w-px bg-white/80" style={{ left: `${stop * 100}%` }} />)}
      <span className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-slate-900 ring-2 ring-white dark:bg-white dark:ring-slate-900" style={{ left: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/5">
      <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
      <p className="font-black tabular-nums">{value}</p>
    </div>
  );
}

function ListingSheet({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [side, setSide] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    setDetail(null);
    setError('');
    api<Detail>(`/api/market/csfloat/listings/${id}`)
      .then((data) => { if (!cancel) setDetail(data); })
      .catch((err: Error) => { if (!cancel) setError(err.message); });
    return () => { cancel = true; };
  }, [id]);

  const toggle = async () => {
    if (!detail || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/market/tracked/${id}`, { method: detail.tracked ? 'DELETE' : 'POST' });
      setDetail({ ...detail, tracked: !detail.tracked });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    } finally {
      setBusy(false);
    }
  };

  const listing = detail?.listing;
  const photo = listing ? listing.photos[side] || listing.photos[0] || listing.image : null;
  const gap = listing?.referenceEur ? Math.round(((listing.priceEur - listing.referenceEur) / listing.referenceEur) * 1000) / 10 : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-[13px] font-semibold text-slate-500">Volver</button>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!detail || busy}
          aria-label={detail?.tracked ? 'Dejar de seguir el anuncio' : 'Seguir este anuncio'}
          className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold', detail?.tracked ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white')}
        >
          <Star size={15} fill={detail?.tracked ? 'currentColor' : 'none'} />
          {detail?.tracked ? 'Anuncio seguido' : 'Seguir anuncio'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
      {!detail && !error && <p className="mt-4 text-sm font-medium text-slate-400">Cargando el anuncio…</p>}
      {listing && detail && (
        <div className="mt-3 space-y-4">
          {photo && (
            <div>
              <img src={photo} alt={listing.label} referrerPolicy="no-referrer" className="aspect-[16/10] w-full rounded-2xl bg-slate-100 object-contain dark:bg-white/5" />
              {listing.photos.length > 1 && (
                <div className="mt-2 flex justify-center gap-2">
                  {['Palma', 'Dorso'].map((name, index) => (
                    <button key={name} type="button" onClick={() => setSide(index)} className={cn('rounded-full px-3 py-1 text-xs font-bold', side === index ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-white/10')}>{name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <p className="font-black">{listing.label}</p>
            <p className="text-[11px] font-bold uppercase text-slate-400">
              {[listing.wear, listing.phase, listing.stattrak ? 'StatTrak' : '', listing.souvenir ? 'Souvenir' : ''].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-2 text-3xl font-black tabular-nums">{marketMoney(listing.priceEur)}</p>
            {listing.state !== 'listed' && <p className="text-sm font-bold text-[#ea3943]">{listing.state === 'sold' ? `Vendido${listing.soldAt ? ` ${formatAgo(listing.soldAt)}` : ''}` : 'Ya no está a la venta'}</p>}
            {listing.referenceEur != null && (
              <p className={cn('text-sm font-bold', gap != null && gap <= 0 ? 'text-[#16c784]' : 'text-slate-500')}>
                CSFloat lo valora en {marketMoney(listing.referenceEur)}{gap == null ? '' : ` · ${gap > 0 ? '+' : ''}${gap.toLocaleString('es-ES')} %`}
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase text-slate-400">Float</p>
            <p className="font-black tabular-nums">{float(listing.floatValue)}</p>
            <FloatBar value={listing.floatValue} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Fact label="Patrón" value={listing.paintSeed == null ? '—' : String(listing.paintSeed)} />
            <Fact label="Puesto por float" value={listing.lowRank == null ? '—' : `#${listing.lowRank}`} />
            <Fact label="Lo siguen" value={listing.watchers == null ? '—' : `${listing.watchers} personas`} />
            <Fact label="Publicado" value={listing.createdAt ? formatDay(listing.createdAt.slice(0, 10)) : '—'} />
          </div>
          {listing.stickers.length > 0 && <p className="text-xs font-medium text-slate-500">Pegatinas: {listing.stickers.join(' · ')}</p>}
          <div className="rounded-2xl bg-slate-50 px-3 py-3 dark:bg-white/5">
            <p className="text-[11px] font-bold uppercase text-slate-400">Ventas recientes de este modelo</p>
            {detail.sales.count === 0 ? (
              <p className="mt-1 text-sm font-medium text-slate-500">CSFloat no ha devuelto ventas.</p>
            ) : (
              <>
                <p className="mt-1 text-sm font-bold">
                  Mediana {detail.sales.medianEur == null ? '—' : marketMoney(detail.sales.medianEur)} en {detail.sales.count} ventas
                  {detail.sales.nearMedianEur != null && ` · con float parecido ${marketMoney(detail.sales.nearMedianEur)} (${detail.sales.nearCount})`}
                </p>
                <div className="mt-2 divide-y divide-slate-200/70 dark:divide-white/10">
                  {detail.sales.last.map((sale, index) => (
                    <p key={`${sale.at}-${index}`} className="flex justify-between gap-3 py-1.5 text-xs font-medium text-slate-500">
                      <span>{formatAgo(sale.at)} · float {float(sale.floatValue)}</span>
                      <span className="font-black tabular-nums text-slate-700 dark:text-slate-200">{marketMoney(sale.eur)}</span>
                    </p>
                  ))}
                </div>
              </>
            )}
          </div>
          <p className="text-xs font-medium text-slate-500">Con la estrella, te llega un aviso al móvil si baja o sube de precio, si se vende o si lo quitan.</p>
          <a href={listing.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white dark:bg-white dark:text-slate-900">
            Abrir en CSFloat <ExternalLink size={15} />
          </a>
        </div>
      )}
    </div>
  );
}

function paintOf(label: string): string {
  const raw = label.split(' | ').slice(1).join(' | ') || label;
  return raw.replace(/\s+\([^)]+\)$/, '');
}

function suggestRows(hits: SkinHit[]): Array<{ type: 'group'; label: string; count: number } | { type: 'hit'; hit: SkinHit }> {
  const order: string[] = [];
  const buckets = new Map<string, SkinHit[]>();
  for (const hit of hits) {
    const key = paintOf(hit.label);
    if (!buckets.has(key)) order.push(key);
    buckets.set(key, [...(buckets.get(key) || []), hit]);
  }
  const rows: Array<{ type: 'group'; label: string; count: number } | { type: 'hit'; hit: SkinHit }> = [];
  for (const key of order) {
    const group = buckets.get(key) || [];
    if (group.length > 1) rows.push({ type: 'group', label: key, count: group.length });
    for (const hit of group) rows.push({ type: 'hit', hit });
  }
  return rows;
}

function SkinThumb({ image }: { image: string | null }) {
  return (
    <span className="grid h-12 w-16 shrink-0 place-items-center rounded-lg bg-slate-100 dark:bg-white/10">
      {image ? <img src={image} alt="" referrerPolicy="no-referrer" className="h-10 w-14 object-contain" /> : <span className="text-[10px] font-black text-slate-400">CS</span>}
    </span>
  );
}

function ListingCard({ listing, onOpen, index, showWear, showName }: { listing: Listing; onOpen: () => void; index: number; showWear?: boolean; showName?: boolean }) {
  const still = stillMotion();
  const art = listing.image || listing.photos[0] || null;
  const gap = deal(listing);
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={still ? false : { opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={still ? { duration: 0 } : { ...softSpring, delay: Math.min(index, 8) * 0.04 }}
      className="overflow-hidden rounded-3xl bg-white text-left shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-white/10"
    >
      <span className="relative grid aspect-[5/4] place-items-center bg-[radial-gradient(circle_at_50%_42%,#3d4a5c,#12151c)]">
        {art ? <img src={art} alt="" referrerPolicy="no-referrer" className="h-[74%] w-[74%] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.45)]" /> : <span className="block aspect-[5/4]" />}
        {listing.stickers.length > 0 && <span className="absolute bottom-2 right-2 grid h-5 min-w-5 place-items-center rounded-md bg-black/70 px-1 text-[10px] font-black text-white">{listing.stickers.length}</span>}
        {listing.tracked && <Star size={14} className="absolute left-2 top-2 text-amber-300" fill="currentColor" />}
        {showWear && listing.wear && <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">{WEAR_SHORT[listing.wear] || listing.wear}</span>}
      </span>
      <span className="block px-2.5 pb-2.5 pt-2">
        <span className="flex items-baseline justify-between gap-1">
          <span className="text-[15px] font-black tabular-nums">{marketMoney(listing.priceEur)}</span>
          {gap != null && <span className={cn('text-[11px] font-black tabular-nums', gap <= 0 ? 'text-[#16c784]' : 'text-[#ea3943]')}>{gap > 0 ? '+' : ''}{gap.toLocaleString('es-ES')} %</span>}
        </span>
        <FloatBar value={listing.floatValue} />
        {showName && <span className="mt-1.5 block truncate text-[11px] font-semibold">{listing.label}</span>}
        <span className="mt-1 block truncate text-[10px] font-semibold text-slate-500">{floatFull(listing.floatValue)}{listing.paintSeed == null ? '' : ` (${listing.paintSeed})`}</span>
      </span>
    </motion.button>
  );
}

function ListingGrid({ listings, onOpen, showWear, showName }: { listings: Listing[]; onOpen: (id: string) => void; showWear?: boolean; showName?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {listings.map((listing, index) => <ListingCard key={listing.id} listing={listing} index={index} showWear={showWear} showName={showName} onOpen={() => onOpen(listing.id)} />)}
    </div>
  );
}

const FEED = [
  'AK-47 | Redline (Field-Tested)',
  'AWP | Asiimov (Field-Tested)',
  'M4A1-S | Printstream (Field-Tested)',
  'Glock-18 | Water Elemental (Minimal Wear)',
];

function mix<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

export function CsfloatFeed() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    const live = (rows: Listing[]) => rows.filter((row) => !row.state || row.state === 'listed');
    (async () => {
      const gathered: Listing[] = [];
      for (const name of mix(FEED)) {
        if (cancel) return;
        try {
          const params = new URLSearchParams({ name, sort: 'most_recent' });
          const data = await api<{ listings: Listing[] }>(`/api/market/csfloat/listings?${params}`);
          gathered.push(...live(data.listings || []).slice(0, 6));
          if (!cancel) setListings(mix(gathered));
        } catch (err) {
          if (!gathered.length && !cancel) setError(err instanceof ApiError ? err.message : 'CSFloat no ha respondido.');
        }
      }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-500">Anuncios de CSFloat.</p>
      {loading && listings.length === 0 && <p className="text-sm font-medium text-slate-400">Buscando anuncios…</p>}
      {error && listings.length === 0 && <p className="text-sm font-medium text-rose-600">{error}</p>}
      {listings.length > 0 && <ListingGrid listings={listings} showWear showName onOpen={setOpenId} />}
      {openId && (
        <Modal title="Anuncio" onClose={() => setOpenId(null)}>
          <ListingSheet id={openId} onBack={() => setOpenId(null)} onChanged={() => undefined} />
        </Modal>
      )}
    </div>
  );
}

function PriceNote({ sort }: { sort: (typeof SORTS)[number]['id'] }) {
  if (sort !== 'best_deal') return null;
  return <p className="text-xs font-medium text-slate-500">El mejor precio es el que queda más por debajo del valor que CSFloat calcula para ese float.</p>;
}

function bestGap(listing: Listing): number {
  const gap = deal(listing);
  return gap == null ? Number.POSITIVE_INFINITY : gap;
}

export function SkinSuggest({ query, onPick, onMatch }: { query: string; onPick: (hit: SkinHit, wear: string | null) => void; onMatch?: (found: boolean) => void }) {
  const [hits, setHits] = useState<SkinHit[]>([]);
  const [note, setNote] = useState('');
  const still = stillMotion();
  const pick = useRef(onPick);
  const match = useRef(onMatch);
  pick.current = onPick;
  match.current = onMatch;

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setHits([]);
      setNote('');
      match.current?.(false);
      return;
    }
    let cancel = false;
    setNote('Buscando en CSFloat…');
    const timer = window.setTimeout(() => {
      api<Catalog>(`/api/market/csfloat/catalog?q=${encodeURIComponent(text)}`)
        .then((data) => {
          if (cancel) return;
          const results = data.results || [];
          const exact = data.wear ? results.filter((hit) => hit.wears.some((row) => row.wear === data.wear)) : [];
          match.current?.(results.length > 0);
          if (data.wear && exact.length === 1) {
            setHits([]);
            setNote('');
            pick.current(exact[0], data.wear);
            return;
          }
          setHits(results);
          setNote(results.length ? '' : `Ninguna skin coincide con «${text}».`);
        })
        .catch((err: Error) => {
          if (!cancel) {
            setHits([]);
            match.current?.(false);
            setNote(err.message || 'CSFloat no ha respondido.');
          }
        });
    }, 250);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (hits.length === 0) return note ? <p className="absolute left-0 right-0 top-full z-40 mt-2 rounded-2xl bg-white px-3 py-3 text-sm font-medium text-slate-500 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10">{note}</p> : null;
  const rows = suggestRows(hits);

  return (
    <motion.div
      initial={still ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={still ? undefined : { opacity: 0, y: 6, transition: quickOut }}
      transition={softSpring}
      className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-white/10"
    >
      <div className="max-h-80 overflow-y-auto py-1">
        {rows.map((row) => row.type === 'group' ? (
          <div key={`group:${row.label}`} className="px-3 pb-1 pt-3">
            <p className="text-sm font-black">{row.label}</p>
            <p className="text-[11px] font-medium text-slate-400">Grupo de {row.count} skins</p>
          </div>
        ) : (
          <button key={row.hit.label} type="button" onClick={() => onPick(row.hit, null)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/10">
            <SkinThumb image={row.hit.image} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black">{row.hit.label}</span>
              <span className="block text-[11px] font-medium text-slate-400">{KIND_LABEL[row.hit.kind] || row.hit.kind}</span>
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

export function SkinMarket({ skin, wear }: { skin: SkinHit; wear: string }) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [story, setStory] = useState<LinePoint[]>([]);
  const [storyNow, setStoryNow] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [starred, setStarred] = useState(false);
  const [starring, setStarring] = useState(false);
  const chosen = wear === 'all' ? '' : wear;
  const wears = wear === 'all' ? skin.wears.map((row) => row.wear) : [wear];

  useEffect(() => {
    let cancel = false;
    api<{ skins: { name: string; wear: string }[] }>('/api/market/skin-stars')
      .then((data) => {
        if (!cancel) setStarred((data.skins || []).some((item) => item.name === skin.name && item.wear === chosen));
      })
      .catch(() => undefined);
    return () => { cancel = true; };
  }, [skin.name, chosen]);

  const toggleStar = async () => {
    if (starring) return;
    setStarring(true);
    setError('');
    try {
      if (starred) {
        const params = new URLSearchParams({ name: skin.name, wear: chosen });
        await api(`/api/market/skin-stars?${params}`, { method: 'DELETE' });
        setStarred(false);
      } else {
        await api('/api/market/skin-stars', {
          method: 'POST',
          body: JSON.stringify({
            name: skin.name,
            wear: chosen,
            label: skin.label,
            image: skin.image,
            paintIndex: skin.paintIndex,
            wears: skin.wears.map((row) => row.wear),
          }),
        });
        setStarred(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido destacar.');
    } finally {
      setStarring(false);
    }
  };

  useEffect(() => {
    const wearName = wear === 'all' ? (skin.wears[0]?.wear || '') : wear;
    const hash = wearName ? `${skin.name} (${wearName})` : skin.name;
    const params = new URLSearchParams({ kind: 'cs2', key: `cs2:${hash}`, name: hash, symbol: 'CS2' });
    let cancel = false;
    setStory([]);
    api<{ series: { at: string; eur: number }[] }>(`/api/market/story?${params}`)
      .then((data) => {
        if (cancel) return;
        setStory((data.series || []).filter((point) => point.eur > 0).map((point) => ({ day: point.at, eur: point.eur })));
      })
      .catch(() => { if (!cancel) setStory([]); });
    return () => { cancel = true; };
  }, [skin, wear]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError('');
    setListings(null);
    Promise.all(wears.map((next) => {
      const params = new URLSearchParams({ name: `${skin.name} (${next})`, sort: 'best_deal' });
      if (skin.paintIndex != null) params.set('paint', String(skin.paintIndex));
      return api<{ listings: Listing[] }>(`/api/market/csfloat/listings?${params}`).then((data) => data.listings || []);
    }))
      .then((packs) => {
        if (cancel) return;
        const merged = packs.flat();
        merged.sort((a, b) => bestGap(a) - bestGap(b) || a.priceEur - b.priceEur);
        setListings(merged.slice(0, 40));
      })
      .catch((err: Error) => { if (!cancel) setError(err.message); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [skin, wear]);

  const chartNow = storyNow ?? story[story.length - 1]?.eur ?? skin.wears.find((row) => row.wear === (wear === 'all' ? skin.wears[0]?.wear : wear))?.refEur ?? 0;
  return (
    <div className="space-y-3">
      <CashChart
        key={`${skin.name}:${wear}:${story.length}`}
        quiet
        tall
        tone="ink"
        hidden={false}
        points={story}
        now={chartNow}
        onValue={setStoryNow}
        emptyText={story.length ? '' : 'La línea sale cuando CSFloat manda las ventas de esta skin.'}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{starred ? 'Te aviso si se mueve la más barata.' : 'Destácala y te aviso de su precio, no de un anuncio suelto.'}</p>
        <button
          type="button"
          onClick={() => void toggleStar()}
          disabled={starring}
          aria-pressed={starred}
          className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold', starred ? 'bg-amber-400 text-slate-900' : 'bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-white dark:ring-white/10')}
        >
          <Star size={14} fill={starred ? 'currentColor' : 'none'} />
          {starred ? 'Destacada' : 'Destacar'}
        </button>
      </div>
      {loading && <p className="text-sm font-medium text-slate-400">Buscando anuncios…</p>}
      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
      {listings && listings.length === 0 && !loading && <p className="text-sm font-medium text-slate-500">No hay anuncios en este desgaste.</p>}
      {listings && listings.length > 0 && (
        <>
          <PriceNote sort="best_deal" />
          <ListingGrid listings={listings} showWear={wear === 'all'} onOpen={setOpenId} />
        </>
      )}
      {openId && (
        <Modal title="Anuncio" onClose={() => setOpenId(null)}>
          <ListingSheet id={openId} onBack={() => setOpenId(null)} onChanged={() => undefined} />
        </Modal>
      )}
    </div>
  );
}

function ListingRow({ image, title, sub, price, starred, onOpen }: { image: string | null; title: string; sub: string; price: string; starred?: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 py-3 text-left">
      {image ? <img src={image} alt="" referrerPolicy="no-referrer" className="h-12 w-16 shrink-0 object-contain" /> : <span className="h-12 w-16 shrink-0 rounded-xl bg-slate-100 dark:bg-white/5" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black">{title}</span>
        <span className="block text-xs font-medium text-slate-500">{sub}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-black tabular-nums">
        {starred && <Star size={13} className="text-amber-400" fill="currentColor" />}
        {price}
      </span>
    </button>
  );
}

export function CsfloatFinder({ focusId }: { focusId?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(focusId || null);
  const [tracked, setTracked] = useState<Tracked[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SkinHit[]>([]);
  const [skin, setSkin] = useState<SkinHit | null>(null);
  const [wear, setWear] = useState('');
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('best_deal');
  const [minFloat, setMinFloat] = useState('');
  const [maxFloat, setMaxFloat] = useState('');
  const [maxEur, setMaxEur] = useState('');
  const [seed, setSeed] = useState('');
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useRescaleAmounts(setMaxEur);

  const loadTracked = () => {
    api<{ tracked: Tracked[] }>('/api/market/tracked')
      .then((data) => setTracked(data.tracked || []))
      .catch(() => undefined);
  };

  useEffect(() => {
    loadTracked();
  }, []);

  useEffect(() => {
    if (focusId) setOpenId(focusId);
  }, [focusId]);

  const search = async (value: string) => {
    setQuery(value);
    setSkin(null);
    setListings(null);
    const text = value.trim();
    if (text.length < 2) {
      setHits([]);
      return;
    }
    const found = await api<Catalog>(`/api/market/csfloat/catalog?q=${encodeURIComponent(text)}`).catch(() => ({ results: [], wear: null }));
    const results = found.results || [];
    const exact = found.wear ? results.filter((hit) => hit.wears.some((row) => row.wear === found.wear)) : [];
    setHits(results);
    if (found.wear && exact.length === 1) {
      setSkin(exact[0]);
      setWear(found.wear);
      setSort('best_deal');
    }
  };

  const browse = async () => {
    if (!skin || !wear) return;
    const name = `${skin.name} (${wear})`;
    const params = new URLSearchParams({ name, sort });
    if (skin.paintIndex != null) params.set('paint', String(skin.paintIndex));
    const low = shown(minFloat);
    const high = shown(maxFloat);
    const cap = shown(maxEur);
    const pattern = shown(seed);
    if (cap != null && !marketReady()) {
      setError('El cambio del dólar no ha llegado. Espera un momento.');
      return;
    }
    if (low != null) params.set('minFloat', String(low));
    if (high != null) params.set('maxFloat', String(high));
    if (cap != null) params.set('maxEur', String(marketToEur(cap)));
    if (pattern != null) params.set('seed', String(Math.round(pattern)));
    setLoading(true);
    setError('');
    try {
      const data = await api<{ listings: Listing[] }>(`/api/market/csfloat/listings?${params}`);
      setListings(data.listings || []);
    } catch (err) {
      setListings(null);
      setError(err instanceof Error ? err.message : 'CSFloat no ha respondido.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (skin && wear) void browse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin, wear, sort]);

  if (openId) {
    return (
      <ListingSheet
        id={openId}
        onBack={() => { setOpenId(null); if (skin) void browse(); }}
        onChanged={loadTracked}
      />
    );
  }

  return (
    <div className="space-y-4">
      {tracked.length > 0 && (
        <section>
          <p className="text-[11px] font-bold uppercase text-slate-400">Siguiendo</p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {tracked.map((row) => {
              const moved = row.priceEur != null && row.firstPriceEur != null ? row.priceEur - row.firstPriceEur : 0;
              const state = STATE_LABEL[row.state];
              const change = Math.abs(moved) >= 0.01 ? ` · ${moved < 0 ? 'ha bajado' : 'ha subido'} ${marketMoney(Math.abs(moved))}` : '';
              return (
                <ListingRow
                  key={row.id}
                  image={row.image}
                  title={row.label}
                  sub={`${state} · float ${float(row.floatValue)}${change}`}
                  price={row.priceEur == null ? '—' : marketMoney(row.priceEur)}
                  starred
                  onOpen={() => setOpenId(row.id)}
                />
              );
            })}
          </div>
        </section>
      )}
      <section className="space-y-2">
        <Input icon={<Search size={16} />} value={query} onChange={(event) => void search(event.target.value)} placeholder="Busca en CSFloat: Pandora, Vice, Crimson Kimono…" aria-label="Buscar en CSFloat" />
        {!skin && hits.length > 0 && (
          <div className="grid gap-1">
            {suggestRows(hits).map((row) => row.type === 'group' ? (
              <p key={`group:${row.label}`} className="px-2 pt-2 text-[11px] font-bold uppercase text-slate-400">{row.label} · {row.count}</p>
            ) : (
              <button key={row.hit.label} type="button" onClick={() => { setSkin(row.hit); setWear(''); setListings(null); setSort('best_deal'); }} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5">
                <SkinThumb image={row.hit.image} />
                <span className="min-w-0">
                  <span className="block truncate">{row.hit.label}</span>
                  <span className="block text-[11px] font-bold uppercase text-slate-400">{KIND_LABEL[row.hit.kind] || row.hit.kind}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {skin && (
          <div className="space-y-2">
            <p className="flex items-center justify-between gap-3 text-sm font-black">
              <span className="truncate">{skin.label}</span>
              <button type="button" onClick={() => { setSkin(null); setWear(''); setListings(null); }} className="shrink-0 text-xs font-bold text-slate-400">Cambiar</button>
            </p>
            {skin.wears.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {skin.wears.map((option) => (
                  <button key={option.wear} type="button" onClick={() => { setWear(option.wear); setSort('best_deal'); }} className={cn('rounded-full border px-3 py-1 text-xs font-bold', wear === option.wear ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-400 dark:border-white/10')}>
                    {WEAR_SHORT[option.wear] || option.wear}{option.refEur != null ? ` · ${marketMoney(option.refEur)}` : ''}
                  </button>
                ))}
              </div>
            )}
            {!wear && <p className="text-sm font-medium text-slate-500">Elige el desgaste. A partir de ahí salen por mejor precio.</p>}
            {wear && <DragRow className="-mx-1 flex flex-nowrap gap-2 px-1">
              {SORTS.map((option) => (
                <button key={option.id} type="button" onClick={() => setSort(option.id)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-bold', sort === option.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-white/10')}>{option.label}</button>
              ))}
            </DragRow>}
            {wear && <div className="grid grid-cols-2 gap-2">
              <Input label="Float desde" inputMode="decimal" value={minFloat} onChange={(event) => setMinFloat(event.target.value)} placeholder="0,15" />
              <Input label="Float hasta" inputMode="decimal" value={maxFloat} onChange={(event) => setMaxFloat(event.target.value)} placeholder="0,25" />
              <Input label={`Hasta (${marketMark()})`} inputMode="decimal" value={maxEur} onChange={(event) => setMaxEur(event.target.value)} placeholder="Opcional" />
              <Input label="Patrón" inputMode="numeric" value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="Opcional" />
            </div>}
            {wear && <button type="button" onClick={() => void browse()} className="w-full rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white dark:bg-white dark:text-slate-900">{loading ? 'Buscando…' : 'Buscar anuncios'}</button>}
          </div>
        )}
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        {listings && listings.length === 0 && !loading && <p className="text-sm font-medium text-slate-500">No hay anuncios con esos filtros.</p>}
        {listings && listings.length > 0 && (
          <>
            <PriceNote sort={sort} />
            <ListingGrid listings={listings} onOpen={setOpenId} />
          </>
        )}
        {!skin && tracked.length === 0 && hits.length === 0 && (
          <p className="text-sm font-medium text-slate-500">Busca unos guantes, entra en el anuncio que te guste y dale a la estrella. Desde ese momento te aviso si baja, sube, se vende o lo quitan.</p>
        )}
      </section>
    </div>
  );
}
