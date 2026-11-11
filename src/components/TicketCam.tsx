import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Plus, X } from 'lucide-react';
import { modalPanelClass } from '@/components/Modal';
import { PlatformLogo } from '@/components/PlatformLogo';
import { api } from '@/lib/api';
import { classifyLine, fold, groupForKind, isCashName, looksLikeWallet, readWalletText, type PhotoClass, type PhotoRead } from '@/lib/read-wallet';
import { PLATFORMS, type PlatformPreset } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import type { PlanRow } from '@/lib/types';

interface Bank {
  id: string;
  name: string;
  kind: string;
  tracking: 'balance' | 'positions';
  platform: string;
}

interface WalletLine {
  key: string;
  name: string;
  amount: string;
  assetClass: PhotoClass;
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

function showAmount(value: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function readAmount(raw: string): number {
  const token = raw.trim().replace(/\s/g, '');
  if (token.includes(',')) return Number(token.replace(/\./g, '').replace(',', '.'));
  return Number(token);
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

function shrinkPhoto(source: CanvasImageSource, width: number, height: number, sharp = false): string {
  const longest = Math.max(width, height);
  const cap = sharp ? 1800 : 1280;
  const scale = longest > cap ? cap / longest : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const pen = canvas.getContext('2d');
  if (!pen) return '';
  pen.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (sharp) return canvas.toDataURL('image/jpeg', 0.92);
  let quality = 0.72;
  let url = canvas.toDataURL('image/jpeg', quality);
  while (url.length > 420_000 && quality > 0.42) {
    quality -= 0.08;
    url = canvas.toDataURL('image/jpeg', quality);
  }
  return url.length > 500_000 ? '' : url;
}

function enhanceForRead(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const pen = canvas.getContext('2d', { willReadFrequently: true });
      if (!pen) {
        resolve(dataUrl);
        return;
      }
      pen.drawImage(image, 0, 0);
      const frame = pen.getImageData(0, 0, canvas.width, canvas.height);
      const data = frame.data;
      let total = 0;
      const count = data.length / 4;
      for (let index = 0; index < data.length; index += 4) {
        total += data[index] * 0.3 + data[index + 1] * 0.59 + data[index + 2] * 0.11;
      }
      const dark = count > 0 && total / count < 120;
      for (let index = 0; index < data.length; index += 4) {
        let gray = data[index] * 0.3 + data[index + 1] * 0.59 + data[index + 2] * 0.11;
        if (dark) gray = 255 - gray;
        const contrast = Math.min(255, Math.max(0, (gray - 128) * 1.35 + 128));
        data[index] = contrast;
        data[index + 1] = contrast;
        data[index + 2] = contrast;
      }
      pen.putImageData(frame, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
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
  const walletKey = useRef(1);
  const accountsRef = useRef<Bank[]>([]);
  const ocrRef = useRef('');
  const touched = useRef(false);
  const modePicked = useRef(false);
  const shotRef = useRef<'tique' | 'cartera'>('tique');
  const [photo, setPhoto] = useState('');
  const [shot, setShot] = useState<'tique' | 'cartera'>('tique');
  const [cameraError, setCameraError] = useState('');
  const [cameraTry, setCameraTry] = useState(0);
  const [lines, setLines] = useState<TicketLine[]>([{ key: '1', name: '', amount: '' }]);
  const [walletLines, setWalletLines] = useState<WalletLine[]>([]);
  const [walletId, setWalletId] = useState('');
  const [fresh, setFresh] = useState<PlatformPreset | null>(null);
  const [catalog, setCatalog] = useState(false);
  const [query, setQuery] = useState('');
  const [reading, setReading] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [accounts, setAccounts] = useState<Bank[]>([]);
  const [where, setWhere] = useState('personal');
  const [outside, setOutside] = useState(false);
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
    api<{ accounts: { _id: string; name: string; currency: string; archived?: boolean; kind: string; tracking: 'balance' | 'positions'; platform: string }[] }>('/api/accounts')
      .then((data) => {
        if (cancel) return;
        const euros = data.accounts.filter((account) => account.currency === 'EUR' && !account.archived).map((account) => ({
          id: String(account._id),
          name: account.name,
          kind: account.kind,
          tracking: account.tracking,
          platform: account.platform,
        }));
        setAccounts(euros);
        accountsRef.current = euros;
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
        setCameraError('Este navegador no deja abrir la cámara. Puedes elegir la foto.');
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
      } catch (err) {
        if (stop) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError('El teléfono tiene la cámara bloqueada. En los ajustes del móvil, entra en Balance y permite la cámara. También puedes elegir la foto.');
          return;
        }
        setCameraError('No se ha podido usar la cámara. Revisa el permiso o elige la foto.');
      }
    };
    void boot();
    return () => {
      stop = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [photo, cameraTry]);

  shotRef.current = shot;

  const showRead = (read: PhotoRead) => {
    walletKey.current = read.lines.length;
    if (!touched.current) {
      if (read.accountId) {
        setFresh(null);
        setWalletId(read.accountId);
      } else if (read.preset) {
        setWalletId('');
        setFresh(read.preset);
      } else {
        setWalletId('');
        setFresh(null);
      }
    }
    setWalletLines(read.lines.map((line, index) => ({
      key: String(index + 1),
      name: line.name,
      amount: showAmount(line.amount),
      assetClass: line.assetClass,
    })));
    if (!read.lines.length) setError('No he reconocido importes. Puedes escribirlos.');
  };

  useEffect(() => {
    if (!photo) return undefined;
    let cancel = false;
    setReading(true);
    setError('');
    const run = async () => {
      try {
        const { createWorker, PSM } = await import('tesseract.js');
        const worker = await createWorker('spa+eng');
        try {
          await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, user_defined_dpi: '300' });
          const prepared = await enhanceForRead(photo);
          const result = await worker.recognize(prepared);
          if (cancel) return;
          const text = result.data.text || '';
          ocrRef.current = text;
          const read = readWalletText(text, accountsRef.current);
          const wantWallet = shotRef.current === 'cartera' || (!modePicked.current && looksLikeWallet(read, text));
          if (!wantWallet) return;
          if (shotRef.current !== 'cartera') setShot('cartera');
          showRead(read);
        } finally {
          await worker.terminate();
        }
      } catch {
        if (!cancel) setError('No he podido leer la foto. Escribe los importes.');
      } finally {
        if (!cancel) setReading(false);
      }
    };
    void run();
    return () => {
      cancel = true;
    };
  }, [photo]);

  useEffect(() => {
    if (shot !== 'cartera' || !ocrRef.current || touched.current || !accounts.length) return;
    const read = readWalletText(ocrRef.current, accounts);
    if (read.accountId) {
      const account = accounts.find((item) => item.id === read.accountId);
      if (!account || walletId === read.accountId) return;
      setFresh(null);
      setWalletId(read.accountId);
      const group = groupForKind(account.kind, account.name);
      setWalletLines((rows) => rows.map((line) => ({ ...line, assetClass: classifyLine(line.name, group) })));
      return;
    }
    if (walletId || fresh || !read.preset) return;
    setFresh(read.preset);
    setWalletLines((rows) => rows.map((line) => ({ ...line, assetClass: classifyLine(line.name, read.preset?.group || null) })));
  }, [accounts, walletId, shot, fresh]);

  const catalogMatches = useMemo(() => {
    const key = fold(query);
    return PLATFORMS
      .filter((item) => !key || fold(item.name).includes(key) || item.id.includes(key))
      .sort((a, b) => {
        const rank = (item: PlatformPreset) => {
          if (!key) return 1;
          const name = fold(item.name);
          if (name === key || item.id === key) return 0;
          if (name.startsWith(key)) return 1;
          return 2;
        };
        return rank(a) - rank(b);
      });
  }, [query]);

  const close = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    onClose();
  };

