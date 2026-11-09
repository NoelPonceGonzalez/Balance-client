import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, fieldClass } from '@/components/ui/Input';
import { Modal } from '@/components/Modal';
import { api, ApiError } from '@/lib/api';
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
  };
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onDelete?: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

function emptyExtra() {
  return { description: '', category: '', fee: '', date: today(), counterAccountId: '', holdingId: '', otherHoldingId: '', quantity: '', otherQuantity: '' };
}

export function EntrySheet({ accounts, pieces, accountId, verb, allowed, editing, initial, onClose, onSaved, onDelete }: Props) {
  const [siteId, setSiteId] = useState(accountId);
  const [chosen, setChosen] = useState<VerbId>(verb);
  const [amount, setAmount] = useState(initial?.amount || '');
  const [more, setMore] = useState(Boolean(editing));
  const [extra, setExtra] = useState({ ...emptyExtra(), ...initial, date: initial?.date || today() });
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const site = accounts.find((item) => item.id === siteId) || accounts[0];
  const allVerbs = site ? verbsFor(site.kind, site.tracking) : [];
  const narrowed = allowed?.length ? allVerbs.filter((item) => allowed.includes(item.id)) : allVerbs;
  const verbs = narrowed.length ? narrowed : allVerbs;
  const active = verbs.some((item) => item.id === chosen) ? chosen : verbs[0]?.id || 'out';
  const mine = useMemo(() => pieces.filter((item) => item.accountId === site?.id), [pieces, site?.id]);
  const needsPiece = verbNeedsPiece(active);
  const balanceVerb = active === 'balance' && !editing;

  const post = async (body: Record<string, unknown>, confirmDuplicate: boolean) => {
    const payload = { ...body, confirmDuplicate };
    if (editing) await api(`/api/movements/${editing}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else await api('/api/movements', { method: 'POST', body: JSON.stringify(payload) });
  };

  const save = async (confirmDuplicate = false) => {
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
      applyToBalances: (site.currency || 'EUR') === 'EUR',
    };
    try {
      if (!(value > 0) && active !== 'add' && active !== 'remove') throw new Error('Escribe el importe.');
      if (active === 'pass' && !extra.counterAccountId) throw new Error('Elige el otro sitio.');
      if (needsPiece && !extra.holdingId) throw new Error('Elige la pieza.');
      if ((active === 'buy' || active === 'sell' || active === 'swap') && !(Number(extra.quantity) > 0)) throw new Error('Escribe la cantidad.');
      if (active === 'swap' && (!extra.otherHoldingId || !(Number(extra.otherQuantity) > 0))) throw new Error('Elige la otra pieza y su cantidad.');
      if (active === 'in') await post({ ...base, type: 'income', amount: value }, confirmDuplicate);
      else if (active === 'out') await post({ ...base, type: 'expense', amount: value }, confirmDuplicate);
      else if (active === 'pass') await post({ ...base, type: 'transfer', amount: value, counterAccountId: extra.counterAccountId }, confirmDuplicate);
      else if (active === 'deposit') await post({ ...base, type: 'deposit', amount: value }, confirmDuplicate);
      else if (active === 'withdraw') await post({ ...base, type: 'withdrawal', amount: value }, confirmDuplicate);
      else if (active === 'dividend') await post({ ...base, type: 'reward', amount: value, category: extra.category || 'Dividendo' }, confirmDuplicate);
      else if (active === 'buy') await post({ ...base, type: 'buy', amount: value, holdingId: extra.holdingId, quantity }, confirmDuplicate);
      else if (active === 'sell') await post({ ...base, type: 'sell', amount: value, holdingId: extra.holdingId, quantity }, confirmDuplicate);
      else if (active === 'add' || active === 'remove') {
        const count = Number(extra.quantity || amount);
        if (!(count > 0)) throw new Error('Escribe la cantidad.');
        await post({ ...base, type: 'adjustment', amount: count, quantity: count, holdingId: extra.holdingId, direction: active === 'add' ? 'in' : 'out', description: extra.description || (active === 'add' ? 'Añadir' : 'Quitar') }, confirmDuplicate);
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
  return (
    <Modal title={verbs.find((item) => item.id === active)?.label || 'Apuntar'} onClose={onClose}>
      <div className="grid gap-4">
        {accounts.length > 1 && !editing && (
          <Field label="Sitio">
            <select className={fieldClass} value={site.id} onChange={(event) => { setSiteId(event.target.value); setChosen(verbsFor(accounts.find((item) => item.id === event.target.value)?.kind || '', accounts.find((item) => item.id === event.target.value)?.tracking || '')[0]?.id || 'out'); }}>
              {accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          {verbs.map((item) => (
            <button key={item.id} type="button" onClick={() => setChosen(item.id)} className={cn('rounded-full px-3 py-1.5 text-sm font-semibold', item.id === active ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 ring-1 ring-slate-200 dark:ring-white/15')}>
              {item.label}
            </button>
          ))}
        </div>
        <Input label={balanceVerb ? 'El saldo es' : active === 'add' || active === 'remove' ? 'Cantidad' : 'Importe'} type="number" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
        {needsPiece && (
          <Field label="Pieza">
            <select className={fieldClass} value={extra.holdingId} onChange={(event) => setExtra({ ...extra, holdingId: event.target.value })}>
              <option value="">Elige</option>
              {mine.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        )}
        {(active === 'buy' || active === 'sell' || active === 'swap') && (
          <Input label="Cantidad" type="number" step="any" value={extra.quantity} onChange={(event) => setExtra({ ...extra, quantity: event.target.value })} />
        )}
        {active === 'swap' && (
          <>
            <Field label="La otra pieza">
              <select className={fieldClass} value={extra.otherHoldingId} onChange={(event) => setExtra({ ...extra, otherHoldingId: event.target.value })}>
                <option value="">Elige</option>
                {mine.filter((item) => item.id !== extra.holdingId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Input label="Cantidad que entra" type="number" step="any" value={extra.otherQuantity} onChange={(event) => setExtra({ ...extra, otherQuantity: event.target.value })} />
          </>
        )}
        {active === 'pass' && (
          <Field label="Hacia">
            <select className={fieldClass} value={extra.counterAccountId} onChange={(event) => setExtra({ ...extra, counterAccountId: event.target.value })}>
              <option value="">Elige</option>
              {accounts.filter((item) => item.id !== site.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        )}
        <button type="button" onClick={() => setMore((value) => !value)} className="text-left text-sm font-semibold text-slate-400">{more ? 'Menos' : 'Más'}</button>
        {more && (
          <div className="grid gap-3">
            <Input label="Fecha" type="date" value={extra.date} onChange={(event) => setExtra({ ...extra, date: event.target.value })} />
            <Field label="Categoría">
              <input list="entry-categories" className={fieldClass} value={extra.category} onChange={(event) => setExtra({ ...extra, category: event.target.value })} />
              <datalist id="entry-categories">{CATEGORIES.map((item) => <option key={item} value={item} />)}</datalist>
            </Field>
            <Input label="Descripción" value={extra.description} onChange={(event) => setExtra({ ...extra, description: event.target.value })} />
            <Input label="Comisión" type="number" step="any" value={extra.fee} onChange={(event) => setExtra({ ...extra, fee: event.target.value })} placeholder="No se resta otra vez" />
          </div>
        )}
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {onDelete ? <Button variant="outline" onClick={onDelete}>Eliminar</Button> : <span />}
          <div className="flex gap-2">
            {duplicate && <Button variant="outline" onClick={() => save(true)}>Guardar igualmente</Button>}
            <Button onClick={() => save(false)} disabled={saving}>{saving ? 'Guardando' : 'Guardar'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
