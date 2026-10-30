import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X } from 'lucide-react';
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
  const [photo, setPhoto] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
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

  const save = async () => {
    const value = Number(amount);
    if (!name.trim()) {
      setError('Escribe qué es el tique.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('El importe tiene que ser mayor que cero.');
      return;
    }
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
        <div className="h-full overflow-y-auto bg-slate-100 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-white">
          <div className="mx-auto grid max-w-md gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Tique</h2>
              <button type="button" onClick={close} className={cn(quiet, 'rounded-full px-3 py-1.5 text-[13px] font-bold')}>Cerrar</button>
            </div>
            <img src={photo} alt="Tique" className="max-h-52 w-full rounded-3xl object-cover" />
            <label className="grid gap-1 text-[13px] font-medium text-slate-600 dark:text-slate-300">
              Qué es
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Café, taxi, compra…" className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base font-bold text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white" />
            </label>
            <label className="grid gap-1 text-[13px] font-medium text-slate-600 dark:text-slate-300">
              Importe
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base font-bold text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white" />
            </label>
            <div>
              <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">Dónde va</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setWhere('personal'); setPayer(userId); }} className={cn('rounded-full border px-3 py-2 text-[13px] font-bold', where === 'personal' ? chipOn : 'border-slate-200 bg-white text-slate-600')}>Gasto personal</button>
                {shares.map((plan) => (
                  <button key={plan._id} type="button" onClick={() => { setWhere(plan._id); setPayer(userId); }} className={cn('rounded-full border px-3 py-2 text-[13px] font-bold', where === plan._id ? chipOn : 'border-slate-200 bg-white text-slate-600')}>{plan.name}</button>
                ))}
              </div>
            </div>
            {where !== 'personal' && (
              <div>
                <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">¿De quién es el tique?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {members.map((member) => (
                    <button key={member.userId} type="button" onClick={() => setPayer(member.userId)} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-bold', payer === member.userId ? chipOn : 'border-slate-200 bg-white text-slate-600')}>
                      <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-black text-white" style={{ background: member.color }}>{member.name.slice(0, 1).toUpperCase()}</span>
                      {member.userId === userId ? 'Tú' : member.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(where === 'personal' || payer === userId) && (
              <div>
                <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">Banco del que sale el 100%</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {accounts.map((account) => (
                    <button key={account.id} type="button" onClick={() => setAccountId(account.id)} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-bold', accountId === account.id ? chipOn : 'border-slate-200 bg-white text-slate-600')}>
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
              <p className="text-[13px] font-medium text-slate-500">{other.name} lo acepta al entrar en el plan. Entonces se resta el 100% de su banco.</p>
            )}
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
            <button type="button" disabled={busy} onClick={() => void save()} className={cn(quiet, 'rounded-2xl py-3.5 text-[15px] font-bold disabled:opacity-50')}>
              {busy ? 'Guardando…' : 'Añadir tique'}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
