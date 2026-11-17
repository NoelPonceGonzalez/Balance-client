import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
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
  const [passed, setPassed] = useState(false);

  const digitsRef = useRef('');
  const stepRef = useRef<Step>(mode === 'create' ? 'fresh' : 'pin');
  const freshRef = useRef('');
  const currentRef = useRef('');
  const forgotRef = useRef(false);
  const busyRef = useRef(false);
  const passedRef = useRef(false);
  const openTimer = useRef(0);
  const handledAt = useRef(0);
  const pushRef = useRef<(key: string) => void>(() => undefined);

  useEffect(() => () => window.clearTimeout(openTimer.current), []);

  const reveal = () => {
    passedRef.current = true;
    setPassed(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => onOpen(), reduce ? 220 : 1080);
  };

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
        reveal();
        return;
      }
      if (forgotRef.current) {
        const data = await api<{ user: User; gate: string }>('/api/auth/lock/reset', {
          method: 'POST',
          body: JSON.stringify({ password, pin }),
        });
        remember(data.gate);
        onUser?.(data.user);
        reveal();
        return;
      }
      const data = await api<{ user: User; gate: string }>('/api/auth/lock', {
        method: 'POST',
        body: JSON.stringify(mode === 'create' ? { pin } : { pin, current: previous }),
      });
      remember(data.gate);
      onUser?.(data.user);
      reveal();
    } catch (err) {
      writeDigits('');
      setShake((value) => value + 1);
      setError(err instanceof Error ? err.message : 'No se ha podido abrir.');
    } finally {
      if (!passedRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const push = (key: string) => {
    if (busyRef.current || passedRef.current || stepRef.current === 'password') return;
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

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const screen = (
    <div data-lock-root className="fixed inset-0 z-[80] grid min-h-dvh place-items-center overflow-hidden bg-[#f7f4ee] px-6 text-[#1c1915] dark:bg-[#0c0b0a] dark:text-[#f6f1e8]">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.9),transparent_48%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(232,214,180,0.14),transparent_46%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-[radial-gradient(ellipse_at_bottom,rgba(28,25,21,0.05),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_bottom,rgba(0,0,0,0.45),transparent_70%)]" />
      <div className={cn('relative w-full max-w-[22rem] pb-4 transition-opacity duration-500', passed && '[&_.lock-pad]:opacity-35')}>
        <motion.div layout className="flex items-center justify-center">
          <motion.div
            layout
            className="grid h-14 w-14 shrink-0 place-items-center rounded-[1.15rem] bg-[#1c1915] text-[#f6f1e8] shadow-[0_14px_30px_rgba(28,25,21,0.14)] dark:bg-[#f4efe6] dark:text-[#16140f] dark:shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
            animate={passed ? { scale: 1.04 } : { scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 18 }}
          >
            <Mark size={24} />
          </motion.div>
          <AnimatePresence>
            {passed && (
              <motion.div
                key="lock-open"
                className="relative shrink-0 overflow-visible text-[#1c1915] dark:text-[#e6d3ae]"
                initial={reduceMotion ? { opacity: 1, scale: 1, width: 40, marginLeft: 14 } : { opacity: 0, scale: 0.5, width: 0, marginLeft: 0 }}
                animate={{ opacity: 1, scale: 1, width: 40, marginLeft: 14 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 24 }}
                aria-hidden
              >
                <span className="absolute inset-0 -z-10 rounded-full bg-[#1c1915]/10 blur-md dark:bg-[#e6d3ae]/25" />
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <motion.circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    initial={{ pathLength: reduceMotion ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.48, ease: 'easeOut' }}
                  />
                  <motion.path
                    d="M12.6 20.4 17.4 25.1 27.2 14.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: reduceMotion ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.32, delay: reduceMotion ? 0 : 0.34, ease: 'easeOut' }}
                  />
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <p className="mt-7 text-center text-[11px] font-semibold uppercase tracking-[0.32em] text-[#8a8175] dark:text-[#a89880]">Balance</p>
        <h1 className="mt-3 text-center text-[2rem] font-semibold leading-none tracking-tight">{title}</h1>
        <p className="mx-auto mt-3 max-w-[18rem] text-center text-[15px] leading-6 text-[#8a8175] dark:text-[#9c9184]">{hint}</p>
        <div className="lock-pad transition-opacity duration-500">
          {step === 'password' ? (
            <form
              className="mt-9 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (passedRef.current || password.trim().length < 8 || freshRef.current.length !== 4) return;
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
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-base text-[#1c1915] outline-none placeholder:text-[#b3aa9e] focus:border-[#1c1915] dark:border-white/10 dark:bg-[#171512] dark:text-[#f6f1e8] dark:placeholder:text-[#6f675c] dark:focus:border-[#e6d3ae]/50"
              />
              <button
                type="submit"
                disabled={busy || password.trim().length < 8}
                className="w-full rounded-full bg-[#1c1915] py-3.5 text-sm font-semibold tracking-wide text-[#f6f1e8] disabled:opacity-40 dark:bg-[#f4efe6] dark:text-[#16140f]"
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
                      'h-4 w-4 rounded-full transition-all duration-150',
                      index < digits.length
                        ? 'scale-100 bg-[#1c1915] dark:bg-[#f4efe6] dark:shadow-[0_0_12px_rgba(244,239,230,0.35)]'
                        : 'scale-100 bg-transparent ring-1 ring-[#1c1915]/25 dark:ring-[#f4efe6]/35',
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
                        'grid h-[4.55rem] w-[4.55rem] touch-manipulation select-none place-items-center rounded-full text-[1.95rem] font-light tabular-nums leading-none transition-transform duration-100 active:scale-[0.94] disabled:opacity-40',
                        erase
                          ? 'border border-[#1c1915]/20 bg-transparent text-[#6d655c] dark:border-transparent dark:bg-[#1a1714] dark:text-[#cbbfa8] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                          : 'border-[1.5px] border-[#1c1915] bg-transparent text-[#1c1915] active:bg-[#1c1915]/5 dark:border-transparent dark:bg-[#2c2823] dark:text-[#f7f2ea] dark:shadow-[inset_0_1px_0_rgba(255,244,220,0.22),0_10px_22px_rgba(0,0,0,0.32)] dark:ring-1 dark:ring-[#f6f1e8]/18',
                      )}
                    >
                      {erase ? <Delete size={22} strokeWidth={1.75} /> : key}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {error && <p className="mt-5 text-center text-sm font-medium text-rose-700 dark:text-[#e7a0a0]">{error}</p>}
          <div className="mt-7 flex flex-col items-center gap-3">
            {mode === 'open' && !forgot && !passed && (
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
                className="text-sm font-medium text-[#8a8175] dark:text-[#9c9184]"
              >
                He olvidado el código
              </button>
            )}
            {forgot && step === 'password' && !passed && (
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
                className="text-sm font-medium text-[#8a8175] dark:text-[#9c9184]"
              >
                Volver al código
              </button>
            )}
            {onCancel && !passed && (
              <button type="button" onClick={onCancel} className="text-sm font-medium text-[#8a8175] dark:text-[#9c9184]">Cancelar</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(screen, document.body);
}
