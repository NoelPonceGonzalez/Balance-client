import { useState } from 'react';
import { Delete } from 'lucide-react';
import { api, keepGate } from '@/lib/api';
import type { User } from '@/lib/types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'borrar'] as const;

type Step = 'pin' | 'fresh' | 'repeat' | 'password';

function remember(gate: string) {
  keepGate(gate);
}

export function AppLock({
  mode,
  onOpen,
  onUser,
  onCancel,
}: {
  mode: 'open' | 'create' | 'change';
  onOpen: () => void;
  onUser?: (user: User) => void;
  onCancel?: () => void;
}) {
  const [forgot, setForgot] = useState(false);
  const [step, setStep] = useState<Step>(mode === 'create' ? 'fresh' : 'pin');
  const [digits, setDigits] = useState('');
  const [fresh, setFresh] = useState('');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const title = step === 'password' ? 'Tu contraseña' : step === 'repeat' ? 'Repite el código' : step === 'fresh' ? 'Elige un código' : 'Código';
  const hint = step === 'password'
    ? 'Con la contraseña queda el código nuevo.'
    : step === 'repeat'
      ? 'Los mismos 4 números.'
      : step === 'pin' && mode === 'open' && !forgot
        ? 'Hace falta para ver el dinero.'
        : mode === 'create'
          ? 'Te quedas aquí hasta guardarlo. Luego, al volver, solo se piden estos 4 números.'
          : 'Cuatro números. Se piden otra vez al salir.';

  const finish = async (pin: string, previous: string) => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'open' && !forgot) {
        const data = await api<{ gate: string }>('/api/auth/lock/open', { method: 'POST', body: JSON.stringify({ pin }) });
        remember(data.gate);
        onOpen();
        return;
      }
      if (forgot) {
        const data = await api<{ user: User; gate: string }>('/api/auth/lock/reset', {
          method: 'POST',
          body: JSON.stringify({ password, pin }),
        });
        remember(data.gate);
        onUser?.(data.user);
        onOpen();
        return;
      }
      const data = await api<{ user: User; gate: string }>('/api/auth/lock', {
        method: 'POST',
        body: JSON.stringify(mode === 'create' ? { pin } : { pin, current: previous }),
      });
      remember(data.gate);
      onUser?.(data.user);
      onOpen();
    } catch (err) {
      setDigits('');
      setError(err instanceof Error ? err.message : 'No se ha podido abrir.');
    } finally {
      setBusy(false);
    }
  };

  const push = (key: string) => {
    if (busy || step === 'password') return;
    setError('');
    if (key === 'borrar') {
      setDigits((value) => value.slice(0, -1));
      return;
    }
    const next = `${digits}${key}`.slice(0, 4);
    setDigits(next);
    if (next.length < 4) return;
    if (step === 'pin') {
      if (mode === 'open' && !forgot) {
        void finish(next, '');
        return;
      }
      setCurrent(next);
      setDigits('');
      setStep('fresh');
      return;
    }
    if (step === 'fresh') {
      setFresh(next);
      setDigits('');
      setStep('repeat');
      return;
    }
    if (next !== fresh) {
      setFresh('');
      setDigits('');
      setStep('fresh');
      setError('Los códigos no coinciden. Elige otro.');
      return;
    }
    if (forgot) {
      setDigits('');
      setStep('password');
      return;
    }
    void finish(next, current);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-white px-6 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="w-full max-w-[20rem]">
        <h1 className="text-center text-[1.65rem] font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500">{hint}</p>
        {step === 'password' ? (
          <form
            className="mt-8 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (password.trim().length < 8 || fresh.length !== 4) return;
              void finish(fresh, '');
            }}
          >
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña"
              aria-label="Contraseña"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-slate-900"
            />
            <button type="submit" disabled={busy || password.trim().length < 8} className="w-full rounded-full bg-slate-950 py-3 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">
              Guardar código
            </button>
          </form>
        ) : (
          <>
            <p className="mt-8 text-center text-2xl tracking-[0.55em]" aria-live="polite">
              {digits.padEnd(4, '○').replace(/[0-9]/g, '●')}
            </p>
            <div className="mx-auto mt-6 grid w-[16rem] grid-cols-3 gap-3">
              {KEYS.map((key) => {
                if (!key) return <span key="hueco" />;
                const erase = key === 'borrar';
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={busy}
                    aria-label={erase ? 'Borrar' : key}
                    onClick={() => push(key)}
                    className="grid h-16 place-items-center rounded-full text-xl font-semibold text-slate-900 active:bg-slate-100 disabled:opacity-40 dark:text-white dark:active:bg-white/10"
                  >
                    {erase ? <Delete size={20} /> : key}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {error && <p className="mt-4 text-center text-sm font-medium text-rose-600">{error}</p>}
        <div className="mt-6 flex flex-col items-center gap-3">
          {mode === 'open' && !forgot && (
            <button
              type="button"
              onClick={() => {
                setForgot(true);
                setError('');
                setDigits('');
                setFresh('');
                setStep('fresh');
              }}
              className="text-sm font-semibold text-slate-500"
            >
              He olvidado el código
            </button>
          )}
          {forgot && step === 'password' && (
            <button type="button" onClick={() => { setForgot(false); setStep('pin'); setDigits(''); setFresh(''); setError(''); }} className="text-sm font-semibold text-slate-500">
              Volver al código
            </button>
          )}
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm font-semibold text-slate-500">Cancelar</button>
          )}
        </div>
      </div>
    </div>
  );
}
