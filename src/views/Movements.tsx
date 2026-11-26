import { useEffect, useMemo, useRef, useState } from 'react';
import { useDockSearch } from '@/components/dock/dock-search';
import { PlatformLogo } from '@/components/PlatformLogo';
import { markReady, arriveTokenNow } from '@/components/QuietLoad';
import { RowBones } from '@/components/Skeleton';
import { cachedApi, cacheEpoch, onCacheReset, peek } from '@/lib/query';
import { Field, Input, fieldClass } from '@/components/ui/Input';
import { EntrySheet } from '@/components/EntrySheet';
import { LimitOrders } from '@/components/LimitOrders';
import { Modal } from '@/components/Modal';
import { TaxReportPanel } from '@/components/TaxReportPanel';
import { api, ApiError } from '@/lib/api';
import { loadMovementPages } from '@/lib/history';
import { formatDay, formatEur } from '@/lib/format';
import { TYPE_LABEL } from '@/lib/labels';
import { moveFaces } from '@/lib/move-faces';
import { verbFromType } from '@/lib/verbs';
import { flowIn, flowOut } from '@/lib/flow';
import { captureFlip } from '@/lib/flip';
import { cn, docId } from '@/lib/utils';
import type { AccountRow, HoldingRow, MovementRow } from '@/lib/types';

