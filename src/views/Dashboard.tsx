import { useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpDown, ChevronLeft, Eye, EyeOff, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PlatformLogo } from '@/components/PlatformLogo';
import { QuietLoad } from '@/components/QuietLoad';
import { QuickSplit } from '@/components/QuickSplit';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, fieldClass } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { formatDay, formatNumber, formatPct, formatPrice, formatSignedEur } from '@/lib/format';
import { PLATFORM_COLORS } from '@/lib/platform-colors';
import { findPlatform } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import type { DashboardData } from '@/lib/types';
import { Wallets } from '@/views/Wallets';
import { SkinSearch, wearHint, type SkinPhase } from '@/components/SkinSearch';
const HIDE_KEY = 'pat_hide_money';
const SORT_KEY = 'pat_dash_sort';
const CYCLE_MS = 5000;

type SortMode = 'amount' | 'profit-desc' | 'profit-asc';

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'amount', label: 'Más cantidad' },
  { id: 'profit-desc', label: 'Mayor beneficio' },
  { id: 'profit-asc', label: 'Menor beneficio' },
];

interface Frame {
  text: string;
  className: string;
}

type PartGroup = 'cash' | 'crypto' | 'etf' | 'stock' | 'personal_good' | 'other';

interface AccountPart {
  label: string;
  eur: number;
  group?: string;
  costEur?: number | null;
  detail?: string;
  image?: string | null;
  id?: string | null;
  quantity?: number;
  followMarket?: boolean;
  quoteSource?: string | null;
  quoteId?: string | null;
  moves?: { at: string; spentEur: number; quantity: number }[];
}

interface PieceDraft {
  id: string | null;
  accountId: string;
  accountName: string;
  skins: boolean;
  assetClass: string;
  name: string;
  floatText: string;
  quantity: string;
  cost: string;
  value: string;
  followMarket: boolean;
  marketName: string;
  wears: string[];
  image: string | null;
  phases: SkinPhase[];
  phasePaint: number | null;
  rank: string;
  boughtAt: string;
  receiveMode: 'market' | 'manual';
  quoteSource: '' | 'coingecko' | 'yahoo';
  quoteId: string;
  extraSpent: string;
  preview: { priceEur: number; quantity: number; note: string } | null;
}

function localStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isMarketClass(assetClass: string): boolean {
  return assetClass === 'crypto' || assetClass === 'etf' || assetClass === 'stock';
}

const PIECE_CLASSES = [
  { id: 'crypto', label: 'Cripto' },
  { id: 'etf', label: 'ETF' },
  { id: 'stock', label: 'Acción' },
  { id: 'personal_good', label: 'Bien' },
  { id: 'other', label: 'Otro' },
];

function knownCoin(name: string): string | null {
  const key = name.trim().toLowerCase();
  const coins: Record<string, string> = { btc: 'bitcoin', bitcoin: 'bitcoin', eth: 'ethereum', ethereum: 'ethereum', sol: 'solana', solana: 'solana' };
  return coins[key] || null;
}

interface Side {
  group: PartGroup;
  title: string;
  items: AccountPart[];
  total: number;
  invested: number | null;
  gain: number | null;
}

const GROUP_ORDER: PartGroup[] = ['cash', 'crypto', 'etf', 'stock', 'personal_good', 'other'];

function brandColor(name: string): string {
  const platform = findPlatform(name);
  return (platform && PLATFORM_COLORS[platform.id]) || '#1C1C1E';
}

