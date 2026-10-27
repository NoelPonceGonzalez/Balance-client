import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { QuietLoad } from '@/components/QuietLoad';
import { Sparkline } from '@/components/Sparkline';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { formatAgo, formatDay, formatEur, formatNumber, formatPct, formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MarketBoard, MarketItem, MarketPending, MarketStory, MarketTapeItem, QuoteCandidate } from '@/lib/types';

function fold(value: string): string {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matches(query: string, parts: Array<string | null | undefined>): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  return parts.some((part) => fold(part || '').includes(needle));
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

function AlertForm({ item, onSaved }: { item: MarketItem; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(String(item.alert.thresholdPct));
  const [above, setAbove] = useState(item.alert.above == null ? '' : String(item.alert.above));
  const [below, setBelow] = useState(item.alert.below == null ? '' : String(item.alert.below));
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    try {
      await api('/api/market/alert', {
        method: 'PATCH',
        body: JSON.stringify({
          holdingId: item.holdingId,
          thresholdPct: Number(threshold),
          above: above === '' ? null : Number(above),
          below: below === '' ? null : Number(below),
          enabled: true,
        }),
      });
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar el aviso.');
    }
  };

  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs font-bold text-indigo-600">Aviso</button>
      {open && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Input label="Avisar si el día se mueve más de (%)" type="number" min="0.1" step="0.1" value={threshold} onChange={(event) => setThreshold(event.target.value)} />
          <Input label="O si el precio pasa de (€)" type="number" min="0" step="any" value={above} onChange={(event) => setAbove(event.target.value)} placeholder="Opcional" />
          <Input label="O si baja de (€)" type="number" min="0" step="any" value={below} onChange={(event) => setBelow(event.target.value)} placeholder="Opcional" />
          {error && <p className="text-xs font-medium text-rose-600 sm:col-span-3">{error}</p>}
          <Button type="button" size="sm" onClick={() => void save()}>Guardar aviso</Button>
        </div>
      )}
    </div>
  );
}

function PriceChart({ values, up }: { values: number[]; up: boolean }) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return <p className="text-sm font-medium text-slate-400">Todavía no hay suficientes precios para la gráfica.</p>;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const width = 640;
  const height = 180;
  const path = clean
    .map((value, index) => {
      const x = (index / (clean.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 16) - 8;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Gráfica del precio">
      <path d={path} fill="none" stroke={up ? '#16c784' : '#ea3943'} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
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
        <AlertForm item={item} onSaved={onChanged} />
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
    <button type="button" onClick={onOpen} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 py-3 text-left last:border-0 dark:border-slate-800 sm:grid-cols-[auto_minmax(0,1fr)_5.5rem_auto]">
      <Mark image={item.image} symbol={item.symbol} fallback={fallback} contain={game} />
      <div className="min-w-0">
        <p className="truncate font-black">{item.name}</p>
        <p className="truncate text-[11px] font-bold uppercase text-slate-400">{item.symbol} · {item.sourceLabel}</p>
      </div>
      <span className="hidden sm:block"><Sparkline values={item.sparkline} up={up} /></span>
      <div className="text-right">
        <p className="font-black tabular-nums">{formatPrice(item.priceEur)}</p>
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

function StoryDialog({ item, onClose }: { item: { kind: string; key: string; name: string; priceEur: number | null; changePct: number | null; changeLabel: string; sparkline: number[] }; onClose: () => void }) {
  const [story, setStory] = useState<MarketStory | null>(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ kind: item.kind, key: item.key, name: item.name });
    api<MarketStory>(`/api/market/story?${params}`)
      .then((next) => { if (!cancelled) setStory(next); })
      .catch((err: Error) => { if (!cancelled) setFailed(err.message); });
    return () => { cancelled = true; };
  }, [item.kind, item.key, item.name]);
  const series = story && story.series.length >= 2 ? story.series.map((point) => point.eur) : item.sparkline;
  const keepTape = item.kind !== 'cs2' && item.changePct != null;
  const change = keepTape ? item.changePct : story && story.series.length >= 2 ? story.changePct : item.changePct;
  const label = keepTape ? item.changeLabel : story && story.series.length >= 2 ? story.changeLabel : item.changeLabel;
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;
  const started = story?.series[0]?.at;
  const ended = story?.series[story.series.length - 1]?.at;
  return (
    <Modal title={item.name} onClose={onClose} wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-2xl font-black tabular-nums sm:text-3xl">{item.priceEur == null ? '—' : formatPrice(item.priceEur)}</p>
        <span className={cn('rounded-xl px-3 py-1.5 text-sm font-black', !up && !down ? 'bg-slate-100 text-slate-500' : up ? 'bg-[#16c784]/15 text-[#16c784]' : 'bg-[#ea3943]/15 text-[#ea3943]')}>
          {change == null ? '—' : formatPct(change)}
          {change != null && <span className="ml-1 text-[10px] font-bold opacity-80">{label}</span>}
        </span>
      </div>
      <div className="mt-4">
        {!story && !failed ? <QuietLoad kind="chart" /> : <PriceChart values={series} up={up || (!down && (change ?? 0) >= 0)} />}
        {started && ended && <p className="mt-1 flex justify-between text-[11px] font-bold text-slate-400"><span>{formatDay(started.slice(0, 10))}</span><span>{formatDay(ended.slice(0, 10))}</span></p>}
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
      <p className="mt-3 text-xs font-medium text-slate-400">{failed || story?.note || 'El verde es subida y el rojo es bajada.'}</p>
    </Modal>
  );
}

