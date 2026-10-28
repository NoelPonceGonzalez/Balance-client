import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from 'lucide-react';
import { PlatformLogo } from '@/components/PlatformLogo';
import { SpendIcon } from '@/components/SpendIcon';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { OriginGlyph, OriginPicker } from '@/components/OriginMark';
import { formatDay, formatEur, formatNumber, formatPct, formatSignedEur } from '@/lib/format';
import { glide } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { AccountOffer } from '@/lib/platforms';

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
  moves?: CarteraMove[];
  boughtOn?: string | null;
}

export interface CarteraSide {
  group: string;
  title: string;
  total: number;
  invested: number | null;
  gain: number | null;
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
  cash: number;
  planId: string | null;
  flows: CashFlow[];
  fixed: FixedRule[];
  purchases?: { name: string; amount: number; date: string; image?: string | null }[];
  sides: CarteraSide[];
  offers?: AccountOffer[];
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

function ItemPicture({ src, large, label }: { src?: string | null; large?: boolean; label: string }) {
  const local = Boolean(src && (src.startsWith('https://') || src.startsWith('/')));
  const [visible, setVisible] = useState(local);
  if (!local || !visible || !src) return <SpendIcon label={label} />;
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setVisible(false)} className={cn('shrink-0 rounded-xl bg-white object-contain', large ? 'h-28 w-44 p-1' : 'h-11 w-11 object-cover')} />;
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

interface LinePoint {
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

function ValueLine({ points }: { points: LinePoint[] }) {
  if (points.length < 2) return null;
  const clean = points.map((point) => point.eur);
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const width = 640;
  const height = 148;
  const path = clean
    .map((value, index) => {
      const x = (index / (clean.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 20) - 10;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const up = clean[clean.length - 1] >= clean[0];
  const color = up ? '#16c784' : '#ea3943';
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-16 w-full" role="img" aria-label="Gráfica desde que está abierto">
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function SectionChart({ accountKey, group, points, title, card = false }: { accountKey?: string; group?: string | null; points?: LinePoint[] | null; title: string; card?: boolean }) {
  const [remote, setRemote] = useState<LinePoint[] | null>(null);
  useEffect(() => {
    if (points || !accountKey || !group) {
      setRemote(null);
      return;
    }
    let cancelled = false;
    api<{ points: LinePoint[] }>(`/api/wallets/series?accountId=${encodeURIComponent(accountKey)}&group=${encodeURIComponent(group)}`)
      .then((data) => {
        if (!cancelled) setRemote(data.points || []);
      })
      .catch(() => {
        if (!cancelled) setRemote([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accountKey, group, points]);
  const line = points ?? remote;
  if (!line || line.length < 2) return null;
  return (
    <div className={card ? 'rounded-[24px] border border-white/70 bg-white/80 p-4 dark:border-white/10 dark:bg-white/10' : undefined}>
      <ValueLine points={line} />
      <p className="mt-1 text-[11px] font-medium text-slate-400">Desde {formatDay(line[0].day)} hasta ahora · {title}</p>
    </div>
  );
}

function ActivityList({ rows, hidden, mode }: { rows: Activity[]; hidden: boolean; mode: 'peek' | 'all' }) {
  const [query, setQuery] = useState('');
  const matched = rows.filter((row) => matchesActivity(row.label, row.note, row.amount, query));
  const shown = mode === 'all' ? matched : rows;
  const faded = mode === 'peek' && rows.length > 6;
  const className = 'flex w-full items-center gap-3 border-t border-slate-200/70 py-2.5 text-left first:border-t-0 dark:border-white/10';
  return (
    <div>
      {mode === 'all' && (
        <label className="mb-2 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/20">
          <Search size={15} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre, fecha o importe"
            className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
          />
        </label>
      )}
      <div className="relative">
        <ul className={faded ? 'max-h-[28rem] overflow-hidden' : undefined}>
          {shown.length === 0 && <li className="py-2 text-sm font-medium text-slate-400">{rows.length === 0 ? 'Todavía no hay transacciones.' : 'Ninguna transacción coincide.'}</li>}
          {shown.map((row) => {
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
              <li key={row.id}>
                <div className={className}>
                  {mark}
                  {row.onOpen ? (
                    <button type="button" onClick={row.onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">{body}</button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {faded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-36"
            style={{
              backdropFilter: 'blur(7px)',
              WebkitBackdropFilter: 'blur(7px)',
              maskImage: 'linear-gradient(to top, black 15%, transparent)',
              WebkitMaskImage: 'linear-gradient(to top, black 15%, transparent)',
            }}
          />
        )}
        {faded && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-slate-950 dark:via-slate-950/80" />}
      </div>
    </div>
  );
}

function sideCaption(group: string): string {
  if (group === 'crypto') return 'Criptomonedas, cada moneda';
  if (group === 'etf') return 'ETF, cada uno';
  if (group === 'stock') return 'Acciones, cada una';
  if (group === 'personal_good') return 'Skins, cada una';
  return 'Cada cosa por separado';
}

export function Wallets({ accounts, hidden, openId, stickTop = 0, onOpen, onAdd, onSaved, onKeep, onEditExtra }: { accounts: CarteraAccount[]; hidden: boolean; openId: string | null; stickTop?: number; onOpen: (id: string | null) => void; onAdd?: (accountKey: string, offer?: AccountOffer) => void; onSaved?: () => Promise<void> | void; onKeep?: (name: string, amount: number) => void; onEditExtra?: (id: string) => void }) {
  const [notes, setNotes] = useState<WalletRow[]>([]);
  const [error, setError] = useState('');
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [entryMore, setEntryMore] = useState(false);
  const [fixedDraft, setFixedDraft] = useState<FixedDraft | null>(null);
  const [ledger, setLedger] = useState<null | 'cash' | 'moves'>(null);
  const [detail, setDetail] = useState<{ label: string; note: string; amount: number; image?: string | null } | null>(null);

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
    setLedger(null);
    setDetail(null);
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
  const offerLabel: Record<AccountOffer, string> = { cash: 'efectivo', crypto: 'cripto', etf: 'un ETF', stock: 'una acción', skin: 'una skin' };
  const usedOffers = new Set(detailSides.map((side) => (side.group === 'personal_good' ? 'skin' : side.group)));
  const dormant = (current?.offers || []).filter((offer) => offer !== 'cash' && !usedOffers.has(offer));
  const openEntry = (direction: 'in' | 'out') => {
    if (!current) return;
    setEntryMore(false);
    setEntryDraft({ id: null, name: '', amount: '', date: todayKey(), direction, origin: '', image: '', source: current.planId ? 'plan' : 'wallet', key: '', surprise: true });
  };
  const positionMoves = detailSides
    .filter((side) => side.group === 'crypto' || side.group === 'etf' || side.group === 'stock')
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
  const ledgerRows = ledger === 'cash' ? cashRows : moveRows;

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
              <span className="flex items-center gap-2">
                {account.image ? <img src={account.image} alt="" className="h-[22px] w-[22px] rounded-lg object-cover" /> : <PlatformLogo name={account.logoName} size={22} />}
                <span className="min-w-0 truncate text-sm font-black">{account.name}</span>
              </span>
              <span className="mt-2 block whitespace-nowrap text-[clamp(1.35rem,6.2vw,1.85rem)] font-black leading-none tabular-nums sm:text-[26px]">{account.value == null ? '—' : money(account.value, hidden)}</span>
              <span className="mt-2 block text-[11px] font-semibold text-slate-400">
                {(account.sides || []).map((side) => side.title).join(' · ') || 'Sin desglose'}
              </span>
            </motion.button>
          ))}
        </div>
      )}
      {current && ledger && (
        <section className="rounded-[24px] border border-white/70 bg-white/80 p-4 dark:border-white/10 dark:bg-white/10">
          <button type="button" onClick={() => setLedger(null)} className="inline-flex items-center gap-1 text-sm font-bold text-slate-500">
            <ChevronLeft size={16} /> Volver
          </button>
          <h2 className="mt-3 text-xl font-black">Transacciones</h2>
          <div className="mt-3">
            <ActivityList mode="all" hidden={hidden} rows={ledgerRows} />
          </div>
        </section>
      )}
      {current && !ledger && (
        <div className="space-y-3">
          {hasCash && (
            <div className="sticky z-20 -mx-4 flex justify-end bg-[var(--app-bg)] px-4 py-2 md:-mx-8 md:px-8" style={{ top: stickTop }}>
              <div className="flex shrink-0 gap-1.5">
                <button type="button" onClick={() => openEntry('out')} className="rounded-full border border-[#ea3943]/40 px-2.5 py-1 text-[13px] font-bold text-[#ea3943]">Gasto</button>
                <button type="button" onClick={() => openEntry('in')} className="rounded-full border border-[#16c784]/40 px-2.5 py-1 text-[13px] font-bold text-[#16c784]">Ha entrado</button>
              </div>
            </div>
          )}
          {hasCash && cashSide && (
            <section className="rounded-[24px] border border-white/70 bg-white/80 p-4 dark:border-white/10 dark:bg-white/10">
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-3">
                  <img src={groupIcon('cash')} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1" />
                  <span>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Dinero normal</p>
                    <h3 className="mt-1 text-base font-black">Líquido</h3>
                  </span>
                </span>
                <p className="text-xl font-black tabular-nums">{money(cashSide.total, hidden)}</p>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-400">Es el efectivo de ahora. El entrenador del 14 y el Seiko ya están restados aquí.</p>
              {current && <SectionChart points={cashPath(current.cash, statement.map((row) => ({ day: row.day, amount: row.amount, absorbed: row.absorbed, open: row.open })), todayKey())} title="Efectivo" />}
            </section>
          )}
          {current?.extras && (
            <SectionChart card points={holdingPath(current.sides.flatMap((side) => side.items).map((item) => ({ day: item.boughtOn, cost: item.costEur, value: item.eur })), todayKey())} title="Extras" />
          )}
          {current && !current.extras && investmentSides.length > 0 && (
            <SectionChart card accountKey={current.key} group={investmentSides.length === 1 ? investmentSides[0].group : null} title={investmentSides.length === 1 ? investmentSides[0].title : 'Inversión'} />
          )}
          {detailSides.filter((side) => side.group !== 'cash').map((side) => (
            <section key={side.group} className="rounded-[24px] border border-white/70 bg-white/80 p-4 dark:border-white/10 dark:bg-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src={groupIcon(side.group)} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1" />
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{sideCaption(side.group)}</p>
                    <h3 className="mt-1 text-base font-black">{side.title}</h3>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black tabular-nums">{money(side.total, hidden)}</p>
                  {side.gain != null && side.invested != null && side.invested > 0 && (
                    <p className={cn('text-xs font-black tabular-nums', toneClass(side.gain))}>{hidden ? '*****' : formatPct((side.gain / side.invested) * 100)}</p>
                  )}
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {side.items.map((item) => (
                  <li key={item.id || item.label} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-black/20">
                    <ItemPicture src={item.image} large={current.extras} label={item.label} />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => item.id && onEditExtra?.(item.id)}>
                      <span className="block break-words text-sm font-bold leading-snug">{item.label}</span>
                      {item.detail && <span className="mt-0.5 block text-[11px] font-medium leading-4 text-slate-400">{item.detail}</span>}
                    </button>
                    <span className="shrink-0 pt-0.5 text-sm font-black tabular-nums">{money(item.eur, hidden)}</span>
                  </li>
                ))}
              </ul>
              {current.extras && onAdd && (
                <button type="button" onClick={() => onAdd(current.key)} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-slate-500">
                  <Plus size={14} /> Añadir
                </button>
              )}
              {side.group !== 'cash' && !current.extras && onAdd && current && (
                <button type="button" onClick={() => onAdd(current.key, side.group === 'personal_good' ? 'skin' : side.group as AccountOffer)} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-slate-500">
                  <Plus size={14} /> {side.group === 'personal_good' ? 'Añadir skin' : 'Añadir'}
                </button>
              )}
              {(side.invested != null || side.gain != null) && (
                <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-slate-400">
                  {side.invested != null && <span>Invertido <span className="font-black text-slate-600 dark:text-slate-300">{money(side.invested, hidden)}</span></span>}
                  {side.gain != null && (
                    <span className={cn('font-black tabular-nums', toneClass(side.gain))}>
                      {side.gain >= 0 ? 'Por encima ' : 'Por debajo '}
                      {hidden ? '*****' : formatSignedEur(side.gain)}
                    </span>
                  )}
                </div>
              )}
            </section>
          ))}
          {detailSides.some((side) => side.group === 'crypto' || side.group === 'etf' || side.group === 'stock') && moveRows.length > 0 && (
            <section className="rounded-[24px] border border-white/70 bg-white/80 p-4 dark:border-white/10 dark:bg-white/10">
              <button type="button" onClick={() => setLedger('moves')} className="flex w-full items-center justify-between gap-3 text-left">
                <h3 className="text-base font-black">Transacciones</h3>
                <ChevronRight size={18} className="shrink-0 text-slate-400" />
              </button>
              <p className="mt-1 text-xs font-medium text-slate-400">{positionMoves.length > 0 ? 'Las compras de este apartado.' : 'No hay cada compra por separado. Esto es lo que llevas metido.'}</p>
              <div className="mt-3">
                <ActivityList mode="peek" hidden={hidden} rows={moveRows} />
              </div>
            </section>
          )}
          {dormant.length > 0 && current && onAdd && (
            <div className="grid gap-1 px-1">
              {dormant.map((offer) => (
                <button key={offer} type="button" onClick={() => onAdd(current.key, offer)} className="inline-flex items-center gap-1 py-1 text-left text-sm font-bold text-slate-500">
                  <Plus size={14} /> Añadir {offerLabel[offer]}
                </button>
              ))}
            </div>
          )}
          {hasCash && cashSide && !current.extras && <section className="rounded-[24px] border border-white/70 bg-white/80 p-4 dark:border-white/10 dark:bg-white/10">
            <button type="button" onClick={() => setLedger('cash')} className="flex w-full items-center justify-between gap-3 text-left">
              <h3 className="text-base font-black">Transacciones</h3>
              <ChevronRight size={18} className="shrink-0 text-slate-400" />
            </button>
            <p className="mt-1 text-xs font-medium text-slate-400">Una entrada va en verde y una salida en rojo. Lo que ya está en el efectivo no se vuelve a restar.</p>
            <div className="mt-3">
              <ActivityList mode="peek" hidden={hidden} rows={cashRows} />
            </div>
          </section>}
        </div>
      )}
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
              <button type="button" onClick={() => setEntryDraft({ ...entryDraft, direction: 'out' })} className={cn('flex-1 rounded-full border py-2 text-sm font-bold', entryDraft.direction === 'out' ? 'border-[#ea3943] text-[#ea3943]' : 'border-slate-200 text-slate-400')}>Sale</button>
              <button type="button" onClick={() => setEntryDraft({ ...entryDraft, direction: 'in' })} className={cn('flex-1 rounded-full border py-2 text-sm font-bold', entryDraft.direction === 'in' ? 'border-[#16c784] text-[#16c784]' : 'border-slate-200 text-slate-400')}>Entra</button>
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
