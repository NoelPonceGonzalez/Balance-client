import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Link2, Plus } from 'lucide-react';
import { Modal, ModalClose, modalPanelClass, Overlay } from '@/components/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { formatEur } from '@/lib/format';
import { cn, docId } from '@/lib/utils';
import type { PlanRow, TripExpense, TripSplit } from '@/lib/types';

type PayStatus = 'preview' | 'pending' | 'awaiting_confirmation' | 'confirmed' | 'disputed';

interface PayRow {
  id: string;
  fromId: string;
  toId: string;
  from: string;
  to: string;
  amount: number;
  status: PayStatus;
  openedAt?: string;
  events?: { at?: string; userId?: string; action: string; note?: string }[];
}

interface ExpenseDraft {
  id: string | null;
  name: string;
  amount: string;
  paidBy: string;
  all: boolean;
  among: string[];
}

function phaseOf(plan: PlanRow): 'active' | 'settling' | 'done' {
  if (plan.tripStatus === 'settling' || plan.tripStatus === 'done') return plan.tripStatus;
  return 'active';
}

function when(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function statusLabel(status: PayStatus): string {
  if (status === 'awaiting_confirmation') return 'Esperando confirmación';
  if (status === 'confirmed') return 'Confirmado';
  if (status === 'disputed') return 'No recibido';
  if (status === 'preview') return 'Al finalizar';
  return 'Pendiente';
}

function statusClass(status: PayStatus): string {
  if (status === 'confirmed') return 'text-[#16c784]';
  if (status === 'disputed') return 'text-[#ea3943]';
  if (status === 'awaiting_confirmation') return 'text-amber-600';
  return 'text-slate-400';
}

const cardClass = 'rounded-2xl border border-white/70 bg-white/80 p-4 shadow-lg shadow-slate-900/5 dark:border-white/10 dark:bg-slate-900/60';
const quiet = 'border border-slate-200/90 bg-white text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 dark:text-white';
const chipOn = 'border-slate-200 bg-slate-100 text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-white';

function Mark({ name, color, light = false }: { name: string; color: string; light?: boolean }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full font-black text-white', light ? 'h-7 w-7 text-[11px]' : 'h-10 w-10 text-sm')} style={{ background: color }}>
      {(name.trim().slice(0, 1) || '?').toUpperCase()}
    </span>
  );
}

function spotsOf(people: TripSplit['people']) {
  const max = Math.max(1, ...people.map((person) => Math.abs(person.net)));
  const even = people.every((person) => Math.abs(person.net) < 0.005);
  const span = Math.min(36, Math.max(0, people.length - 1) * 6);
  return people.map((person, index) => ({
    person,
    x: even ? 50 + (people.length <= 1 ? 0 : (index / (people.length - 1) - 0.5) * span) : 50 + (person.net / max) * 42,
  }));
}

function StandLine({ people, open, onToggle }: { people: TripSplit['people']; open: boolean; onToggle: () => void }) {
  const spots = spotsOf(people);
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-label="Dónde está cada uno" className="relative block h-5 w-full text-left">
      <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-900/10 dark:bg-white/15" />
      {spots.map(({ person, x }) => (
        <span
          key={person.id}
          className="absolute top-1/2 grid h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[8px] font-black text-white ring-2 ring-[var(--app-bg)]"
          style={{ left: `${x}%`, background: person.color }}
        >
          {(person.name.trim().slice(0, 1) || '?').toUpperCase()}
        </span>
      ))}
    </button>
  );
}