function channel(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  const value = Number.parseInt(clean, 16);
  if (!Number.isFinite(value)) return null;
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function isLight(hex: string): boolean {
  const rgb = channel(hex);
  if (!rgb) return false;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 210;
}

function wash(hex: string): string {
  const rgb = channel(hex);
  if (!rgb || isLight(hex)) return 'rgba(255,255,255,0.5)';
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
}

function prefersStill(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useRise(target: number, play: boolean, duration = 1100, delay = 0) {
  const [value, setValue] = useState(() => (play ? 0 : target));
  useEffect(() => {
    if (!play || prefersStill()) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - (1 - t) ** 3;
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setValue(target);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, play, duration, delay]);
  return value;
}

function formatRisingEur(value: number, target: number, card: boolean): string {
  const digits = card && Number.isInteger(target) ? 0 : 2;
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function RisingAmount({ value, hidden, signed = false, card = false, delay = 0 }: { value: number; hidden: boolean; signed?: boolean; card?: boolean; delay?: number }) {
  const shown = useRise(Math.abs(value), !hidden, 1100, delay);
  if (hidden) return <>*****</>;
  const text = formatRisingEur(shown, Math.abs(value), card);
  if (!signed) return <>{text}</>;
  if (value > 0) return <>+{text}</>;
  if (value < 0) return <>−{text}</>;
  return <>{text}</>;
}

const rise = { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const };

function Donut({ slices }: { slices: { key: string; eur: number; color: string }[] }) {
  const progress = useRise(1, true, 1200, 80);
  const total = slices.reduce((sum, slice) => sum + slice.eur, 0);
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;
  return (
    <svg viewBox="0 0 200 200" className="mx-auto h-56 w-56" role="img" aria-label="De dónde viene el patrimonio">
      <circle cx="100" cy="100" r={radius} fill="none" stroke="currentColor" strokeWidth="24" className="text-slate-100 dark:text-slate-800" />
      {total > 0 && slices.map((slice) => {
        const length = (slice.eur / total) * circumference * progress;
        const gap = slices.length > 1 ? 3 * progress : 0;
        const drawn = Math.max(0, length - gap);
        const light = isLight(slice.color);
        const node = (
          <circle
            key={slice.key}
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={light ? '#FFFFFF' : slice.color}
            strokeWidth={light ? 20 : 24}
            strokeDasharray={`${drawn} ${circumference - drawn}`}
            strokeDashoffset={-cursor}
            transform="rotate(-90 100 100)"
            style={light ? { filter: 'drop-shadow(0 0 0.6px rgba(15,23,42,0.35))' } : undefined}
          />
        );
        cursor += length;
        return node;
      })}
    </svg>
  );
}

function toneClass(value: number): string {
  if (value > 0) return 'text-[#16c784]';
  if (value < 0) return 'text-[#ea3943]';
  return 'text-slate-400';
}

function framesFor(gain: number | null, gainPct: number | null): Frame[] {
  const frames: Frame[] = [];
  if (gainPct != null) frames.push({ text: formatPct(gainPct), className: toneClass(gainPct) });
  if (gain != null) frames.push({ text: formatSignedEur(gain), className: toneClass(gain) });
  if (frames.length === 0) frames.push({ text: '—', className: 'text-slate-400' });
  return frames;
}

function sideTitle(group: PartGroup, skins: boolean): string {
  if (group === 'crypto') return 'Cripto';
  if (group === 'etf') return 'ETF';
  if (group === 'stock') return 'Acciones';
  if (group === 'personal_good') return skins ? 'Skins' : 'Bienes';
  if (group === 'other') return 'Otros';
  return 'Líquido';
}

function accountSides(parts: AccountPart[], skins: boolean): Side[] {
  return GROUP_ORDER.flatMap((group) => {
    const items = parts.filter((part) => (part.group || 'other') === group);
    if (items.length === 0) return [];
    const total = items.reduce((sum, item) => sum + item.eur, 0);
    const costs = items.map((item) => item.costEur);
    const complete = group !== 'cash' && costs.every((cost) => cost != null);
    const invested = complete ? costs.reduce((sum: number, cost) => sum + (cost ?? 0), 0) : null;
    return [{
      group,
      title: sideTitle(group, skins),
      items,
      total,
      invested,
      gain: invested == null ? null : total - invested,
    }];
  });
}

function accountGain(account: DashboardData['accounts'][number], pnl: DashboardData['pnl']): { eur: number; percent: number | null } | null {
  const rows = pnl.filter((item) => !item.place && item.accountName === account.name && item.platform === account.platform);
  if (rows.length === 0 || rows.some((item) => item.eur == null)) return null;
  const eur = rows.reduce((sum, item) => sum + (item.eur ?? 0), 0);
  const liquid = (account.parts || []).filter((part) => part.label === 'Líquido').reduce((sum, part) => sum + part.eur, 0);
  const holdings = account.valueEur == null ? null : account.valueEur - liquid;
  const cost = holdings == null ? null : holdings - eur;
  return { eur, percent: cost != null && cost > 0 ? (eur / cost) * 100 : null };
}

function ViewSwitch({ value, onChange }: { value: 'general' | 'cartera'; onChange: (value: 'general' | 'cartera') => void }) {
  return (
    <div className="flex rounded-full bg-slate-900/5 p-0.5 dark:bg-white/10">
      {(['general', 'cartera'] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn(
            'rounded-full px-3 py-1 text-[13px] font-bold',
            value === item ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500',
          )}
        >
          {item === 'general' ? 'General' : 'Cartera'}
        </button>
      ))}
    </div>
  );
}

interface QuoteHit {
  source: 'coingecko' | 'yahoo';
  externalId: string;
  symbol: string;
  name: string;
  image?: string | null;
  kind?: 'crypto' | 'etf' | 'stock';
}

function quoteKindLabel(hit: QuoteHit): string {
  if (hit.kind === 'stock') return 'Acción';
  if (hit.kind === 'etf') return 'ETF';
  if (hit.source === 'yahoo') return 'ETF';
  return 'Cripto';
}

function quoteFallback(hit: QuoteHit): string {
  if (hit.kind === 'stock') return '/markets/stock.svg';
  if (hit.kind === 'etf' || hit.source === 'yahoo') return '/markets/etf.svg';
  return '/markets/crypto.svg';
}

function QuoteMark({ hit }: { hit: QuoteHit }) {
  const [broken, setBroken] = useState(false);
  const src = !broken && hit.image ? hit.image : quoteFallback(hit);
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cn('h-10 w-10 shrink-0 bg-white object-cover', hit.image && !broken ? 'rounded-full' : 'rounded-xl object-contain p-1')}
    />
  );
}

