import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, fieldClass } from '@/components/ui/Input';
import { Modal } from '@/components/Modal';
import { PlatformLogo } from '@/components/PlatformLogo';
import { SearchPick } from '@/components/SearchPick';
import { playFlip } from '@/lib/flip';
import { api, ApiError } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { CATEGORIES } from '@/lib/labels';
import { verbNeedsPiece, verbsFor, type VerbId } from '@/lib/verbs';
import { cn } from '@/lib/utils';

export interface SheetAccount {
  id: string;
  name: string;
  kind: string;
  tracking: string;
  currency: string;
  balance: number;
  pricedOn?: string | null;
}

export interface SheetPiece {
  id: string;
  accountId: string;
  name: string;
}

interface Props {
  accounts: SheetAccount[];
  pieces: SheetPiece[];
  accountId: string;
  verb: VerbId;
  allowed?: VerbId[];
  editing?: string | null;
  initial?: {
    amount: string;
    date: string;
    description: string;
    category: string;
    fee: string;
    counterAccountId: string;
    holdingId: string;
    otherHoldingId: string;
    quantity: string;
    otherQuantity: string;
    applyToBalances?: boolean;
  };
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onDelete?: () => void;
  /** Movimiento que se edita, tal como se ve en su fila: sus piezas vuelan desde la fila hasta aquí. */
  identity?: { logo: string; title: string; caption: string; amount: string; tone?: string };
}

const today = () => new Date().toISOString().slice(0, 10);

function emptyExtra() {
  return { description: '', category: '', fee: '', date: today(), counterAccountId: '', holdingId: '', otherHoldingId: '', quantity: '', otherQuantity: '' };
}

