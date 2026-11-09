import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { modalPanelClass } from '@/components/Modal';
import { activateCamera, activatePush, phoneStatus, type Gate } from '@/lib/device';
import { syncPhonePush, warmPushKey } from '@/lib/push';
import { softSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';

const LATER = 'pat_perm_later';

function missing(gate: Gate): boolean {
  return gate === 'ask' || gate === 'blocked';
}

export function DeviceAccess() {
  const [push, setPush] = useState<Gate | null>(null);
  const [camera, setCamera] = useState<Gate | null>(null);
  const [aside, setAside] = useState(() => sessionStorage.getItem(LATER) === '1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'push' | 'camera' | ''>('');

  const refresh = () => {
    void phoneStatus().then((next) => {
      setPush(next.push);
      setCamera(next.camera);
      if (!missing(next.push) && !missing(next.camera)) sessionStorage.removeItem(LATER);
    });
  };

  useEffect(() => {
    warmPushKey();
    void syncPhonePush().finally(refresh);
  }, []);

  const later = () => {
    sessionStorage.setItem(LATER, '1');
    setAside(true);
  };

  const turnOn = async (kind: 'push' | 'camera') => {
    setBusy(kind);
    setNote('');
    try {
      const message = kind === 'push' ? await activatePush() : await activateCamera();
      setNote(message);
      refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'No se ha podido activar.');
    } finally {
      setBusy('');
    }
  };

  if (push == null || camera == null || aside) return null;
  const needPush = missing(push);
  const needCamera = missing(camera);
  if (!needPush && !needCamera) return null;

  return createPortal(
    <div className="fixed inset-0 z-[64] flex items-end justify-center bg-white/25 p-4 pb-28 backdrop-blur-2xl dark:bg-slate-950/40 sm:items-center sm:pb-4" onClick={later}>
      <motion.div
        role="dialog"
        aria-labelledby="device-access-title"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={softSpring}
        className={cn(modalPanelClass, 'max-w-sm')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="device-access-title" className="text-[22px] font-semibold tracking-tight">Activa el móvil</h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
          {needPush && needCamera && 'Los avisos y la cámara siguen apagados. Sin eso el teléfono no recibe el guante ni puede fotografiar un tique.'}
          {needPush && !needCamera && 'Los avisos siguen apagados. Sin eso el teléfono no recibe el guante ni el precio.'}
          {!needPush && needCamera && 'La cámara sigue apagada. Sin eso no se puede fotografiar un tique.'}
        </p>
        <div className="mt-4 grid gap-2">
          {needPush && (
            <button type="button" disabled={busy !== ''} onClick={() => void turnOn('push')} className="w-full rounded-full bg-slate-950 py-3 text-[15px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">
              {busy === 'push' ? 'Activando…' : 'Activar avisos'}
            </button>
          )}
          {needCamera && (
            <button type="button" disabled={busy !== ''} onClick={() => void turnOn('camera')} className="w-full rounded-full bg-slate-950 py-3 text-[15px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">
              {busy === 'camera' ? 'Activando…' : 'Activar cámara'}
            </button>
          )}
          <button type="button" onClick={later} className="w-full py-2 text-[13px] font-semibold text-slate-500">Ahora no</button>
        </div>
        {note && <p className="mt-3 text-xs font-medium leading-5 text-slate-500">{note}</p>}
        <p className="mt-3 text-xs font-medium leading-5 text-slate-400">También se puede hacer luego en Ajustes. Si el teléfono ya lo bloqueó, hay que permitirlo en los ajustes del móvil.</p>
      </motion.div>
    </div>,
    document.body,
  );
}