function PieceDialog({
  piece,
  pieceError,
  pieceDelete,
  setPiece,
  onSave,
  onDelete,
}: {
  piece: PieceDraft;
  pieceError: string;
  pieceDelete: boolean;
  setPiece: Dispatch<SetStateAction<PieceDraft | null>>;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<QuoteHit[]>([]);
  const [searchNote, setSearchNote] = useState('');
  const [searching, setSearching] = useState(false);
  const [showAllHits, setShowAllHits] = useState(false);
  const market = !piece.skins && isMarketClass(piece.assetClass);
  const spent = piece.id ? piece.extraSpent : piece.cost;
  const manualPrice = piece.receiveMode === 'manual' && Number(spent) > 0 && Number(piece.quantity) > 0 ? Number(spent) / Number(piece.quantity) : null;
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setHits([]);
      setSearchNote('');
      setSearching(false);
      setShowAllHits(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchNote('');
      api<{ results: QuoteHit[] }>(`/api/market/search?q=${encodeURIComponent(text)}`)
        .then((data) => {
          if (cancelled) return;
          setHits(data.results || []);
          setShowAllHits(false);
          setSearchNote(data.results?.length ? '' : 'No hay una cotización con ese nombre.');
        })
        .catch((err: unknown) => {
          if (!cancelled) setSearchNote(err instanceof Error ? err.message : 'La búsqueda no ha respondido.');
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);
  const clearPreview = (next: PieceDraft): PieceDraft => ({ ...next, preview: null });
  return (
    <Modal title={piece.id ? piece.name : `Añadir en ${piece.accountName}`} onClose={() => setPiece(null)}>
      <div className="grid gap-4">
        {pieceError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{pieceError}</p>}
        {!piece.skins && (
          <Field label="Tipo">
            <select className={fieldClass} value={piece.assetClass} onChange={(event) => setPiece({ ...piece, assetClass: event.target.value, quoteSource: '', quoteId: '', preview: null })}>
              {PIECE_CLASSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
        )}
        {(piece.skins || piece.assetClass === 'personal_good') && (
          <SkinSearch
            onPick={(hit) => setPiece({
              ...piece,
              name: hit.name,
              marketName: hit.name,
              wears: hit.wears,
              image: hit.image,
              phases: hit.phases,
              phasePaint: null,
              followMarket: true,
              value: '',
            })}
          />
        )}
        {piece.image && (piece.skins || piece.assetClass === 'personal_good') && (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-black/20">
            <img src={piece.image} alt="" referrerPolicy="no-referrer" className="h-14 w-20 rounded-xl bg-white object-contain p-1 dark:bg-white/10" />
            <span className="min-w-0 truncate text-sm font-bold">{piece.marketName || piece.name}</span>
          </div>
        )}
        <Input label="Nombre" value={piece.name} onChange={(event) => setPiece({ ...piece, name: event.target.value })} />
        {piece.phases.length > 0 && (
          <Field label="Fase">
            <select
              className={fieldClass}
              value={piece.phasePaint == null ? '' : String(piece.phasePaint)}
              onChange={(event) => setPiece({ ...piece, phasePaint: event.target.value ? Number(event.target.value) : null })}
            >
              <option value="">Elige la fase</option>
              {piece.phases.map((phase) => <option key={phase.id} value={phase.paintIndex}>{phase.label}</option>)}
            </select>
          </Field>
        )}
        {(piece.skins || piece.assetClass === 'personal_good') && (
          <>
            <Input label="Float" value={piece.floatText} onChange={(event) => setPiece({ ...piece, floatText: event.target.value })} placeholder="0,15 más o menos" />
            <p className="text-xs font-medium text-slate-400">{wearHint(piece.floatText, piece.wears)}</p>
          </>
        )}
        {piece.phases.length > 0 && (
          <Input label="Puesto en el mundo" value={piece.rank} onChange={(event) => setPiece({ ...piece, rank: event.target.value })} placeholder="26, si lo sabes" />
        )}
        {market && (
          <div className="grid gap-3 rounded-2xl border border-white/70 bg-white/35 p-3 dark:border-white/10 dark:bg-white/5">
            <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">{piece.id ? 'Otra compra' : 'Compra'}</p>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white/90 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <Search size={15} className="shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="S&P, Bitcoin, VWCE…"
                className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
              />
            </label>
            {searching && <p className="text-xs font-medium text-slate-400">Buscando…</p>}
            {searchNote && <p className="text-xs font-medium text-amber-600">{searchNote}</p>}
            {hits.length > 0 && (
              <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {(showAllHits ? hits : hits.slice(0, 5)).map((hit) => {
                  const chosen = piece.quoteId === hit.externalId;
                  return (
                    <li key={`${hit.source}:${hit.externalId}`}>
                      <button
                        type="button"
                        onClick={() => setPiece(clearPreview({
                          ...piece,
                          name: hit.name,
                          assetClass: hit.kind || (hit.source === 'coingecko' ? 'crypto' : 'etf'),
                          quoteSource: hit.source,
                          quoteId: hit.externalId,
                          followMarket: true,
                        }))}
                        className={cn('flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left', chosen ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white/80 text-slate-800 hover:bg-white dark:bg-white/10 dark:text-slate-100')}
                      >
                        <QuoteMark hit={hit} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{hit.name}</span>
                          <span className={cn('block truncate text-[11px] font-medium', chosen ? 'text-white/70 dark:text-slate-500' : 'text-slate-400')}>{hit.symbol} · {quoteKindLabel(hit)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {hits.length > 5 && (
              <button type="button" onClick={() => setShowAllHits((open) => !open)} className="text-left text-xs font-bold text-slate-500">
                {showAllHits ? 'Ver menos' : `Ver ${hits.length - 5} más`}
              </button>
            )}
            <Input label="Fecha y hora" type="datetime-local" value={piece.boughtAt} onChange={(event) => setPiece(clearPreview({ ...piece, boughtAt: event.target.value }))} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setPiece(clearPreview({ ...piece, receiveMode: 'market' }))} className={cn('flex-1 rounded-full border py-2 text-sm font-bold', piece.receiveMode === 'market' ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-400')}>Calcular lo recibido</button>
              <button type="button" onClick={() => setPiece(clearPreview({ ...piece, receiveMode: 'manual' }))} className={cn('flex-1 rounded-full border py-2 text-sm font-bold', piece.receiveMode === 'manual' ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-400')}>Lo escribo yo</button>
            </div>
            {piece.id ? (
              <Input label="Esta compra €" type="number" min="0" step="any" value={piece.extraSpent} onChange={(event) => setPiece(clearPreview({ ...piece, extraSpent: event.target.value }))} placeholder="Vacío si solo corriges la posición" />
            ) : (
              <Input label="Me costó €" type="number" min="0" step="any" value={piece.cost} onChange={(event) => setPiece(clearPreview({ ...piece, cost: event.target.value }))} />
            )}
            {piece.receiveMode === 'manual' && (
              <Input label="Recibí" type="number" min="0" step="any" value={piece.quantity} onChange={(event) => setPiece({ ...piece, quantity: event.target.value, preview: null })} />
            )}
            {piece.preview && (
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Lo compraste a {formatPrice(piece.preview.priceEur)} y recibiste {formatNumber(piece.preview.quantity, 8)}.
                <span className="mt-1 block text-xs font-medium text-slate-400">{piece.preview.note}</span>
              </p>
            )}
            {manualPrice != null && (
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Lo compraste a {formatPrice(manualPrice)} y recibiste {formatNumber(Number(piece.quantity), 8)}.
                <span className="mt-1 block text-xs font-medium text-slate-400">Precio según lo que has escrito.</span>
              </p>
            )}
          </div>
        )}
        {!market && !piece.skins && piece.assetClass !== 'personal_good' && (
          <Input label="Cantidad" type="number" min="0" step="any" value={piece.quantity} onChange={(event) => setPiece({ ...piece, quantity: event.target.value })} />
        )}
        {(!market || piece.id) && (
          <Input label="Me costó €" type="number" min="0" step="any" value={piece.cost} onChange={(event) => setPiece({ ...piece, cost: event.target.value })} />
        )}
        <Input
          label="Vale ahora €"
          type="number"
          min="0"
          step="any"
          value={piece.followMarket ? '' : piece.value}
          disabled={piece.followMarket}
          placeholder={piece.marketName ? 'El float busca el precio' : piece.followMarket ? 'Sigue la cotización' : piece.assetClass === 'crypto' ? 'Vacío en Bitcoin, Ethereum o Solana usa la cotización' : ''}
          onChange={(event) => setPiece({ ...piece, value: event.target.value })}
        />
        <Button onClick={onSave}>Guardar</Button>
        {piece.id && (
          <Button variant="danger" onClick={onDelete}>
            {pieceDelete ? 'Confirmar eliminación' : 'Eliminar'}
          </Button>
        )}
      </div>
    </Modal>
  );
}

interface ExtraDraft {
  id: string | null;
  name: string;
  value: string;
  cost: string;
  image: string;
  boughtOn: string;
  track: boolean;
  counts: boolean;
}

function blankExtra(partial: Partial<ExtraDraft> = {}): ExtraDraft {
  return { id: null, name: '', value: '', cost: '', image: '', boughtOn: '', track: false, counts: true, ...partial };
}

function extraWallet(items: { id: string; name: string; valueEur: number; costEur: number | null; imageUrl?: string; boughtOn?: string; track?: boolean; counts?: boolean }[]) {
  const total = items.reduce((sum, item) => sum + item.valueEur, 0);
  const tracked = items.filter((item) => item.track && item.costEur != null);
  const invested = tracked.reduce((sum, item) => sum + (item.costEur || 0), 0);
  const gain = tracked.length ? tracked.reduce((sum, item) => sum + item.valueEur - (item.costEur || 0), 0) : null;
  return {
    key: 'extras',
    name: 'Extras',
    logoName: 'Extras',
    image: '/extras/objeto.svg',
    value: total,
    cash: 0,
    planId: null,
    flows: [],
    fixed: [],
    extras: true,
    sides: [{
      group: 'other',
      title: 'Lo que te quedas',
      total,
      invested: tracked.length ? invested : null,
      gain,
      items: items.map((item) => ({ id: item.id, label: item.name, eur: item.valueEur, image: item.imageUrl || null, detail: extraDetail(item), costEur: item.costEur, boughtOn: item.boughtOn || null })),
    }],
  };
}

function extraDetail(item: { boughtOn?: string; track?: boolean; counts?: boolean; costEur: number | null; valueEur: number }): string {
  const parts: string[] = [];
  if (item.boughtOn) parts.push(formatDay(item.boughtOn));
  if (item.track && item.costEur != null) {
    const gain = item.valueEur - item.costEur;
    parts.push(gain === 0 ? 'Igual que lo que costó' : gain > 0 ? `Por encima ${formatSignedEur(gain)}` : `Por debajo ${formatSignedEur(gain)}`);
  } else parts.push('Solo guardado');
  if (item.counts === false) parts.push('No entra en el total');
  return parts.join(' · ');
}

function ExtraDialog({ draft, error, setDraft, onClose, onSave, onDelete }: { draft: ExtraDraft; error: string; setDraft: (next: ExtraDraft) => void; onClose: () => void; onSave: () => void; onDelete: () => void }) {
  return (
    <Modal title={draft.id ? draft.name : 'Extra'} onClose={onClose}>
      <div className="grid gap-3">
        {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}
        <p className="text-xs font-medium text-slate-400">Un reloj, un PC o un anillo. Una cena no va aquí.</p>
        <Input label="Qué es" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Seiko Presage" />
        <Input label="Imagen (enlace https)" value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} placeholder="https://..." />
        {draft.image.startsWith('https://') && <img src={draft.image} alt="" referrerPolicy="no-referrer" className="h-28 w-full rounded-2xl bg-slate-50 object-contain" />}
        <Input label="Fecha" type="date" value={draft.boughtOn} onChange={(event) => setDraft({ ...draft, boughtOn: event.target.value })} />
        <Input label="Me costó €" type="number" min="0" step="any" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} />
        <Input label="Vale ahora €" type="number" min="0" step="any" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} />
        <button type="button" onClick={() => setDraft({ ...draft, track: !draft.track })} className={cn('rounded-full border py-2 text-sm font-bold', draft.track ? 'border-[#16c784] text-[#16c784]' : 'border-slate-200 text-slate-400')}>{draft.track ? 'Sigo si sube o baja' : 'Solo lo guardo'}</button>
        <button type="button" onClick={() => setDraft({ ...draft, counts: !draft.counts })} className={cn('rounded-full border py-2 text-sm font-bold', draft.counts ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-400')}>{draft.counts ? 'Cuenta en el patrimonio' : 'No entra en el total'}</button>
        <Button onClick={onSave}>Guardar</Button>
        {draft.id && <Button variant="danger" onClick={onDelete}>Eliminar</Button>}
      </div>
    </Modal>
  );
}

export function Dashboard({ home }: { heroMs: number; home: number }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [view, setView] = useState<'general' | 'cartera'>('general');
  const [openWallet, setOpenWallet] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDE_KEY) === '1');
  const [adding, setAdding] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [beat, setBeat] = useState(0);
  const [sort, setSort] = useState<SortMode>(() => {
    const saved = localStorage.getItem(SORT_KEY);
    return SORTS.some((item) => item.id === saved) ? (saved as SortMode) : 'amount';
  });
  const [menu, setMenu] = useState<{ id: string; name: string; cash: number; top: number; left: number } | null>(null);
  const [editor, setEditor] = useState<{ id: string; name: string; balance: string } | null>(null);
  const [piece, setPiece] = useState<PieceDraft | null>(null);
  const [pieceError, setPieceError] = useState('');
  const [pieceDelete, setPieceDelete] = useState(false);
  const [countExtras, setCountExtras] = useState(() => localStorage.getItem('pat_count_extras') === '1');
  const [extraDraft, setExtraDraft] = useState<ExtraDraft | null>(null);
  const [extraError, setExtraError] = useState('');
  const [keepAsk, setKeepAsk] = useState<{ name: string; amount: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const suppressClick = useRef(false);
  const pinRef = useRef<HTMLDivElement>(null);
  const [pinHeight, setPinHeight] = useState(0);

  const load = () => {
    setError('');
    return api<DashboardData>('/api/dashboard?period=30d')
      .then((next) => {
        setData(next);
        setError('');
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    setView('general');
    setOpenWallet(null);
  }, [home]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const pull = (attempt: number) => {
      api<DashboardData>('/api/dashboard?period=30d')
        .then((next) => {
          if (cancelled) return;
          setData(next);
          setError('');
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const status = err instanceof ApiError ? err.status : 0;
          const message = err instanceof Error ? err.message : 'No se ha podido completar.';
          if (status >= 400 && status < 500) {
            setError(message);
            return;
          }
          if (attempt < 8) {
            timer = window.setTimeout(() => pull(attempt + 1), Math.min(2000, 350 * (attempt + 1)));
            return;
          }
          setError(message);
          timer = window.setTimeout(() => pull(0), 4000);
        });
    };
    pull(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const node = pinRef.current;
    if (!node) return;
    const measure = () => setPinHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view, openWallet, hidden, data]);

  useEffect(() => {
    const timer = window.setInterval(() => setBeat((value) => value + 1), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.accounts.map((account) => {
      const gain = accountGain(account, data.pnl);
      const name = account.platform || account.name;
      const skins = /cs2|counter-strike/i.test(name);
      return {
        key: account.id,
        name,
        logoName: name,
        color: brandColor(name),
        value: account.valueEur,
        cash: account.balance,
        planId: account.planId || null,
        flows: account.flows || [],
        fixed: account.fixed || [],
        purchases: account.planId ? (data.extras || []).filter((item) => item.boughtOn).map((item) => ({ name: item.name, amount: -Math.abs(item.costEur ?? item.valueEur), date: item.boughtOn || '', image: item.imageUrl || null })) : [],
        tracking: account.tracking,
        sides: accountSides(account.parts || [], skins),
        gainEur: gain?.eur ?? null,
        frames: framesFor(gain?.eur ?? null, gain?.percent ?? null),
      };
    });
  }, [data]);

  const ordered = useMemo(() => {
    const list = rows.filter((row) => row.value !== 0);
    const gainOf = (row: (typeof rows)[number]) => row.gainEur ?? 0;
    if (sort === 'profit-desc') list.sort((a, b) => gainOf(b) - gainOf(a) || (b.value ?? 0) - (a.value ?? 0));
    else if (sort === 'profit-asc') list.sort((a, b) => gainOf(a) - gainOf(b) || (b.value ?? 0) - (a.value ?? 0));
    else list.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return list;
  }, [rows, sort]);

  const cycleSort = () => {
    setSort((current) => {
      const index = SORTS.findIndex((item) => item.id === current);
      const next = SORTS[(index + 1) % SORTS.length].id;
      localStorage.setItem(SORT_KEY, next);
      return next;
    });
  };

  const holdAccount = (row: (typeof rows)[number], event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const x = event.clientX;
    const y = event.clientY;
    let moved = false;
    const timer = window.setTimeout(() => {
      if (moved) return;
      suppressClick.current = true;
      setConfirmDelete(false);
      setMenu({
        id: row.key,
        name: row.name,
        cash: row.cash,
        top: Math.min(y, window.innerHeight - 120),
        left: Math.min(x, window.innerWidth - 188),
      });
    }, 380);
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > 12) {
        moved = true;
        window.clearTimeout(timer);
      }
    };
    const up = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const saveAccount = async () => {
    if (!editor) return;
    setError('');
    try {
      await api(`/api/accounts/${editor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editor.name, balance: Number(editor.balance || 0) }),
      });
      setEditor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    }
  };

  const openPiece = (row: (typeof rows)[number], item?: AccountPart) => {
    const skins = /cs2|counter-strike/i.test(row.name);
    setPieceError('');
    setPieceDelete(false);
    setPiece({
      id: item?.id || null,
      accountId: row.key,
      accountName: row.name,
      skins,
      assetClass: skins ? 'personal_good' : item?.group && item.group !== 'cash' ? item.group : 'crypto',
      name: item?.label || '',
      floatText: ((item?.detail || '').match(/\d+\.\d+/) || [''])[0],
      quantity: item?.quantity != null ? String(item.quantity) : '1',
      cost: item?.costEur == null ? '' : String(item.costEur),
      value: item ? String(item.eur) : '',
      followMarket: Boolean(item?.followMarket),
      marketName: '',
      wears: [],
      image: item?.image || null,
      phases: [],
      phasePaint: null,
      rank: ((item?.label || '').match(/#\s*(\d{1,4})/) || [])[1] || '',
      boughtAt: item ? '' : localStamp(),
      receiveMode: 'market',
      quoteSource: item?.quoteSource === 'yahoo' || item?.quoteSource === 'coingecko' ? item.quoteSource : '',
      quoteId: item?.quoteId || '',
      extraSpent: '',
      preview: null,
    });
  };

  const savePiece = async () => {
    if (!piece) return;
    setPieceError('');
    const skins = piece.skins || piece.assetClass === 'personal_good';
    const market = !skins && isMarketClass(piece.assetClass);
    const coin = piece.assetClass === 'crypto' ? knownCoin(piece.name) : null;
    const quoteSource = piece.quoteSource || (coin ? 'coingecko' : '');
    const quoteId = piece.quoteId || coin || '';
    const addingBuy = market && (!piece.id || piece.extraSpent.trim() !== '');
    const spent = piece.id ? Number(piece.extraSpent) : Number(piece.cost);
    if (addingBuy && piece.receiveMode === 'market' && !piece.preview) {
      if (!piece.boughtAt) {
        setPieceError('Pon la fecha y la hora.');
        return;
      }
      if (!(spent > 0)) {
        setPieceError('Escribe lo que te costó.');
        return;
      }
      if (!quoteSource || !quoteId) {
        setPieceError('Busca la cotización para calcularlo, o escribe tú lo que recibiste.');
        return;
      }
      try {
        const preview = await api<{ priceEur: number; quantity: number; note: string }>('/api/market/received', {
          method: 'POST',
          body: JSON.stringify({ source: quoteSource, externalId: quoteId, at: piece.boughtAt, spentEur: spent }),
        });
        setPiece({ ...piece, preview, quantity: String(preview.quantity) });
      } catch (err) {
        setPieceError(err instanceof Error ? err.message : 'No se ha podido calcular lo recibido.');
      }
      return;
    }
    const quantity = skins ? 1 : addingBuy && piece.receiveMode === 'market' && piece.preview ? piece.preview.quantity : Number(piece.quantity);
    if (!piece.name.trim()) {
      setPieceError('Escribe el nombre.');
      return;
    }
    if (!addingBuy && !(quantity > 0)) {
      setPieceError('La cantidad tiene que ser mayor que cero.');
      return;
    }
    if (addingBuy && piece.receiveMode === 'manual' && !(quantity > 0)) {
      setPieceError('Escribe lo que recibiste.');
      return;
    }
    if (addingBuy && !(spent > 0)) {
      setPieceError('Escribe lo que te costó.');
      return;
    }
    if (addingBuy && !piece.boughtAt) {
      setPieceError('Pon la fecha y la hora.');
      return;
    }
    const manual = piece.value.trim() !== '';
    if (!piece.marketName && !piece.followMarket && !manual && !quoteId) {
      setPieceError('Escribe cuánto vale ahora.');
      return;
    }
    const total = manual ? Number(piece.value) : null;
    if (manual && !(total != null && total > 0)) {
      setPieceError('El valor tiene que ser mayor que cero.');
      return;
    }
    const float = piece.floatText.trim().replace(',', '.');
    const floatValue = Number(float);
    if (piece.marketName && !(floatValue >= 0 && floatValue <= 1)) {
      setPieceError('Escribe el float, aunque sea aproximado.');
      return;
    }
    if (piece.phases.length > 0 && piece.phasePaint == null) {
      setPieceError('Elige la fase. Si no, el precio mezcla Ruby con Phase 1.');
      return;
    }
    if (piece.rank.trim() && !/^\d{1,4}$/.test(piece.rank.trim())) {
      setPieceError('El puesto es un número, como 26.');
      return;
    }
    const paintNote = piece.phasePaint != null ? ` Paint ${piece.phasePaint}.` : '';
    const notes = float ? `Float ${float}.${paintNote}${piece.marketName || piece.followMarket ? '' : ' Valor puesto a mano.'}` : piece.followMarket ? '' : skins ? 'Valor puesto a mano.' : '';
    const costBasis = piece.cost.trim() === '' ? null : Number(piece.cost);
    if (piece.cost.trim() !== '' && !(costBasis != null && costBasis >= 0)) {
      setPieceError('El coste tiene que ser un número.');
      return;
    }
    const linked = Boolean(piece.marketName);
    const unit = total == null || linked ? null : total / quantity;
    const displayName = piece.name.trim();
    const withRank = `${displayName} #${piece.rank.trim()}`;
    const ranked = linked && piece.rank.trim() && !/#\s*\d+/.test(displayName) && withRank.length <= 80 ? withRank : displayName;
    const skinQuote = linked ? { quoteSource: 'csfloat', quoteId: piece.marketName } : {};
    try {
      const saved = piece.id
        ? await api<{ holding: { _id: string; unitMarketValue: number | null } }>(`/api/holdings/${piece.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: ranked,
            assetClass: piece.assetClass,
            ...(addingBuy ? {} : { quantity, costBasis }),
            notes,
            ...skinQuote,
            ...(piece.followMarket || linked ? {} : { unitMarketValue: unit }),
            ...(addingBuy ? { buy: { at: piece.boughtAt, spentEur: spent, mode: piece.receiveMode, quantity }, quoteSource, quoteId } : {}),
          }),
        })
        : await api<{ holding: { _id: string; unitMarketValue: number | null } }>('/api/holdings', {
          method: 'POST',
          body: JSON.stringify({
            accountId: piece.accountId,
            name: ranked,
            symbol: '',
            assetClass: piece.assetClass,
            quantity,
            unitMarketValue: linked ? null : unit,
            costBasis,
            currency: 'EUR',
            notes,
            ...(linked ? skinQuote : {}),
            ...(quoteSource && quoteId && unit == null && !linked ? { quoteSource, quoteId } : {}),
            ...(addingBuy ? { buy: { at: piece.boughtAt, spentEur: spent, mode: piece.receiveMode, quantity } } : {}),
          }),
        });
      if (linked && !(saved.holding?.unitMarketValue != null && saved.holding.unitMarketValue > 0)) {
        if (!piece.id) await api(`/api/holdings/${saved.holding._id}`, { method: 'DELETE' });
        setPieceError('No hay ventas cercanas a ese float. Prueba un float un poco distinto.');
        return;
      }
      setPiece(null);
      await load();
    } catch (err) {
      setPieceError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    }
  };

  const deletePiece = async () => {
    if (!piece?.id) return;
    setPieceError('');
    try {
      await api(`/api/holdings/${piece.id}`, { method: 'DELETE' });
      setPiece(null);
      await load();
    } catch (err) {
      setPieceError(err instanceof Error ? err.message : 'No se ha podido eliminar.');
    }
  };

  const openExtra = (id: string) => {
    const item = data?.extras.find((extra) => extra.id === id);
    if (!item) return;
    setExtraError('');
    setExtraDraft({
      id: item.id,
      name: item.name,
      value: String(item.valueEur),
      cost: item.costEur == null ? '' : String(item.costEur),
      image: item.imageUrl || '',
      boughtOn: item.boughtOn || '',
      track: item.track === true,
      counts: item.counts !== false,
    });
  };

  const saveExtra = async () => {
    if (!extraDraft) return;
    setExtraError('');
    const value = Number(extraDraft.value);
    if (!extraDraft.name.trim()) {
      setExtraError('Escribe qué es.');
      return;
    }
    if (!(value > 0)) {
      setExtraError('El valor tiene que ser mayor que cero.');
      return;
    }
    const body = {
      place: 'objeto',
      name: extraDraft.name.trim(),
      valueEur: value,
      costEur: extraDraft.cost.trim() === '' ? null : Number(extraDraft.cost),
      imageUrl: extraDraft.image.trim(),
      boughtOn: extraDraft.boughtOn,
      track: extraDraft.track,
      counts: extraDraft.counts,
      notes: '',
    };
    try {
      if (extraDraft.id) await api(`/api/extras/${extraDraft.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/api/extras', { method: 'POST', body: JSON.stringify(body) });
      setExtraDraft(null);
      await load();
    } catch (err) {
      setExtraError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    }
  };

  const deleteExtra = async () => {
    if (!extraDraft?.id) return;
    setExtraError('');
    try {
      await api(`/api/extras/${extraDraft.id}`, { method: 'DELETE' });
      setExtraDraft(null);
      await load();
    } catch (err) {
      setExtraError(err instanceof Error ? err.message : 'No se ha podido eliminar.');
    }
  };

  const deleteAccount = async () => {
    if (!menu) return;
    setError('');
    try {
      await api(`/api/accounts/${menu.id}`, { method: 'DELETE' });
      setMenu(null);
      setConfirmDelete(false);
      await load();
    } catch (err) {
      setMenu(null);
      setError(err instanceof Error ? err.message : 'No se ha podido eliminar.');
    }
  };

  const direction = data?.variation.available ? data.variation.amount ?? 0 : null;
  const totalClass = direction == null || direction === 0 ? 'text-slate-900 dark:text-white' : direction > 0 ? 'text-[#16c784]' : 'text-[#ea3943]';
  const extraWealth = (data?.extras || []).filter((item) => item.counts !== false).reduce((sum, item) => sum + item.valueEur, 0);
  const shownWorth = data ? data.netWorth.eur + (countExtras ? extraWealth : 0) : null;
  const openAccount = openWallet === 'extras'
    ? (data ? { name: 'Extras', value: extraWallet(data.extras).value, logoName: 'Extras' } : null)
    : ordered.find((row) => row.key === openWallet) || null;
  const barValue = view === 'cartera' && openAccount ? openAccount.value : shownWorth;
  const toggleHidden = () => {
    setHidden((value) => {
      const next = !value;
      localStorage.setItem(HIDE_KEY, next ? '1' : '0');
      return next;
    });
  };
  const pin = (
    <div ref={pinRef} className="sticky top-0 z-30 -mx-4 space-y-2 bg-[var(--app-bg)] px-4 py-2 md:-mx-8 md:px-8">
      {view === 'cartera' && openAccount && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpenWallet(null)} className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1.5 text-sm font-bold text-slate-700 shadow-sm dark:bg-white/10 dark:text-white" aria-label="Volver a carteras">
            <ChevronLeft size={16} /> Carteras
          </button>
          <PlatformLogo name={openAccount.logoName} size={28} />
          <h2 className="min-w-0 truncate text-base font-black">{openAccount.name}</h2>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <p className={cn('truncate text-[26px] font-black leading-none tabular-nums sm:text-[32px]', hidden || (view === 'cartera' && openAccount) ? 'text-slate-900 dark:text-white' : totalClass)}>
            {barValue == null ? '—' : <RisingAmount value={barValue} hidden={hidden} card />}
          </p>
          <button
            type="button"
            onClick={toggleHidden}
            aria-pressed={hidden}
            aria-label={hidden ? 'Mostrar importes' : 'Ocultar importes'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400"
          >
            {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <ViewSwitch value={view} onChange={setView} />
      </div>
    </div>
  );

  if (view === 'cartera') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {pin}
        {error ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
        ) : !data ? (
          <QuietLoad />
        ) : (
          <Wallets
            hidden={hidden}
            openId={openWallet}
            stickTop={pinHeight}
            onOpen={setOpenWallet}
            accounts={[...ordered.map((row) => ({
              key: row.key,
              name: row.name,
              logoName: row.logoName,
              value: row.value,
              cash: row.cash,
              planId: row.planId,
              flows: row.flows,
              fixed: row.fixed,
              purchases: row.purchases,
              sides: row.sides.map((side) => ({
                group: side.group,
                title: side.title,
                total: side.total,
                invested: side.invested,
                gain: side.gain,
                items: side.items.map((item) => ({ id: item.id || undefined, label: item.label, eur: item.eur, detail: item.detail, image: item.image, costEur: item.costEur ?? null, moves: item.moves || [] })),
              })),
            })), extraWallet(data.extras)]}
            onSaved={load}
            onKeep={(name, amount) => setKeepAsk({ name, amount })}
            onEditExtra={openExtra}
            onAdd={(key) => {
              if (key === 'extras') {
                setExtraError('');
                setExtraDraft(blankExtra());
                return;
              }
              const row = ordered.find((item) => item.key === key);
              if (row) openPiece(row);
            }}
          />
        )}
        {piece && (
          <PieceDialog
            piece={piece}
            pieceError={pieceError}
            pieceDelete={pieceDelete}
            setPiece={setPiece}
            onSave={() => void savePiece()}
            onDelete={() => { if (pieceDelete) void deletePiece(); else setPieceDelete(true); }}
          />
        )}
        {extraDraft && <ExtraDialog draft={extraDraft} error={extraError} setDraft={setExtraDraft} onClose={() => setExtraDraft(null)} onSave={() => void saveExtra()} onDelete={() => void deleteExtra()} />}
        {keepAsk && (
          <Modal title="¿Lo guardas?" onClose={() => setKeepAsk(null)}>
            <p className="text-sm font-medium text-slate-500">Un reloj, un PC o un anillo se quedan. Una cena no.</p>
            <div className="mt-4 grid gap-2">
              <Button onClick={() => { setExtraDraft(blankExtra({ name: keepAsk.name, value: String(keepAsk.amount), cost: String(keepAsk.amount), boughtOn: new Date().toISOString().slice(0, 10) })); setKeepAsk(null); }}>Guardarlo en extras</Button>
              <Button variant="secondary" onClick={() => setKeepAsk(null)}>No, era un gasto</Button>
            </div>
          </Modal>
        )}
        {!openWallet && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-3 rounded-[28px] border border-dashed border-slate-300/90 bg-white/40 px-5 py-3.5 text-left text-slate-600 backdrop-blur-xl hover:bg-white/70 dark:border-white/15 dark:bg-white/5 dark:text-slate-300"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-300/80 dark:border-white/15">
              <Plus size={15} />
            </span>
            <span className="text-sm font-semibold">Añadir sitio</span>
          </button>
        )}
        {adding && <QuickSplit onClose={() => setAdding(false)} onSaved={load} />}
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {pin}
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {pin}
        <QuietLoad />
      </div>
    );
  }

  const mask = (value: string) => (hidden ? '*****' : value);
  const slices = rows.filter((row) => row.value != null && row.value > 0).map((row) => ({ key: row.key, name: row.name, eur: row.value as number, color: row.color }));
  if (countExtras && extraWealth > 0) slices.push({ key: 'extras', name: 'Extras', eur: extraWealth, color: '#3F3A4A' });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {pin}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={rise}>
        <p className="text-[11px] font-semibold text-slate-400">{formatDay(data.today)}</p>
        <button
          type="button"
          aria-pressed={countExtras}
          onClick={() => setCountExtras((value) => {
            const next = !value;
            localStorage.setItem('pat_count_extras', next ? '1' : '0');
            return next;
          })}
          className={cn('mt-2 rounded-full border px-3 py-1 text-xs font-bold', countExtras ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-slate-200 text-slate-400')}
        >
          {countExtras ? 'Con extras' : 'Sin extras'}
        </button>
        {data.variation.available && data.variation.amount != null && (
          <p className={cn('mt-1 text-[13px] font-semibold', hidden ? 'text-slate-400' : totalClass)}>
            <RisingAmount value={data.variation.amount} hidden={hidden} signed delay={120} />
            {data.variation.percent != null && <span className="ml-1.5">{mask(formatPct(data.variation.percent))}</span>}
          </p>
        )}
      </motion.section>

      <motion.div className="grid place-items-center py-1" initial={{ opacity: 0, scale: 0.86 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...rise, delay: 0.08 }}>
        {slices.length > 0 ? <Donut slices={slices} /> : <span className="my-2 h-44 w-44 rounded-full border-[16px] border-dashed border-slate-300/80 dark:border-slate-700" />}
      </motion.div>

      <section className="space-y-2">
        {ordered.length > 0 && (
          <div className="flex justify-end">
            <button type="button" onClick={cycleSort} className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/45 px-3 py-1.5 text-xs font-bold text-slate-600 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              <ArrowUpDown size={13} />
              {SORTS.find((item) => item.id === sort)?.label}
            </button>
          </div>
        )}
        {ordered.map((row, index) => {
          const frame = row.frames[beat % row.frames.length];
          const open = openKey === row.key;
          return (
            <motion.div key={row.key} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...rise, delay: 0.12 + index * 0.07 }}>
              <button
                type="button"
                onPointerDown={(event) => holdAccount(row, event)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setConfirmDelete(false);
                  setMenu({ id: row.key, name: row.name, cash: row.cash, top: Math.min(event.clientY, window.innerHeight - 120), left: Math.min(event.clientX, window.innerWidth - 188) });
                }}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  setOpenKey(open ? null : row.key);
                }}
                className="relative flex w-full items-center gap-4 overflow-hidden rounded-[28px] border border-white/70 py-4 pl-5 pr-4 text-left shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/10"
                style={{ background: wash(row.color) }}
              >
                <span className="absolute inset-y-0 left-0 w-2" style={{ background: isLight(row.color) ? 'rgba(28,28,30,0.14)' : row.color }} />
                <PlatformLogo name={row.logoName} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: isLight(row.color) ? '#1C1C1E' : row.color }}>{row.name}</span>
                  <span className="mt-1 block truncate text-[28px] font-black leading-none text-slate-900 dark:text-white">
                    {row.value == null ? '—' : <RisingAmount value={row.value} hidden={hidden} card delay={140 + index * 70} />}
                  </span>
                </span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={hidden ? 'hidden' : frame.text}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28 }}
                    className={cn('shrink-0 text-base font-black tabular-nums', hidden ? 'text-slate-400' : frame.className)}
                  >
                    {mask(frame.text)}
                  </motion.span>
                </AnimatePresence>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28 }}
                    className="mt-2 space-y-1 overflow-hidden rounded-[28px] border border-white/70 bg-white/45 px-4 py-3 shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/10"
                  >
                    {row.sides.length === 0 && <li className="text-xs font-semibold text-slate-400">Sin desglose todavía.</li>}
                    {row.sides.map((side) => (
                      <li key={side.group} className="border-t border-slate-200/80 pt-2 first:border-t-0 first:pt-0 dark:border-white/10">
                        {side.group === 'cash' ? (
                          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-500">
                            <span>Líquido</span>
                            <span className="font-black tabular-nums text-slate-800 dark:text-slate-100">
                              <RisingAmount value={side.total} hidden={hidden} />
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                              <span>{side.title}</span>
                              <span className="text-right">
                                <span className="block font-black tabular-nums text-slate-900 dark:text-white">
                                  <RisingAmount value={side.total} hidden={hidden} />
                                </span>
                                {side.gain != null && side.invested != null && side.invested > 0 && (
                                  <span className={cn('block text-xs font-black tabular-nums', toneClass(side.gain))}>
                                    {formatPct((side.gain / side.invested) * 100)}
                                  </span>
                                )}
                              </span>
                            </div>
                            <ul className="mt-1 space-y-1 border-l border-slate-200 pl-3 dark:border-white/15">
                              {side.items.map((item) => (
                                <li key={item.id || item.label}>
                                  <button
                                    type="button"
                                    onClick={() => item.id && openPiece(row, item)}
                                    className={cn('flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-slate-500', item.id && 'rounded-xl hover:bg-white/50 dark:hover:bg-white/5')}
                                  >
                                    <span>
                                      {item.label}
                                      {item.detail && <span className="mt-0.5 block text-[11px] font-medium text-slate-400">{item.detail}</span>}
                                    </span>
                                    <span className="font-black tabular-nums text-slate-800 dark:text-slate-100">
                                      <RisingAmount value={item.eur} hidden={hidden} />
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                            {(side.invested != null || side.gain != null) && (
                              <div className="mt-1.5 flex items-center justify-between gap-3 pl-3 text-xs font-semibold text-slate-400">
                                {side.invested != null && (
                                  <span>
                                    Invertido{' '}
                                    <span className="font-black tabular-nums text-slate-600 dark:text-slate-300">
                                      <RisingAmount value={side.invested} hidden={hidden} />
                                    </span>
                                  </span>
                                )}
                                {side.gain != null && (
                                  <span className={cn('font-black tabular-nums', toneClass(side.gain))}>
                                    {side.gain >= 0 ? 'Por encima ' : 'Por debajo '}
                                    <RisingAmount value={side.gain} hidden={hidden} signed />
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </li>
                    ))}
                    {row.tracking === 'positions' && (
                      <li className="border-t border-slate-200/80 pt-2 dark:border-white/10">
                        <button type="button" onClick={() => openPiece(row)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500">
                          <Plus size={14} /> Añadir
                        </button>
                      </li>
                    )}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
        {countExtras && extraWealth > 0 && (
          <button type="button" onClick={() => { setView('cartera'); }} className="flex w-full items-center gap-4 rounded-[28px] border border-white/70 bg-white/50 px-5 py-4 text-left dark:border-white/10 dark:bg-white/5">
            <img src="/extras/objeto.svg" alt="" className="h-9 w-9 rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Extras</span>
              <span className="mt-1 block text-[28px] font-black leading-none"><RisingAmount value={extraWealth} hidden={hidden} card /></span>
            </span>
          </button>
        )}
        <motion.button
          type="button"
          onClick={() => setAdding(true)}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...rise, delay: 0.12 + ordered.length * 0.07 }}
          className="flex w-full items-center gap-3 rounded-[28px] border border-dashed border-slate-300/90 bg-white/40 px-5 py-3.5 text-left text-slate-600 backdrop-blur-xl hover:bg-white/70 dark:border-white/15 dark:bg-white/5 dark:text-slate-300"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-300/80 dark:border-white/15">
            <Plus size={15} />
          </span>
          <span className="text-sm font-semibold">Añadir sitio</span>
        </motion.button>
      </section>
      {adding && <QuickSplit onClose={() => setAdding(false)} onSaved={load} />}
      {menu && createPortal(
        <>
          <button type="button" className="fixed inset-0 z-[60] cursor-default" aria-label="Cerrar menú" onClick={() => setMenu(null)} />
          <div className="fixed z-[70] w-44 overflow-hidden rounded-2xl bg-white py-1 text-sm shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10" style={{ top: menu.top, left: menu.left }}>
            <button
              type="button"
              onClick={() => {
                setEditor({ id: menu.id, name: menu.name, balance: String(menu.cash) });
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/5"
            >
              <Pencil size={15} /> Editar
            </button>
            <button
              type="button"
              onClick={() => { if (confirmDelete) void deleteAccount(); else setConfirmDelete(true); }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-semibold text-[#ea3943] hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <Trash2 size={15} /> {confirmDelete ? 'Confirmar' : 'Eliminar'}
            </button>
          </div>
        </>,
        document.body,
      )}
      {piece && (
        <PieceDialog
          piece={piece}
          pieceError={pieceError}
          pieceDelete={pieceDelete}
          setPiece={setPiece}
          onSave={() => void savePiece()}
          onDelete={() => { if (pieceDelete) void deletePiece(); else setPieceDelete(true); }}
        />
      )}
      {extraDraft && <ExtraDialog draft={extraDraft} error={extraError} setDraft={setExtraDraft} onClose={() => setExtraDraft(null)} onSave={() => void saveExtra()} onDelete={() => void deleteExtra()} />}
      {keepAsk && (
        <Modal title="¿Lo guardas?" onClose={() => setKeepAsk(null)}>
          <p className="text-sm font-medium text-slate-500">Un reloj, un PC o un anillo se quedan. Una cena no.</p>
          <div className="mt-4 grid gap-2">
            <Button onClick={() => { setExtraDraft(blankExtra({ name: keepAsk.name, value: String(keepAsk.amount), cost: String(keepAsk.amount), boughtOn: new Date().toISOString().slice(0, 10) })); setKeepAsk(null); }}>Guardarlo en extras</Button>
            <Button variant="secondary" onClick={() => setKeepAsk(null)}>No, era un gasto</Button>
          </div>
        </Modal>
      )}
      {editor && (
        <Modal title={`Editar ${editor.name}`} onClose={() => setEditor(null)}>
          <div className="grid gap-4">
            <Input label="Nombre" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            <Input label="Saldo" type="number" min="0" step="any" value={editor.balance} onChange={(event) => setEditor({ ...editor, balance: event.target.value })} />
            <Button onClick={() => void saveAccount()}>Guardar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
