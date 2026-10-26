import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, fieldClass } from '@/components/ui/Input';
import { Modal } from '@/components/Modal';
import { api } from '@/lib/api';
import { formatAgo, formatDay, formatEur, formatNumber, formatPct, formatPrice } from '@/lib/format';
import { PlatformLogo } from '@/components/PlatformLogo';
import { CLASS_LABEL, KIND_LABEL } from '@/lib/labels';
import { PLATFORM_GROUPS, PLATFORMS, type PlatformGroup, type PlatformPreset } from '@/lib/platforms';
import { cn, docId } from '@/lib/utils';
import type { AccountRow, HoldingRow, QuoteCandidate } from '@/lib/types';

interface Draft {
  name: string;
  platform: string;
  kind: string;
  tracking: 'balance' | 'positions';
  currency: string;
  balance: string;
  eurPerUnit: string;
  notes: string;
  publicAddress: string;
}

const emptyDraft = (): Draft => ({
  name: '',
  platform: '',
  kind: 'bank',
  tracking: 'balance',
  currency: 'EUR',
  balance: '0',
  eurPerUnit: '',
  notes: '',
  publicAddress: '',
});

export function Accounts() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [holding, setHolding] = useState({ name: '', symbol: '', assetClass: 'etf', quantity: '', unitMarketValue: '', costBasis: '', currency: 'EUR', eurPerUnit: '', quoteSource: '' as '' | 'coingecko' | 'yahoo', quoteId: '' });
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogGroup, setCatalogGroup] = useState<PlatformGroup | 'Todas'>('Todas');

  const load = async () => {
    const [accountData, holdingData] = await Promise.all([
      api<{ accounts: AccountRow[] }>('/api/accounts'),
      api<{ holdings: HoldingRow[] }>('/api/holdings'),
    ]);
    setAccounts(accountData.accounts);
    setHoldings(holdingData.holdings);
  };

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const current = accounts.find((account) => docId(account) === selected);
  const currentHoldings = holdings.filter((item) => String(item.accountId) === selected);

  const saveAccount = async () => {
    if (!draft) return;
    setError('');
    const body = {
      ...draft,
      balance: Number(draft.balance || 0),
      eurPerUnit: draft.currency === 'EUR' ? null : Number(draft.eurPerUnit),
    };
    try {
      if (editingId) await api(`/api/accounts/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await api('/api/accounts', { method: 'POST', body: JSON.stringify(body) });
      setDraft(null);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    }
  };

  const saveHolding = async () => {
    if (!current) return;
    setError('');
    try {
      await api('/api/holdings', {
        method: 'POST',
        body: JSON.stringify({
          accountId: docId(current),
          name: holding.name,
          symbol: holding.symbol,
          assetClass: holding.assetClass,
          quantity: Number(holding.quantity),
          unitMarketValue: holding.unitMarketValue === '' ? null : Number(holding.unitMarketValue),
          costBasis: holding.costBasis === '' ? null : Number(holding.costBasis),
          currency: holding.currency || current.currency,
          eurPerUnit: (holding.currency || current.currency) === 'EUR' ? null : Number(holding.eurPerUnit),
          quoteSource: holding.quoteSource || undefined,
          quoteId: holding.quoteId || undefined,
        }),
      });
      setHolding({ name: '', symbol: '', assetClass: 'etf', quantity: '', unitMarketValue: '', costBasis: '', currency: current.currency, eurPerUnit: '', quoteSource: '', quoteId: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar el activo.');
    }
  };

  const updatePrice = async (item: HoldingRow, price: string) => {
    setError('');
    try {
      await api(`/api/holdings/${docId(item)}`, {
        method: 'PATCH',
        body: JSON.stringify({ unitMarketValue: price === '' ? null : Number(price) }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido actualizar el precio.');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Cuentas</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Puedes añadir cualquier plataforma. El nombre no está cerrado a una lista.</p>
        </div>
        <Button onClick={() => { setEditingId(null); setCatalogQuery(''); setCatalogGroup('Todas'); setDraft(emptyDraft()); }}>Nueva cuenta</Button>
      </div>
      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
      {accounts.length === 0 && <Card>Todavía no hay cuentas. Crea la primera con el saldo real de hoy.</Card>}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          {accounts.map((account) => {
            const id = docId(account);
            return (
              <button key={id} type="button" onClick={() => setSelected(id)} className="block w-full text-left">
                <Card className={selected === id ? 'border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-900' : ''}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <PlatformLogo name={account.platform} />
                      <div className="min-w-0">
                        <p className="font-black">{account.name}</p>
                        <p className="text-xs font-medium text-slate-500">{account.platform} · {KIND_LABEL[account.kind]} · {account.tracking === 'positions' ? 'Saldo + activos' : 'Solo saldo'}</p>
                      </div>
                    </div>
                    <p className="font-black">{formatNumber(account.balance)} {account.currency}</p>
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-400">Actualizado {formatDay(account.balanceUpdatedAt?.slice(0, 10) || account.updatedAt?.slice(0, 10))}{account.archived ? ' · archivada' : ''}</p>
                </Card>
              </button>
            );
          })}
        </div>
        {current && (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <PlatformLogo name={current.platform} size={52} />
                <div>
                <h2 className="text-xl font-black">{current.name}</h2>
                <p className="text-sm text-slate-500">{current.tracking === 'positions' ? 'El saldo es efectivo. Los activos se suman aparte: con la cotización si el símbolo se reconoce, o con el precio que escribas.' : 'El saldo es el valor de la cuenta. Los activos que añadas aquí no se vuelven a sumar.'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => {
                  setEditingId(docId(current));
                  setDraft({
                    name: current.name,
                    platform: current.platform,
                    kind: current.kind,
                    tracking: current.tracking,
                    currency: current.currency,
                    balance: String(current.balance),
                    eurPerUnit: current.eurPerUnit == null ? '' : String(current.eurPerUnit),
                    notes: current.notes || '',
                    publicAddress: current.publicAddress || '',
                  });
                }}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={async () => {
                  await api(`/api/accounts/${docId(current)}`, { method: 'PATCH', body: JSON.stringify({ archived: !current.archived }) });
                  await load();
                }}>{current.archived ? 'Restaurar' : 'Archivar'}</Button>
              </div>
            </div>
            {current.publicAddress && <p className="mt-3 break-all text-xs font-medium text-slate-500">Dirección pública: {current.publicAddress}</p>}
            {current.tracking === 'positions' && (
              <div className="mt-5 space-y-3">
                <h3 className="font-black">Activos</h3>
                {currentHoldings.map((item) => (
                  <HoldingLine key={docId(item)} item={item} onPrice={(price) => updatePrice(item, price)} onDelete={async () => {
                    await api(`/api/holdings/${docId(item)}`, { method: 'DELETE' });
                    await load();
                  }} />
                ))}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input label="Nombre" value={holding.name} onChange={(e) => setHolding({ ...holding, name: e.target.value })} placeholder="MSCI World o BTC" />
                  <Input label="Símbolo" value={holding.symbol} onChange={(e) => setHolding({ ...holding, symbol: e.target.value })} placeholder="BTC" />
                  <Field label="Tipo">
                    <select className={fieldClass} value={holding.assetClass} onChange={(e) => setHolding({ ...holding, assetClass: e.target.value })}>
                      {Object.entries(CLASS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Input label="Cantidad" type="number" min="0" step="any" value={holding.quantity} onChange={(e) => setHolding({ ...holding, quantity: e.target.value })} />
                  <Input label="Precio manual por unidad" type="number" min="0" step="any" value={holding.unitMarketValue} onChange={(e) => setHolding({ ...holding, unitMarketValue: e.target.value })} placeholder="Opcional" />
                  <Input label="Coste total de compra" type="number" min="0" step="any" value={holding.costBasis} onChange={(e) => setHolding({ ...holding, costBasis: e.target.value })} placeholder="No es el valor actual" />
                </div>
                <p className="text-xs font-medium text-slate-500">El coste no se usa como precio. En cripto, acciones y ETF el símbolo se enlaza con la cotización. Si dejas el precio vacío y no hay cotización, el activo queda fuera del patrimonio.</p>
                {(holding.assetClass === 'crypto' || holding.assetClass === 'stock' || holding.assetClass === 'etf') && (
                  <QuotePicker
                    assetClass={holding.assetClass}
                    selected={holding.quoteId}
                    onPick={(item) => setHolding({ ...holding, name: holding.name || item.name, symbol: item.symbol.slice(0, 20), quoteSource: item.source, quoteId: item.externalId })}
                  />
                )}
                <Button onClick={saveHolding} disabled={!holding.name || !holding.quantity}>Añadir activo</Button>
              </div>
            )}
          </Card>
        )}
      </div>
      {draft && (
        <Modal wide title={editingId ? 'Editar cuenta' : 'Nueva cuenta'} onClose={() => setDraft(null)}>
          <Catalog
            query={catalogQuery}
            group={catalogGroup}
            selected={draft.platform}
            onQuery={setCatalogQuery}
            onGroup={setCatalogGroup}
            onPick={(preset) => {
              const known = PLATFORMS.some((item) => item.name === draft.name);
              setDraft({
                ...draft,
                name: !draft.name || known ? preset.name : draft.name,
                platform: preset.name,
                kind: preset.kind,
                tracking: preset.tracking,
              });
            }}
          />
          <div className="grid gap-3">
            <Input label="Nombre" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input label="Plataforma" value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <select className={fieldClass} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                  {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Seguimiento">
                <select className={fieldClass} value={draft.tracking} onChange={(e) => setDraft({ ...draft, tracking: e.target.value as Draft['tracking'] })}>
                  <option value="balance">El saldo ya es el total</option>
                  <option value="positions">Saldo en efectivo + activos</option>
                </select>
              </Field>
              <Input label="Moneda" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
              <Input label="Saldo actual" type="number" step="any" value={draft.balance} onChange={(e) => setDraft({ ...draft, balance: e.target.value })} />
            </div>
            {draft.currency !== 'EUR' && <Input label="Euros por cada unidad" type="number" step="any" value={draft.eurPerUnit} onChange={(e) => setDraft({ ...draft, eurPerUnit: e.target.value })} placeholder="Tipo de cambio manual" />}
            {(draft.kind === 'wallet' || draft.kind === 'exchange') && <Input label="Dirección pública" value={draft.publicAddress} onChange={(e) => setDraft({ ...draft, publicAddress: e.target.value })} placeholder="Nunca la frase semilla" />}
            <Field label="Notas">
              <textarea className={fieldClass} rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
            <Button onClick={saveAccount}>Guardar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Catalog({
  query,
  group,
  selected,
  onQuery,
  onGroup,
  onPick,
}: {
  query: string;
  group: PlatformGroup | 'Todas';
  selected: string;
  onQuery: (value: string) => void;
  onGroup: (value: PlatformGroup | 'Todas') => void;
  onPick: (preset: PlatformPreset) => void;
}) {
  const visible = PLATFORMS.filter((item) => {
    const inGroup = group === 'Todas' || item.group === group;
    const matches = item.name.toLowerCase().includes(query.trim().toLowerCase());
    return inGroup && matches;
  });
  const current = PLATFORMS.find((item) => item.name === selected);
  return (
    <div className="mb-5 space-y-3">
      <Input label="Buscar plataforma" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="BBVA, Binance, Phantom…" />
      <div className="flex flex-wrap gap-1">
        {(['Todas', ...PLATFORM_GROUPS] as const).map((item) => (
          <button key={item} type="button" onClick={() => onGroup(item)} className={cn('rounded-full px-3 py-1.5 text-xs font-bold', group === item ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
            {item}
          </button>
        ))}
      </div>
      <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-2 text-center',
              selected === item.name ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800',
            )}
          >
            <PlatformLogo name={item.name} size={48} />
            <span className="line-clamp-2 text-[11px] font-bold leading-tight">{item.name}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 && <p className="text-sm font-medium text-slate-500">No hay ninguna con ese nombre. Escríbelo abajo y se guardará igual.</p>}
      {current && <p className="text-xs font-medium text-slate-500">{current.hint}</p>}
    </div>
  );
}

function QuotePicker({ assetClass, selected, onPick }: { assetClass: string; selected: string; onPick: (item: QuoteCandidate) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuoteCandidate[]>([]);
  const [note, setNote] = useState('');
  const search = async () => {
    setNote('');
    try {
      const data = await api<{ results: QuoteCandidate[] }>(`/api/market/search?q=${encodeURIComponent(query)}&assetClass=${encodeURIComponent(assetClass)}`);
      setResults(data.results);
      if (!data.results.length) setNote('No hay una cotización con ese nombre.');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'La búsqueda no ha respondido.');
    }
  };
  return (
    <div className="space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950">
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">Cotización</p>
      <div className="flex gap-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bitcoin, VWCE, AAPL…" />
        <Button type="button" size="sm" variant="outline" onClick={() => void search()} disabled={query.trim().length < 2}>Buscar</Button>
      </div>
      {note && <p className="text-xs font-medium text-amber-600">{note}</p>}
      <div className="flex flex-wrap gap-2">
        {results.map((item) => (
          <button key={item.externalId} type="button" onClick={() => onPick(item)} className={cn('rounded-full px-3 py-1.5 text-xs font-bold', selected === item.externalId ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-200')}>
            {item.symbol} · {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function HoldingLine({ item, onPrice, onDelete }: { item: HoldingRow; onPrice: (price: string) => void; onDelete: () => void }) {
  const [price, setPrice] = useState(item.unitMarketValue == null ? '' : String(item.unitMarketValue));
  const live = item.priceSource === 'market';
  const value = price === '' ? null : Number(price) * item.quantity;
  const up = (item.change24hPct ?? 0) > 0;
  return (
    <div className="rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          {item.quoteImage && <img src={item.quoteImage} alt="" width={36} height={36} referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" />}
          <div>
            <p className="font-bold">{item.name} {item.symbol && <span className="text-slate-400">{item.symbol}</span>}</p>
            <p className="text-xs text-slate-500">{CLASS_LABEL[item.assetClass]} · {formatNumber(item.quantity, 8)} · coste {item.costBasis == null ? 'desconocido' : formatEur(item.costBasis)}</p>
          </div>
        </div>
        <button type="button" onClick={onDelete} className="text-xs font-bold text-rose-500">Quitar</button>
      </div>
      {live ? (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-lg font-black">{formatPrice(item.unitMarketValue)}</p>
            <p className={cn('text-sm font-black', up ? 'text-[#16c784]' : (item.change24hPct ?? 0) < 0 ? 'text-[#ea3943]' : 'text-slate-400')}>{formatPct(item.change24hPct)}</p>
          </div>
          <p className="text-xs font-medium text-slate-500">Cotización · {item.valuedAt ? formatAgo(item.valuedAt) : 'sin lectura'} · posición {value == null || Number.isNaN(value) ? 'sin valorar' : formatEur(value)}</p>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-end gap-2">
            <Input label="Precio manual" type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => onPrice(price)}>Guardar</Button>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500">Valor de la posición: {value == null || Number.isNaN(value) ? 'sin valorar' : formatEur(value)} · {item.valuedAt ? `precio del ${formatDay(item.valuedAt.slice(0, 10))}` : 'sin fecha de precio'}</p>
        </>
      )}
    </div>
  );
}
