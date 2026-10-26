import { useEffect, useMemo, useState } from 'react';
import { PlatformLogo } from '@/components/PlatformLogo';
import { QuietLoad } from '@/components/QuietLoad';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, fieldClass } from '@/components/ui/Input';
import { Modal } from '@/components/Modal';
import { api, ApiError } from '@/lib/api';
import { formatDay, formatEur } from '@/lib/format';
import { CATEGORIES, TYPE_LABEL } from '@/lib/labels';
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
  const title = (row.description || '').split('Â·')[0]?.trim();
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
  const [editing, setEditing] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

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

  const accountOf = (id?: string | null) => accounts.find((account) => docId(account) === id);
  const nameOf = (id?: string | null) => accountOf(id)?.name || 'â€”';

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
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate') setDuplicate(true);
      else setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    }
  };

  const exportCsv = () => {
    const header = ['fecha', 'tipo', 'importe', 'moneda', 'categoria', 'descripcion', 'cuenta', 'destino'];
    const lines = sorted.map((row) => [row.date, TYPE_LABEL[row.type] || row.type, String(row.amount), row.currency, row.category, row.description, nameOf(row.accountId), nameOf(row.counterAccountId)].map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'));
    const blob = new Blob([[header.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'movimientos.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const accountHoldings = holdings.filter((item) => String(item.accountId) === draft?.accountId);

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto max-w-3xl space-y-5'}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={embedded ? 'text-lg font-black' : 'text-3xl font-black tracking-tight'}>Movimientos</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">Compras, retiros, intereses y conversiones. Si no hay cambio a euros, el apunte se guarda en su moneda y no entra en el patrimonio en euros.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>Exportar</Button>
          <Button onClick={() => { setEditing(null); setDuplicate(false); setDraft(emptyDraft(accounts[0] ? docId(accounts[0]) : '')); }}>Nuevo</Button>
        </div>
      </div>
      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
      <Card className="border-white/70 bg-white/45 shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/10">
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            className={fieldClass}
            aria-label="AÃ±o"
            value={year}
            onChange={(event) => {
              const next = event.target.value;
              setYear(next);
              setFilters({ ...filters, ...periodRange(next, next ? month : '') });
            }}
          >
            <option value="">Todos los aÃ±os</option>
            {Array.from({ length: 8 }, (_, index) => now.getFullYear() - index).map((value) => (
              <option key={value} value={String(value)}>{value}</option>
            ))}
          </select>
          <select
            className={fieldClass}
            aria-label="Mes"
            value={month}
            disabled={!year}
            onChange={(event) => {
              const next = event.target.value;
              setMonth(next);
              setFilters({ ...filters, ...periodRange(year, next) });
            }}
          >
            <option value="">Todo el aÃ±o</option>
            {MONTHS.map((label, index) => (
              <option key={label} value={String(index + 1).padStart(2, '0')}>{label}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <Input label="Buscar" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="DescripciÃ³n o categorÃ­a" />
          <Field label="Tipo">
            <select className={fieldClass} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Cuenta">
            <select className={fieldClass} value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}>
              <option value="">Todas</option>
              {accounts.map((account) => <option key={docId(account)} value={docId(account)}>{account.name}</option>)}
            </select>
          </Field>
          <Input label="Desde" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <Input label="Hasta" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </div>
      </Card>
      <ul className="overflow-hidden rounded-[28px] border border-white/70 bg-white/55 shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/55">
        {grouped.map((group) => {
          const row = group.rows[0];
          const many = group.rows.length > 1;
          const open = openGroup === group.id;
          const total = group.rows.reduce((sum, item) => sum + item.amount * moveSign(item), 0);
          return (
            <li key={group.id} className="border-t border-slate-100 first:border-t-0 dark:border-white/10">
              <button type="button" onClick={() => { if (many) setOpenGroup(open ? null : group.id); else openEdit(row); }} className="flex w-full items-center gap-3 px-3 py-3 text-left">
                <PlatformLogo name={accountOf(row.accountId)?.platform || nameOf(row.accountId)} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{moveTitle(row)}</span>
                  <span className="block truncate text-[11px] font-medium text-slate-400">
                    {many ? `${MONTHS[Number(row.date.slice(5, 7)) - 1]} ${row.date.slice(0, 4)} Â· ${group.rows.length} apuntes` : `${formatDay(row.date)} Â· ${TYPE_LABEL[row.type] || row.type}`}
                    {` Â· ${nameOf(row.accountId)}`}
                  </span>
                </span>
                <span className={cn('shrink-0 text-right text-sm font-black tabular-nums', moveTone(row))}>
                  {total > 0 ? '+' : total < 0 ? 'âˆ’' : ''}{formatMove(total, row.currency)}
                </span>
              </button>
              {many && open && (
                <ul className="border-t border-slate-100 bg-slate-50/70 dark:border-white/10 dark:bg-black/20">
                  {group.rows.map((item) => (
                    <li key={docId(item)}>
                      <button type="button" onClick={() => openEdit(item)} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left">
                        <span className="text-[11px] font-medium text-slate-500">{formatDay(item.date)} Â· {(item.description.split('Â·')[1] || '').trim()}</span>
                        <span className={cn('text-xs font-black tabular-nums', moveTone(item))}>{moveSign(item) < 0 ? 'âˆ’' : '+'}{formatMove(item.amount, item.currency)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {!ready && (
          <li className="px-2 py-3">
            <QuietLoad kind="rows" />
          </li>
        )}
        {ready && grouped.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-slate-500">
            No hay movimientos en este periodo.
            <button type="button" className="mt-3 block w-full font-bold text-indigo-600" onClick={() => { setYear('2025'); setMonth(''); setFilters({ ...filters, ...periodRange('2025', '') }); }}>Ver 2025</button>
          </li>
        )}
      </ul>
      {draft && (
        <Modal title={editing ? 'Editar movimiento' : 'Nuevo movimiento'} onClose={() => setDraft(null)}>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <select className={fieldClass} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                  {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Input label="Fecha" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              <Input label="Importe" type="number" step="any" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              <Input label="Moneda" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
              <Field label="Cuenta">
                <select className={fieldClass} value={draft.accountId} onChange={(e) => setDraft({ ...draft, accountId: e.target.value, currency: accounts.find((account) => docId(account) === e.target.value)?.currency || draft.currency })}>
                  <option value="">Elige</option>
                  {accounts.filter((account) => !account.archived).map((account) => <option key={docId(account)} value={docId(account)}>{account.name}</option>)}
                </select>
              </Field>
              {draft.type === 'transfer' && (
                <Field label="Destino">
                  <select className={fieldClass} value={draft.counterAccountId} onChange={(e) => setDraft({ ...draft, counterAccountId: e.target.value })}>
                    <option value="">Elige</option>
                    {accounts.filter((account) => docId(account) !== draft.accountId && !account.archived).map((account) => <option key={docId(account)} value={docId(account)}>{account.name}</option>)}
                  </select>
                </Field>
              )}
              {(draft.type === 'buy' || draft.type === 'sell') && (
                <>
                  <Field label="Activo">
                    <select className={fieldClass} value={draft.holdingId} onChange={(e) => setDraft({ ...draft, holdingId: e.target.value })}>
                      <option value="">Elige</option>
                      {accountHoldings.map((item) => <option key={docId(item)} value={docId(item)}>{item.name}</option>)}
                    </select>
                  </Field>
                  <Input label="Cantidad" type="number" step="any" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
                </>
              )}
              {draft.type === 'adjustment' && (
                <Field label="El saldo">
                  <select className={fieldClass} value={draft.direction} onChange={(e) => setDraft({ ...draft, direction: e.target.value as 'in' | 'out' })}>
                    <option value="in">Sube</option>
                    <option value="out">Baja</option>
                  </select>
                </Field>
              )}
              <Field label="CategorÃ­a">
                <input list="categories" className={fieldClass} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                <datalist id="categories">{CATEGORIES.map((item) => <option key={item} value={item} />)}</datalist>
              </Field>
              <Input label="ComisiÃ³n informativa" type="number" step="any" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} placeholder="No se resta otra vez" />
            </div>
            <Input label="DescripciÃ³n" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={draft.applyToBalances} onChange={(e) => setDraft({ ...draft, applyToBalances: e.target.checked })} />
              Actualizar el saldo de la cuenta
            </label>
            <p className="text-xs font-medium text-slate-500">Para BTC, ETH u otra moneda sin precio en euros, dÃ©jalo sin marcar. El apunte se guarda y no se inventa un importe en euros.</p>
            <div className="flex justify-end gap-2">
              {duplicate && <Button variant="outline" onClick={() => save(true)}>Guardar igualmente</Button>}
              <Button onClick={() => save(false)}>Guardar</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
  function openEdit(row: MovementRow) {
    setEditing(docId(row));
    setDuplicate(false);
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
