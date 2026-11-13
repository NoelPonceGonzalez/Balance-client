import { useEffect, useMemo, useState } from 'react';
import { PlatformLogo } from '@/components/PlatformLogo';
import { QuietLoad } from '@/components/QuietLoad';
import { Field, Input, fieldClass } from '@/components/ui/Input';
import { EntrySheet } from '@/components/EntrySheet';
import { Modal } from '@/components/Modal';
import { TaxReportPanel } from '@/components/TaxReportPanel';
import { api, ApiError } from '@/lib/api';
import { formatDay, formatEur } from '@/lib/format';
import { TYPE_LABEL } from '@/lib/labels';
import { moveFaces } from '@/lib/move-faces';
import { verbFromType } from '@/lib/verbs';
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

function moveTone(row: MovementRow): string {
  if (row.type === 'transfer') return 'text-slate-500';
  return moveSign(row) < 0 ? 'text-[#ea3943]' : 'text-[#16c784]';
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

export function Movements({ embedded = false }: { embedded?: boolean } = {}) {
  const now = new Date();
  const initialYear = String(now.getFullYear());
  const initialMonth = String(now.getMonth() + 1).padStart(2, '0');
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [filters, setFilters] = useState({ q: '', type: '', accountId: '', ...periodRange(initialYear, initialMonth) });
  const [sort, setSort] = useState<{ key: 'date' | 'amount'; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formMore, setFormMore] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [taxYear, setTaxYear] = useState(initialYear);
  const [taxBusy, setTaxBusy] = useState(false);

  const load = async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    const [movementData, accountData, holdingData] = await Promise.all([
      api<{ movements: MovementRow[] }>(`/api/movements?${params.toString()}`),
      api<{ accounts: AccountRow[] }>('/api/accounts'),
      api<{ holdings: HoldingRow[] }>('/api/holdings'),
    ]);
    setRows(movementData.movements);
    setAccounts(accountData.accounts);
    setHoldings(holdingData.holdings);
  };

  useEffect(() => {
    load().catch((err: Error) => setError(err.message)).finally(() => setReady(true));
  }, [filters.q, filters.type, filters.accountId, filters.from, filters.to]);

  const faces = useMemo(() => moveFaces(rows), [rows]);
  const titleOf = (row: MovementRow) => faces.get(docId(row))?.title || moveTitle(row);
  const kindOf = (row: MovementRow) => faces.get(docId(row))?.kind || TYPE_LABEL[row.type] || row.type;
  const toneOf = (row: MovementRow) => (faces.has(docId(row)) ? 'text-slate-500' : moveTone(row));

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

  const accountOf = (id?: string | null) => accounts.find((account) => docId(account) === id);
  const nameOf = (id?: string | null) => accountOf(id)?.name || '—';

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
    const blob = new Blob([[header.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
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
      <div className={embedded ? 'flex items-center justify-between gap-3' : 'sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 bg-[var(--app-bg)] px-4 py-2 md:-mx-8 md:px-8'}>
        <h2 className={embedded ? 'text-lg font-semibold tracking-tight' : 'text-2xl font-semibold tracking-tight'}>Movimientos</h2>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setTaxYear(year || initialYear); setExportOpen(true); }} className="text-sm font-semibold text-slate-500">Descargar</button>
          <button type="button" onClick={() => { setEditing(null); setDuplicate(false); setFormMore(false); setDraft(emptyDraft(accounts[0] ? docId(accounts[0]) : '')); }} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">Nuevo</button>
        </div>
      </div>
      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
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
        <summary className="cursor-pointer text-[13px] font-semibold text-slate-400">Buscar y fechas</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input label="Buscar" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Descripción o categoría" />
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
      {!ready && <QuietLoad kind="rows" />}
      {ready && sections.length === 0 && (
        <div className="rounded-[28px] bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10">
          No hay movimientos en este periodo.
          {year === initialYear && <button type="button" className="mt-3 block w-full font-semibold text-slate-900 dark:text-white" onClick={() => { const previous = String(Number(initialYear) - 1); setYear(previous); setMonth(''); setFilters({ ...filters, ...periodRange(previous, '') }); }}>Ver {Number(initialYear) - 1}</button>}
        </div>
      )}
      <div className="space-y-6">
        {sections.map((section) => (
          <section key={`${section.title}-${section.groups[0]?.id || ''}`}>
            {section.title && <h3 className="px-1 pb-2 text-[13px] font-semibold text-slate-400">{section.title}</h3>}
            <ul className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-white/10">
              {section.groups.map((group) => {
                const row = group.rows[0];
                const many = group.rows.length > 1;
                const open = openGroup === group.id;
                const total = group.rows.reduce((sum, item) => sum + item.amount * moveSign(item), 0);
                return (
                  <li key={group.id} className="border-t border-slate-100 first:border-t-0 dark:border-white/10">
                    <button type="button" onClick={() => { if (many) setOpenGroup(open ? null : group.id); else openEdit(row); }} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                      <PlatformLogo name={accountOf(row.accountId)?.platform || nameOf(row.accountId)} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{titleOf(row)}</span>
                        <span className="mt-0.5 block truncate text-[12px] font-medium text-slate-400">
                          {many ? `${group.rows.length} apuntes · ${nameOf(row.accountId)}` : `${nameOf(row.accountId)} · ${kindOf(row)}`}
                        </span>
                      </span>
                      <span className={cn('shrink-0 text-right text-[15px] font-semibold tabular-nums', toneOf(row))}>
                        {total > 0 ? '+' : total < 0 ? '−' : ''}{formatMove(total, row.currency)}
                      </span>
                    </button>
                    {many && open && (
                      <ul className="border-t border-slate-100 dark:border-white/10">
                        {group.rows.map((item) => (
                          <li key={docId(item)} className="border-t border-slate-100 first:border-t-0 dark:border-white/10">
                            <button type="button" onClick={() => openEdit(item)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
                              <span className="text-[13px] font-medium text-slate-500">{formatDay(item.date)} · {(item.description.split('·')[1] || '').trim()}</span>
                              <span className={cn('text-xs font-semibold tabular-nums', toneOf(item))}>{moveSign(item) < 0 ? '−' : '+'}{formatMove(item.amount, item.currency)}</span>
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
      {exportOpen && (
        <Modal title="Descargar movimientos" onClose={() => { if (!taxBusy) setExportOpen(false); }}>
          <div className="space-y-5">
            <TaxReportPanel years={Array.from({ length: 8 }, (_, index) => now.getFullYear() - index)} initialYear={taxYear} onBusy={setTaxBusy} />
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
          accounts={accounts.filter((account) => !account.archived).map((account) => ({ id: docId(account), name: account.name, kind: account.kind, tracking: account.tracking, currency: account.currency, balance: account.balance }))}
          pieces={holdings.map((item) => ({ id: docId(item), accountId: String(item.accountId), name: item.name }))}
          accountId={draft.accountId}
          verb={verbFromType(draft.type, draft.direction, draft.holdingId)}
          editing={editing}
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
          }}
          onClose={() => { setDraft(null); setEditing(null); }}
          onSaved={load}
          onDelete={editing ? () => { if (confirmRemove) void remove(); else setConfirmRemove(true); } : undefined}
        />
      )}
    </div>
  );
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