export function Market() {
  const [data, setData] = useState<MarketBoard | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState('all');
  const [open, setOpen] = useState<{ kind: string; key: string; name: string; priceEur: number | null; changePct: number | null; changeLabel: string; sparkline: number[] } | null>(null);
  const [, setTick] = useState(0);

  const load = () => {
    api<MarketBoard>('/api/market')
      .then((next) => {
        setData(next);
        setError('');
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
    { id: 'crypto', title: 'Criptomonedas', icon: data.cryptos?.find((item) => item.image)?.image || '/markets/crypto.svg', items: keep(data.cryptos) },
    { id: 'etf', title: 'ETF', icon: '/markets/etf.svg', items: keep(data.etfs) },
    { id: 'stock', title: 'Acciones', icon: '/markets/stock.svg', items: keep(data.stocks) },
    { id: 'gold', title: 'Oro', icon: '/platforms/oro.svg', items: keep(data.gold) },
    { id: 'cs2', title: 'CS2', icon: data.icons?.cs2 || '/platforms/cs2.svg', items: keep(data.cs2) },
    { id: 'tf2', title: 'TF2', icon: data.icons?.tf2 || '/extras/tf2.svg', items: keep(data.tf2) },
  ];
  const visible = market === 'all' ? sections : sections.filter((section) => section.id === market);
  const investments = data.items.filter((item) => matches(needle, [item.name, item.symbol, item.accountName]));
  const pending = data.pending.filter((item) => matches(needle, [item.name, item.symbol, item.accountName]));
  const tapes = sections.flatMap((section) => section.items);
  const fresh = [...tapes, ...data.items].some((item) => !item.stale && !item.error);
  const empty = sections.every((section) => (section.id === 'crypto' ? (data.cryptos || []) : section.id === 'etf' ? (data.etfs || []) : section.id === 'stock' ? (data.stocks || []) : section.id === 'gold' ? (data.gold || []) : section.id === 'cs2' ? (data.cs2 || []) : (data.tf2 || [])).length === 0) && data.items.length === 0;
  const noMatch = !empty && needle.length > 0 && tapes.length + investments.length + pending.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Cotizaciones</p>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Mercado</h1>
        </div>
        <p className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <i className={cn('h-2 w-2 rounded-full', fresh ? 'bg-[#16c784]' : 'bg-amber-500')} />
          {fresh ? `En vivo · ${formatAgo(data.updatedAt)}` : `Último intento ${formatAgo(data.updatedAt)}`}
        </p>
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
      <div className="flex touch-[pan-x_pan-y] gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setMarket('all')} className={cn('shrink-0 rounded-full px-3 py-1.5 text-sm font-bold', market === 'all' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-500 dark:bg-white/10')}>Todos</button>
        {sections.map((section) => (
          <button key={section.id} type="button" onClick={() => setMarket(section.id)} className={cn('inline-flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold', market === section.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 dark:bg-white/10 dark:text-slate-200')}>
            <img src={section.icon} alt="" width={28} height={28} referrerPolicy="no-referrer" className="h-7 w-7 rounded-full bg-white object-cover" />
            {section.title}
          </button>
        ))}
      </div>
      <p className="text-sm font-medium text-slate-500">Cada mercado va con su icono. El verde es subida y el rojo es bajada. Cripto sale de CoinGecko, ETF, acciones y oro de bolsa, y CS2 y TF2 de Steam. Tus skins van las primeras en CS2.</p>
      {data.warning && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{data.warning}</p>}
      {empty && <p className="rounded-2xl bg-slate-100 px-4 py-6 text-sm font-medium text-slate-500 dark:bg-slate-900">El mercado no ha respondido todavía. Cuando haya un precio real, se queda aunque la fuente falle después.</p>}
      {noMatch && <p className="rounded-2xl bg-slate-100 px-4 py-6 text-sm font-medium text-slate-500 dark:bg-slate-900">Ninguna cotización coincide con «{needle}».</p>}
      {visible.map((section) => <TapeSection key={section.id} title={section.title} icon={section.icon} items={section.items} onOpen={(item) => setOpen({ kind: item.kind, key: item.key, name: item.name, priceEur: item.priceEur, changePct: item.changePct, changeLabel: item.changeLabel, sparkline: item.sparkline })} />)}
      {market === 'all' && investments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-black">Tus inversiones</h2>
          <Card className="px-4 py-1">
            {investments.map((item) => (
              <QuoteRow
                key={item.holdingId}
                item={item}
                onChanged={load}
                onOpen={() => item.quoteKey && setOpen({ kind: item.assetClass, key: item.quoteKey, name: item.name, priceEur: item.priceEur, changePct: item.changePct, changeLabel: item.changeLabel, sparkline: item.sparkline })}
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
