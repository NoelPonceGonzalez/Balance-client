import { useEffect, useState } from 'react';
import { Bell, Heart, Search, X } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { QuietLoad } from '@/components/QuietLoad';
import { Sparkline } from '@/components/Sparkline';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { enablePhonePush } from '@/lib/push';
import { formatAgo, formatDay, formatEur, formatNumber, formatPct, formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CashChart, type LinePoint } from '@/views/Wallets';
import type { MarketBoard, MarketItem, MarketPending, MarketSignal, MarketStory, MarketTapeItem, QuoteCandidate } from '@/lib/types';

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
              <span className="block truncate text-sm font-black">{item.name}</span>
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
          <p className="truncate font-black">{item.name}</p>
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
        <p className={cn('font-black leading-snug', game ? 'break-words' : 'truncate')}>{item.name}</p>
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
                  <p className="truncate font-black">{offer.label}</p>
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

function AlertDesk({ items, catalog, onChanged }: { items: MarketSignal[]; catalog: MarketTapeItem[]; onChanged: () => void }) {
  const [query, setQuery] = useState('');
  const [quotes, setQuotes] = useState<QuoteCandidate[]>([]);
  const [skins, setSkins] = useState<{ name: string; wears: string[]; image: string | null }[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [above, setAbove] = useState('');
  const [below, setBelow] = useState('');
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');

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
        {!adding && <p className="text-sm font-medium text-slate-500">Cada aviso se queda escuchando. Si el precio pasa por encima o por debajo del tuyo, llega en el momento. Vale para todo el mercado, no solo para CS2.</p>}
        {!adding && items.length > 0 && (
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((item) => (
              <article key={`${item.kind}:${item.id}`} className="flex items-center gap-3 py-3">
                <Mark image={item.image || null} symbol={item.name} contain={item.kind === 'compra'} fallback={item.kind === 'compra' ? '/platforms/cs2.svg' : null} />
                <div className="min-w-0 flex-1">
                  <p className="font-black">{item.name}</p>
                  <p className="text-[11px] font-bold uppercase text-slate-400">Escuchando{item.priceEur == null ? '' : ` · ahora ${formatEur(item.priceEur)}`}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{item.note}</p>
                </div>
                <button type="button" onClick={() => remove(item)} className="shrink-0 text-[11px] font-bold text-slate-400">Quitar</button>
              </article>
            ))}
          </div>
        )}
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
              <p className="flex items-center gap-3 text-sm font-black">
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
        {!adding && <button type="button" onClick={() => void enablePhonePush().then(setPhone).catch((err: Error) => setPhone(err.message))} className="mt-4 text-xs font-bold text-slate-500">Avisos en el móvil</button>}
        {phone && <p className="mt-1 text-xs font-medium text-slate-500">{phone}</p>}
      </Card>
  );
}

function TapeSection({ title, icon, items, onOpen }: { title: string; icon: string; items: MarketTapeItem[]; onOpen: (item: MarketTapeItem) => void }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg font-black">
        <img src={icon} alt="" width={32} height={32} referrerPolicy="no-referrer" className="h-8 w-8 rounded-xl bg-white object-cover" />
        {title}
      </h2>
      <Card className="px-4 py-1">
        {items.map((item) => <TapeRow key={item.key} item={item} fallback={item.image ? null : icon} onOpen={() => onOpen(item)} />)}
      </Card>
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
      <p className="font-black">{item.name} <span className="text-slate-400">{item.symbol}</span></p>
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
  const points: LinePoint[] = story && story.series.length >= 2 ? story.series.map((point) => ({ day: point.at, eur: point.eur })) : [];
  const matched = points.length >= 2;
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
        {waiting && points.length < 2 ? <QuietLoad kind="chart" /> : points.length < 2 ? <p className="text-sm font-medium text-slate-400">Todavía no hay suficientes precios para la gráfica.</p> : (
          <CashChart
            key={`${item.key}:${loadedDays}`}
            quiet
            tall
            points={points}
            now={item.priceEur ?? points[points.length - 1].eur}
            hidden={false}
            onValue={setLive}
            onDay={setLiveDay}
            emptyText="Todavía no hay suficientes precios para la gráfica."
          />
        )}
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
                  <span className="block text-[11px] font-medium text-slate-400">{band.range} · {band.sales} ventas</span>
                </span>
                <span className="font-black tabular-nums">{formatPrice(band.priceEur)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs font-medium text-slate-400">{failed || (!item.key ? 'Este valor no está enlazado a un mercado, así que no hay histórico.' : story?.note) || 'El verde es subida y el rojo es bajada. El porcentaje es el de la gráfica, del primer punto al último.'}</p>
    </Modal>
  );
}