export function TripFace({ plan, split, onMenu, userId = '' }: { plan: PlanRow; split?: TripSplit; onMenu: (rect: DOMRect) => void; userId?: string }) {
  const people = split?.people || [];
  const phase = phaseOf(plan);
  const mine = people.find((person) => person.id === userId);
  const line = phase === 'settling'
    ? 'En liquidación'
    : phase === 'done'
      ? 'Completado'
      : !mine || Math.abs(mine.net) < 0.005
        ? 'En paz'
        : mine.net > 0
          ? `Te deben ${formatEur(mine.net)}`
          : `Debes ${formatEur(-mine.net)}`;
  return (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-black">{plan.name}</span>
        <button
          type="button"
          data-menu
          aria-label="Editar o eliminar"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onMenu(event.currentTarget.getBoundingClientRect());
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400"
        >
          <span className="text-base leading-none">···</span>
        </button>
      </span>
      <span className="mt-2 block text-[11px] font-semibold text-slate-400">Reparto</span>
      <span className="mt-1 block whitespace-nowrap text-[clamp(1.35rem,6.2vw,1.85rem)] font-black leading-none tabular-nums sm:text-[28px]">{formatEur(split?.totalSpent || 0)}</span>
      <span className="relative mt-3 block h-1.5">
        <span className="block h-1.5 rounded-full bg-slate-200/80 dark:bg-white/10" />
        {spotsOf(people).map(({ person, x }) => (
          <span key={person.id} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-slate-900" style={{ left: `${x}%`, background: person.color }} />
        ))}
      </span>
      <span className={cn('mt-2 block text-[11px] font-semibold', phase === 'done' ? 'text-[#16c784]' : mine && mine.net < -0.005 ? 'text-[#ea3943]' : mine && mine.net > 0.005 ? 'text-[#16c784]' : 'text-slate-400')}>{line}</span>
    </>
  );
}