  const take = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const url = shrinkPhoto(video, video.videoWidth, video.videoHeight, shot === 'cartera');
    if (!url) {
      setCameraError('La foto pesa demasiado. Acércala un poco menos.');
      return;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    ocrRef.current = '';
    touched.current = false;
    setReading(true);
    setWalletId('');
    setFresh(null);
    setCatalog(false);
    setQuery('');
    setWalletLines([]);
    setError('');
    setPhoto(url);
  };

  const fromFile = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const url = shrinkPhoto(bitmap, bitmap.width, bitmap.height, shot === 'cartera');
    bitmap.close();
    if (!url) {
      setCameraError('La foto pesa demasiado.');
      return;
    }
    setCameraError('');
    ocrRef.current = '';
    touched.current = false;
    setReading(true);
    setWalletId('');
    setFresh(null);
    setCatalog(false);
    setQuery('');
    setWalletLines([]);
    setError('');
    setPhoto(url);
  };

  const chooseShot = (id: 'tique' | 'cartera') => {
    modePicked.current = true;
    setShot(id);
    setError('');
    if (id !== 'cartera' || !ocrRef.current) return;
    showRead(readWalletText(ocrRef.current, accountsRef.current));
  };

  const shares = plans.filter((plan) => plan.kind === 'gastos' && (plan.tripStatus || 'active') === 'active');
  const chosen = shares.find((plan) => plan._id === where);
  const members: Member[] = (chosen?.members || []).map((member) => ({
    userId: String(member.userId),
    name: member.name,
    color: member.color,
  }));
  const linked = plans.filter((plan) => plan.kind !== 'gastos' && (plan.linkedAccountIds || []).map(String).includes(accountId));
  const followed = plans.filter((plan) => plan.kind !== 'gastos' && walletId && (plan.linkedAccountIds || []).map(String).includes(walletId));
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
        for (const line of filled) {
          await api('/api/plans/tique', { method: 'POST', body: JSON.stringify({ name: line.name.trim(), amount: readAmount(line.amount), accountId, receipt: photo }) });
        }
      } else {
        await api(`/api/plans/${where}/gasto`, {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            amount: value,
            paidBy: payer,
            splitAmong: [],
            category: '',
            counts: !outside,
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

  const retitle = (id: string) => {
    const account = accounts.find((item) => item.id === id);
    if (!account) return;
    const group = groupForKind(account.kind, account.name);
    touched.current = true;
    setWalletId(id);
    setFresh(null);
    setCatalog(false);
    setQuery('');
    setWalletLines((rows) => rows.map((line) => ({ ...line, assetClass: classifyLine(line.name, group) })));
    setError('');
  };

  const applyPlatform = (preset: PlatformPreset) => {
    const key = fold(preset.name);
    const existing = accounts.find((item) => fold(item.name) === key || fold(item.platform) === key);
    if (existing) {
      retitle(existing.id);
      return;
    }
    touched.current = true;
    setWalletId('');
    setFresh(preset);
    setCatalog(false);
    setQuery('');
    setWalletLines((rows) => rows.map((line) => ({ ...line, assetClass: classifyLine(line.name, preset.group) })));
    setError('');
  };

  const saveWallet = async () => {
    const filled = walletLines.filter((line) => line.name.trim() || line.amount.trim());
    if (filled.some((line) => !line.name.trim() || !Number.isFinite(readAmount(line.amount)) || readAmount(line.amount) <= 0)) {
      setError('Completa cada cosa de la lista.');
      return;
    }
    const positions = filled.filter((line) => !isCashName(line.name));
    const cash = filled.filter((line) => isCashName(line.name));
    const liquid = cash.length ? Math.max(...cash.map((line) => readAmount(line.amount))) : 0;
    const chosen = accounts.find((account) => account.id === walletId);
    if ((!chosen && !fresh) || !filled.length) return;
    setBusy(true);
    setError('');
    try {
      let target = chosen?.id || '';
      let tracking = chosen?.tracking || fresh?.tracking || 'positions';
      if (!chosen && fresh) {
        const onlyBalance = fresh.tracking === 'balance' && positions.length === 0;
        const created = await api<{ account: { _id: string } }>('/api/accounts', {
          method: 'POST',
          body: JSON.stringify({
            name: fresh.name,
            platform: fresh.name,
            kind: fresh.kind,
            tracking: onlyBalance ? 'balance' : 'positions',
            currency: 'EUR',
            balance: onlyBalance ? (filled[0] ? readAmount(filled[0].amount) : 0) : liquid,
          }),
        });
        target = String(created.account._id);
        tracking = onlyBalance ? 'balance' : 'positions';
        if (tracking === 'balance') {
          onSaved();
          return;
        }
      } else if (tracking === 'balance' && positions.length === 0) {
        const amount = filled.length ? Math.max(...filled.map((line) => readAmount(line.amount))) : 0;
        await api(`/api/accounts/${target}`, { method: 'PATCH', body: JSON.stringify({ balance: amount }) });
        onSaved();
        return;
      } else if (tracking === 'balance') {
        await api(`/api/accounts/${target}`, { method: 'PATCH', body: JSON.stringify({ tracking: 'positions', ...(cash.length ? { balance: liquid } : {}) }) });
      } else if (cash.length) {
        await api(`/api/accounts/${target}`, { method: 'PATCH', body: JSON.stringify({ balance: liquid }) });
      }
      const book = await api<{ holdings: { _id: string; accountId: string; name: string; quantity: number }[] }>('/api/holdings');
      const mine = (book.holdings || []).filter((item) => String(item.accountId) === target);
      for (const line of positions) {
        const amount = readAmount(line.amount);
        const found = mine.find((item) => item.name.trim().toLowerCase() === line.name.trim().toLowerCase());
        if (found) {
          const qty = found.quantity > 0 ? found.quantity : 1;
          await api(`/api/holdings/${found._id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: line.name.trim(), assetClass: line.assetClass, quantity: qty, unitMarketValue: amount / qty }),
          });
        } else {
          await api('/api/holdings', {
            method: 'POST',
            body: JSON.stringify({
              accountId: target,
              name: line.name.trim(),
              symbol: '',
              assetClass: line.assetClass,
              quantity: 1,
              unitMarketValue: amount,
              currency: 'EUR',
            }),
          });
        }
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
          <div className="absolute left-1/2 top-4 flex -translate-x-1/2 gap-1 rounded-full bg-black/45 p-1">
            {([['tique', 'Tique'], ['cartera', 'Cartera']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={shot === id}
                onClick={() => chooseShot(id)}
                className={cn('rounded-full px-4 py-2 text-[13px] font-semibold', shot === id ? 'bg-white text-slate-950' : 'text-white')}
              >
                {label}
              </button>
            ))}
          </div>
          {cameraError && (
            <div className="absolute inset-x-4 top-20 rounded-3xl bg-white p-4 text-sm font-medium text-slate-700">
              <p>{cameraError}</p>
              <button type="button" onClick={() => { setCameraError(''); setCameraTry((value) => value + 1); }} className={cn(quiet, 'mt-3 w-full rounded-2xl px-4 py-3 text-[15px] font-bold')}>Activar cámara</button>
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
          <div className="absolute inset-0 bg-black/25 dark:bg-black/50" />
          <div className="absolute inset-0 flex items-end justify-center p-3 sm:items-center" onClick={close}>
            {shot === 'cartera' ? (
            <div role="dialog" aria-labelledby="wallet-read" className={cn(modalPanelClass, 'flex max-h-[85dvh] max-w-md flex-col overflow-hidden p-0')} onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
                <div>
                  <p className="text-[13px] font-medium text-slate-500">{reading ? 'Leyendo la foto…' : 'De la foto'}</p>
                  <h2 id="wallet-read" className="text-[22px] font-semibold tracking-tight">{accounts.find((account) => account.id === walletId)?.name || fresh?.name || 'Elige la cartera'}</h2>
                </div>
                <button type="button" onClick={close} className="shrink-0 rounded-full border border-slate-200/90 bg-white/60 px-3 py-1 text-[13px] font-medium text-slate-600">Cerrar</button>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 px-5">
                {accounts.map((account) => {
                  const on = walletId === account.id;
                  return (
                    <button key={account.id} type="button" aria-pressed={on} onClick={() => retitle(account.id)} className={cn('inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold', on ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200')}>
                      <PlatformLogo name={account.platform || account.name} size={22} />
                      {account.name}
                    </button>
                  );
                })}
                {fresh && (
                  <button type="button" aria-pressed className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-slate-950">
                    <PlatformLogo name={fresh.name} size={22} />
                    {fresh.name}
                  </button>
                )}
                <button type="button" aria-pressed={catalog} onClick={() => { setCatalog((open) => !open); setQuery(''); setError(''); }} className={cn('rounded-full px-3 py-2 text-[13px] font-semibold', catalog ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-200')}>Otra</button>
              </div>
              {catalog ? (
                <input
                  value={query}
                  autoFocus
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && query.trim() && catalogMatches[0]) applyPlatform(catalogMatches[0]); }}
                  placeholder="Busca la cartera"
                  aria-label="Busca la cartera"
                  className="mx-5 mt-3 block w-[calc(100%-2.5rem)] shrink-0 rounded-2xl bg-slate-100 px-3 py-2.5 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-slate-400 dark:bg-white/10"
                />
              ) : !walletId && !fresh && !reading ? (
                <p className="mt-3 px-5 text-sm font-medium text-slate-500">Si no está, pulsa Otra.</p>
              ) : null}
              {(walletId || fresh) && !catalog && !reading && (
                <p className="mt-3 px-5 text-sm font-medium text-slate-500">{walletId && followed.length ? `Se actualiza en ${followed.map((plan) => plan.name).join(', ')}.` : 'Ningún plan sigue esta cartera.'}</p>
              )}
              <div className="sheet-scroll mt-3 min-h-0 flex-auto overflow-y-auto px-5">
              {catalog ? (
                <div>
                  {catalogMatches.map((item) => (
                    <button key={item.id} type="button" onClick={() => applyPlatform(item)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5">
                      <PlatformLogo name={item.name} size={28} />
                      <span className="text-[15px] font-semibold">{item.name}</span>
                    </button>
                  ))}
                  {query.trim() && catalogMatches.length === 0 && <p className="px-2 py-3 text-sm font-medium text-slate-500">No está entre las carteras.</p>}
                </div>
              ) : reading ? (
                <p className="py-2 text-sm font-medium text-slate-500">Estoy leyendo los importes.</p>
              ) : (
                <div className="space-y-1">
                  {walletLines.length === 0 && <p className="py-2 text-sm font-medium text-slate-500">No he visto importes. Añádelos tú.</p>}
                  {walletLines.map((line, index) => (
                    <div key={line.key} className="flex items-center gap-2 rounded-2xl px-2 py-2.5">
                      <input value={line.name} onChange={(event) => {
                        const account = accounts.find((item) => item.id === walletId);
                        const group = account ? groupForKind(account.kind, account.name) : (fresh?.group || null);
                        const name = event.target.value;
                        setWalletLines(walletLines.map((item) => (item.key === line.key ? { ...item, name, assetClass: classifyLine(name, group) } : item)));
                      }} placeholder="Qué es" aria-label={`Qué es, línea ${index + 1}`} className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold tracking-tight outline-none placeholder:font-medium placeholder:text-slate-400" />
                      <input value={line.amount} onChange={(event) => setWalletLines(walletLines.map((item) => (item.key === line.key ? { ...item, amount: event.target.value } : item)))} inputMode="decimal" placeholder="0,00" aria-label={`Importe, línea ${index + 1}`} className="w-24 bg-transparent text-right text-[16px] font-semibold tabular-nums outline-none placeholder:font-medium placeholder:text-slate-400" />
                      <span className="text-sm font-medium text-slate-400">€</span>
                      <button type="button" onClick={() => setWalletLines(walletLines.filter((item) => item.key !== line.key))} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-300 hover:text-slate-500" aria-label={`Quitar línea ${index + 1}`}>
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => { walletKey.current += 1; setWalletLines((rows) => [...rows, { key: `w${walletKey.current}`, name: '', amount: '', assetClass: 'other' }]); setError(''); }} className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-2 text-[13px] font-semibold text-slate-500">
                    <Plus size={14} />
                    Añadir
                  </button>
                </div>
              )}
              </div>
              <div className="shrink-0 px-5 pt-3 pb-5">
              {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
              <button type="button" disabled={(!walletId && !fresh) || catalog || busy || reading} onClick={() => void saveWallet()} className="w-full rounded-full bg-slate-950 py-3.5 text-[15px] font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">
                {busy ? 'Guardando…' : 'Aceptar'}
              </button>
              </div>
            </div>
            ) : (
            <div role="dialog" aria-labelledby="ticket-read" className={cn(modalPanelClass, 'max-w-sm')} onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-white/10">
                    {([['tique', 'Tique'], ['cartera', 'Cartera']] as const).map(([id, label]) => (
                      <button key={id} type="button" aria-pressed={shot === id} onClick={() => chooseShot(id)} className={cn('rounded-full px-3 py-1.5 text-[13px] font-semibold', shot === id ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500')}>{label}</button>
                    ))}
                  </div>
                  <p className="text-[13px] font-medium text-slate-500">He leído esto</p>
                  <h2 id="ticket-read" className="text-[22px] font-semibold tracking-tight">¿Está todo correcto?</h2>
                </div>
                <button type="button" onClick={close} className="shrink-0 rounded-full border border-slate-200/90 bg-white/60 px-3 py-1 text-[13px] font-medium text-slate-600">Cerrar</button>
              </div>
              {reading && <p className="mb-3 text-sm font-medium text-slate-500">Estoy leyendo la foto.</p>}
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
                <button type="button" onClick={addLine} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold text-slate-900 dark:text-white">
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
                  <p className="text-[13px] font-medium text-slate-500">Presupuesto</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setOutside(false)} className={cn('rounded-full border px-3 py-2 text-[13px] font-semibold', !outside ? chipOn : 'border-slate-200 bg-white/70 text-slate-600')}>Cuenta</button>
                    <button type="button" onClick={() => setOutside(true)} className={cn('rounded-full border px-3 py-2 text-[13px] font-semibold', outside ? chipOn : 'border-slate-200 bg-white/70 text-slate-600')}>Fuera</button>
                  </div>
                  <p className="mt-2 text-[12px] font-medium text-slate-500">{outside ? 'No baja lo que lleváis allí.' : 'Baja lo que lleváis allí.'}</p>
                </div>
              )}
              {where !== 'personal' && (
                <div className="mt-4">
                  <p className="text-[13px] font-medium text-slate-500">¿De quién es el tique?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {members.map((member) => (
                      <button key={member.userId} type="button" onClick={() => setPayer(member.userId)} className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-semibold', payer === member.userId ? chipOn : 'border-slate-200 bg-white/70 text-slate-600')}>
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-950 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-950">{member.name.slice(0, 1).toUpperCase()}</span>
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
                      Sale el importe entero de {bankName}.{linked.length > 0 ? ` Baja en ${linked.map((plan) => plan.name).join(', ')}.` : ' No toca ningún plan.'}
                    </p>
                  )}
                </div>
              )}
              {where !== 'personal' && payer !== userId && other && (
                <p className="mt-3 text-[13px] font-medium text-slate-500">{other.name} lo acepta al entrar en el plan. Entonces se resta el 100% de su banco.</p>
              )}
              {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
              <button type="button" disabled={busy || reading} onClick={() => void save()} className="mt-4 w-full rounded-full bg-slate-950 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">
                {busy ? 'Guardando…' : 'Aceptar'}
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
