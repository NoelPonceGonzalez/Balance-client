import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { bindHold, HoldMenu, holdItemClass, placeMenu } from '@/components/HoldMenu';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Banknote, Check, ChevronLeft, GripVertical, ImageIcon, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { ModalClose, modalOverlayClass, modalPanelClass } from '@/components/Modal';
import { OriginGlyph, OriginPicker } from '@/components/OriginMark';
import { PlatformLogo } from '@/components/PlatformLogo';
import { QuietLoad } from '@/components/QuietLoad';
import { Button } from '@/components/ui/Button';
import { Input, fieldClass } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { glide } from '@/lib/motion';
import { formatEur, formatSignedEur } from '@/lib/format';
import { planImageFileName, renderPlanPng } from '@/lib/plan-image';
import { cn, docId } from '@/lib/utils';
import type { AccountRow, PlanForecast, PlanMonthLine, PlanMonthView, PlanRow } from '@/lib/types';

type Kind = 'patrimonio' | 'liquidez' | 'inversion';

interface Draft {
  name: string;
  kind: Kind;
  field: string;
  salary: string;
  salaryAccountId: string;
  savingsDay: string;
  openingBalance: string;
  startDate: string;
  targetAmount: string;
  targetDate: string;
  monthlySavings: string;
  linkedAccountIds: string[];
  manualRealBalance: string;
  recurring: { id?: string; name: string; amount: string; dayOfMonth: string; paidDates: string[]; direction?: 'in' | 'out' }[];
  intervals: { id?: string; name: string; amount: string; everyWeeks: string; startDate: string; paidDates: string[]; direction?: 'in' | 'out' }[];
  plannedExpenses: { id?: string; name: string; amount: string; date: string; paid: boolean; surprise?: boolean; automatic?: boolean; image?: string }[];
  incomes: { id?: string; name: string; amount: string; date: string; status: 'expected' | 'confirmed'; paid: boolean; surprise?: boolean; automatic?: boolean; image?: string }[];
  scenarios: { name: string; monthlySavings: string }[];
}

const blank = (): Draft => ({
  name: '',
  kind: 'patrimonio',
  field: 'Cripto',
  salary: '',
  salaryAccountId: '',
  savingsDay: '31',
  openingBalance: '',
  startDate: new Date().toISOString().slice(0, 10),
  targetAmount: '',
  targetDate: '',
  monthlySavings: '',
  linkedAccountIds: [],
  manualRealBalance: '',
  recurring: [],
  intervals: [],
  plannedExpenses: [],
  incomes: [],
  scenarios: [],
});

function isPurchase(plan: { kind?: string; linkedAccountIds?: unknown[] }): boolean {
  return (plan.kind || 'patrimonio') === 'patrimonio' && !(plan.linkedAccountIds || []).length;
}

function planTitle(plan: PlanRow): string {
  const goal = formatEur(plan.targetAmount);
  if (plan.kind === 'liquidez') return `Plan de liquidez hasta los ${goal}`;
  if (plan.kind === 'inversion') {
    const field = plan.field?.trim();
    return field ? `Plan de inversión en ${field} hasta los ${goal}` : `Plan de inversión hasta los ${goal}`;
  }
  if (isPurchase(plan)) return plan.name.trim() ? `Comprar ${plan.name.trim()}` : `Comprar algo de ${goal}`;
  return `Plan de patrimonio hasta los ${goal}`;
}

function toBody(draft: Draft) {
  const field = draft.kind === 'inversion' ? draft.field.trim() : '';
  const name = draft.name.trim() || (draft.kind === 'liquidez' ? 'Liquidez' : draft.kind === 'inversion' ? (field || 'Inversión') : 'Patrimonio');
  return {
    name,
    kind: draft.kind,
    field,
    salary: draft.kind === 'liquidez' ? Number(draft.salary || 0) : 0,
    salaryAccountId: draft.kind === 'liquidez' ? (draft.linkedAccountIds[0] || null) : null,
    savingsDay: Number(draft.savingsDay || 31),
    openingBalance: Number(draft.openingBalance || 0),
    startDate: draft.startDate,
    targetAmount: Number(draft.targetAmount),
    targetDate: draft.targetDate,
    monthlySavings: Number(draft.monthlySavings || 0),
    linkedAccountIds: draft.kind === 'patrimonio' ? [] : draft.linkedAccountIds.slice(0, 1),
    manualRealBalance: draft.manualRealBalance === '' ? null : Number(draft.manualRealBalance),
    recurring: draft.recurring.filter((item) => item.name.trim() && item.amount !== '').map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      name: item.name,
      amount: Number(item.amount),
      dayOfMonth: Number(item.dayOfMonth || 1),
      direction: item.direction === 'in' ? 'in' : 'out',
      paidDates: item.paidDates,
    })),
    intervals: draft.intervals.filter((item) => item.name.trim() && item.amount !== '').map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      name: item.name,
      amount: Number(item.amount),
      everyWeeks: Number(item.everyWeeks || 1),
      startDate: item.startDate,
      direction: item.direction === 'in' ? 'in' : 'out',
      paidDates: item.paidDates,
    })),
    plannedExpenses: draft.plannedExpenses.filter((item) => item.name.trim() && item.amount !== '').map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      name: item.name,
      amount: Number(item.amount),
      date: item.date,
      paid: item.paid,
      surprise: item.surprise === true,
      automatic: item.automatic === true,
      image: item.image || '',
    })),
    incomes: draft.incomes.filter((item) => item.name.trim() && item.amount !== '').map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      name: item.name,
      amount: Number(item.amount),
      date: item.date,
      status: item.status,
      paid: item.paid,
      surprise: item.surprise === true,
      automatic: item.automatic === true,
      image: item.image || '',
    })),
    scenarios: draft.scenarios.filter((item) => item.name.trim()).map((item) => ({
      name: item.name,
      monthlySavings: Number(item.monthlySavings || 0),
    })),
  };
}

function fromPlan(plan: PlanRow): Draft {
  return {
    name: plan.name,
    kind: plan.kind || 'patrimonio',
    field: plan.field || 'ETF',
    salary: plan.salary ? String(plan.salary) : '',
    salaryAccountId: plan.salaryAccountId ? String(plan.salaryAccountId) : '',
    savingsDay: plan.savingsDay ? String(plan.savingsDay) : '31',
    openingBalance: String(plan.openingBalance ?? ''),
    startDate: plan.startDate,
    targetAmount: String(plan.targetAmount),
    targetDate: plan.targetDate,
    monthlySavings: String(plan.monthlySavings ?? ''),
    linkedAccountIds: (plan.linkedAccountIds || []).map(String),
    manualRealBalance: plan.manualRealBalance == null ? '' : String(plan.manualRealBalance),
    recurring: (plan.recurring || []).map((item) => ({ id: item._id, name: item.name, amount: String(item.amount), dayOfMonth: String(item.dayOfMonth), paidDates: item.paidDates || [], direction: item.direction === 'in' ? 'in' as const : 'out' as const })),
    intervals: (plan.intervals || []).map((item) => ({ id: item._id, name: item.name, amount: String(item.amount), everyWeeks: String(item.everyWeeks), startDate: item.startDate.slice(0, 10), paidDates: item.paidDates || [], direction: item.direction === 'in' ? 'in' as const : 'out' as const })),
    plannedExpenses: (plan.plannedExpenses || []).map((item) => ({ id: item._id, name: item.name, amount: String(item.amount), date: item.date.slice(0, 10), paid: item.paid === true, surprise: item.surprise === true, automatic: item.automatic === true || /^entrenador$/i.test(item.name), image: item.image || '' })),
    incomes: (plan.incomes || []).map((item) => ({ id: item._id, name: item.name, amount: String(item.amount), date: item.date.slice(0, 10), status: item.status || 'confirmed', paid: item.paid === true, surprise: item.surprise === true, automatic: item.automatic === true, image: item.image || '' })),
    scenarios: (plan.scenarios || []).map((item) => ({ name: item.name, monthlySavings: String(item.monthlySavings) })),
  };
}