interface Draft {
  type: string;
  date: string;
  amount: string;
  currency: string;
  category: string;
  description: string;
  accountId: string;
  counterAccountId: string;
  holdingId: string;
  quantity: string;
  direction: 'in' | 'out';
  fee: string;
  applyToBalances: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

function formatMove(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  if (currency === 'EUR') return formatEur(abs);
  const digits = abs >= 1 ? 2 : abs >= 0.0001 ? 6 : 8;
  const text = new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(abs);
  return `${text} ${currency}`;
}

function moveSign(row: MovementRow): number {
  if (row.direction === 'out') return -1;
  if (row.direction === 'in') return 1;
  if (row.type === 'expense' || row.type === 'fee' || row.type === 'withdrawal' || row.type === 'sell') return -1;
  return 1;
}

function flowOf(row: MovementRow, accountId = ''): 'in' | 'out' | 'flat' {
  if (row.type === 'transfer') {
    if (accountId && String(row.accountId) === accountId) return 'out';
    if (accountId && String(row.counterAccountId || '') === accountId) return 'in';
    return 'flat';
  }
  return moveSign(row) < 0 ? 'out' : 'in';
}

function moveTone(row: MovementRow, accountId = ''): string {
  const flow = flowOf(row, accountId);
  if (flow === 'out') return flowOut;
  if (flow === 'in') return flowIn;
  return 'text-slate-500';
}

function coinPass(row: MovementRow): boolean {
  return row.type === 'transfer' && Boolean(row.holdingId) && (row.quantity ?? 0) > 0;
}

function moveTitle(row: MovementRow): string {
  const title = (row.description || '').split('·')[0]?.trim();
  return title || TYPE_LABEL[row.type] || row.type;
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function periodRange(year: string, month: string): { from: string; to: string } {
  if (!year) return { from: '', to: '' };
  if (!month) return { from: `${year}-01-01`, to: `${year}-12-31` };
  const last = new Date(Number(year), Number(month), 0).getDate();
  const mm = month.padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

function emptyDraft(accountId = ''): Draft {
  return { type: 'expense', date: today(), amount: '', currency: 'EUR', category: '', description: '', accountId, counterAccountId: '', holdingId: '', quantity: '', direction: 'out', fee: '', applyToBalances: true };
}

/** Movimientos ya descargados por filtro (todas las páginas). Se vacía con cualquier escritura o cambio de sesión. */
const moveMemo = new Map<string, { rows: MovementRow[]; complete: boolean; at: number }>();
const MOVE_KEEP = 60_000;
onCacheReset(() => moveMemo.clear());
/** Grupos que se pintan de entrada; el resto llega al acercarse al final (historiales largos). */
const FIRST_GROUPS = 120;
const MORE_GROUPS = 240;

function filterKey(filters: Record<string, string>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.toString();
}

function remembered(key: string) {
  cacheEpoch();
  const hit = moveMemo.get(key);
  return hit && Date.now() - hit.at < MOVE_KEEP ? hit : null;
}

export function Movements({ embedded = false }: { embedded?: boolean } = {}) {
  const now = new Date();
  const initialYear = String(now.getFullYear());
  const initialMonth = String(now.getMonth() + 1).padStart(2, '0');
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [filters, setFilters] = useState({ q: '', type: '', accountId: '', ...periodRange(initialYear, initialMonth) });
  const firstKey = filterKey(filters);
  const [rows, setRows] = useState<MovementRow[]>(() => remembered(firstKey)?.rows ?? []);
  const [accounts, setAccounts] = useState<AccountRow[]>(() => peek<{ accounts: AccountRow[] }>('/api/accounts')?.accounts ?? []);
  const [holdings, setHoldings] = useState<HoldingRow[]>(() => peek<{ holdings: HoldingRow[] }>('/api/holdings')?.holdings ?? []);
  // Filtro al que pertenecen las filas pintadas: si no coincide con el pedido, la lista se marca como «actualizando».
  const [shownKey, setShownKey] = useState<string | null>(() => (remembered(firstKey) ? firstKey : null));
  const loadSeq = useRef(0);
  const [limit, setLimit] = useState(FIRST_GROUPS);
  const moreRef = useRef<HTMLDivElement>(null);
  // Buscador único del dock (D025): el texto viaja al servidor como antes (filters.q), con una pausa breve.
  const [dockQuery] = useDockSearch('Buscar movimientos');
  useEffect(() => {
    const next = dockQuery.trim();
    const wait = window.setTimeout(() => setFilters((current) => (current.q === next ? current : { ...current, q: next })), next ? 260 : 0);
    return () => window.clearTimeout(wait);
  }, [dockQuery]);
  const [sort, setSort] = useState<{ key: 'date' | 'amount'; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [draft, setDraft] = useState<Draft | null>(null);
  // Bloque D: cómo se veía la fila del movimiento que se edita (para la cabecera de la hoja y su vuelo).
  const [identity, setIdentity] = useState<{ logo: string; title: string; caption: string; amount: string; tone?: string } | null>(null);
  const [formMore, setFormMore] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(() => remembered(firstKey) != null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [taxYear, setTaxYear] = useState(initialYear);
  const [cut, setCut] = useState(false);

  const load = async () => {
    const key = filterKey(filters);
    const params = new URLSearchParams(key);
    // Solo vale la última petición: una respuesta de un filtro anterior nunca pisa al nuevo.
    const seq = ++loadSeq.current;
    const epoch = cacheEpoch();
    const [movementData, accountData, holdingData] = await Promise.all([
      loadMovementPages<MovementRow>(params),
      cachedApi<{ accounts: AccountRow[] }>('/api/accounts', { maxAge: 30_000 }),
      cachedApi<{ holdings: HoldingRow[] }>('/api/holdings', { maxAge: 30_000 }),
    ]);
    if (seq !== loadSeq.current) return;
    if (movementData.complete && epoch === cacheEpoch()) moveMemo.set(key, { rows: movementData.rows, complete: true, at: Date.now() });
    setRows(movementData.rows);
    setCut(!movementData.complete);
    setAccounts(accountData.accounts);
    setHoldings(holdingData.holdings);
    setShownKey(key);
  };
  const wantKey = filterKey(filters);
  const updating = ready && shownKey !== wantKey;
  useEffect(() => { setLimit(FIRST_GROUPS); }, [wantKey]);

  useEffect(() => {
    let cancelled = false;
    const token = arriveTokenNow();
    const hit = remembered(filterKey(filters));
    if (hit) {
      setRows(hit.rows);
      setCut(!hit.complete);
      setShownKey(filterKey(filters));
    }
    load().catch((err: Error) => { if (!cancelled) setError(err.message); }).finally(() => {
      if (cancelled) return;
      setReady(true);
      if (arriveTokenNow() === token) markReady();
    });
    return () => { cancelled = true; };
  }, [filters.q, filters.type, filters.accountId, filters.from, filters.to]);

  const faces = useMemo(() => moveFaces(rows), [rows]);
  const titleOf = (row: MovementRow) => faces.get(docId(row))?.title || moveTitle(row);
  const kindOf = (row: MovementRow) => {
    if (row.type === 'transfer') {
      const incoming = filters.accountId && String(row.counterAccountId || '') === filters.accountId;
      return incoming ? `desde ${nameOf(row.accountId)}` : `hacia ${nameOf(row.counterAccountId)}`;
    }
    return faces.get(docId(row))?.kind || TYPE_LABEL[row.type] || row.type;
  };
  const toneOf = (row: MovementRow) => (faces.has(docId(row)) ? 'text-slate-500' : moveTone(row, filters.accountId));

  const sorted = useMemo(() => {
    const copy = [...rows];
    const clock = (item: MovementRow) => (item.description.match(/(\d{2}:\d{2}:\d{2})/) || ['', ''])[1];
    copy.sort((a, b) => {
      const diff = sort.key === 'date' ? a.date.localeCompare(b.date) || clock(a).localeCompare(clock(b)) : a.amount - b.amount;
      return sort.dir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [rows, sort]);

  const grouped = useMemo(() => {
    const out: { id: string; rows: MovementRow[] }[] = [];
    const buckets = new Map<string, { id: string; rows: MovementRow[] }>();
    for (const row of sorted) {
      if (row.type !== 'reward') {
        out.push({ id: docId(row), rows: [row] });
        continue;
      }
      const key = `${row.accountId}|${row.date.slice(0, 7)}|${row.currency}|${row.category}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.rows.push(row);
      else {
        const next = { id: key, rows: [row] };
        buckets.set(key, next);
        out.push(next);
      }
    }
    return out;
  }, [sorted]);

  const sections = useMemo(() => {
    const out: { title: string; groups: typeof grouped }[] = [];
    for (const group of grouped) {
      const row = group.rows[0];
      const title = sort.key === 'date'
        ? (group.rows.length > 1 ? `${MONTHS[Number(row.date.slice(5, 7)) - 1] || ''} ${row.date.slice(0, 4)}` : formatDay(row.date))
        : '';
      const last = out[out.length - 1];
      if (last && last.title === title) last.groups.push(group);
      else out.push({ title, groups: [group] });
    }
    return out;
  }, [grouped, sort.key]);

  const totalGroups = grouped.length;
  const visibleSections = useMemo(() => {
    if (totalGroups <= limit) return sections;
    const out: typeof sections = [];
    let left = limit;
    for (const section of sections) {
      if (left <= 0) break;
      const groups = section.groups.slice(0, left);
      left -= groups.length;
      out.push({ ...section, groups });
    }
    return out;
  }, [sections, totalGroups, limit]);
  useEffect(() => {
    const sentinel = moreRef.current;
    if (!sentinel || totalGroups <= limit) return undefined;
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setLimit((value) => value + MORE_GROUPS);
    }, { rootMargin: '900px 0px' });
    watch.observe(sentinel);
    return () => watch.disconnect();
  }, [totalGroups, limit, visibleSections]);

  const accountOf = (id?: string | null) => accounts.find((account) => docId(account) === id);
  const nameOf = (id?: string | null) => accountOf(id)?.name || '—';
  const figureOf = (row: MovementRow) => {
    if (!coinPass(row)) return '';
    const holding = holdings.find((item) => docId(item) === String(row.holdingId));
    const code = (holding?.symbol || '').trim().toUpperCase();
    return formatMove(row.quantity || 0, code || '—');
  };

  const save = async (confirmDuplicate = false) => {
    if (!draft) return;
    setError('');
    const body = {
      ...draft,
      amount: Number(draft.amount),
      quantity: draft.quantity === '' ? null : Number(draft.quantity),
      fee: draft.fee === '' ? null : Number(draft.fee),
      counterAccountId: draft.counterAccountId || null,
      holdingId: draft.holdingId || null,
      confirmDuplicate,
    };
    try {
      if (editing) await api(`/api/movements/${editing}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/api/movements', { method: 'POST', body: JSON.stringify(body) });
      setDraft(null);
      setEditing(null);
      setDuplicate(false);
      setConfirmRemove(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate') setDuplicate(true);
      else setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    }
  };

  const remove = async () => {
    if (!editing) return;
    setError('');
    try {
      await api(`/api/movements/${editing}`, { method: 'DELETE' });
      setDraft(null);
      setEditing(null);
      setConfirmRemove(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido eliminar.');
    }
  };

  const exportCsv = () => {
    const header = ['fecha', 'tipo', 'importe', 'moneda', 'categoria', 'descripcion', 'cuenta', 'destino'];
    const lines = sorted.map((row) => [row.date, kindOf(row), String(row.amount), row.currency, row.category, faces.get(docId(row))?.title || row.description, nameOf(row.accountId), nameOf(row.counterAccountId)].map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'));
    const blob = new Blob(['\uFEFF', [header.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'movimientos.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const accountHoldings = holdings.filter((item) => String(item.accountId) === draft?.accountId);
  const simpleMove = draft?.type === 'expense' || draft?.type === 'income';
  const pickAccount = (accountId: string) => {
    if (!draft) return;
    const currency = accounts.find((account) => docId(account) === accountId)?.currency || draft.currency;
    setDraft({ ...draft, accountId, currency, applyToBalances: simpleMove ? currency === 'EUR' : draft.applyToBalances });
  };

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto max-w-3xl space-y-5'}>
      <div className={embedded ? 'flex items-center justify-between gap-3' : 'sticky -top-2 z-20 -mx-4 flex items-center justify-between gap-3 bg-[var(--app-bg)] px-4 py-2 md:-mx-8 md:px-8'}>
        <h2 className={embedded ? 'text-lg font-semibold tracking-tight' : 'text-2xl font-semibold tracking-tight'}>Movimientos</h2>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setTaxYear(year || initialYear); setExportOpen(true); }} className="text-sm font-semibold text-slate-500">Descargar</button>
          <button type="button" onClick={() => { setEditing(null); setDuplicate(false); setFormMore(false); setDraft(emptyDraft(accounts[0] ? docId(accounts[0]) : '')); }} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">Nuevo</button>
        </div>
      </div>
      {ready && <LimitOrders holdings={holdings} onBooked={() => { void load(); }} />}
      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
      {cut && <p className="rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-medium text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">Faltan los movimientos más antiguos.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select className={fieldClass} aria-label="Sitio" value={filters.accountId} onChange={(event) => setFilters({ ...filters, accountId: event.target.value })}>
          <option value="">Todos los sitios</option>
          {accounts.map((account) => <option key={docId(account)} value={docId(account)}>{account.name}</option>)}
        </select>
        <select
          className={fieldClass}
          aria-label="Año"
          value={year}
          onChange={(event) => {
            const next = event.target.value;
            setYear(next);
            setFilters({ ...filters, ...periodRange(next, next ? month : '') });
          }}
        >
          <option value="">Todos los años</option>
          {Array.from({ length: 8 }, (_, index) => now.getFullYear() - index).map((value) => (
            <option key={value} value={String(value)}>{value}</option>
          ))}
        </select>
        <select
          className={cn(fieldClass, 'col-span-2 sm:col-span-1')}
          aria-label="Mes"
          value={month}
          disabled={!year}
          onChange={(event) => {
            const next = event.target.value;
            setMonth(next);
            setFilters({ ...filters, ...periodRange(year, next) });
          }}
        >
          <option value="">Todo el año</option>
          {MONTHS.map((label, index) => (
            <option key={label} value={String(index + 1).padStart(2, '0')}>{label}</option>
          ))}
        </select>
      </div>
      <details>
        <summary className="cursor-pointer text-[13px] font-semibold text-slate-400">Tipo y fechas</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <select className={fieldClass} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Input label="Desde" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <Input label="Hasta" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </div>
      </details>
      {!ready && <RowBones count={8} logo={36} />}
      {ready && !updating && sections.length === 0 && (
        <div className="px-4 py-10 text-center text-[15px] text-slate-400">
          No hay movimientos en este periodo.
          {year === initialYear && <button type="button" className="mt-3 block w-full font-semibold text-slate-900 dark:text-white" onClick={() => { const previous = String(Number(initialYear) - 1); setYear(previous); setMonth(''); setFilters({ ...filters, ...periodRange(previous, '') }); }}>Ver {Number(initialYear) - 1}</button>}
        </div>
      )}
      {updating && <p role="status" className="px-1 text-[13px] font-medium text-slate-400">Actualizando con el filtro nuevo…</p>}
      <div aria-busy={updating} className={cn('space-y-6 transition-opacity duration-200', updating && 'pointer-events-none opacity-40')}>
        {visibleSections.map((section) => (
          <section key={`${section.title}-${section.groups[0]?.id || ''}`}>
            {section.title && <h3 className="pb-1 text-[13px] font-semibold text-slate-500 dark:text-slate-400">{section.title}</h3>}
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.08]">
              {section.groups.map((group) => {
                const row = group.rows[0];
                const many = group.rows.length > 1;
                const open = openGroup === group.id;
                const total = group.rows.reduce((sum, item) => sum + item.amount * moveSign(item), 0);
                const flow = flowOf(row, filters.accountId);
                const coin = figureOf(row);
                const signed = row.type === 'transfer' ? (flow === 'out' ? -Math.abs(total) : Math.abs(total)) : total;
                const mark = row.type === 'transfer' && flow === 'flat' ? '' : signed > 0 ? '+' : signed < 0 ? '−' : '';
                const shown = coin ? `${mark}${coin}` : `${mark}${formatMove(Math.abs(signed), row.currency)}`;
                return (
                  <li key={group.id}>
                    <button type="button" onClick={(event) => { if (many) setOpenGroup(open ? null : group.id); else openRow(row, event.currentTarget, shown); }} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors duration-150 active:bg-slate-50 dark:active:bg-white/[0.04]">
                      <span data-flip="logo" className="flex shrink-0"><PlatformLogo name={accountOf(row.accountId)?.platform || nameOf(row.accountId)} size={36} /></span>
                      <span className="min-w-0 flex-1">
                        <span data-flip="name" className="block truncate text-[15px] font-semibold">{titleOf(row)}</span>
                        <span className="mt-0.5 block truncate text-[13px] font-medium text-slate-400">
                          {many ? `${group.rows.length} apuntes · ${nameOf(row.accountId)}` : `${nameOf(row.accountId)} · ${kindOf(row)}${row.applyToBalances === false ? ' · guardado para la renta' : ''}`}
                        </span>
                      </span>
                      <span data-flip="value" className={cn('shrink-0 text-right text-[15px] font-semibold tabular-nums', toneOf(row))}>
                        {shown}
                      </span>
                    </button>
                    {many && open && (
                      <ul className="mb-2 rounded-2xl bg-slate-50/80 px-2 dark:bg-white/[0.04]">
                        {group.rows.map((item) => (
                          <li key={docId(item)} className="border-t border-slate-100 first:border-t-0 dark:border-white/10">
                            <button type="button" onClick={() => openRow(item)} className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left">
                              <span className="text-[13px] font-medium text-slate-500">{formatDay(item.date)} · {(item.description.split('·')[1] || '').trim()}</span>
                              <span className={cn('text-xs font-semibold tabular-nums', toneOf(item))}>{(() => { const side = flowOf(item, filters.accountId); const prefix = item.type === 'transfer' ? (side === 'out' ? '−' : side === 'in' ? '+' : '') : (moveSign(item) < 0 ? '−' : '+'); return `${prefix}${figureOf(item) || formatMove(item.amount, item.currency)}`; })()}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {totalGroups > limit && (
        <div ref={moreRef} className="py-4 text-center text-[13px] font-medium text-slate-400">
          Mostrando {limit} de {totalGroups} · bajando aparecen más
        </div>
      )}
      {exportOpen && (
        <Modal title="Descargar movimientos" onClose={() => setExportOpen(false)}>
          <div className="space-y-5">
            <TaxReportPanel years={Array.from({ length: 8 }, (_, index) => now.getFullYear() - index)} initialYear={taxYear} />
            <section className="flex items-center justify-between gap-3 px-1">
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">Lista de esta pantalla</span>
                <span className="block text-[13px] text-slate-500 dark:text-slate-400">CSV con los {sorted.length} movimientos que ves ahora</span>
              </span>
              <button type="button" onClick={exportCsv} className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 dark:text-slate-200 dark:ring-white/15">CSV</button>
            </section>
          </div>
        </Modal>
      )}
      {draft && (
        <EntrySheet
          accounts={accounts.filter((account) => !account.archived).map((account) => ({ id: docId(account), name: account.name, kind: account.kind, tracking: account.tracking, currency: account.currency, balance: account.balance, pricedOn: account.balanceUpdatedAt || account.updatedAt || null }))}
          pieces={holdings.map((item) => ({ id: docId(item), accountId: String(item.accountId), name: item.name }))}
          accountId={draft.accountId}
          verb={verbFromType(draft.type, draft.direction, draft.holdingId)}
          editing={editing}
          identity={editing && identity ? identity : undefined}
          initial={{
            amount: draft.amount,
            date: draft.date,
            description: draft.description,
            category: draft.category,
            fee: draft.fee,
            counterAccountId: draft.counterAccountId,
            holdingId: draft.holdingId,
            otherHoldingId: '',
            quantity: draft.quantity,
            otherQuantity: '',
            applyToBalances: draft.applyToBalances,
          }}
          onClose={() => { setDraft(null); setEditing(null); }}
          onSaved={load}
          onDelete={editing ? () => { if (confirmRemove) void remove(); else setConfirmRemove(true); } : undefined}
        />
      )}
    </div>
  );
  function openRow(row: MovementRow, from?: HTMLElement, amount?: string) {
    if (from) captureFlip(from);
    const side = flowOf(row, filters.accountId);
    const prefix = row.type === 'transfer' ? (side === 'out' ? '−' : side === 'in' ? '+' : '') : (moveSign(row) < 0 ? '−' : '+');
    setIdentity({
      logo: accountOf(row.accountId)?.platform || nameOf(row.accountId),
      title: titleOf(row),
      caption: `${nameOf(row.accountId)} · ${formatDay(row.date)}`,
      amount: amount ?? `${prefix}${figureOf(row) || formatMove(row.amount, row.currency)}`,
      tone: toneOf(row),
    });
    openEdit(row);
  }
  function openEdit(row: MovementRow) {
    setEditing(docId(row));
    setDuplicate(false);
    setConfirmRemove(false);
    setFormMore(true);
    setDraft({
      type: row.type,
      date: row.date,
      amount: String(row.amount),
      currency: row.currency,
      category: row.category || '',
      description: row.description || '',
      accountId: String(row.accountId),
      counterAccountId: row.counterAccountId ? String(row.counterAccountId) : '',
      holdingId: row.holdingId ? String(row.holdingId) : '',
      quantity: row.quantity == null ? '' : String(row.quantity),
      direction: row.direction || 'out',
      fee: row.fee == null ? '' : String(row.fee),
      applyToBalances: row.applyToBalances !== false,
    });
  }
}