export function Market() {
  const [data, setData] = useState<MarketBoard | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState('all');
  const [open, setOpen] = useState<{ kind: string; key: string; name: string; symbol: string; priceEur: number | null; changePct: number | null; changeLabel: string; sparkline: number[] } | null>(null);
  const [desk, setDesk] = useState<'saved' | 'alerts' | null>(null);
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
  const keep = (items: MarketTapeItem[] | undefined) => (items || []).filter((item) => matches(needle, [item.name, item.symbol, item.sourceLabel]));
  const sections = [
    { id: 'crypto', title: 'Criptomonedas', icon: data.cryptos?.find((item) => item.image)?.image || '/markets/crypto.svg', items: keep(data.cryptos), ready: (data.cryptos || []).length > 0 },
    { id: 'stock', title: 'Acciones', icon: '/markets/stock.svg', items: keep(data.stocks), ready: (data.stocks || []).length > 0 },
    { id: 'etf', title: 'ETF', icon: '/markets/etf.svg', items: keep(data.etfs), ready: (data.etfs || []).length > 0 },
    { id: 'index', title: 'Índices', icon: '/markets/index.svg', items: keep(data.indices), ready: (data.indices || []).length > 0 },
    { id: 'gold', title: 'Oro', icon: '/platforms/oro.svg', items: keep(data.gold), ready: (data.gold || []).length > 0 },
    { id: 'silver', title: 'Plata', icon: '/markets/silver.svg', items: keep(data.silver), ready: (data.silver || []).length > 0 },
    { id: 'oil', title: 'Petróleo', icon: '/markets/oil.svg', items: keep(data.oil), ready: (data.oil || []).length > 0 },
    { id: 'copper', title: 'Cobre', icon: '/markets/copper.svg', items: keep(data.copper), ready: (data.copper || []).length > 0 },
    { id: 'cs2', title: 'CS2', icon: data.icons?.cs2 || '/platforms/cs2.svg', items: keep(data.cs2), ready: (data.cs2 || []).length > 0 },
    { id: 'tf2', title: 'TF2', icon: data.icons?.tf2 || '/extras/tf2.svg', items: keep(data.tf2), ready: (data.tf2 || []).length > 0 },
  ];
  const chips = sections.filter((section) => section.ready);
  const visible = market === 'all' ? sections : sections.filter((section) => section.id === market);
  const investments = data.items.filter((item) => matches(needle, [item.name, item.symbol, item.accountName]));
  const pending = data.pending.filter((item) => matches(needle, [item.name, item.symbol, item.accountName]));
  const tapes = sections.flatMap((section) => section.items);
  const fresh = [...tapes, ...data.items].some((item) => !item.stale && !item.error);
  const empty = sections.every((section) => !section.ready) && data.items.length === 0;
  const noMatch = !empty && needle.length > 0 && tapes.length + investments.length + pending.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Cotizaciones</p>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Mercado</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <i className={cn('h-2 w-2 rounded-full', fresh ? 'bg-[#16c784]' : 'bg-amber-500')} />
            {fresh ? `En vivo · ${formatAgo(data.updatedAt)}` : `Último intento ${formatAgo(data.updatedAt)}`}
          </p>
          <div className="flex gap-2">
            <button type="button" aria-label="Me interesa" onClick={() => setDesk('saved')} className={cn('grid h-10 w-10 place-items-center rounded-full', desk === 'saved' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-700 dark:bg-white/10 dark:text-white')}>
              <Heart size={18} />
            </button>
            <button type="button" aria-label="Avisos" onClick={() => setDesk('alerts')} className={cn('grid h-10 w-10 place-items-center rounded-full', desk === 'alerts' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-700 dark:bg-white/10 dark:text-white')}>
              <Bell size={18} />
            </button>
          </div>
        </div>
      </div>
      <div className="sticky top-0 z-10 -mx-1 bg-[var(--app-bg)]/85 px-1 py-2 backdrop-blur-xl">
        <Input
          icon={<Search size={16} />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Busca por nombre o símbolo"
          aria-label="Buscar en el mercado"
          trailing={
            query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
                <X size={16} />
              </button>
            ) : undefined
          }
        />
      </div>
      <div className="market-pills -mx-4 flex w-full max-w-full flex-nowrap gap-2 overflow-x-auto px-4">
        <button type="button" onClick={() => setMarket('all')} className={cn('shrink-0 rounded-full px-3 py-1.5 text-sm font-bold', market === 'all' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-500 dark:bg-white/10')}>Todos</button>
        {chips.map((section) => (
          <button key={section.id} type="button" onClick={() => setMarket(section.id)} className={cn('inline-flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold', market === section.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 dark:bg-white/10 dark:text-slate-200')}>
            <img src={section.icon} alt="" width={28} height={28} referrerPolicy="no-referrer" className="h-7 w-7 rounded-full bg-white object-cover" />
            {section.title}
          </button>
        ))}
      </div>
      <p className="text-sm font-medium text-slate-500">Pulsa una cotización para ver cómo ha ido. El porcentaje de la gráfica es el de ese tramo. En la lista, el verde y el rojo son el día o la sesión.</p>
      {data.warning && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{data.warning}</p>}
      {desk === 'saved' && (
        <Modal title="Me interesa" onClose={() => setDesk(null)}>
          <SavedDesk needle={needle} />
        </Modal>
      )}
      {desk === 'alerts' && (
        <Modal title="Avisos" onClose={() => setDesk(null)}>
          <AlertDesk items={data.signals || []} catalog={sections.flatMap((section) => section.items)} onChanged={load} />
        </Modal>
      )}
      {empty && <p className="rounded-2xl bg-slate-100 px-4 py-6 text-sm font-medium text-slate-500 dark:bg-slate-900">El mercado no ha respondido todavía. Cuando haya un precio real, se queda aunque la fuente falle después.</p>}
      {noMatch && <p className="rounded-2xl bg-slate-100 px-4 py-6 text-sm font-medium text-slate-500 dark:bg-slate-900">Ninguna cotización coincide con «{needle}».</p>}
      {visible.map((section) => <TapeSection key={section.id} title={section.title} icon={section.icon} items={section.items} onOpen={(item) => setOpen({ kind: item.kind, key: item.key, name: item.name, symbol: item.symbol, priceEur: item.priceEur, changePct: item.changePct, changeLabel: item.changeLabel, sparkline: item.sparkline })} />)}
      {market === 'all' && investments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-black">Tus inversiones</h2>
          <Card className="px-4 py-1">
            {investments.map((item) => (
              <QuoteRow
                key={item.holdingId}
                item={item}
                onChanged={load}
                onOpen={() => setOpen({ kind: item.assetClass, key: item.quoteKey || '', name: item.name, symbol: item.symbol, priceEur: item.priceEur, changePct: item.changePct, changeLabel: item.changeLabel, sparkline: item.sparkline })}
              />
            ))}
          </Card>
        </section>
      )}
      {open && <StoryDialog item={open} onClose={() => setOpen(null)} />}
      {market === 'all' && pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-black">Sin cotización automática</h2>
          {pending.map((item) => <PendingRow key={item.holdingId} item={item} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}