export function EntrySheet({ accounts, pieces, accountId, verb, allowed, editing, initial, onClose, onSaved, onDelete, identity }: Props) {
  const [siteId, setSiteId] = useState(accountId);
  const [chosen, setChosen] = useState<VerbId>(verb);
  const [amount, setAmount] = useState(initial?.amount || '');
  const [more, setMore] = useState(Boolean(editing));
  const [extra, setExtra] = useState({ ...emptyExtra(), ...initial, date: initial?.date || today() });
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [choice, setChoice] = useState<boolean | null>(editing && initial?.applyToBalances != null ? initial.applyToBalances : null);
  // Bloque D: cambios sin guardar (se pregunta antes de cerrar) y un solo envío a la vez.
  const snap = JSON.stringify([siteId, chosen, amount, extra, choice]);
  const startSnap = useRef(snap);
  const dirty = snap !== startSnap.current;
  const sending = useRef(false);
  const site = accounts.find((item) => item.id === siteId) || accounts[0];
  const allVerbs = site ? verbsFor(site.kind, site.tracking) : [];
  const narrowed = allowed?.length ? allVerbs.filter((item) => allowed.includes(item.id)) : allVerbs;
  const verbs = narrowed.length ? narrowed : allVerbs;
  const active = verbs.some((item) => item.id === chosen) ? chosen : verbs[0]?.id || 'out';
  const mine = useMemo(() => pieces.filter((item) => item.accountId === site?.id), [pieces, site?.id]);
  const needsPiece = verbNeedsPiece(active);
  const balanceVerb = active === 'balance' && !editing;
  const moveDay = (extra.date || today()).slice(0, 10);
  const pricedDay = (site?.pricedOn || '').slice(0, 10);
  const alreadyInside = Boolean(pricedDay && moveDay <= pricedDay);
  const eur = (site?.currency || 'EUR').toUpperCase() === 'EUR';
  const coinPass = active === 'pass' && Boolean(extra.holdingId);
  const apply = coinPass || (eur && (active === 'balance' || (choice != null ? choice : !alreadyInside)));

  const post = async (body: Record<string, unknown>, confirmDuplicate: boolean) => {
    const payload = { ...body, confirmDuplicate };
    if (editing) await api(`/api/movements/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else await api('/api/movements', { method: 'POST', body: JSON.stringify(payload) });
  };

  const save = async (confirmDuplicate = false) => {
    if (sending.current) return;
    sending.current = true;
    try {
      await send(confirmDuplicate);
    } finally {
      sending.current = false;
    }
  };

  const send = async (confirmDuplicate = false) => {
    if (!site) return;
    setError('');
    setSaving(true);
    const value = Number(amount);
    const quantity = extra.quantity === '' ? null : Number(extra.quantity);
    const fee = extra.fee === '' ? null : Number(extra.fee);
    const base = {
      date: extra.date || today(),
      currency: site.currency || 'EUR',
      category: extra.category,
      description: extra.description,
      accountId: site.id,
      fee,
      applyToBalances: apply,
    };
    try {
      if (!(value > 0) && active !== 'add' && active !== 'remove') throw new Error('Escribe el importe.');
      if (active === 'pass' && !extra.counterAccountId) throw new Error('Elige el otro sitio.');
      if (coinPass && !(Number(extra.quantity) > 0)) throw new Error('Escribe la cantidad.');
      if (needsPiece && !extra.holdingId) throw new Error('Elige la pieza.');
      if ((active === 'buy' || active === 'sell' || active === 'swap') && !(Number(extra.quantity) > 0)) throw new Error('Escribe la cantidad.');
      if (active === 'swap' && (!extra.otherHoldingId || !(Number(extra.otherQuantity) > 0))) throw new Error('Elige la otra pieza y su cantidad.');
      if (active === 'in') await post({ ...base, type: 'income', amount: value }, confirmDuplicate);
      else if (active === 'out') await post({ ...base, type: 'expense', amount: value }, confirmDuplicate);
      else if (active === 'pass' && extra.holdingId) {
        const piece = pieces.find((item) => item.id === extra.holdingId);
        const dest = pieces.find((item) => item.accountId === extra.counterAccountId && item.name.trim().toLowerCase() === (piece?.name || '').trim().toLowerCase());
        if (!dest) throw new Error('Esa moneda tiene que estar ya en el otro sitio.');
        await post({
          ...base,
          type: 'transfer',
          amount: value,
          counterAccountId: extra.counterAccountId,
          holdingId: extra.holdingId,
          counterHoldingId: dest.id,
          quantity,
          description: extra.description || piece?.name || '',
          applyToBalances: true,
        }, confirmDuplicate);
      } else if (active === 'pass') await post({ ...base, type: 'transfer', amount: value, counterAccountId: extra.counterAccountId }, confirmDuplicate);
      else if (active === 'deposit') await post({ ...base, type: 'deposit', amount: value }, confirmDuplicate);
      else if (active === 'withdraw') await post({ ...base, type: 'withdrawal', amount: value }, confirmDuplicate);
      else if (active === 'dividend') await post({ ...base, type: 'reward', amount: value, category: extra.category || 'Dividendo' }, confirmDuplicate);
      else if (active === 'buy') await post({ ...base, type: 'buy', amount: value, holdingId: extra.holdingId, quantity }, confirmDuplicate);
      else if (active === 'sell') await post({ ...base, type: 'sell', amount: value, holdingId: extra.holdingId, quantity }, confirmDuplicate);
      else if (active === 'add' || active === 'remove') {
        const count = Number(extra.quantity || amount);
        if (!(count > 0)) throw new Error('Escribe la cantidad.');
        await post({ ...base, type: 'adjustment', amount: count, quantity: count, holdingId: extra.holdingId, direction: active === 'add' ? 'in' : 'out', description: extra.description || (active === 'add' ? 'Añadir' : 'Sacar') }, confirmDuplicate);
      } else if (active === 'balance') {
        const target = value;
        const delta = editing ? target : target - site.balance;
        if (Math.abs(delta) < 0.005) throw new Error('El saldo ya es ese.');
        await post({ ...base, type: 'adjustment', amount: Math.abs(delta), direction: delta > 0 ? 'in' : 'out', description: extra.description || 'Este es el saldo' }, confirmDuplicate);
      } else if (active === 'swap') {
        await post({ ...base, type: 'sell', amount: value, holdingId: extra.holdingId, quantity, description: extra.description || 'Cambio' }, confirmDuplicate);
        await post({ ...base, type: 'buy', amount: value, holdingId: extra.otherHoldingId, quantity: Number(extra.otherQuantity), description: extra.description || 'Cambio' }, true);
      }
      await onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate') setDuplicate(true);
      else setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (!site) return null;
  const amountLabel = balanceVerb ? 'El saldo es' : active === 'add' || active === 'remove' ? 'Cantidad' : coinPass ? 'Valor en euros' : 'Importe';
  const unit = active === 'add' || active === 'remove' ? '' : eur || coinPass ? '€' : (site.currency || '').toUpperCase();
  return (
    <Modal
      title={verbs.find((item) => item.id === active)?.label || 'Apuntar'}
      onClose={onClose}
      dirty={dirty}
      busy={saving}
      entrance={identity ? 'fade' : 'sheet'}
      onShown={identity ? (panel) => playFlip(panel) : undefined}
    >
      <div className="grid gap-4">
        {identity && (
          <div className="-mt-1 flex items-center gap-3 rounded-[22px] bg-slate-50 px-3 py-3 dark:bg-white/[0.05]">
            <span data-flip-to="logo" className="shrink-0"><PlatformLogo name={identity.logo} size={40} /></span>
            <span className="min-w-0 flex-1">
              <span data-flip-to="name" className="block truncate text-[16px] font-semibold">{identity.title}</span>
              <span className="mt-0.5 block truncate text-[13px] font-medium text-slate-400">{identity.caption}</span>
            </span>
            <span data-flip-to="value" className={cn('shrink-0 text-right text-[16px] font-semibold tabular-nums', identity.tone)}>{identity.amount}</span>
          </div>
        )}
        <label className="block min-w-0">
          <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">{amountLabel}</span>
          <span className="mt-1.5 flex items-baseline gap-2 rounded-[22px] border border-slate-200/90 bg-white/90 px-4 py-2.5 transition-shadow focus-within:border-slate-300 focus-within:ring-4 focus-within:ring-slate-900/[0.06] dark:border-white/10 dark:bg-white/5 dark:focus-within:ring-white/10">
            <input
              type="number"
              step="any"
              inputMode="decimal"
              enterKeyHint="done"
              placeholder="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="amount-field w-0 min-w-0 flex-1 bg-transparent text-[30px] font-semibold leading-tight tracking-tight tabular-nums text-slate-900 outline-none placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-600"
            />
            {unit && <span className="shrink-0 text-[17px] font-semibold text-slate-400" aria-hidden>{unit}</span>}
          </span>
        </label>
        {accounts.length > 1 && !editing && (
          <SearchPick
            label="Sitio"
            value={site.id}
            options={accounts.map((item) => ({ id: item.id, label: item.name }))}
            onChange={(id) => { setSiteId(id); setChosen(verbsFor(accounts.find((item) => item.id === id)?.kind || '', accounts.find((item) => item.id === id)?.tracking || '')[0]?.id || 'out'); }}
          />
        )}
        {needsPiece && (
          <SearchPick label="Pieza" empty="Elige" value={extra.holdingId} options={mine.map((item) => ({ id: item.id, label: item.name }))} onChange={(id) => setExtra({ ...extra, holdingId: id })} />
        )}
        {(active === 'buy' || active === 'sell' || active === 'swap') && (
          <Input label="Cantidad" type="number" step="any" value={extra.quantity} onChange={(event) => setExtra({ ...extra, quantity: event.target.value })} />
        )}
        {active === 'swap' && (
          <>
            <SearchPick label="La otra pieza" empty="Elige" value={extra.otherHoldingId} options={mine.filter((item) => item.id !== extra.holdingId).map((item) => ({ id: item.id, label: item.name }))} onChange={(id) => setExtra({ ...extra, otherHoldingId: id })} />
            <Input label="Cantidad que entra" type="number" step="any" value={extra.otherQuantity} onChange={(event) => setExtra({ ...extra, otherQuantity: event.target.value })} />
          </>
        )}
        {active === 'pass' && (
          <>
            <SearchPick label="Hacia" empty="Elige" value={extra.counterAccountId} options={accounts.filter((item) => item.id !== site.id).map((item) => ({ id: item.id, label: item.name }))} onChange={(id) => setExtra({ ...extra, counterAccountId: id })} />
            {mine.length > 0 && (
              <SearchPick label="Moneda" empty="Solo euros" value={extra.holdingId} options={mine.map((item) => ({ id: item.id, label: item.name }))} onChange={(id) => setExtra({ ...extra, holdingId: id })} />
            )}
            {coinPass && <Input label="Cantidad" type="number" step="any" value={extra.quantity} onChange={(event) => setExtra({ ...extra, quantity: event.target.value })} />}
            {coinPass && <p className="text-[13px] font-medium leading-snug text-slate-500">Pasa la moneda con su coste. El efectivo se queda y no tributa.</p>}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {verbs.map((item) => (
            <button key={item.id} type="button" onClick={() => setChosen(item.id)} className={cn('rounded-full px-3 py-1.5 text-sm font-semibold', item.id === active ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 ring-1 ring-slate-200 dark:ring-white/15')}>
              {item.label}
            </button>
          ))}
        </div>
        <Input label="Fecha" type="date" value={extra.date} onChange={(event) => setExtra({ ...extra, date: event.target.value })} />
        {eur && active !== 'balance' && !coinPass && (
          <label className="flex items-start gap-3 rounded-[20px] bg-slate-100 px-4 py-3 text-[13px] font-medium leading-snug text-slate-600 dark:bg-white/10 dark:text-slate-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={apply}
              onChange={(event) => setChoice(event.target.checked)}
            />
            <span>
              {pricedDay ? `El efectivo es del ${formatDay(pricedDay)}. ` : ''}
              {apply ? 'Se guarda para la renta y también cambia el saldo.' : 'Se guarda para la renta y no vuelve a cambiar el saldo ni la pieza.'}
            </span>
          </label>
        )}
        <button type="button" onClick={() => setMore((value) => !value)} className="text-left text-sm font-semibold text-slate-400">{more ? 'Menos' : 'Más'}</button>
        {more && (
          <div className="grid gap-3">
            <Field label="Categoría">
              <input list="entry-categories" className={fieldClass} value={extra.category} onChange={(event) => setExtra({ ...extra, category: event.target.value })} />
              <datalist id="entry-categories">{CATEGORIES.map((item) => <option key={item} value={item} />)}</datalist>
            </Field>
            <Input label="Descripción" value={extra.description} onChange={(event) => setExtra({ ...extra, description: event.target.value })} />
            <Input label="Comisión" type="number" step="any" value={extra.fee} onChange={(event) => setExtra({ ...extra, fee: event.target.value })} placeholder="No se resta otra vez" />
          </div>
        )}
        {error && <p role="alert" className="text-sm font-medium text-rose-600">{error}</p>}
        <div className="sticky bottom-[-1.25rem] -mx-5 -mb-5 flex items-center justify-between gap-2 border-t border-slate-100 bg-white/90 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90">
          {onDelete ? <button type="button" onClick={onDelete} disabled={saving} className="rounded-full px-2 py-2 text-sm font-semibold text-rose-600 disabled:opacity-50 dark:text-rose-400">Eliminar</button> : <span />}
          <div className="flex gap-2">
            {duplicate && <Button variant="outline" onClick={() => save(true)} disabled={saving}>Guardar igualmente</Button>}
            <Button onClick={() => save(false)} disabled={saving} aria-busy={saving || undefined}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