function planPlaces(accounts: AccountRow[]): AccountRow[] {
  const open = accounts.filter((account) => !account.archived && !/cs2|counter-strike|tf2|team fortress/i.test(`${account.platform} ${account.name}`));
  const withMoney = open.filter((account) => account.balance > 0);
  return withMoney.length ? withMoney : open;
}

function kindLabel(plan: { kind?: string; linkedAccountIds?: unknown[] }): string {
  if (plan.kind === 'liquidez') return 'Liquidez';
  if (plan.kind === 'inversion') return 'Inversión';
  if (isPurchase(plan)) return 'Compra';
  return 'Patrimonio';
}

function formatShare(value: number): string {
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} %`;
}

function PlanCorner({ balance, target, delta, beat }: { balance: number; target: number; delta: number | null; beat: number }) {
  const share = target > 0 ? (balance / target) * 100 : 0;
  const frames = [{ text: formatShare(share), className: 'text-[#16c784]' }];
  if (delta != null && Math.abs(delta) > 0.5) {
    frames.push({ text: formatSignedEur(delta), className: delta > 0 ? 'text-[#16c784]' : 'text-[#ea3943]' });
  }
  const still = window.matchMedia('(max-width: 767px)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame = still ? frames[0] : frames[beat % frames.length];
  if (still) return <span className={cn('shrink-0 text-xs font-black tabular-nums', frame.className)}>{frame.text}</span>;
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={frame.text}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={glide}
        className={cn('shrink-0 text-sm font-black tabular-nums', frame.className)}
      >
        {frame.text}
      </motion.span>
    </AnimatePresence>
  );
}

function barWidth(balance: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.max(0, Math.min(100, (balance / target) * 100));
}

function monthPace(extraMonths: number | null | undefined): { text: string; className: string } {
  if (extraMonths == null) return { text: 'Sin mes de más', className: 'text-slate-400' };
  if (extraMonths > 0) {
    const months = extraMonths === 1 ? 'un mes de más' : `${extraMonths} meses de más`;
    return { text: `Vas mal · ${months}`, className: 'text-[#ea3943]' };
  }
  if (extraMonths < 0) {
    const ahead = -extraMonths;
    const months = ahead === 1 ? 'un mes antes' : `${ahead} meses antes`;
    return { text: `Vas mejor · ${months}`, className: 'text-[#16c784]' };
  }
  return { text: 'Vas mejor · sin mes de más', className: 'text-[#16c784]' };
}

function surprisePace(plan: PlanRow): { ahead: number; behind: number } {
  const cleared = new Set(plan.surpriseCleared || []);
  let net = 0;
  for (const item of plan.plannedExpenses || []) {
    if (item.surprise && item._id && !cleared.has(item._id)) net -= item.amount;
  }
  for (const item of plan.incomes || []) {
    if (item.surprise && item._id && !cleared.has(item._id)) net += item.amount;
  }
  return { ahead: Math.max(0, net), behind: Math.max(0, -net) };
}

function lineClass(line: PlanMonthLine): string {
  if (line.tone === 'in' || line.tone === 'final') return 'text-[#16c784]';
  if (line.tone === 'out') return 'text-[#ea3943]';
  return 'text-slate-900 dark:text-white';
}

function toggleDate(dates: string[] | undefined, day: string, paid: boolean): string[] {
  const next = new Set(dates || []);
  if (paid) next.add(day);
  else next.delete(day);
  return [...next];
}

function patchPlanPaid(plan: PlanRow, key: string, paid: boolean): PlanRow {
  const [kind, id, date] = key.split(':');
  if (kind === 'expense') {
    return { ...plan, plannedExpenses: plan.plannedExpenses.map((item) => (item._id === id ? { ...item, paid } : item)) };
  }
  if (kind === 'income') {
    return { ...plan, incomes: (plan.incomes || []).map((item) => (item._id === id ? { ...item, paid } : item)) };
  }
  if (kind === 'recurring') {
    return { ...plan, recurring: plan.recurring.map((item) => (item._id === id ? { ...item, paidDates: toggleDate(item.paidDates, date, paid) } : item)) };
  }
  if (kind === 'interval') {
    return { ...plan, intervals: (plan.intervals || []).map((item) => (item._id === id ? { ...item, paidDates: toggleDate(item.paidDates, date, paid) } : item)) };
  }
  return plan;
}

/** El círculo cambia al momento. El saldo de esa línea y las de después se mueven con el mismo importe. */
function shiftMonths(months: PlanMonthView[], key: string, paid: boolean): PlanMonthView[] {
  let delta = 0;
  let armed = false;
  return months.map((month) => ({
    ...month,
    lines: month.lines.map((line) => {
      if (!armed && line.markKey === key && !line.absorbed) {
        armed = true;
        delta = line.paid === paid ? 0 : paid ? (line.amount || 0) : -(line.amount || 0);
        return { ...line, paid, balance: line.balance + delta };
      }
      if (!armed || !delta) return line;
      return { ...line, balance: line.balance + delta };
    }),
  }));
}

export function Plans({ embedded = false, books = 0 }: { embedded?: boolean; books?: number }) {
  const [items, setItems] = useState<{ plan: PlanRow; forecast: PlanForecast }[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [monthOpen, setMonthOpen] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shaped, setShaped] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<EditorDraft | null>(null);
  const [menu, setMenu] = useState<{ line: PlanMonthLine; top: number; left: number } | null>(null);
  const [drag, setDrag] = useState<{ line: PlanMonthLine; x: number; y: number; over: string | null } | null>(null);
  const dragRef = useRef<{ line: PlanMonthLine; x: number; y: number; moved: boolean } | null>(null);
  const [extra, setExtra] = useState<{ month: string; name: string; amount: string; date: string; direction: 'in' | 'out'; image: string } | null>(null);
  const [keepAsk, setKeepAsk] = useState<{ name: string; amount: number; date: string; image: string } | null>(null);
  const [beat, setBeat] = useState(0);
  const [cardMenu, setCardMenu] = useState<{ id: string; top: number; left: number; confirm: boolean } | null>(null);
  const [makingId, setMakingId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ url: string; blob: Blob; fileName: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [previewDay, setPreviewDay] = useState<string | null>(null);
  const suppressCard = useRef(false);
  useEffect(() => {
    setMonthOpen({});
  }, [selected]);
  const desiredMark = useRef(new Map<string, boolean>());
  const marking = useRef(new Set<string>());

  const load = async () => {
    const planData = await api<{ plans: { plan: PlanRow; forecast: PlanForecast }[] }>('/api/plans');
    setItems(planData.plans);
    setSelected((current) => (current && planData.plans.some((item) => docId(item.plan) === current) ? current : null));
  };

  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setBeat((value) => value + 1), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setPreviewDay(null);
  }, [selected]);

  useEffect(() => {
    load().catch((err: Error) => setError(err.message)).finally(() => setReady(true));
    api<{ accounts: AccountRow[] }>('/api/accounts')
      .then((data) => setAccounts(data.accounts))
      .catch(() => setAccounts([]));
  }, [books]);

  const save = async () => {
    if (!draft) return;
    setError('');
    try {
      const body = toBody(draft);
      if (!(body.targetAmount > 0)) throw new Error('El objetivo tiene que ser mayor que cero.');
      if (!body.targetDate || !body.startDate) throw new Error('Faltan las fechas del plan.');
      const saved = editing
        ? await api<{ plan: PlanRow }>(`/api/plans/${editing}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await api<{ plan: PlanRow }>('/api/plans', { method: 'POST', body: JSON.stringify(body) });
      setDraft(null);
      setEditing(null);
      await load();
      setSelected(docId(saved.plan));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar el plan.');
    }
  };

  const current = items.find((item) => docId(item.plan) === selected) || null;
  const plan = current?.plan;
  const forecast = current?.forecast;
  const months = forecast?.months || [];
  const openingBalance = months[0]?.lines[0]?.balance ?? plan?.openingBalance ?? 0;
  const todayBalance = forecast?.today ? balanceAsOf(months, forecast.today, openingBalance) : openingBalance;
  const reachedDay = forecast?.today ? reachDay(months, forecast.today, previewDay) : previewDay;
  const lookingAhead = Boolean(forecast?.today && previewDay && previewDay > forecast.today);
  const shownMonths = lookingAhead && reachedDay ? walkMonths(months, reachedDay, openingBalance) : months;
  const shownBalance = lookingAhead && reachedDay ? walkedBalance(months, reachedDay, openingBalance) : todayBalance;
  const linked = accounts.filter((account) => (plan?.linkedAccountIds || []).map(String).includes(String(account._id)) && !account.archived);
  const payday = accounts.find((account) => String(account._id) === String(plan?.salaryAccountId) && !account.archived) || (linked.length === 1 ? linked[0] : undefined);
  const liquidity = linked[0];

  const beginEdit = (line: PlanMonthLine) => {
    if (!plan || !line.markKey) return;
    const [kind, id, extra] = line.markKey.split(':');
    if (kind === 'expense' || kind === 'income') {
      const source = kind === 'expense' ? plan.plannedExpenses : plan.incomes;
      const item = source.find((row) => row._id === id);
      if (!item) return;
      setEditor({ key: line.markKey, kind, name: item.name, amount: String(item.amount), date: item.date.slice(0, 10), dayOfMonth: '1', everyWeeks: '2', image: item.image || '' });
    } else if (kind === 'savings') {
      setEditor({ key: line.markKey, kind, name: line.label, amount: String(Math.abs(line.amount || 0)), date: id, dayOfMonth: '1', everyWeeks: '2', image: '' });
    } else if (kind === 'recurring') {
      const item = plan.recurring.find((row) => row._id === id);
      if (!item) return;
      setEditor({ key: line.markKey, kind, name: item.name, amount: String(item.amount), date: extra || '', dayOfMonth: String(item.dayOfMonth), everyWeeks: '2', image: '' });
    } else if (kind === 'interval') {
      const item = (plan.intervals || []).find((row) => row._id === id);
      if (!item) return;
      setEditor({ key: line.markKey, kind, name: item.name, amount: String(item.amount), date: item.startDate.slice(0, 10), dayOfMonth: '1', everyWeeks: String(item.everyWeeks), image: '' });
    }
  };

  const saveEditor = async (remove = false) => {
    if (!plan || !editor) return;
    setError('');
    try {
      await api(`/api/plans/${docId(plan)}/entry`, {
        method: 'POST',
        body: JSON.stringify({
          key: editor.key,
          remove,
          name: editor.name,
          amount: Number(editor.amount),
          date: editor.date,
          dayOfMonth: Number(editor.dayOfMonth || 1),
          everyWeeks: Number(editor.everyWeeks || 1),
          image: editor.image || '',
        }),
      });
      setEditor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar el apunte.');
    }
  };

  const openMenu = (line: PlanMonthLine, rect: DOMRect) => {
    const place = placeMenu(rect.left + rect.width / 2, rect.top + 8);
    setMenu({ line, ...place });
  };

  const onDragStart = (line: PlanMonthLine, x: number, y: number) => {
    dragRef.current = { line, x, y, moved: false };
    setMenu(null);
  };

  const onDragMove = (x: number, y: number) => {
    const current = dragRef.current;
    if (!current) return;
    if (Math.hypot(x - current.x, y - current.y) > 6) current.moved = true;
    if (!current.moved) return;
    const scroller = document.querySelector('.app-scroll');
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      const edge = 96;
      if (y > bounds.bottom - edge) scroller.scrollBy({ top: 14 + (y - (bounds.bottom - edge)) * 0.4 });
      else if (y < bounds.top + edge) scroller.scrollBy({ top: -(14 + (bounds.top + edge - y) * 0.4) });
    }
    const over = document.elementFromPoint(x, y)?.closest('[data-drop-month]')?.getAttribute('data-drop-month') ?? null;
    setDrag({ line: current.line, x, y, over });
  };

  const moveToMonth = async (line: PlanMonthLine, month: string) => {
    if (!plan || !line.markKey || !line.day || line.day.slice(0, 7) === month) return;
    const [kind, id] = line.markKey.split(':');
    if (kind !== 'expense' && kind !== 'income') return;
    const source = kind === 'expense' ? plan.plannedExpenses : plan.incomes;
    const item = source.find((row) => row._id === id);
    if (!item) return;
    const day = Math.min(Number(line.day.slice(8, 10)) || 1, lastDay(month));
    const date = `${month}-${String(day).padStart(2, '0')}`;
    setError('');
    try {
      await api(`/api/plans/${docId(plan)}/entry`, {
        method: 'POST',
        body: JSON.stringify({ key: line.markKey, remove: false, name: item.name, amount: item.amount, date, dayOfMonth: 1, everyWeeks: 1 }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido mover el apunte.');
    }
  };

  const onDragEnd = (x: number, y: number, rect: DOMRect, fromHandle = false) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current) return;
    if (!current.moved) {
      if (!fromHandle) openMenu(current.line, rect);
      return;
    }
    const month = document.elementFromPoint(x, y)?.closest('[data-drop-month]')?.getAttribute('data-drop-month');
    if (month) void moveToMonth(current.line, month);
  };

  const removeLine = async (line: PlanMonthLine) => {
    if (!plan || !line.markKey) return;
    setMenu(null);
    setError('');
    try {
      await api(`/api/plans/${docId(plan)}/entry`, {
        method: 'POST',
        body: JSON.stringify({ key: line.markKey, remove: true, name: line.label, amount: Math.abs(line.amount || 0), date: line.day || '', dayOfMonth: 1, everyWeeks: 1 }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido quitar el apunte.');
    }
  };

  const addExtra = async () => {
    if (!plan || !extra) return;
    const amount = Number(extra.amount);
    if (!extra.name.trim() || !(amount > 0) || !extra.date) {
      setError('Pon un nombre, un importe y una fecha.');
      return;
    }
    setError('');
    try {
      await api(`/api/plans/${docId(plan)}/extra`, {
        method: 'POST',
        body: JSON.stringify({ name: extra.name.trim(), amount, date: extra.date, direction: extra.direction, image: extra.image || '' }),
      });
      setExtra(null);
      await load();
      if (extra.direction === 'out') setKeepAsk({ name: extra.name.trim(), amount, date: extra.date, image: extra.image || '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido añadir el extra.');
    }
  };

  const keepExtra = async () => {
    if (!keepAsk) return;
    setError('');
    try {
      await api('/api/extras', {
        method: 'POST',
        body: JSON.stringify({ place: 'objeto', name: keepAsk.name, valueEur: keepAsk.amount, costEur: keepAsk.amount, imageUrl: keepAsk.image.startsWith('https://') ? keepAsk.image : '', boughtOn: keepAsk.date, track: false, counts: true, notes: '' }),
      });
      setKeepAsk(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar en extras.');
    }
  };

  const mark = async (key: string, paid: boolean) => {
    if (!plan) return;
    const planId = docId(plan);
    const currentPaid = desiredMark.current.has(key) ? desiredMark.current.get(key)! : paid;
    const nextPaid = !currentPaid;
    desiredMark.current.set(key, nextPaid);
    setError('');
    setItems((rows) => rows.map((item) => {
      if (docId(item.plan) !== planId) return item;
      return {
        plan: patchPlanPaid(item.plan, key, nextPaid),
        forecast: { ...item.forecast, months: shiftMonths(item.forecast.months || [], key, nextPaid) },
      };
    }));
    if (marking.current.has(key)) return;
    marking.current.add(key);
    try {
      let saved: { plan: PlanRow; forecast: PlanForecast } | null = null;
      while (desiredMark.current.has(key)) {
        const target = desiredMark.current.get(key)!;
        saved = await api<{ plan: PlanRow; forecast: PlanForecast }>(`/api/plans/${planId}/mark`, {
          method: 'POST',
          body: JSON.stringify({ key, paid: target }),
        });
        if (desiredMark.current.get(key) === target) {
          desiredMark.current.delete(key);
          break;
        }
      }
      if (saved && !desiredMark.current.has(key)) {
        setItems((rows) => rows.map((item) => (docId(item.plan) === planId ? saved! : item)));
      }
    } catch (err) {
      desiredMark.current.delete(key);
      setError(err instanceof Error ? err.message : 'No se ha podido marcar el gasto.');
      await load();
    } finally {
      marking.current.delete(key);
    }
  };

  const holdCard = (id: string, event: ReactPointerEvent) => {
    bindHold(event, (x, y) => {
      suppressCard.current = true;
      setCardMenu({ id, ...placeMenu(x, y), confirm: false });
    });
  };

  const removeCard = async (id: string) => {
    await api(`/api/plans/${id}`, { method: 'DELETE' });
    setCardMenu(null);
    await load();
  };

  const closeSheet = () => {
    setCopied(false);
    setSheet((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  const makeImage = async (item: { plan: PlanRow; forecast: PlanForecast }) => {
    const id = docId(item.plan);
    setMakingId(id);
    setError('');
    try {
      const rows = item.forecast.months || [];
      const opening = rows[0]?.lines[0]?.balance ?? item.plan.openingBalance ?? 0;
      const today = item.forecast.today ? balanceAsOf(rows, item.forecast.today, opening) : opening;
      const blob = await renderPlanPng({
        name: item.plan.name,
        title: planTitle(item.plan),
        todayLabel: 'Hoy',
        today,
        target: item.plan.targetAmount,
        months: rows,
        capturedOn: item.forecast.today || new Date().toISOString().slice(0, 10),
      });
      const fileName = planImageFileName(item.plan.name);
      const url = URL.createObjectURL(blob);
      setCopied(false);
      setSheet((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url, blob, fileName };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido crear la imagen.');
    } finally {
      setMakingId(null);
    }
  };

  const copySheet = async () => {
    if (!sheet) return;
    setError('');
    window.focus();
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': sheet.blob })]);
      setCopied(true);
      return;
    } catch {
      const image = document.querySelector<HTMLImageElement>('img[alt="Plan completo"]');
      if (image) {
        const range = document.createRange();
        range.selectNode(image);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        const copiedImage = document.execCommand('copy');
        selection?.removeAllRanges();
        if (copiedImage) {
          setCopied(true);
          return;
        }
      }
      setError('No se ha podido copiar la imagen.');
    }
  };

  const saveSheet = () => {
    if (!sheet) return;
    const link = document.createElement('a');
    link.href = sheet.url;
    link.download = sheet.fileName;
    link.click();
  };

  const remove = async () => {
    if (!plan) return;
    await api(`/api/plans/${docId(plan)}`, { method: 'DELETE' });
    setConfirmDelete(false);
    await load();
  };

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto max-w-3xl space-y-4'}>
      {plan && (
        <div className="sticky top-0 z-30 -mx-4 bg-gradient-to-b from-[color-mix(in_srgb,var(--app-bg)_42%,transparent)] via-[color-mix(in_srgb,var(--app-bg)_18%,transparent)] to-transparent px-4 pb-8 pt-1 backdrop-blur-2xl md:-mx-8 md:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs font-bold">
              <span className="inline-flex items-center gap-2 text-slate-500">
                <button type="button" onClick={() => setSelected(null)} className="grid h-7 w-7 place-items-center rounded-full text-slate-500 transition-colors hover:bg-white/80" aria-label="Todos los planes"><ChevronLeft size={16} /></button>
                {liquidity && <PlatformLogo name={liquidity.platform || liquidity.name} size={22} />}
                {lookingAhead ? (
                  <button type="button" onClick={() => setPreviewDay(null)} className="text-slate-500" title="Volver a hoy">
                    Así <span className="text-slate-400">· {shortDay(previewDay || '')}</span>
                  </button>
                ) : (
                  'Hoy'
                )}
                <span className="text-base font-black text-slate-900 dark:text-white"><SoftEur value={shownBalance} /></span>
              </span>
              <span className="text-slate-400">{formatEur(plan.targetAmount)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/15">
              <div className="h-full rounded-full bg-slate-900/75 transition-[width] duration-700 ease-out dark:bg-white" style={{ width: `${barWidth(shownBalance, plan.targetAmount)}%` }} />
            </div>
            <p className={cn('mt-2 text-xs font-bold leading-snug', monthPace(forecast?.extraMonths).className)}>{monthPace(forecast?.extraMonths).text}</p>
          </div>
        </div>
      )}
      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
      {!ready && !plan && <QuietLoad />}
      {ready && !selected && (
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          {items.map((item) => {
            const id = docId(item.plan);
            const opening = item.forecast.months?.[0]?.lines[0]?.balance ?? item.plan.openingBalance ?? 0;
            const balance = item.forecast.today ? balanceAsOf(item.forecast.months || [], item.forecast.today, opening) : opening;
            const site = accounts.find((account) => (item.plan.linkedAccountIds || []).map(String).includes(String(account._id)) && !account.archived);
            const pace = surprisePace(item.plan);
            const delta = item.plan.kind === 'inversion' ? pace.ahead - pace.behind : null;
            return (
              <div
                key={id}
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).closest('[data-menu]')) return;
                  holdCard(id, event);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setCardMenu({ id, ...placeMenu(event.clientX, event.clientY), confirm: false });
                }}
                onClick={() => {
                  if (suppressCard.current) {
                    suppressCard.current = false;
                    return;
                  }
                  setSelected(id);
                  setConfirmDelete(false);
                }}
                className="hold-target plan-rise cursor-pointer rounded-2xl border border-white/70 bg-white/70 p-3 text-left shadow-lg shadow-slate-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {site && <PlatformLogo name={site.platform || site.name} size={22} />}
                    <span className="min-w-0 truncate text-sm font-black">{item.plan.name}</span>
                    <button
                      type="button"
                      data-menu
                      aria-label="Editar o eliminar"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        const rect = event.currentTarget.getBoundingClientRect();
                        setCardMenu({ id, ...placeMenu(rect.left + rect.width / 2, rect.top), confirm: false });
                      }}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  </span>
                  <PlanCorner balance={balance} target={item.plan.targetAmount} delta={delta} beat={beat} />
                </span>
                <span className="mt-2 block text-[11px] font-semibold text-slate-400">{kindLabel(item.plan)}</span>
                <span className="mt-1 block whitespace-nowrap text-[clamp(1.35rem,6.2vw,1.85rem)] font-black leading-none tabular-nums sm:text-[28px]"><SoftEur value={balance} /></span>
                <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                  <span className="block h-full rounded-full bg-slate-800 transition-[width] duration-700 dark:bg-white" style={{ width: `${barWidth(balance, item.plan.targetAmount)}%` }} />
                </span>
                <span className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-400">de {formatEur(item.plan.targetAmount)}</span>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      void makeImage(item);
                    }}
                    disabled={makingId === id}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                  >
                    <ImageIcon size={12} />
                    {makingId === id ? 'Creando…' : 'Imagen'}
                  </button>
                </span>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => { setEditing(null); setDraft(blank()); setShaped(false); setConfirmDelete(false); }}
            className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/40 text-sm font-bold text-slate-500 transition-colors hover:bg-white/70 dark:border-white/15 dark:bg-white/5"
          >
            <Plus size={18} />
            Nuevo plan
          </button>
        </div>
      )}
      {cardMenu && (
        <HoldMenu top={cardMenu.top} left={cardMenu.left} onClose={() => setCardMenu(null)}>
          <button
            type="button"
            onClick={() => {
              const item = items.find((entry) => docId(entry.plan) === cardMenu.id);
              setCardMenu(null);
              if (!item) return;
              setEditing(cardMenu.id);
              setShaped(true);
              setDraft(fromPlan(item.plan));
            }}
            className={cn(holdItemClass, 'text-slate-800 dark:text-slate-100')}
          >
            <Pencil size={14} /> Editar
          </button>
          <button
            type="button"
            onClick={() => { if (cardMenu.confirm) void removeCard(cardMenu.id); else setCardMenu({ ...cardMenu, confirm: true }); }}
            className={cn(holdItemClass, 'text-[#ea3943]')}
          >
            <Trash2 size={14} /> {cardMenu.confirm ? 'Confirmar' : 'Eliminar'}
          </button>
        </HoldMenu>
      )}
      {plan && forecast && (
        <article className="rounded-[28px] border border-white/60 bg-white/55 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/55 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-black tracking-tight">{planTitle(plan)}</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {(plan.salary || 0) > 0 && <span className="inline-flex items-center gap-1"><Banknote size={12} /> Nómina {formatEur(plan.salary)}{payday ? ` va a ${payday.name}` : ''} · </span>}
                Apartas {formatEur(plan.monthlySavings)} el día {plan.savingsDay || Number(plan.startDate.slice(8, 10))}
                {forecast.anchor && (
                  <span className="mt-1 flex items-center gap-2 text-slate-700 dark:text-slate-200">
                    {liquidity && <PlatformLogo name={liquidity.platform || liquidity.name} size={18} />}
                    El saldo es {forecast.anchor.label}
                  </span>
                )}
                <span className="mt-1 block">Marcar suma o resta ese importe, aunque el día no haya llegado. Quitar la marca lo devuelve. Lo que ya está en el efectivo no se mueve otra vez.</span>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" disabled={makingId === docId(plan)} onClick={() => current && void makeImage(current)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 disabled:opacity-50">
                <ImageIcon size={13} /> {makingId === docId(plan) ? 'Creando…' : 'Imagen'}
              </button>
              <button type="button" onClick={() => { setEditing(docId(plan)); setShaped(true); setDraft(fromPlan(plan)); }} className="text-xs font-bold text-slate-500">Editar</button>
              {confirmDelete ? (
                <button type="button" onClick={() => void remove()} className="text-xs font-bold text-[#ea3943]">Confirmar</button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs font-bold text-slate-400">Borrar</button>
              )}
            </div>
          </div>
          <div className="mt-5 space-y-5">
            {shownMonths.map((month) => {
              const expected = forecast.series?.find((item) => item.month === month.month)?.withExpected;
              const dropping = drag != null && drag.over === month.month && drag.line.day?.slice(0, 7) !== month.month;
              const todayMonth = (forecast.today || '').slice(0, 7);
              const open = monthOpen[month.month] ?? month.month >= todayMonth;
              const shown = open || extra?.month === month.month || dropping;
              return (
              <section
                key={month.month}
                data-drop-month={month.month}
                className={cn('rounded-2xl transition-all duration-200', dropping && 'bg-indigo-50/90 ring-2 ring-indigo-400 dark:bg-indigo-500/15')}
              >
                <button
                  type="button"
                  onClick={() => setMonthOpen((prev) => ({ ...prev, [month.month]: !shown }))}
                  className="mb-2 flex w-full items-baseline justify-between gap-3 px-1 text-left"
                >
                  <h4 className="text-sm font-black">{month.title}</h4>
                  {dropping ? <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300">Soltar aquí</span> : <span className="text-[11px] font-semibold text-slate-400">{shown && expected != null ? `Cierre previsto ${formatEur(expected)}` : 'Ver el mes'}</span>}
                </button>
                {shown && <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 transition-colors duration-300 dark:border-white/10 dark:bg-black/20">
                  {month.lines.map((line, index) => (
                    <PlanLine
                      key={line.markKey || `${month.month}-${line.label}`}
                      line={line}
                      index={index}
                      lifted={drag?.line.markKey === line.markKey}
                      today={forecast.today}
                      ahead={lookingAhead}
                      until={lookingAhead ? previewDay || undefined : undefined}
                      onMark={() => { if (line.absorbed || !line.markKey) return; void mark(line.markKey, line.paid === true); }}
                      onOpenMenu={openMenu}
                      onDragStart={onDragStart}
                      onDragMove={onDragMove}
                      onDragEnd={onDragEnd}
                      image={plan ? eventImage(plan, line) : ''}
                    />
                  ))}
                  {dropping && <p className="border-t border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-600">Soltar en {month.title}</p>}
                  {extra?.month === month.month ? (
                    <div className="plan-rise grid gap-2 border-t border-slate-200/70 px-3 py-3 dark:border-white/10">
                      <Input placeholder="Qué es" value={extra.name} onChange={(event) => setExtra({ ...extra, name: event.target.value })} />
                      <OriginPicker name={extra.name} image={extra.image} onImage={(image) => setExtra({ ...extra, image })} />
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="number" min="0" step="any" placeholder="Importe" value={extra.amount} onChange={(event) => setExtra({ ...extra, amount: event.target.value })} />
                        <Input type="date" min={`${month.month}-01`} max={monthEnd(month.month)} value={extra.date} onChange={(event) => setExtra({ ...extra, date: event.target.value })} />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setExtra({ ...extra, direction: 'out' })} className={cn('flex-1 rounded-full border py-2 text-sm font-semibold transition-colors', extra.direction === 'out' ? 'border-[#ea3943] text-[#ea3943]' : 'border-slate-200 text-slate-400')}>Sale</button>
                        <button type="button" onClick={() => setExtra({ ...extra, direction: 'in' })} className={cn('flex-1 rounded-full border py-2 text-sm font-semibold transition-colors', extra.direction === 'in' ? 'border-[#16c784] text-[#16c784]' : 'border-slate-200 text-slate-400')}>Entra</button>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1" onClick={() => void addExtra()}>Añadir</Button>
                        <Button variant="secondary" onClick={() => setExtra(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExtra({ month: month.month, name: '', amount: '', date: dayInMonth(month.month, forecast.today || month.month + '-15'), direction: 'out', image: '' })}
                      className="flex w-full items-center gap-2 border-t border-slate-200/70 px-3 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800 dark:border-white/10"
                    >
                      <Plus size={15} /> Añadir extra
                    </button>
                  )}
                </div>}
              </section>
              );
            })}
          </div>
          {menu && (
            <HoldMenu top={menu.top} left={menu.left} onClose={() => setMenu(null)}>
              <button type="button" onClick={() => { const line = menu.line; setMenu(null); beginEdit(line); }} className={cn(holdItemClass, 'text-slate-800 dark:text-slate-100')}><Pencil size={14} /> Editar</button>
              <button type="button" onClick={() => void removeLine(menu.line)} className={cn(holdItemClass, 'text-[#ea3943]')}><Trash2 size={14} /> Eliminar</button>
            </HoldMenu>
          )}
          {drag && createPortal(
            <div
              className="pointer-events-none fixed z-[70] flex w-52 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[13px] shadow-lg ring-2 ring-indigo-300 dark:bg-slate-900 dark:ring-indigo-400/60"
              style={{ left: drag.x, top: drag.y }}
            >
              <LineIcon label={drag.line.label} image={plan ? eventImage(plan, drag.line) : ''} />
              <span className="min-w-0 flex-1 truncate font-semibold">{drag.line.label}</span>
              {drag.line.amount != null && <span className={cn('shrink-0 font-black tabular-nums', lineClass(drag.line))}>{formatSignedEur(drag.line.amount)}</span>}
            </div>,
            document.body,
          )}
        </article>
      )}
      {keepAsk && (
        <div className={modalOverlayClass} onClick={() => setKeepAsk(null)}>
          <div className={cn(modalPanelClass, 'max-w-md')} onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-[17px] font-semibold">¿Lo guardas?</h3>
              <ModalClose onClose={() => setKeepAsk(null)} />
            </div>
            <p className="mt-2 text-sm font-medium text-slate-500">Un reloj, un PC o un anillo se quedan. Una cena no.</p>
            <div className="mt-4 grid gap-2">
              <Button onClick={() => void keepExtra()}>Guardarlo en extras</Button>
              <Button variant="secondary" onClick={() => setKeepAsk(null)}>No, era un gasto</Button>
            </div>
          </div>
        </div>
      )}
      {sheet && (
        <div className={modalOverlayClass} onClick={closeSheet}>
          <div className={cn(modalPanelClass, 'flex max-w-md flex-col')} onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="text-[17px] font-semibold">Imagen del plan</h3>
              <ModalClose onClose={closeSheet} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-[#f2f2f7]">
              <img src={sheet.url} alt="Plan completo" className="w-full" />
            </div>
            <p className="mt-3 text-xs font-medium text-slate-500">Es el plan entero en un solo archivo, aunque quede muy largo. Cópiala para pegarla donde quieras, o guárdala.</p>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" variant="outline" onClick={() => void copySheet()}>{copied ? 'Copiada' : 'Copiar'}</Button>
              <Button className="flex-1" onClick={saveSheet}>Guardar</Button>
            </div>
          </div>
        </div>
      )}
      {draft && (
        <div className={modalOverlayClass} onClick={() => setDraft(null)}>
          <div
            className={cn(modalPanelClass, 'max-w-md')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h3 className="text-[17px] font-semibold">{editing ? 'Editar plan' : 'Nuevo plan'}</h3>
              <ModalClose onClose={() => setDraft(null)} />
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2">
                {([
                  { kind: 'liquidez' as Kind, title: 'Llegar a un líquido', hint: 'Como los 10.000 € de Trade Republic.' },
                  { kind: 'inversion' as Kind, title: 'Subir una inversión', hint: 'Cripto, ETF o acciones.' },
                  { kind: 'patrimonio' as Kind, title: 'Comprar algo', hint: 'Un reloj o unos guantes. Solo el precio.' },
                ]).map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => {
                      setShaped(true);
                      setDraft({
                        ...draft,
                        kind: item.kind,
                        field: item.kind === 'inversion' && ['Cripto', 'ETF', 'Acciones'].includes(draft.field) ? draft.field : item.kind === 'inversion' ? 'Cripto' : draft.field,
                        linkedAccountIds: item.kind === 'patrimonio' ? [] : draft.linkedAccountIds.slice(0, 1),
                        salary: item.kind === 'liquidez' ? draft.salary : '',
                      });
                    }}
                    className={cn('rounded-2xl border px-3 py-2.5 text-left', shaped && draft.kind === item.kind ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 text-slate-700 dark:border-white/10')}
                  >
                    <span className="block text-sm font-black">{item.title}</span>
                    <span className={cn('mt-0.5 block text-[11px] font-medium', shaped && draft.kind === item.kind ? 'text-white/70 dark:text-slate-500' : 'text-slate-400')}>{item.hint}</span>
                  </button>
                ))}
              </div>
              {shaped && draft.kind === 'inversion' && (
                <div className="flex flex-wrap gap-2">
                  {['Cripto', 'ETF', 'Acciones'].map((field) => (
                    <button key={field} type="button" onClick={() => setDraft({ ...draft, field })} className={cn('rounded-full border px-3 py-1 text-xs font-semibold', draft.field === field ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 text-slate-500')}>{field}</button>
                  ))}
                </div>
              )}
              {shaped && (
                <Input label={draft.kind === 'patrimonio' ? 'Qué quieres comprar' : 'Nombre'} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={draft.kind === 'patrimonio' ? 'Guantes' : 'Plan 10k'} />
              )}
              {shaped && draft.kind !== 'patrimonio' && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{draft.kind === 'liquidez' ? 'El líquido de' : `${draft.field || 'Inversión'} en`}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {planPlaces(accounts).map((account) => {
                      const id = String(account._id);
                      const on = draft.linkedAccountIds[0] === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setDraft({ ...draft, linkedAccountIds: on ? [] : [id] })}
                          className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold', on ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 text-slate-600 dark:border-white/10')}
                        >
                          <PlatformLogo name={account.platform || account.name} size={16} />
                          {account.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {shaped && draft.kind === 'liquidez' && (
                <Input label="Nómina al mes" type="number" min="0" step="any" value={draft.salary} onChange={(event) => setDraft({ ...draft, salary: event.target.value })} placeholder="Si no entra, déjalo vacío" />
              )}
              {shaped && (
                <>
                  <Input label="Cuánto apartas" type="number" min="0" step="any" value={draft.monthlySavings} onChange={(event) => setDraft({ ...draft, monthlySavings: event.target.value })} />
                  <Input label="Día en que apartas" type="number" min="1" max="31" value={draft.savingsDay} onChange={(event) => setDraft({ ...draft, savingsDay: event.target.value })} />
                  {draft.kind !== 'patrimonio' && draft.linkedAccountIds.length === 0 && (
                    <Input label="Saldo de partida" type="number" min="0" step="any" value={draft.openingBalance} onChange={(event) => setDraft({ ...draft, openingBalance: event.target.value })} />
                  )}
                  <Input label={draft.kind === 'patrimonio' ? 'Cuánto cuesta' : 'A cuánto quieres llegar'} type="number" min="0" step="any" value={draft.targetAmount} onChange={(event) => setDraft({ ...draft, targetAmount: event.target.value })} />
                  <Input label="Empieza" type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
                  <Input label="Fecha del objetivo" type="date" value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} />
                </>
              )}
              {shaped && (
              <details className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
              <summary className="cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-300">Apuntes</summary>
              <div className="mt-3 grid gap-2">
                {draft.plannedExpenses.map((item, index) => (
                  <ApunteRow key={`e-${index}`} kind="Gasto" name={item.name} amount={item.amount} when={item.date} whenType="date" image={item.image} onName={(name) => patchList(draft, setDraft, 'plannedExpenses', index, { name })} onAmount={(amount) => patchList(draft, setDraft, 'plannedExpenses', index, { amount })} onWhen={(date) => patchList(draft, setDraft, 'plannedExpenses', index, { date })} onImage={(image) => patchList(draft, setDraft, 'plannedExpenses', index, { image })} onRemove={() => setDraft({ ...draft, plannedExpenses: draft.plannedExpenses.filter((_, itemIndex) => itemIndex !== index) })} />
                ))}
                {draft.recurring.map((item, index) => (
                  <ApunteRow key={`r-${index}`} kind="Cada mes" name={item.name} amount={item.amount} when={item.dayOfMonth} whenType="day" onName={(name) => patchList(draft, setDraft, 'recurring', index, { name })} onAmount={(amount) => patchList(draft, setDraft, 'recurring', index, { amount })} onWhen={(dayOfMonth) => patchList(draft, setDraft, 'recurring', index, { dayOfMonth })} onRemove={() => setDraft({ ...draft, recurring: draft.recurring.filter((_, itemIndex) => itemIndex !== index) })} />
                ))}
                {draft.intervals.map((item, index) => (
                  <ApunteRow key={`w-${index}`} kind="Semanas" name={item.name} amount={item.amount} when={item.everyWeeks} whenType="weeks" extra={item.startDate} onName={(name) => patchList(draft, setDraft, 'intervals', index, { name })} onAmount={(amount) => patchList(draft, setDraft, 'intervals', index, { amount })} onWhen={(everyWeeks) => patchList(draft, setDraft, 'intervals', index, { everyWeeks })} onExtra={(startDate) => patchList(draft, setDraft, 'intervals', index, { startDate })} onRemove={() => setDraft({ ...draft, intervals: draft.intervals.filter((_, itemIndex) => itemIndex !== index) })} />
                ))}
                {draft.incomes.map((item, index) => (
                  <ApunteRow key={`i-${index}`} kind="Ingreso" name={item.name} amount={item.amount} when={item.date} whenType="date" status={item.status} image={item.image} onStatus={(status) => patchList(draft, setDraft, 'incomes', index, { status })} onName={(name) => patchList(draft, setDraft, 'incomes', index, { name })} onAmount={(amount) => patchList(draft, setDraft, 'incomes', index, { amount })} onWhen={(date) => patchList(draft, setDraft, 'incomes', index, { date })} onImage={(image) => patchList(draft, setDraft, 'incomes', index, { image })} onRemove={() => setDraft({ ...draft, incomes: draft.incomes.filter((_, itemIndex) => itemIndex !== index) })} />
                ))}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button type="button" onClick={() => setDraft({ ...draft, plannedExpenses: [...draft.plannedExpenses, { name: '', amount: '', date: draft.startDate, paid: false }] })} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10">+ Gasto</button>
                  <button type="button" onClick={() => setDraft({ ...draft, recurring: [...draft.recurring, { name: '', amount: '', dayOfMonth: '1', paidDates: [] }] })} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10">+ Cada mes</button>
                  <button type="button" onClick={() => setDraft({ ...draft, intervals: [...draft.intervals, { name: '', amount: '', everyWeeks: '2', startDate: draft.startDate, paidDates: [] }] })} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10">+ Cada X sem.</button>
                  <button type="button" onClick={() => setDraft({ ...draft, incomes: [...draft.incomes, { name: '', amount: '', date: draft.startDate, status: 'expected', paid: false }] })} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-white/10">+ Ingreso</button>
                </div>
              </div>
              </details>
              )}
              {shaped && <Button onClick={() => void save()}>Guardar plan</Button>}
            </div>
          </div>
        </div>
      )}
      {editor && (
        <div className={modalOverlayClass} onClick={() => setEditor(null)}>
          <div className={cn(modalPanelClass, 'max-w-md')} onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-[17px] font-semibold">Apunte</h3>
              <ModalClose onClose={() => setEditor(null)} />
            </div>
            <div className="grid gap-3">
              <Input label="Nombre" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
              <OriginPicker name={editor.name} image={editor.image} onImage={(editor.kind === 'expense' || editor.kind === 'income') ? (image) => setEditor({ ...editor, image }) : undefined} />
              <Input label="Importe" type="number" min="0" step="any" value={editor.amount} onChange={(event) => setEditor({ ...editor, amount: event.target.value })} />
              {(editor.kind === 'expense' || editor.kind === 'income') && (
                <Input label="Fecha" type="date" value={editor.date} onChange={(event) => setEditor({ ...editor, date: event.target.value })} />
              )}
              {editor.kind === 'recurring' && (
                <Input label="Día del mes" type="number" min="1" max="31" value={editor.dayOfMonth} onChange={(event) => setEditor({ ...editor, dayOfMonth: event.target.value })} />
              )}
              {editor.kind === 'interval' && (
                <Input label="Cada cuántas semanas" type="number" min="1" max="52" value={editor.everyWeeks} onChange={(event) => setEditor({ ...editor, everyWeeks: event.target.value })} />
              )}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => void saveEditor(false)}>Guardar</Button>
                <Button variant="danger" onClick={() => void saveEditor(true)}>Quitar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface EditorDraft {
  key: string;
  kind: string;
  name: string;
  amount: string;
  date: string;
  dayOfMonth: string;
  everyWeeks: string;
  image: string;
}

function balanceAsOf(months: PlanMonthView[], day: string, opening: number): number {
  let balance = opening;
  for (const month of months) {
    for (const line of month.lines) {
      if (!line.day) continue;
      if (line.day <= day || line.paid) balance = line.balance;
    }
  }
  return balance;
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function reachDay(months: PlanMonthView[], today: string, previewDay: string | null): string {
  return previewDay && previewDay > today ? previewDay : today;
}

function countsToward(line: PlanMonthLine, until: string): boolean {
  if (line.absorbed || line.amount == null || !line.day) return false;
  if (line.paid === true) return true;
  return line.automatic === true && line.day <= until;
}

/** Saldo al llegar a `until`: fijos hasta ese día y extras que ya están marcados. */
function walkedBalance(months: PlanMonthView[], until: string, opening: number): number {
  let balance = opening;
  for (const month of months) {
    for (const line of month.lines) {
      if (!countsToward(line, until) || line.amount == null) continue;
      balance = roundCents(balance + line.amount);
    }
  }
  return balance;
}

/** El plan visto desde `until`: los saldos avanzan y los fijos de después siguen sin marcar. */
function walkMonths(months: PlanMonthView[], until: string, opening: number): PlanMonthView[] {
  let balance = opening;
  return months.map((month, monthIndex) => ({
    ...month,
    lines: month.lines.map((line, lineIndex) => {
      if (line.amount == null || !line.day) {
        return { ...line, balance: monthIndex === 0 && lineIndex === 0 ? opening : balance };
      }
      const inside = line.day <= until;
      if (countsToward(line, until)) balance = roundCents(balance + line.amount);
      return { ...line, paid: line.automatic ? inside : line.paid === true, balance };
    }),
  }));
}

function shortDay(iso: string): string {
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const month = Number(iso.slice(5, 7));
  return `${Number(iso.slice(8, 10))} ${names[month - 1] || ''}`.trim();
}

function SoftEur({ value, signed = false }: { value: number; signed?: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (window.matchMedia('(max-width: 767px)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / 560);
      const eased = 1 - (1 - progress) ** 3;
      const next = start + (value - start) * eased;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{signed ? formatSignedEur(shown) : formatEur(shown)}</>;
}

function eventImage(plan: PlanRow, line: PlanMonthLine): string {
  if (!line.markKey) return '';
  const [kind, id] = line.markKey.split(':');
  const list = kind === 'expense' ? plan.plannedExpenses : kind === 'income' ? plan.incomes : [];
  return list?.find((item) => item._id === id)?.image || '';
}

function LineIcon({ label, image }: { label: string; image?: string }) {
  return <OriginGlyph name={label} image={image} className="h-9 w-9" />;
}

function lastDay(month: string): number {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

function monthEnd(month: string): string {
  return `${month}-${String(lastDay(month)).padStart(2, '0')}`;
}

function dayInMonth(month: string, today: string): string {
  if (today.startsWith(month)) return today;
  return `${month}-${String(Math.min(15, lastDay(month))).padStart(2, '0')}`;
}

function PlanLine({ line, index, lifted, today, ahead, until, image, onMark, onOpenMenu, onDragStart, onDragMove, onDragEnd }: {
  line: PlanMonthLine;
  index: number;
  lifted: boolean;
  today?: string;
  ahead?: boolean;
  until?: string;
  image?: string;
  onMark: () => void;
  onOpenMenu: (line: PlanMonthLine, rect: DOMRect) => void;
  onDragStart: (line: PlanMonthLine, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number, rect: DOMRect, fromHandle?: boolean) => void;
}) {
  const timer = useRef<number | null>(null);
  const point = useRef({ x: 0, y: 0, held: false });
  const gripDrag = useRef(false);
  const ref = useRef<HTMLButtonElement>(null);
  const movable = line.markKey?.startsWith('expense:') || line.markKey?.startsWith('income:') || false;
  const markLabel = line.absorbed ? 'Ya está en el efectivo' : line.paid ? 'Quitar marca' : 'Marcar';
  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <div className={cn('hold-target flex items-start gap-2 px-2.5 py-2 text-[13px] transition-transform duration-200 sm:gap-3 sm:px-3 sm:text-sm', index > 0 && 'border-t border-slate-200/70 dark:border-white/10', lifted && 'scale-[0.98] opacity-40', (line.tone === 'plain' || line.tone === 'final') && 'font-semibold')}>
      {line.markKey ? (
        <button type="button" aria-label={markLabel} aria-pressed={line.paid === true} disabled={line.absorbed === true} onPointerDown={(event) => event.stopPropagation()} onClick={onMark} className={cn('mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 bg-white transition-colors duration-150 disabled:opacity-80 dark:bg-transparent', line.paid ? 'border-[#16c784] bg-[#16c784] text-white dark:bg-[#16c784]' : 'border-slate-300 text-transparent dark:border-slate-500')}>
          <Check size={13} strokeWidth={3} className={cn('transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]', line.paid ? 'scale-100 opacity-100' : 'scale-75 opacity-0')} />
        </button>
      ) : (
        <span className="w-[22px] shrink-0" />
      )}
      <span className="min-w-0 flex-1">
      {line.markKey ? (
        <button
          ref={ref}
          type="button"
          title="Mantén para editar"
          className="flex w-full min-w-0 items-start gap-2 text-left sm:gap-3"
          onContextMenu={(event) => {
            event.preventDefault();
            clear();
            if (ref.current) onOpenMenu(line, ref.current.getBoundingClientRect());
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const node = event.currentTarget;
            point.current = { x: event.clientX, y: event.clientY, held: false };
            clear();
            const scroller = node.closest('.app-scroll');
            let drop = () => {};
            const cancelScroll = () => { clear(); drop(); };
            scroller?.addEventListener('scroll', cancelScroll, { passive: true });
            drop = () => scroller?.removeEventListener('scroll', cancelScroll);
            timer.current = window.setTimeout(() => {
              drop();
              point.current.held = true;
              node.classList.add('hold-pop');
              if (navigator.vibrate) navigator.vibrate(10);
              if (ref.current) onOpenMenu(line, ref.current.getBoundingClientRect());
            }, 420);
            const end = () => { clear(); drop(); };
            node.addEventListener('pointerup', end, { once: true });
            node.addEventListener('pointercancel', end, { once: true });
          }}
          onPointerMove={(event) => {
            if (!point.current.held && Math.hypot(event.clientX - point.current.x, event.clientY - point.current.y) > 6) clear();
          }}
        >
          <LineIcon label={line.label} image={image} />
          <span className="min-w-0 flex-1">
            <span className={cn('block break-words leading-snug transition-colors duration-300', line.paid ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>{line.label}</span>
            <span className="mt-0.5 block text-[9px] font-black uppercase tracking-wide text-slate-400">{lineKind(line)}</span>
            {line.absorbed && <span className="block text-[11px] font-medium text-slate-400">Ya está en el efectivo</span>}
            {!line.absorbed && line.paid && line.amount != null && <span className="block text-[11px] font-medium text-slate-400">Queda {formatEur(line.balance)}</span>}
          </span>
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <LineIcon label={line.label} image={image} />
          <span className="min-w-0 break-words leading-snug text-slate-800 dark:text-slate-100">{line.label}</span>
        </span>
      )}
      <span className="mt-1 flex items-center gap-1">
      <span className={cn('ml-auto shrink-0 text-[13px] tabular-nums font-semibold transition-opacity duration-300', lineClass(line), line.markKey && !line.paid && 'opacity-40')}>
        {line.amount == null ? <SoftEur value={line.balance} /> : formatSignedEur(line.amount)}
      </span>
      {line.markKey && (
        <button
          type="button"
          aria-label="Editar o eliminar"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-300"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpenMenu(line, event.currentTarget.getBoundingClientRect());
          }}
        >
          <MoreHorizontal size={15} />
        </button>
      )}
      {movable ? (
        <button
          type="button"
          aria-label="Arrastrar"
          className="grid h-8 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-slate-300 active:cursor-grabbing dark:text-slate-500"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            event.preventDefault();
            gripDrag.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            onDragStart(line, event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (!gripDrag.current) return;
            onDragMove(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            if (!gripDrag.current) return;
            gripDrag.current = false;
            onDragEnd(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), true);
          }}
          onPointerCancel={(event) => {
            if (!gripDrag.current) return;
            gripDrag.current = false;
            onDragEnd(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), true);
          }}
        >
          <GripVertical size={16} />
        </button>
      ) : null}
      </span>
      </span>
    </div>
  );
}

function lineKind(line: PlanMonthLine): string {
  if (line.automatic || line.markKey?.startsWith('recurring') || line.markKey?.startsWith('interval')) return 'Fijo';
  if (line.markKey?.startsWith('savings')) return 'Ahorro';
  if (line.markKey?.startsWith('income') || (line.amount != null && line.amount > 0)) return 'Ingreso';
  return 'Gasto';
}

function ApunteRow({ kind, name, amount, when, whenType, extra, status, image, onName, onAmount, onWhen, onExtra, onStatus, onImage, onRemove }: {
  kind: string;
  name: string;
  amount: string;
  when: string;
  whenType: 'date' | 'day' | 'weeks';
  extra?: string;
  status?: 'expected' | 'confirmed';
  image?: string;
  onName: (value: string) => void;
  onAmount: (value: string) => void;
  onWhen: (value: string) => void;
  onExtra?: (value: string) => void;
  onStatus?: (value: 'expected' | 'confirmed') => void;
  onImage?: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-1.5 rounded-xl border border-slate-200/80 px-2.5 py-2 dark:border-white/10">
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">{kind}</span>
        <input value={name} onChange={(event) => onName(event.target.value)} placeholder="Qué es" className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none" />
        <button type="button" onClick={onRemove} className="text-[11px] font-semibold text-rose-600" aria-label="Quitar">Quitar</button>
      </div>
      <OriginPicker name={name} image={image} onImage={onImage} />
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min="0" step="any" value={amount} onChange={(event) => onAmount(event.target.value)} placeholder="Importe" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] outline-none dark:border-white/10 dark:bg-transparent" />
        <input type={whenType === 'date' ? 'date' : 'number'} min={whenType === 'date' ? undefined : 1} max={whenType === 'day' ? 31 : whenType === 'weeks' ? 52 : undefined} value={when} onChange={(event) => onWhen(event.target.value)} placeholder={whenType === 'day' ? 'Día' : whenType === 'weeks' ? 'Semanas' : ''} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] outline-none dark:border-white/10 dark:bg-transparent" />
      </div>
      {whenType === 'weeks' && onExtra && (
        <input type="date" value={extra || ''} onChange={(event) => onExtra(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] outline-none dark:border-white/10 dark:bg-transparent" />
      )}
      {onStatus && status && (
        <button type="button" onClick={() => onStatus(status === 'confirmed' ? 'expected' : 'confirmed')} className="w-fit text-[11px] font-semibold text-slate-400">
          {status === 'confirmed' ? 'Confirmado' : 'Estimado'}
        </button>
      )}
    </div>
  );
}

function patchList<K extends 'recurring' | 'intervals' | 'plannedExpenses' | 'incomes'>(draft: Draft, setDraft: (draft: Draft) => void, key: K, index: number, patch: Partial<Draft[K][number]>) {
  const next = draft[key].map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
  setDraft({ ...draft, [key]: next });
}