export function TripPlan({
  plan,
  split,
  userId,
  onBack,
  onChanged,
}: {
  plan: PlanRow;
  split?: TripSplit;
  userId: string;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const people = split?.people || [];
  const expenses = plan.tripExpenses || [];
  const phase = phaseOf(plan);
  const owner = String(plan.userId || '') === userId;
  const link = plan.joinCode ? `${window.location.origin}/?junta=${plan.joinCode}` : '';
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [finishAsk, setFinishAsk] = useState(false);
  const [reopenAsk, setReopenAsk] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [ask, setAsk] = useState<'pay' | 'got' | 'miss' | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [pot, setPot] = useState('');
  const [potOn, setPotOn] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);
  const [ticketBank, setTicketBank] = useState<Record<string, string>>({});
  const mineTickets = expenses.filter((expense) => expense.charge === 'pending' && String(expense.paidBy) === userId);

  useEffect(() => {
    if (mineTickets.length === 0) return undefined;
    let cancel = false;
    api<{ accounts: { _id: string; name: string; currency: string; archived?: boolean }[] }>('/api/accounts')
      .then((data) => {
        if (cancel) return;
        const euros = data.accounts.filter((account) => account.currency === 'EUR' && !account.archived).map((account) => ({ id: String(account._id), name: account.name }));
        setBanks(euros);
        setTicketBank((current) => {
          const next = { ...current };
          for (const expense of mineTickets) {
            const id = String(expense._id || '');
            if (id && !next[id] && euros[0]) next[id] = euros[0].id;
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [plan._id, mineTickets.length]);

  const nameOf = (id: string) => people.find((person) => person.id === String(id))?.name
    || expenses.find((expense) => String(expense.paidBy) === String(id))?.paidByName
    || 'Alguien';
  const colorOf = (id: string) => people.find((person) => person.id === String(id))?.color || '#94a3b8';

  const pays: PayRow[] = phase === 'active'
    ? (split?.transfers || []).map((row, index) => ({
      id: `live-${row.fromId}-${row.toId}-${index}`,
      fromId: row.fromId,
      toId: row.toId,
      from: row.from,
      to: row.to,
      amount: row.amount,
      status: 'preview',
    }))
    : (plan.settlements || []).map((row) => ({
      id: String(row._id || ''),
      fromId: String(row.fromId),
      toId: String(row.toId),
      from: nameOf(String(row.fromId)),
      to: nameOf(String(row.toId)),
      amount: row.amount,
      status: row.status,
      openedAt: row.openedAt,
      events: row.events,
    }));

  const selectedPerson = people.find((person) => person.id === personId) || null;
  const selectedPay = pays.find((row) => row.id === payId) || null;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!link) return;
    const text = `Entras en «${plan.name}»: ${link}`;
    setNotice('');
    if (navigator.share) {
      try {
        await navigator.share({ title: plan.name, text, url: link });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setNotice('Enlace copiado');
    } catch {
      setNotice('El enlace está arriba.');
    }
  };

  const leave = () => run(async () => {
    await api(`/api/plans/${docId(plan)}`, { method: 'DELETE' });
    onBack();
    await onChanged();
  });

  const finish = () => run(async () => {
    await api(`/api/plans/${docId(plan)}/cerrar`, { method: 'POST', body: '{}' });
    setFinishAsk(false);
    await onChanged();
  });

  const reopen = () => run(async () => {
    await api(`/api/plans/${docId(plan)}/reabrir`, { method: 'POST', body: '{}' });
    setReopenAsk(false);
    await onChanged();
  });

  const saveExpense = () => run(async () => {
    if (!draft) return;
    const value = Number(draft.amount);
    if (!draft.name.trim()) throw new Error('Ponle un nombre al gasto.');
    if (!(value > 0)) throw new Error('El importe tiene que ser mayor que cero.');
    if (!draft.all && draft.among.length === 0) throw new Error('Elige al menos a una persona.');
    const body = JSON.stringify({
      name: draft.name.trim(),
      amount: value,
      paidBy: draft.paidBy,
      category: '',
      splitAmong: draft.all ? [] : draft.among,
    });
    if (draft.id) await api(`/api/plans/${docId(plan)}/gasto/${draft.id}`, { method: 'PATCH', body });
    else await api(`/api/plans/${docId(plan)}/gasto`, { method: 'POST', body });
    setDraft(null);
    await onChanged();
  });

  const removeExpense = (expenseId: string) => run(async () => {
    await api(`/api/plans/${docId(plan)}/gasto/${expenseId}`, { method: 'DELETE' });
    setDraft(null);
    await onChanged();
  });

  const savePot = (id: string) => run(async () => {
    const value = Number(pot || 0);
    if (!Number.isFinite(value) || value < 0) throw new Error('Lo aportado no puede ser negativo.');
    await api(`/api/plans/${docId(plan)}/pot`, { method: 'PATCH', body: JSON.stringify({ userId: id, contributed: value }) });
    setPotOn(false);
    await onChanged();
  });

  const actPay = (path: 'pagado' | 'recibido' | 'no-recibido') => run(async () => {
    if (!selectedPay) return;
    await api(`/api/plans/${docId(plan)}/liquidacion/${selectedPay.id}/${path}`, { method: 'POST', body: '{}' });
    setAsk(null);
    await onChanged();
  });

  const openExpense = (expense?: TripExpense) => {
    const among = (expense?.splitAmong || []).map(String);
    setDraft({
      id: expense?._id ? String(expense._id) : null,
      name: expense?.name || '',
      amount: expense ? String(expense.amount) : '',
      paidBy: expense ? String(expense.paidBy) : userId,
      all: among.length === 0,
      among: among.length > 0 ? among : people.map((person) => person.id),
    });
  };

  const amongText = (expense: TripExpense) => {
    const ids = (expense.splitAmong || []).map(String);
    if (ids.length === 0) return 'Entre todos';
    const names = ids.map((id) => (id === userId ? 'ti' : nameOf(id))).filter(Boolean);
    return names.length > 0 ? `Entre ${names.join(', ')}` : 'Entre todos';
  };

  const phaseText = phase === 'settling' ? 'En liquidación' : phase === 'done' ? 'Completado' : 'En curso';

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-36">
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs font-bold">
          <span className="inline-flex min-w-0 items-center gap-2 text-slate-500">
            <button type="button" onClick={onBack} className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-white/80" aria-label="Todos los planes">
              <ChevronLeft size={16} />
            </button>
            <span className="truncate">{plan.name}</span>
            <span className="shrink-0 text-base font-black text-slate-900 dark:text-white">{formatEur(split?.totalSpent || 0)}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {phase === 'active' && (
              <button type="button" onClick={() => { if (leaveAsk) void leave(); else setLeaveAsk(true); }} className="text-[#ea3943]">
                {leaveAsk ? 'Confirmar' : 'Salir'}
              </button>
            )}
            {phase === 'active' && (
              <button type="button" onClick={() => void share()} className="inline-flex items-center gap-1 text-slate-500">
                <Link2 size={13} />
                Enlace
              </button>
            )}
            {owner && phase === 'active' && (
              <button type="button" onClick={() => setFinishAsk(true)} className="text-slate-500">Finalizar</button>
            )}
            {owner && phase !== 'active' && (
              <button type="button" onClick={() => setReopenAsk(true)} className="text-slate-500">Corregir</button>
            )}
          </span>
        </div>
        <StandLine people={people} open={peopleOpen} onToggle={() => setPeopleOpen((value) => !value)} />
        <p className="mt-1 flex items-center justify-between text-xs font-semibold text-slate-400">
          <span>Paga</span>
          <span className={phase === 'done' ? 'text-[#16c784]' : ''}>{phaseText}</span>
          <span>Recibe</span>
        </p>
      </div>
      {notice && <p className="text-xs font-semibold text-slate-500">{notice}</p>}
      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

      {mineTickets.map((expense) => {
        const id = String(expense._id || '');
        return (
          <section key={id} className={cardClass}>
            {expense.receipt && <img src={expense.receipt} alt="Tique" className="mb-3 h-28 w-full rounded-2xl object-cover" />}
            <p className="text-sm font-black">{expense.name}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{formatEur(expense.amount)}</p>
            <p className="mt-1 text-[13px] font-medium text-slate-500">Confirma que es tuyo. Se resta el 100% del banco que elijas.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {banks.map((bank) => (
                <button key={bank.id} type="button" onClick={() => setTicketBank({ ...ticketBank, [id]: bank.id })} className={cn('rounded-full border px-3 py-1.5 text-[12px] font-bold', ticketBank[id] === bank.id ? 'border-slate-200 bg-slate-100 text-slate-800' : 'border-slate-200 text-slate-500')}>{bank.name}</button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || !ticketBank[id]}
              onClick={() => {
                setBusy(true);
                setError('');
                api(`/api/plans/${plan._id}/gasto/${id}/aceptar`, { method: 'POST', body: JSON.stringify({ accountId: ticketBank[id] }) })
                  .then(() => onChanged())
                  .catch((err: Error) => { setError(err.message); setBusy(false); });
              }}
              className="mt-3 w-full rounded-2xl border border-slate-200/90 bg-white py-3 text-[14px] font-bold text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)] disabled:opacity-50"
            >
              Aceptar y restar el 100%
            </button>
          </section>
        );
      })}

      {peopleOpen && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-black/20">
          {people.map((person, index) => {
            const positive = person.net > 0.004;
            const negative = person.net < -0.004;
            return (
              <button key={person.id} type="button" onClick={() => { setPersonId(person.id); setPotOn(false); setPot(String(person.contributed || '')); }} className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left', index > 0 && 'border-t border-slate-200/70 dark:border-white/10')}>
                <Mark name={person.name} color={person.color} light />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{person.id === userId ? `${person.name} · tú` : person.name}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-slate-400">Ha aportado {formatEur(person.contributed)}</span>
                </span>
                <span className={cn('shrink-0 text-right text-[13px] font-black', positive ? 'text-[#16c784]' : negative ? 'text-[#ea3943]' : 'text-slate-400')}>
                  {positive ? `Recibe ${formatEur(person.net)}` : negative ? `Paga ${formatEur(-person.net)}` : 'En paz'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <section>
        <h3 className="mb-2 px-1 text-sm font-black">Gastos</h3>
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-black/20">
          {expenses.length === 0 && <p className="px-3 py-3 text-xs font-medium text-slate-400">Todavía no hay gastos.</p>}
          {expenses.map((expense, index) => {
            const id = String(expense._id || '');
            const payer = people.find((person) => person.id === String(expense.paidBy));
            const payerName = payer?.name || expense.paidByName || '';
            const gone = !payer && Boolean(expense.paidByName);
            return (
              <button key={id} type="button" onClick={() => { if (phase === 'active') openExpense(expense); }} className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left', index > 0 && 'border-t border-slate-200/70 dark:border-white/10', phase !== 'active' && 'cursor-default')}>
                <Mark name={payerName || expense.name} color={payer?.color || '#94a3b8'} light />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{expense.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-400">
                    {payerName ? (gone ? `${payerName} · se ha salido` : payerName) : 'Sin quien lo pague'} · {amongText(expense)}{expense.charge === 'pending' ? ' · Por aceptar' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-black tabular-nums">{formatEur(expense.amount)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {phase === 'active' && createPortal(
        <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: 'calc(max(1rem, env(safe-area-inset-bottom)) + 4.6rem)' }}>
          <button type="button" onClick={() => openExpense()} className={cn(quiet, 'pointer-events-auto inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 text-[15px] font-bold')}>
            Añadir gasto <Plus size={17} />
          </button>
        </div>,
        document.body,
      )}

      {draft && (
        <Modal title={draft.id ? 'Cambiar gasto' : 'Nuevo gasto'} onClose={() => setDraft(null)}>
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void saveExpense(); }}>
            <Input label="Concepto" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Cena, tren, hotel…" />
            <Input label="Importe" type="number" min="0" step="any" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} />
            <div>
              <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">Quién lo ha pagado</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {people.map((person) => (
                  <button key={person.id} type="button" onClick={() => setDraft({ ...draft, paidBy: person.id })} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-bold', draft.paidBy === person.id ? chipOn : 'border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-slate-900')}>
                    <Mark name={person.name} color={person.color} light />
                    {person.id === userId ? 'Tú' : person.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">Entre quién se divide</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setDraft({ ...draft, all: true, among: people.map((person) => person.id) })} className={cn('rounded-full border px-3 py-2 text-[13px] font-bold', draft.all ? chipOn : 'border-slate-200 text-slate-600')}>Entre todos</button>
                <button type="button" onClick={() => setDraft({ ...draft, all: false })} className={cn('rounded-full border px-3 py-2 text-[13px] font-bold', !draft.all ? chipOn : 'border-slate-200 text-slate-600')}>Elegir</button>
              </div>
              {!draft.all && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {people.map((person) => {
                    const on = draft.among.includes(person.id);
                    return (
                      <button key={person.id} type="button" onClick={() => setDraft({ ...draft, among: on ? draft.among.filter((id) => id !== person.id) : [...draft.among, person.id] })} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-bold', on ? chipOn : 'border-slate-200 text-slate-400')}>
                        <Mark name={person.name} color={on ? person.color : '#cbd5e1'} light />
                        {person.id === userId ? 'Tú' : person.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button type="submit" disabled={busy} className={cn(quiet, 'rounded-2xl py-3.5 text-[15px] font-bold disabled:opacity-50')}>{draft.id ? 'Guardar gasto' : 'Añadir gasto'}</button>
            {draft.id && (
              <button type="button" onClick={() => void removeExpense(draft.id as string)} className="text-sm font-bold text-[#ea3943]">Quitar este gasto</button>
            )}
          </form>
        </Modal>
      )}

      {selectedPerson && (
        <Modal title={selectedPerson.id === userId ? `${selectedPerson.name} · tú` : selectedPerson.name} onClose={() => setPersonId(null)}>
          <div className="mb-4 flex items-center gap-3">
            <Mark name={selectedPerson.name} color={selectedPerson.color} />
            <div>
              <p className="text-sm font-medium text-slate-500">Ha aportado {formatEur(selectedPerson.contributed)}</p>
              <p className={cn('text-lg font-black', selectedPerson.net > 0.004 ? 'text-[#16c784]' : selectedPerson.net < -0.004 ? 'text-[#ea3943]' : 'text-slate-500')}>
                {selectedPerson.net > 0.004 ? `Debe recibir ${formatEur(selectedPerson.net)}` : selectedPerson.net < -0.004 ? `Debe pagar ${formatEur(-selectedPerson.net)}` : 'En paz'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/5"><span className="block text-[11px] font-semibold text-slate-400">Ha pagado</span><span className="font-black">{formatEur(selectedPerson.spent)}</span></p>
            <p className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/5"><span className="block text-[11px] font-semibold text-slate-400">Le toca</span><span className="font-black">{formatEur(selectedPerson.share)}</span></p>
          </div>
          {phase === 'active' && (selectedPerson.id === userId || owner) && (
            potOn ? (
              <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void savePot(selectedPerson.id); }}>
                <input value={pot} onChange={(event) => setPot(event.target.value)} inputMode="decimal" aria-label="Lo aportado" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-white/10 dark:bg-slate-900" />
                <button type="submit" className={cn(quiet, 'rounded-xl px-3 text-sm font-bold')}>Ok</button>
              </form>
            ) : (
              <button type="button" onClick={() => setPotOn(true)} className="mt-3 text-[13px] font-bold text-slate-500">Cambiar lo aportado</button>
            )
          )}
          <h3 className="mb-2 mt-5 text-sm font-black">Gastos que ha pagado</h3>
          {expenses.filter((expense) => String(expense.paidBy) === selectedPerson.id).length === 0 && <p className="text-xs font-medium text-slate-400">No ha pagado ninguno.</p>}
          {expenses.filter((expense) => String(expense.paidBy) === selectedPerson.id).map((expense) => (
            <p key={String(expense._id)} className="flex items-center justify-between gap-3 py-1.5 text-sm font-semibold">
              <span className="truncate">{expense.name}</span>
              <span className="shrink-0 tabular-nums">{formatEur(expense.amount)}</span>
            </p>
          ))}
          <h3 className="mb-2 mt-5 text-sm font-black">A quién</h3>
          {pays.filter((row) => row.fromId === selectedPerson.id || row.toId === selectedPerson.id).length === 0 && <p className="text-xs font-medium text-slate-400">No tiene pagos con el resto.</p>}
          {pays.filter((row) => row.fromId === selectedPerson.id || row.toId === selectedPerson.id).map((row) => {
            const done = row.status === 'confirmed';
            const owes = row.fromId === selectedPerson.id;
            return (
              <button key={row.id} type="button" onClick={() => { setPersonId(null); setPayId(row.id); setAsk(null); }} className={cn('flex w-full items-center justify-between gap-3 py-2 text-left text-sm font-semibold', done && 'text-slate-400 line-through')}>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Mark name={owes ? row.to : row.from} color={colorOf(owes ? row.toId : row.fromId)} light />
                  <span className="truncate">{owes ? `Tiene que devolver ${formatEur(row.amount)} a ${row.to}` : `${row.from} le debe ${formatEur(row.amount)}`}</span>
                </span>
              </button>
            );
          })}
        </Modal>
      )}

      {selectedPay && (
        <Modal title="Liquidación" onClose={() => { setPayId(null); setAsk(null); }}>
          {ask === 'pay' ? (
            <div className="grid gap-3">
              <p className="text-lg font-black">¿Has realizado este pago?</p>
              <p className="text-3xl font-black tabular-nums">{formatEur(selectedPay.amount)}</p>
              <p className="text-sm font-medium text-slate-500">Debes pagar a {selectedPay.to}.</p>
              <button type="button" disabled={busy} onClick={() => void actPay('pagado')} className="rounded-2xl border border-slate-200/90 bg-white py-3.5 text-[15px] font-bold text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 dark:text-white">He realizado el pago</button>
              <button type="button" onClick={() => setAsk(null)} className="rounded-2xl border border-slate-200 py-3.5 text-[15px] font-bold text-slate-600">Todavía no he pagado</button>
            </div>
          ) : ask === 'got' || ask === 'miss' ? (
            <div className="grid gap-3">
              <p className="text-lg font-black">{selectedPay.from} indica que te ha pagado {formatEur(selectedPay.amount)}.</p>
              <p className="text-sm font-medium text-slate-500">¿Has recibido el dinero?</p>
              <button type="button" disabled={busy} onClick={() => void actPay('recibido')} className="rounded-2xl border border-slate-200/90 bg-white py-3.5 text-[15px] font-bold text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 dark:text-white">Sí, he recibido el dinero</button>
              <button type="button" disabled={busy} onClick={() => void actPay('no-recibido')} className="rounded-2xl border border-slate-200 py-3.5 text-[15px] font-bold text-[#ea3943]">No he recibido el dinero</button>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Mark name={selectedPay.from} color={colorOf(selectedPay.fromId)} light />
                <span>{selectedPay.from}</span>
                <span className="text-slate-300">→</span>
                <Mark name={selectedPay.to} color={colorOf(selectedPay.toId)} light />
                <span>{selectedPay.to}</span>
              </div>
              <p className="text-3xl font-black tabular-nums">{formatEur(selectedPay.amount)}</p>
              <p className="text-sm font-medium text-slate-500">{selectedPay.from} es quien paga. {selectedPay.to} es quien recibe.</p>
              <p className={cn('text-sm font-black', statusClass(selectedPay.status))}>{statusLabel(selectedPay.status)}</p>
              {selectedPay.openedAt && <p className="text-[12px] font-medium text-slate-400">Creada {when(selectedPay.openedAt)}</p>}
              {(selectedPay.events || []).length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-white/10">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Historial</p>
                  {(selectedPay.events || []).map((event, index) => (
                    <p key={`${event.at}-${index}`} className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
                      <span className="font-bold">{event.userId ? nameOf(String(event.userId)) : 'Alguien'}</span>
                      {' · '}{event.note || event.action}
                      {event.at && <span className="block text-[11px] text-slate-400">{when(event.at)}</span>}
                    </p>
                  ))}
                </div>
              )}
              {phase === 'settling' && selectedPay.fromId === userId && (selectedPay.status === 'pending' || selectedPay.status === 'disputed') && (
                <button type="button" onClick={() => setAsk('pay')} className="rounded-2xl border border-slate-200/90 bg-white py-3.5 text-[15px] font-bold text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 dark:text-white">He realizado el pago</button>
              )}
              {phase === 'settling' && selectedPay.toId === userId && selectedPay.fromId !== userId && selectedPay.status === 'awaiting_confirmation' && (
                <button type="button" onClick={() => setAsk('got')} className="rounded-2xl border border-slate-200/90 bg-white py-3.5 text-[15px] font-bold text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 dark:text-white">Confirmar si me ha llegado</button>
              )}
              {phase === 'settling' && selectedPay.fromId !== userId && selectedPay.toId !== userId && (
                <p className="text-[13px] font-medium text-slate-400">Lo confirman {selectedPay.from} y {selectedPay.to}.</p>
              )}
            </div>
          )}
        </Modal>
      )}

      {finishAsk && (
        <Modal title="Finalizar plan" onClose={() => setFinishAsk(false)}>
          <div className="grid gap-3 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
            <p>Se dejan de añadir gastos. Se calculan los balances y se generan las liquidaciones.</p>
            <p>Cada persona verá cuánto tiene que pagar y a quién. Un pago se cierra cuando quien paga lo indica y quien recibe lo confirma.</p>
            <button type="button" disabled={busy} onClick={() => void finish()} className="rounded-2xl border border-slate-200/90 bg-white py-3.5 text-[15px] font-bold text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 dark:text-white">Finalizar plan</button>
            <button type="button" onClick={() => setFinishAsk(false)} className="rounded-2xl border border-slate-200 py-3.5 text-[15px] font-bold text-slate-600">Seguir añadiendo gastos</button>
          </div>
        </Modal>
      )}

      {reopenAsk && (
        <Modal title="Corregir un gasto" onClose={() => setReopenAsk(false)}>
          <div className="grid gap-3 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
            <p>El plan vuelve a estar abierto. Los pagos que ya estaban confirmados se mantienen. Los que estaban a medias se anulan y las deudas se calculan otra vez.</p>
            <p>Quien sigue en el reparto recibe un aviso.</p>
            <button type="button" disabled={busy} onClick={() => void reopen()} className="rounded-2xl border border-slate-200/90 bg-white py-3.5 text-[15px] font-bold text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 dark:text-white">Reabrir y corregir</button>
            <button type="button" onClick={() => setReopenAsk(false)} className="rounded-2xl border border-slate-200 py-3.5 text-[15px] font-bold text-slate-600">Dejarlo como está</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function JoinTrip({ code, onClose, onOpen }: { code: string; onClose: () => void; onOpen: (planId: string) => void }) {
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const [name, setName] = useState('');
  const [people, setPeople] = useState(0);
  const [full, setFull] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancel = false;
    api<{ planId: string; name: string; people: number; joined: boolean; full: boolean }>(`/api/plans/join/${encodeURIComponent(code)}`)
      .then((data) => {
        if (cancel) return;
        if (data.joined) {
          openRef.current(data.planId);
          return;
        }
        setName(data.name);
        setPeople(data.people);
        setFull(data.full);
        setReady(true);
      })
      .catch((err: Error) => {
        if (!cancel) {
          setError(err.message);
          setReady(true);
        }
      });
    return () => {
      cancel = true;
    };
  }, [code]);

  const join = async () => {
    const contributed = Number(amount || 0);
    if (!Number.isFinite(contributed) || contributed < 0) {
      setError('Lo aportado no puede ser negativo.');
      return;
    }
    const saved = await api<{ planId: string }>('/api/plans/join', { method: 'POST', body: JSON.stringify({ code, contributed }) });
    onOpen(saved.planId);
  };

  if (!ready) return null;

  return (
    <Overlay onClose={onClose}>
      <div className={cn(modalPanelClass, 'max-w-md')} onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-[17px] font-semibold">{name ? `Te unes a ${name}` : 'El enlace'}</h3>
          <ModalClose onClose={onClose} />
        </div>
        {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
        {name && !full && (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void join().catch((err: Error) => setError(err.message));
            }}
          >
            <p className="text-sm font-medium text-slate-500">{people === 1 ? 'Ya hay una persona.' : `Ya hay ${people} personas.`} Cada una tiene un color.</p>
            <Input label="¿Cuánto has puesto ya?" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Si todavía nada, déjalo vacío" />
            <Button type="submit" variant="outline">Unirme</Button>
          </form>
        )}
        {full && <p className="text-sm font-medium text-slate-500">Ya sois 10, no cabe nadie más.</p>}
      </div>
    </Overlay>
  );
}
