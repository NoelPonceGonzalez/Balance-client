import { useEffect, useState } from 'react';
import { ExternalLink, Search, Star } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { formatAgo, formatDay, formatEur } from '@/lib/format';
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

type SkinHit = { name: string; label: string; kind: string; paintIndex: number | null; wears: { wear: string; refEur: number | null }[] };

const WEAR_SHORT: Record<string, string> = { 'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS' };
const KIND_LABEL: Record<string, string> = { Gloves: 'Guantes', Knives: 'Cuchillo', Weapons: 'Arma' };

const SORTS = [
  { id: 'lowest_price', label: 'Más barato' },
  { id: 'lowest_float', label: 'Menos float' },
  { id: 'highest_float', label: 'Más float' },
  { id: 'most_recent', label: 'Lo último' },
  { id: 'best_deal', label: 'Mejor oferta' },
] as const;

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
          aria-label={detail?.tracked ? 'Dejar de seguir' : 'Seguir este anuncio'}
          className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black', detail?.tracked ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white')}
        >
          <Star size={15} fill={detail?.tracked ? 'currentColor' : 'none'} />
          {detail?.tracked ? 'Siguiendo' : 'Seguir'}
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
            <p className="mt-2 text-3xl font-black tabular-nums">{formatEur(listing.priceEur)}</p>
            {listing.state !== 'listed' && <p className="text-sm font-bold text-[#ea3943]">{listing.state === 'sold' ? `Vendido${listing.soldAt ? ` ${formatAgo(listing.soldAt)}` : ''}` : 'Ya no está a la venta'}</p>}
            {listing.referenceEur != null && (
              <p className={cn('text-sm font-bold', gap != null && gap <= 0 ? 'text-[#16c784]' : 'text-slate-500')}>
                CSFloat lo valora en {formatEur(listing.referenceEur)}{gap == null ? '' : ` · ${gap > 0 ? '+' : ''}${gap.toLocaleString('es-ES')} %`}
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
                  Mediana {detail.sales.medianEur == null ? '—' : formatEur(detail.sales.medianEur)} en {detail.sales.count} ventas
                  {detail.sales.nearMedianEur != null && ` · con float parecido ${formatEur(detail.sales.nearMedianEur)} (${detail.sales.nearCount})`}
                </p>
                <div className="mt-2 divide-y divide-slate-200/70 dark:divide-white/10">
                  {detail.sales.last.map((sale, index) => (
                    <p key={`${sale.at}-${index}`} className="flex justify-between gap-3 py-1.5 text-xs font-medium text-slate-500">
                      <span>{formatAgo(sale.at)} · float {float(sale.floatValue)}</span>
                      <span className="font-black tabular-nums text-slate-700 dark:text-slate-200">{formatEur(sale.eur)}</span>
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

function ListingCard({ listing, onOpen }: { listing: Listing; onOpen: () => void }) {
  const photo = listing.photos[0] || listing.image;
  const gap = deal(listing);
  return (
    <button type="button" onClick={onOpen} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-sm dark:border-white/10 dark:bg-slate-900">
      <span className="relative block bg-[#1a1d24]">
        {photo ? <img src={photo} alt="" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-contain" /> : <span className="block aspect-[4/3]" />}
        {listing.stickers.length > 0 && <span className="absolute bottom-2 right-2 grid h-5 min-w-5 place-items-center rounded-md bg-black/70 px-1 text-[10px] font-black text-white">{listing.stickers.length}</span>}
        {listing.tracked && <Star size={14} className="absolute left-2 top-2 text-amber-300" fill="currentColor" />}
      </span>
      <span className="block px-2.5 pb-2.5 pt-2">
        <span className="flex items-baseline justify-between gap-1">
          <span className="text-[15px] font-black tabular-nums">{formatEur(listing.priceEur)}</span>
          {gap != null && <span className={cn('text-[11px] font-black tabular-nums', gap <= 0 ? 'text-[#16c784]' : 'text-[#ea3943]')}>{gap > 0 ? '+' : ''}{gap.toLocaleString('es-ES')} %</span>}
        </span>
        <FloatBar value={listing.floatValue} />
        <span className="mt-1.5 block truncate text-[10px] font-semibold text-slate-500">{floatFull(listing.floatValue)}{listing.paintSeed == null ? '' : ` (${listing.paintSeed})`}</span>
      </span>
    </button>
  );
}

function ListingGrid({ listings, onOpen }: { listings: Listing[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {listings.map((listing) => <ListingCard key={listing.id} listing={listing} onOpen={() => onOpen(listing.id)} />)}
    </div>
  );
}

export function CsfloatQuery({ query, onMatch }: { query: string; onMatch?: (found: boolean) => void }) {
  const [hits, setHits] = useState<SkinHit[]>([]);
  const [skin, setSkin] = useState<SkinHit | null>(null);
  const [wear, setWear] = useState('');
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const text = query.trim();
    setSkin(null);
    setWear('');
    setListings(null);
    setError('');
    if (text.length < 2) {
      setHits([]);
      onMatch?.(false);
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      api<{ results: SkinHit[] }>(`/api/market/csfloat/catalog?q=${encodeURIComponent(text)}`)
        .then((data) => {
          if (cancel) return;
          const results = data.results || [];
          setHits(results);
          onMatch?.(results.length > 0);
        })
        .catch(() => {
          if (!cancel) {
            setHits([]);
            onMatch?.(false);
          }
        })
        .finally(() => { if (!cancel) setSearching(false); });
    }, 250);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [query, onMatch]);

  const openSkin = (hit: SkinHit, nextWear: string) => {
    setSkin(hit);
    setWear(nextWear);
  };

  useEffect(() => {
    if (!skin || !wear) return;
    let cancel = false;
    const params = new URLSearchParams({ name: `${skin.name} (${wear})`, sort: 'lowest_price' });
    if (skin.paintIndex != null) params.set('paint', String(skin.paintIndex));
    setLoading(true);
    setError('');
    setListings(null);
    api<{ listings: Listing[] }>(`/api/market/csfloat/listings?${params}`)
      .then((data) => { if (!cancel) setListings(data.listings || []); })
      .catch((err: Error) => { if (!cancel) setError(err.message); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [skin, wear]);

  if (!skin && hits.length === 0 && !searching) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-black">CSFloat</h2>
      {searching && !skin && hits.length === 0 && <p className="text-sm font-medium text-slate-400">Buscando en CSFloat…</p>}
      {!skin && hits.map((hit) => (
        <article key={hit.label} className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3 dark:border-white/10 dark:bg-slate-900">
          <button type="button" onClick={() => openSkin(hit, hit.wears.some((row) => row.wear === 'Field-Tested') ? 'Field-Tested' : hit.wears[0]?.wear || '')} className="block w-full text-left">
            <span className="block font-black">{hit.label}</span>
            <span className="text-[11px] font-bold uppercase text-slate-400">{KIND_LABEL[hit.kind] || hit.kind}</span>
          </button>
          <div className="mt-2 flex flex-wrap gap-2">
            {hit.wears.map((option) => (
              <button key={option.wear} type="button" onClick={() => openSkin(hit, option.wear)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-black text-slate-600 dark:border-white/10 dark:text-slate-200">
                {WEAR_SHORT[option.wear] || option.wear}{option.refEur != null ? ` · ${formatEur(option.refEur)}` : ''}
              </button>
            ))}
          </div>
        </article>
      ))}
      {skin && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate font-black">{skin.label}</p>
            <button type="button" onClick={() => { setSkin(null); setListings(null); }} className="shrink-0 text-xs font-bold text-slate-400">Volver</button>
          </div>
          <div className="market-pills flex flex-nowrap gap-2 overflow-x-auto">
            {skin.wears.map((option) => (
              <button key={option.wear} type="button" onClick={() => setWear(option.wear)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-black', wear === option.wear ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-500 dark:bg-white/10')}>
                {WEAR_SHORT[option.wear] || option.wear}{option.refEur != null ? ` · ${formatEur(option.refEur)}` : ''}
              </button>
            ))}
          </div>
          {loading && <p className="text-sm font-medium text-slate-400">Buscando anuncios…</p>}
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          {listings && listings.length === 0 && !loading && <p className="text-sm font-medium text-slate-500">No hay anuncios de este desgaste.</p>}
          {listings && listings.length > 0 && <ListingGrid listings={listings} onOpen={setOpenId} />}
        </div>
      )}
      {openId && (
        <Modal title="Anuncio" onClose={() => setOpenId(null)}>
          <ListingSheet id={openId} onBack={() => setOpenId(null)} onChanged={() => undefined} />
        </Modal>
      )}
    </section>
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
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('lowest_price');
  const [minFloat, setMinFloat] = useState('');
  const [maxFloat, setMaxFloat] = useState('');
  const [maxEur, setMaxEur] = useState('');
  const [seed, setSeed] = useState('');
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    const found = await api<{ results: SkinHit[] }>(`/api/market/csfloat/catalog?q=${encodeURIComponent(text)}`).catch(() => ({ results: [] }));
    setHits(found.results || []);
  };

  const browse = async () => {
    if (!skin) return;
    const name = wear ? `${skin.name} (${wear})` : skin.name;
    const params = new URLSearchParams({ name, sort });
    if (skin.paintIndex != null) params.set('paint', String(skin.paintIndex));
    const low = shown(minFloat);
    const high = shown(maxFloat);
    const cap = shown(maxEur);
    const pattern = shown(seed);
    if (low != null) params.set('minFloat', String(low));
    if (high != null) params.set('maxFloat', String(high));
    if (cap != null) params.set('maxEur', String(cap));
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
    if (skin) void browse();
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
              const change = Math.abs(moved) >= 0.01 ? ` · ${moved < 0 ? 'ha bajado' : 'ha subido'} ${formatEur(Math.abs(moved))}` : '';
              return (
                <ListingRow
                  key={row.id}
                  image={row.image}
                  title={row.label}
                  sub={`${state} · float ${float(row.floatValue)}${change}`}
                  price={row.priceEur == null ? '—' : formatEur(row.priceEur)}
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
            {hits.map((hit) => {
              const cheapest = hit.wears.reduce<number | null>((low, row) => (row.refEur != null && (low == null || row.refEur < low) ? row.refEur : low), null);
              return (
                <button key={hit.label} type="button" onClick={() => { setSkin(hit); setWear(hit.wears.some((row) => row.wear === 'Field-Tested') ? 'Field-Tested' : hit.wears[0]?.wear || ''); }} className="flex items-center justify-between gap-3 rounded-2xl px-2 py-2 text-left text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5">
                  <span className="min-w-0">
                    <span className="block truncate">{hit.label}</span>
                    <span className="block text-[11px] font-bold uppercase text-slate-400">{KIND_LABEL[hit.kind] || hit.kind}</span>
                  </span>
                  {cheapest != null && <span className="shrink-0 text-xs font-bold text-slate-400">desde {formatEur(cheapest)}</span>}
                </button>
              );
            })}
          </div>
        )}
        {skin && (
          <div className="space-y-2">
            <p className="flex items-center justify-between gap-3 text-sm font-black">
              <span className="truncate">{skin.label}</span>
              <button type="button" onClick={() => { setSkin(null); setListings(null); }} className="shrink-0 text-xs font-bold text-slate-400">Cambiar</button>
            </p>
            {skin.wears.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {skin.wears.map((option) => (
                  <button key={option.wear} type="button" onClick={() => setWear(option.wear)} className={cn('rounded-full border px-3 py-1 text-xs font-bold', wear === option.wear ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-400 dark:border-white/10')}>
                    {WEAR_SHORT[option.wear] || option.wear}{option.refEur != null ? ` · ${formatEur(option.refEur)}` : ''}
                  </button>
                ))}
              </div>
            )}
            <div className="market-pills -mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1">
              {SORTS.map((option) => (
                <button key={option.id} type="button" onClick={() => setSort(option.id)} className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-bold', sort === option.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-white/10')}>{option.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Float desde" inputMode="decimal" value={minFloat} onChange={(event) => setMinFloat(event.target.value)} placeholder="0,15" />
              <Input label="Float hasta" inputMode="decimal" value={maxFloat} onChange={(event) => setMaxFloat(event.target.value)} placeholder="0,25" />
              <Input label="Hasta (€)" inputMode="decimal" value={maxEur} onChange={(event) => setMaxEur(event.target.value)} placeholder="Opcional" />
              <Input label="Patrón" inputMode="numeric" value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="Opcional" />
            </div>
            <button type="button" onClick={() => void browse()} className="w-full rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white dark:bg-white dark:text-slate-900">{loading ? 'Buscando…' : 'Buscar anuncios'}</button>
          </div>
        )}
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        {listings && listings.length === 0 && !loading && <p className="text-sm font-medium text-slate-500">No hay anuncios con esos filtros.</p>}
        {listings && listings.length > 0 && <ListingGrid listings={listings} onOpen={setOpenId} />}
        {!skin && tracked.length === 0 && hits.length === 0 && (
          <p className="text-sm font-medium text-slate-500">Busca unos guantes, entra en el anuncio que te guste y dale a la estrella. Desde ese momento te aviso si baja, sube, se vende o lo quitan.</p>
        )}
      </section>
    </div>
  );
}
