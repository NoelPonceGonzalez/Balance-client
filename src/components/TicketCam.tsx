import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Plus, X } from 'lucide-react';
import { modalPanelClass } from '@/components/Modal';
import { PlatformLogo } from '@/components/PlatformLogo';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PlanRow } from '@/lib/types';

interface Bank {
  id: string;
  name: string;
}

interface Member {
  userId: string;
  name: string;
  color: string;
}

const quiet = 'border border-slate-200/90 bg-white text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-slate-900 dark:text-white';
const chipOn = 'border-slate-200 bg-slate-100 text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-white';

interface TicketLine {
  key: string;
  name: string;
  amount: string;
}

function euros(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

function readAmount(raw: string): number {
  return Number(raw.trim().replace(',', '.'));
}

function ticketTitle(rows: TicketLine[]): string {
  const names = rows.map((row) => row.name.trim());
  if (names.length <= 1) return (names[0] || '').slice(0, 80);
  let title = names[0];
  for (let index = 1; index < names.length; index += 1) {
    const next = `${title}, ${names[index]}`;
    if (next.length > 80) return `${title} y ${names.length - index} más`.slice(0, 80);
    title = next;
  }
  return title;
}

function shrinkPhoto(source: CanvasImageSource, width: number, height: number): string {
  const longest = Math.max(width, height);
  const scale = longest > 1280 ? 1280 / longest : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const pen = canvas.getContext('2d');
  if (!pen) return '';
  pen.drawImage(source, 0, 0, canvas.width, canvas.height);
  let quality = 0.72;
  let url = canvas.toDataURL('image/jpeg', quality);
  while (url.length > 420_000 && quality > 0.42) {
    quality -= 0.08;
    url = canvas.toDataURL('image/jpeg', quality);
  }
  return url.length > 500_000 ? '' : url;
}

export function TicketCam({
  userId,
  onClose,
  onSaved,
}: {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lineKey = useRef(1);
  const [photo, setPhoto] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [lines, setLines] = useState<TicketLine[]>([{ key: '1', name: '', amount: '' }]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [accounts, setAccounts] = useState<Bank[]>([]);
  const [where, setWhere] = useState('personal');
  const [payer, setPayer] = useState(userId);
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    api<{ plans: { plan: PlanRow }[] }>('/api/plans')
      .then((data) => {
        if (!cancel) setPlans(data.plans.map((item) => item.plan));
      })
      .catch(() => undefined);
    api<{ accounts: { _id: string; name: string; currency: string; archived?: boolean }[] }>('/api/accounts')
      .then((data) => {
        if (cancel) return;
        const euros = data.accounts.filter((account) => account.currency === 'EUR' && !account.archived).map((account) => ({ id: String(account._id), name: account.name }));
        setAccounts(euros);
        setAccountId((current) => current || euros[0]?.id || '');
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (photo) return undefined;
    let stop = false;
    const boot = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Este navegador no deja abrir la cámara. Puedes elegir la foto del tique.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stop) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        if (!stop) setCameraError('No se ha podido usar la cámara. Revisa el permiso o elige la foto del tique.');
      }
    };
    void boot();
    return () => {
      stop = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [photo]);

  const close = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    onClose();
  };

  const take = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const url = shrinkPhoto(video, video.videoWidth, video.videoHeight);
    if (!url) {
      setCameraError('La foto pesa demasiado. Acércala un poco menos.');
      return;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setPhoto(url);
  };

  const fromFile = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const url = shrinkPhoto(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    if (!url) {
      setCameraError('La foto pesa demasiado.');
      return;
    }
    setCameraError('');
    setPhoto(url);
  };

  const shares = plans.filter((plan) => plan.kind === 'gastos' && (plan.tripStatus || 'active') === 'active');
  const chosen = shares.find((plan) => plan._id === where);
  const members: Member[] = (chosen?.members || []).map((member) => ({
    userId: String(member.userId),
    name: member.name,
    color: member.color,
  }));
  const linked = plans.filter((plan) => plan.kind !== 'gastos' && (plan.linkedAccountIds || []).map(String).includes(accountId));
  const bankName = accounts.find((account) => account.id === accountId)?.name || 'ese banco';
  const other = members.find((member) => member.userId === payer);

  const addLine = () => {
    lineKey.current += 1;
    setLines((rows) => [...rows, { key: String(lineKey.current), name: '', amount: '' }]);
    setError('');
  };

  const save = async () => {
    const filled = lines.filter((line) => line.name.trim() || line.amount.trim());
    if (!filled.length) {
      setError('Escribe qué hay en el tique.');
      return;
    }
    if (filled.some((line) => !line.name.trim() || !Number.isFinite(readAmount(line.amount)) || readAmount(line.amount) <= 0)) {
      setError('Completa cada cosa de la lista.');
      return;
    }
    const value = filled.reduce((sum, line) => sum + readAmount(line.amount), 0);
    const name = ticketTitle(filled);
    if (!photo) {
      setError('Falta la foto.');
      return;
    }
    const mine = where === 'personal' || payer === userId;
    if (mine && !accountId) {
      setError('Elige el banco del que sale.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (where === 'personal') {
        await api('/api/plans/tique', { method: 'POST', body: JSON.stringify({ name: name.trim(), amount: value, accountId, receipt: photo }) });
      } else {
        await api(`/api/plans/${where}/gasto`, {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            amount: value,
            paidBy: payer,
            splitAmong: [],
            category: '',
            receipt: photo,
            accountId: payer === userId ? accountId : undefined,
          }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-950/80 text-white">
      {!photo ? (
        <div className="relative h-full">
          <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
          <button type="button" onClick={close} className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-slate-800" aria-label="Cerrar">
            <X size={18} />
          </button>
          {cameraError && (
            <div className="absolute inset-x-4 top-20 rounded-3xl bg-white p-4 text-sm font-medium text-slate-700">
              <p>{cameraError}</p>
              <label className={cn(quiet, 'mt-3 flex cursor-pointer items-center justify-center rounded-2xl px-4 py-3 text-[15px] font-bold')}>
                Elegir foto
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void fromFile(file); }} />
              </label>
            </div>
          )}
          <button type="button" onClick={take} className="absolute bottom-10 left-1/2 grid h-20 w-20 -translate-x-1/2 place-items-center rounded-full border-4 border-white bg-white/20" aria-label="Hacer la foto">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-slate-900">
              <Camera size={26} />
            </span>
          </button>
        </div>
      ) : (
        <div className="relative h-full">
          <img src={photo} alt="Tique" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-md" />
          <div className="absolute inset-0 flex items-end justify-center p-3 sm:items-center">
            <div role="dialog" aria-labelledby="ticket-read" className={cn(modalPanelClass, 'max-w-sm')}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-slate-500">He leído esto</p>
                  <h2 id="ticket-read" className="text-[22px] font-semibold tracking-tight">¿Está todo correcto?</h2>
                </div>
                <button type="button" onClick={close} className="shrink-0 rounded-full border border-slate-200/90 bg-white/60 px-3 py-1 text-[13px] font-medium text-slate-600">Cerrar</button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/80 dark:border-white/10 dark:bg-white/5">
                {lines.map((line, index) => (
                  <div key={line.key} className={cn('grid items-center gap-2 px-3 py-2', lines.length > 1 ? 'grid-cols-[1fr_5.5rem_auto]' : 'grid-cols-[1fr_5.5rem]', index > 0 && 'border-t border-slate-200/80 dark:border-white/10')}>
                    <input value={line.name} onChange={(event) => setLines(lines.map((item) => (item.key === line.key ? { ...item, name: event.target.value } : item)))} placeholder="Qué es" aria-label={`Qué es, línea ${index + 1}`} className="min-w-0 bg-transparent text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-slate-400" />
                    <input value={line.amount} onChange={(event) => setLines(lines.map((item) => (item.key === line.key ? { ...item, amount: event.target.value } : item)))} inputMode="decimal" placeholder="0,00" aria-label={`Importe, línea ${index + 1}`} className="min-w-0 bg-transparent text-right text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-slate-400" />
                    {lines.length > 1 && (
                      <button type="button" onClick={() => setLines(lines.filter((item) => item.key !== line.key))} className="grid h-7 w-7 place-items-center rounded-full text-slate-400" aria-label={`Quitar línea ${index + 1}`}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <button type="button" onClick={addLine} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold text-indigo-600">
                  <Plus size={14} />
                  Añadir
                </button>
                <p className="text-[13px] font-semibold text-slate-500">Total {euros(lines.reduce((sum, line) => sum + (Number.isFinite(readAmount(line.amount)) ? Math.max(0, readAmount(line.amount)) : 0), 0))}</p>
              </div>
              <div className="mt-4">
                <p className="text-[13px] font-medium text-slate-500">Dónde va</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setWhere('personal'); setPayer(userId); }} className={cn('rounded-full border px-3 py-2 text-[13px] font-semibold', where === 'personal' ? chipOn : 'border-slate-200 bg-white/70 text-slate-600')}>Gasto personal</button>
                  {shares.map((plan) => (
                    <button key={plan._id} type="button" onClick={() => { setWhere(plan._id); setPayer(userId); }} className={cn('rounded-full border px-3 py-2 text-[13px] font-semibold', where === plan._id ? chipOn : 'border-slate-200 bg-white/70 text-slate-600')}>{plan.name}</button>
                  ))}
                </div>
              </div>
              {where !== 'personal' && (
                <div className="mt-4">
                  <p className="text-[13px] font-medium text-slate-500">¿De quién es el tique?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {members.map((member) => (
                      <button key={member.userId} type="button" onClick={() => setPayer(member.userId)} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-semibold', payer === member.userId ? chipOn : 'border-slate-200 bg-white/70 text-slate-600')}>
                        <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-black text-white" style={{ background: member.color }}>{member.name.slice(0, 1).toUpperCase()}</span>
                        {member.userId === userId ? 'Tú' : member.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(where === 'personal' || payer === userId) && (
                <div className="mt-4">
                  <p className="text-[13px] font-medium text-slate-500">Banco del que sale el 100%</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {accounts.map((account) => (
                      <button key={account.id} type="button" onClick={() => setAccountId(account.id)} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-semibold', accountId === account.id ? chipOn : 'border-slate-200 bg-white/70 text-slate-600')}>
                        <PlatformLogo name={account.name} size={22} />
                        {account.name}
                      </button>
                    ))}
                  </div>
                  {accountId && (
                    <p className="mt-2 text-[12px] font-medium text-slate-500">
                      Sale el importe entero de {bankName}.{linked.length > 0 ? ` También baja en ${linked.map((plan) => plan.name).join(', ')}.` : ''}
                    </p>
                  )}
                </div>
              )}
              {where !== 'personal' && payer !== userId && other && (
                <p className="mt-3 text-[13px] font-medium text-slate-500">{other.name} lo acepta al entrar en el plan. Entonces se resta el 100% de su banco.</p>
              )}
              {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
              <button type="button" disabled={busy} onClick={() => void save()} className="mt-4 w-full rounded-full bg-indigo-600 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50">
                {busy ? 'Guardando…' : 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
