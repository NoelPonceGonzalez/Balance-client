import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Delete } from 'lucide-react';
import { api, keepGate } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';
import { Mark } from '@/components/Mark';

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
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const digitsRef = useRef('');
  const stepRef = useRef<Step>(mode === 'create' ? 'fresh' : 'pin');
  const freshRef = useRef('');
  const currentRef = useRef('');
  const forgotRef = useRef(false);
  const busyRef = useRef(false);
  const handledAt = useRef(0);
  const pushRef = useRef<(key: string) => void>(() => undefined);

  const writeDigits = (value: string) => {
    digitsRef.current = value;
    setDigits(value);
  };

  const writeStep = (value: Step) => {
    stepRef.current = value;
    setStep(value);
  };

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
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (mode === 'open' && !forgotRef.current) {
        const data = await api<{ gate: string }>('/api/auth/lock/open', { method: 'POST', body: JSON.stringify({ pin }) });
        remember(data.gate);
        onOpen();
        return;
      }
      if (forgotRef.current) {
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
      writeDigits('');
      setShake((value) => value + 1);
      setError(err instanceof Error ? err.message : 'No se ha podido abrir.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const push = (key: string) => {
    if (busyRef.current || stepRef.current === 'password') return;
    setError('');
    if (key === 'borrar') {
      writeDigits(digitsRef.current.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key) || digitsRef.current.length >= 4) return;
    const next = `${digitsRef.current}${key}`;
    writeDigits(next);
    if (next.length < 4) return;
    const now = stepRef.current;
    if (now === 'pin') {
      if (mode === 'open' && !forgotRef.current) {
        void finish(next, '');
        return;
      }
      currentRef.current = next;
      writeDigits('');
      writeStep('fresh');
      return;
    }
    if (now === 'fresh') {
      freshRef.current = next;
      writeDigits('');
      writeStep('repeat');
      return;
    }
    if (next !== freshRef.current) {
      freshRef.current = '';
      writeDigits('');
      writeStep('fresh');
      setShake((value) => value + 1);
      setError('Los códigos no coinciden. Elige otro.');
      return;
    }
    if (forgotRef.current) {
      writeDigits('');
      writeStep('password');
      return;
    }
    void finish(next, currentRef.current);
  };

  pushRef.current = push;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (stepRef.current === 'password') return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        pushRef.current(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        pushRef.current('borrar');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tap = (key: string, source: 'pointer' | 'click') => {
    const now = performance.now();
    if (source === 'click' && now - handledAt.current < 500) return;
    if (source === 'pointer') handledAt.current = now;
    push(key);
  };

  const screen = (
    <div className="fixed inset-0 z-[80] grid min-h-dvh place-items-center overflow-hidden bg-[#f3f0ea] px-6 text-[#1c1915] dark:bg-[#0b0b0b] dark:text-[#f6f1e8]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(255,252,246,0.96),transparent_68%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.07),transparent_66%)]" />
      <div className="relative w-full max-w-[22rem] pb-6">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#1c1915] text-[#f6f1e8] shadow-[0_14px_32px_rgba(28,25,21,0.18)] dark:bg-[#f6f1e8] dark:text-[#1c1915]">
          <Mark size={22} />
        </div>
        <p className="mt-6 text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8a8175]">Balance</p>
        <h1 className="mt-3 text-center text-[2rem] font-semibold leading-none tracking-tight">{title}</h1>
        <p className="mx-auto mt-3 max-w-[18rem] text-center text-[15px] leading-6 text-[#8a8175]">{hint}</p>
        {step === 'password' ? (
          <form
            className="mt-9 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (password.trim().length < 8 || freshRef.current.length !== 4) return;
              void finish(freshRef.current, '');
            }}
          >
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña"
              aria-label="Contraseña"
              className="w-full rounded-2xl border border-black/5 bg-white px-4 py-3.5 text-base shadow-[0_10px_24px_rgba(48,38,24,0.06)] outline-none ring-0 placeholder:text-[#b3aa9e] focus:border-[#1c1915] dark:border-white/10 dark:bg-[#161616] dark:placeholder:text-[#6f675e] dark:focus:border-white"
            />
            <button
              type="submit"
              disabled={busy || password.trim().length < 8}
              className="w-full rounded-full bg-[#1c1915] py-3.5 text-sm font-semibold tracking-wide text-[#f6f1e8] disabled:opacity-40 dark:bg-[#f6f1e8] dark:text-[#1c1915]"
            >
              Guardar código
            </button>
          </form>
        ) : (
          <>
            <div key={shake} className={cn('mt-9 flex justify-center gap-[1.15rem]', shake > 0 && error && 'lock-shake')} aria-live="polite" aria-label={`${digits.length} de 4`}>
              {Array.from({ length: 4 }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    'h-3.5 w-3.5 rounded-full transition-all duration-150',
                    index < digits.length
                      ? 'scale-100 bg-[#1c1915] dark:bg-[#f6f1e8]'
                      : 'scale-[0.86] bg-transparent ring-[1.5px] ring-[#d4cdc3] dark:ring-white/20',
                  )}
                />
              ))}
            </div>
            <div className="mx-auto mt-10 grid w-fit grid-cols-3 gap-x-5 gap-y-4">
              {KEYS.map((key) => {
                if (!key) return <span key="hueco" />;
                const erase = key === 'borrar';
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={busy}
                    aria-label={erase ? 'Borrar' : key}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      tap(key, 'pointer');
                    }}
                    onClick={() => tap(key, 'click')}
                    className={cn(
                      'grid h-[4.7rem] w-[4.7rem] touch-manipulation select-none place-items-center rounded-full text-[1.7rem] font-medium tabular-nums transition-transform duration-100 active:scale-[0.94] disabled:opacity-40',
                      erase
                        ? 'bg-[#e6dfd4] text-[#5c554c] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:bg-[#242220] dark:text-[#d9d0c4]'
                        : 'bg-white text-[#1c1915] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_12px_28px_rgba(48,38,24,0.07)] dark:bg-[#171717] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_30px_rgba(0,0,0,0.4)]',
                    )}
                  >
                    {erase ? <Delete size={22} strokeWidth={1.75} /> : key}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {error && <p className="mt-5 text-center text-sm font-medium text-rose-600">{error}</p>}
        <div className="mt-7 flex flex-col items-center gap-3">
          {mode === 'open' && !forgot && (
            <button
              type="button"
              onClick={() => {
                forgotRef.current = true;
                setForgot(true);
                setError('');
                freshRef.current = '';
                currentRef.current = '';
                writeDigits('');
                writeStep('fresh');
              }}
              className="text-sm font-medium text-[#8a8175]"
            >
              He olvidado el código
            </button>
          )}
          {forgot && step === 'password' && (
            <button
              type="button"
              onClick={() => {
                forgotRef.current = false;
                setForgot(false);
                freshRef.current = '';
                writeDigits('');
                writeStep('pin');
                setError('');
              }}
              className="text-sm font-medium text-[#8a8175]"
            >
              Volver al código
            </button>
          )}
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm font-medium text-[#8a8175]">Cancelar</button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(screen, document.body);
}
